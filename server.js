const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Storage setup - 100MB max
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.random().toString(36).substring(2, 15);
        cb(null, uniqueName + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage, 
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// In-memory store (use Redis/DB in production)
const fileStore = new Map();

// Generate 6-char code (removed confusing characters: 0, O, 1, I)
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (fileStore.has(code)) return generateCode();
    return code;
}

// Clean up expired files
function cleanupExpired() {
    const now = Date.now();
    for (const [code, data] of fileStore.entries()) {
        if (now > data.expiresAt || data.downloadCount >= data.maxDownloads) {
            cleanupFile(code);
        }
    }
}

// Cleanup single file
function cleanupFile(code) {
    const data = fileStore.get(code);
    if (data) {
        const filepath = path.join(uploadsDir, data.filename);
        if (fs.existsSync(filepath)) {
            fs.unlink(filepath, (err) => {
                if (err) console.error('Cleanup error:', err);
            });
        }
        fileStore.delete(code);
        console.log(`[CLEANUP] Code: ${code} removed`);
    }
}

// Run cleanup every hour
setInterval(cleanupExpired, 60 * 60 * 1000);

// ========== API ENDPOINTS ==========

// Upload file endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const code = generateCode();
    const fileData = {
        code,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        uploadedAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        downloadCount: 0,
        maxDownloads: 3
    };

    fileStore.set(code, fileData);

    console.log(`[UPLOAD] Code: ${code} | File: ${req.file.originalname} | Size: ${formatBytes(req.file.size)} | Type: ${req.file.mimetype}`);

    res.json({ success: true, code });
});

// Upload text endpoint
app.post('/api/upload-text', (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'No text provided' });
    }

    const code = generateCode();
    const filename = Date.now() + '-message.txt';
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, text, 'utf8');

    const fileData = {
        code,
        filename: filename,
        originalName: 'message.txt',
        size: Buffer.byteLength(text, 'utf8'),
        type: 'text/plain',
        uploadedAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
        downloadCount: 0,
        maxDownloads: 3,
        isText: true
    };

    fileStore.set(code, fileData);

    console.log(`[UPLOAD-TEXT] Code: ${code} | Size: ${formatBytes(fileData.size)} | Chars: ${text.length}`);

    res.json({ success: true, code });
});

// Retrieve file info
app.get('/api/retrieve/:code', (req, res) => {
    const { code } = req.params;
    const fileData = fileStore.get(code);

    if (!fileData) {
        return res.status(404).json({ error: 'Code not found or expired' });
    }

    if (Date.now() > fileData.expiresAt) {
        cleanupFile(code);
        return res.status(404).json({ error: 'Code expired' });
    }

    if (fileData.downloadCount >= fileData.maxDownloads) {
        cleanupFile(code);
        return res.status(404).json({ error: 'Max downloads reached' });
    }

    res.json({
        success: true,
        file: {
            name: fileData.originalName,
            size: fileData.size,
            type: fileData.type,
            uploadedAt: fileData.uploadedAt,
            downloadsLeft: fileData.maxDownloads - fileData.downloadCount,
            isText: fileData.isText || false
        }
    });
});

// Download endpoint
app.get('/api/download/:code', (req, res) => {
    const { code } = req.params;
    const isPreview = req.query.preview === '1';
    const fileData = fileStore.get(code);

    if (!fileData || Date.now() > fileData.expiresAt) {
        if (fileData) cleanupFile(code);
        return res.status(404).json({ error: 'Not found or expired' });
    }

    if (!isPreview && fileData.downloadCount >= fileData.maxDownloads) {
        cleanupFile(code);
        return res.status(404).json({ error: 'Max downloads reached' });
    }

    const filepath = path.join(__dirname, uploadsDir, fileData.filename);

    if (!fs.existsSync(filepath)) {
        fileStore.delete(code);
        return res.status(404).json({ error: 'File not found on server' });
    }

    // Increment download count only for actual downloads
    if (!isPreview) {
        fileData.downloadCount++;
        console.log(`[DOWNLOAD] Code: ${code} | File: ${fileData.originalName} | Count: ${fileData.downloadCount}/${fileData.maxDownloads}`);

        if (fileData.downloadCount >= fileData.maxDownloads) {
            setTimeout(() => cleanupFile(code), 5000);
        }
    }

    // Set proper headers
    res.setHeader('Content-Type', fileData.type);
    if (!isPreview) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.originalName)}"`);
    }

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);

    stream.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        storedFiles: fileStore.size,
        maxFileSize: '100MB',
        uptime: process.uptime()
    });
});

// Helper: Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.listen(PORT, () => {
    console.log('🚀 Codeword File Share Server');
    console.log(`📡 Running on port ${PORT}`);
    console.log(`📁 Upload limit: 100MB per file`);
    console.log(`📝 Text messages supported`);
    console.log(`⏱️  Files expire after 24 hours`);
    console.log(`🔒 Max 3 downloads per file`);
    console.log('');
    console.log('Ready for connections...');
});
