# 🔐 Codeword File Share

Anonymous cross-device file sharing with secret codewords. No login required. Share **photos, videos, text messages, and files** up to **100MB**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📸 **Photos** | JPG, PNG, GIF, WebP with preview |
| 🎬 **Videos** | MP4, MOV, AVI, MKV, WebM with preview |
| 📝 **Text/Messages** | Type or paste text directly |
| 🎵 **Audio** | MP3, WAV, OGG, M4A |
| 📄 **Documents** | PDF, TXT, DOC, and any file |
| 🔒 **No login** | Completely anonymous |
| ⏱️ **Auto-expire** | Files delete after 24 hours |
| 🔢 **Download limit** | Max 3 downloads per file |
| 📱 **Cross-device** | Works on any device with browser |
| 🎨 **Beautiful UI** | Smooth animations & modern design |

## 🚀 How It Works

1. **Choose** upload type: File/Photo/Video OR Text Message
2. **Upload** on Device A → Get a 6-character secret codeword
3. **Share** the codeword (text, call, any way)
4. **Enter** the codeword on Device B → Download instantly

## 🛠️ Local Development

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/codeword-file-share.git
cd codeword-file-share

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open browser
http://localhost:3000
```

## 🌐 Deploy to Render (Free)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → Sign up with GitHub
3. Click **New +** → **Web Service**
4. Connect your GitHub repo
5. Settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Click **Create Web Service**

## 📁 Project Structure

```
codeword-file-share/
├── index.html          # Frontend UI (animations + text block)
├── server.js           # Backend API (100MB + text support)
├── package.json        # Dependencies
├── .gitignore          # Ignore files
└── uploads/            # Uploaded files (auto-created)
```

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload file, returns code |
| POST | `/api/upload-text` | Upload text message, returns code |
| GET | `/api/retrieve/:code` | Get file info |
| GET | `/api/download/:code` | Download file |
| GET | `/api/health` | Server status |

## ⚙️ Configuration

Environment variables (optional):

```env
PORT=3000
```

## 🎨 UI Features

- **Animated gradient background**
- **Floating particles**
- **Smooth transitions** on all interactions
- **Real-time upload progress** with speed indicator
- **File preview** for images, videos, and text
- **Shake animation** on errors
- **Bounce-in animation** on success
- **Card hover effects**
- **Glass morphism design**

## 📜 License

MIT License - feel free to use and modify!

---

Made with ❤️ for anonymous sharing.