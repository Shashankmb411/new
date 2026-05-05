const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// CORS - Allow all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('.'));

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
    limits: { 
        fileSize: 100 * 1024 * 1024,  // 100MB
        files: 1
    }
});

// In-memory store
const fileStore = new Map();

// Generate 6-char code
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (fileStore.has(code)) return generateCode();
    return code;
}

// Cleanup functions
function cleanupFile(code) {
    const data = fileStore.get(code);
    if (data) {
        const filepath = path.join(uploadsDir, data.filename);
        if (fs.existsSync(filepath)) {
            fs.unlink(filepath, (err) => {
                if (err) console.error('[CLEANUP ERROR]', err);
            });
        }
        fileStore.delete(code);
    }
}

function cleanupExpired() {
    const now = Date.now();
    for (const [code, data] of fileStore.entries()) {
        if (now > data.expiresAt || data.downloadCount >= data.maxDownloads) {
            cleanupFile(code);
        }
    }
}

setInterval(cleanupExpired, 60 * 60 * 1000);

// ========== API ENDPOINTS ==========

// Upload file endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No file uploaded',
                details: 'Please select a file to upload'
            });
        }

        const code = generateCode();
        const fileData = {
            code,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype,
            uploadedAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000),
            downloadCount: 0,
            maxDownloads: 3
        };

        fileStore.set(code, fileData);

        console.log(`[UPLOAD] Code: ${code} | File: ${req.file.originalname} | Size: ${formatBytes(req.file.size)}`);

        res.json({ success: true, code });
    } catch (err) {
        console.error('[UPLOAD ERROR]', err);
        res.status(500).json({ 
            error: 'Upload failed',
            details: err.message 
        });
    }
});

// Multer error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ 
                error: 'File too large',
                details: 'Maximum file size is 100MB'
            });
        }
        return res.status(400).json({ 
            error: 'Upload error',
            details: err.message 
        });
    }
    next(err);
});

// Upload text endpoint
app.post('/api/upload-text', (req, res) => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string' || text.length === 0) {
            return res.status(400).json({ 
                error: 'No text provided',
                details: 'Please enter some text to upload'
            });
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
    } catch (err) {
        console.error('[UPLOAD-TEXT ERROR]', err);
        res.status(500).json({ 
            error: 'Text upload failed',
            details: err.message 
        });
    }
});

// Retrieve file info
app.get('/api/retrieve/:code', (req, res) => {
    try {
        const { code } = req.params;
        const fileData = fileStore.get(code);

        if (!fileData) {
            return res.status(404).json({ 
                error: 'Code not found',
                details: 'The code may be expired, incorrect, or max downloads reached'
            });
        }

        if (Date.now() > fileData.expiresAt) {
            cleanupFile(code);
            return res.status(404).json({ 
                error: 'Code expired',
                details: 'This code has expired (24 hour limit)'
            });
        }

        if (fileData.downloadCount >= fileData.maxDownloads) {
            cleanupFile(code);
            return res.status(404).json({ 
                error: 'Max downloads reached',
                details: 'This file has been downloaded the maximum number of times'
            });
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
    } catch (err) {
        console.error('[RETRIEVE ERROR]', err);
        res.status(500).json({ 
            error: 'Server error',
            details: err.message 
        });
    }
});

// Download endpoint
app.get('/api/download/:code', (req, res) => {
    try {
        const { code } = req.params;
        const isPreview = req.query.preview === '1';
        const fileData = fileStore.get(code);

        if (!fileData || Date.now() > fileData.expiresAt) {
            if (fileData) cleanupFile(code);
            return res.status(404).json({ 
                error: 'Not found or expired',
                details: 'File not found or code has expired'
            });
        }

        if (!isPreview && fileData.downloadCount >= fileData.maxDownloads) {
            cleanupFile(code);
            return res.status(404).json({ 
                error: 'Max downloads reached',
                details: 'This file has been downloaded the maximum number of times'
            });
        }

        const filepath = path.join(uploadsDir, fileData.filename);

        if (!fs.existsSync(filepath)) {
            fileStore.delete(code);
            return res.status(404).json({ 
                error: 'File not found',
                details: 'File missing from server'
            });
        }

        if (!isPreview) {
            fileData.downloadCount++;
            console.log(`[DOWNLOAD] Code: ${code} | File: ${fileData.originalName} | Count: ${fileData.downloadCount}/${fileData.maxDownloads}`);

            if (fileData.downloadCount >= fileData.maxDownloads) {
                setTimeout(() => cleanupFile(code), 5000);
            }
        }

        res.setHeader('Content-Type', fileData.type);
        if (!isPreview) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.originalName)}"`);
        }

        const stream = fs.createReadStream(filepath);
        stream.pipe(res);

        stream.on('error', (err) => {
            console.error('[STREAM ERROR]', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed' });
            }
        });
    } catch (err) {
        console.error('[DOWNLOAD ERROR]', err);
        res.status(500).json({ 
            error: 'Download failed',
            details: err.message 
        });
    }
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

// Global error handler
app.use((err, req, res, next) => {
    console.error('[GLOBAL ERROR]', err);
    res.status(500).json({ 
        error: 'Server error',
        details: err.message 
    });
});

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
