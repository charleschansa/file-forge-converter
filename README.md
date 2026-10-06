# FileForge

🚀 **Live Demo:** [https://fileforge-converter.onrender.com/](https://fileforge-converter.onrender.com/)

FileForge is a beautiful, local-first file converter that prioritizes privacy and speed. Convert your media files and documents without uploading them to a third-party server!

## Features

- **Video & Audio Conversion**: Convert video files (MP4, AVI, MKV, MOV, WebM) to other video formats (AVI, MKV, MP4, MOV, WebM) or extract audio (MP3, WAV, AAC, OGG, FLAC) with FFmpeg.
- **Document Conversion**: Convert Word documents (.doc, .docx) to beautifully formatted PDFs using Mammoth and Puppeteer.
- **100% Local & Fast**: All conversions happen locally on your machine. No data leaves your computer.
- **Beautiful UI**: Modern glassmorphism-inspired design with category switching, drag-and-drop support, smooth animations, and real-time progress tracking.

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg (Installed and available in your system PATH)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/charleschansa/file-forge-converter.git
   ```
2. Navigate to the project directory:
   ```bash
   cd file-forge-converter
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```
2. Open your browser and navigate to `http://localhost:3700`.
3. Drag and drop your files into the dropzone, select your target format, and convert!

## Technologies Used
- **Backend:** Node.js, Express, Multer, Child Process (FFmpeg direct spawn)
- **Document Conversion:** Mammoth (DOCX -> HTML), Puppeteer (HTML -> PDF)
- **Frontend:** Vanilla HTML/CSS/JS with modern CSS variables, animations, and Grid/Flexbox layouts.

## License

MIT
