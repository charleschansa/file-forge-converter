const express = require('express');
const multer = require('multer');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3700;

// ============================================================
// Find FFmpeg binary path — resolve it once at startup
// ============================================================
let ffmpegPath = 'ffmpeg';
let ffprobePath = 'ffprobe';

const os = require('os');
const isWindows = os.platform() === 'win32';
const findCmd = isWindows ? 'where ffmpeg' : 'which ffmpeg';

try {
  const result = execSync(findCmd, { encoding: 'utf-8' }).trim().split('\n')[0].trim();
  if (result) {
    ffmpegPath = result;
    ffprobePath = result.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    console.log(`  ✓ FFmpeg found at: ${ffmpegPath}`);
  }
} catch (e) {
  const commonPaths = [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      ffmpegPath = p;
      ffprobePath = p.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
      console.log(`  ✓ FFmpeg found at: ${ffmpegPath}`);
      break;
    }
  }
}

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
[uploadsDir, outputDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      // Media
      'video/mp4', 'video/mpeg', 'video/avi', 'video/x-msvideo', 'video/msvideo',
      'video/quicktime', 'video/x-matroska', 'video/webm', 'video/x-flv', 'video/x-ms-wmv',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac',
      'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
      // Documents
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/octet-stream'
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = [
      '.mp4', '.avi', '.mkv', '.mov', '.webm', '.mpeg', '.mpg', '.flv', '.wmv', '.m4v',
      '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
      '.docx', '.doc'
    ];

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type: ' + file.mimetype), false);
    }
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Track active conversions
const activeConversions = new Map();

// MIME types map
const mimeTypesMap = {
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  // Video
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  // Document
  pdf: 'application/pdf'
};

// ============================================================
// FFmpeg helpers (media conversion)
// ============================================================
function getFFmpegArgs(inputPath, outputPath, format) {
  switch (format) {
    // --- Audio extraction / conversion ---
    case 'mp3':
      return ['-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-ab', '192k', '-ar', '44100', '-ac', '2', '-map_metadata', '-1', '-y', outputPath];
    case 'wav':
      return ['-i', inputPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-map_metadata', '-1', '-y', outputPath];
    case 'aac':
      return ['-i', inputPath, '-vn', '-acodec', 'aac', '-ab', '192k', '-ar', '44100', '-ac', '2', '-map_metadata', '-1', '-y', outputPath];
    case 'ogg':
      return ['-i', inputPath, '-vn', '-acodec', 'libvorbis', '-ab', '192k', '-ar', '44100', '-ac', '2', '-map_metadata', '-1', '-y', outputPath];
    case 'flac':
      return ['-i', inputPath, '-vn', '-acodec', 'flac', '-ar', '44100', '-ac', '2', '-map_metadata', '-1', '-y', outputPath];

    // --- Video conversion ---
    case 'avi':
      return ['-i', inputPath, '-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '3', '-c:a', 'libmp3lame', '-b:a', '192k', '-y', outputPath];
    case 'mkv':
      return ['-i', inputPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k', '-y', outputPath];
    case 'mp4':
      return ['-i', inputPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-y', outputPath];
    case 'mov':
      return ['-i', inputPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k', '-y', outputPath];
    case 'webm':
      return ['-i', inputPath, '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus', '-b:a', '128k', '-y', outputPath];

    default:
      return ['-i', inputPath, '-y', outputPath];
  }
}

function getDuration(inputPath) {
  return new Promise((resolve) => {
    const probe = spawn(ffprobePath, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', inputPath
    ]);
    let output = '';
    probe.stdout.on('data', (data) => { output += data.toString(); });
    probe.on('close', () => {
      const duration = parseFloat(output.trim());
      resolve(isNaN(duration) ? 0 : duration);
    });
    probe.on('error', () => resolve(0));
  });
}

// ============================================================
// Word to PDF conversion (mammoth + puppeteer)
// ============================================================
async function convertDocxToPdf(inputPath, outputPath, conversionId) {
  console.log(`[${conversionId}] Step 1: Converting DOCX → HTML with mammoth...`);

  activeConversions.set(conversionId, {
    ...activeConversions.get(conversionId),
    progress: 10,
    status: 'processing'
  });

  // Step 1: DOCX → HTML
  const result = await mammoth.convertToHtml({ path: inputPath });

  if (result.messages.length > 0) {
    console.log(`[${conversionId}] Mammoth warnings:`, result.messages.map(m => m.message).join(', '));
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', 'Segoe UI', 'Calibri', Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 60px 72px;
      max-width: 100%;
    }

    h1 { font-size: 22pt; font-weight: 700; margin: 24px 0 12px 0; color: #111; }
    h2 { font-size: 18pt; font-weight: 600; margin: 20px 0 10px 0; color: #222; }
    h3 { font-size: 14pt; font-weight: 600; margin: 16px 0 8px 0; color: #333; }
    h4 { font-size: 12pt; font-weight: 600; margin: 14px 0 6px 0; color: #444; }

    p { margin: 0 0 10px 0; }

    ul, ol { margin: 0 0 10px 24px; }
    li { margin: 0 0 4px 0; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 8px 12px;
      text-align: left;
    }
    th { background: #f0f0f0; font-weight: 600; }

    img { max-width: 100%; height: auto; margin: 12px 0; }

    strong, b { font-weight: 600; }
    em, i { font-style: italic; }

    a { color: #2563eb; text-decoration: underline; }

    blockquote {
      border-left: 3px solid #ddd;
      padding-left: 16px;
      margin: 12px 0;
      color: #555;
    }

    pre, code {
      font-family: 'Consolas', 'Courier New', monospace;
      background: #f5f5f5;
      border-radius: 4px;
    }
    pre { padding: 12px; margin: 12px 0; overflow-x: auto; }
    code { padding: 2px 4px; font-size: 10pt; }
  </style>
</head>
<body>
  ${result.value}
</body>
</html>`;

  activeConversions.set(conversionId, {
    ...activeConversions.get(conversionId),
    progress: 40,
    status: 'processing'
  });

  console.log(`[${conversionId}] Step 2: Rendering HTML → PDF with Puppeteer...`);

  // Step 2: HTML → PDF with Puppeteer
  const puppeteer = (await import('puppeteer')).default;
  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();

    activeConversions.set(conversionId, {
      ...activeConversions.get(conversionId),
      progress: 60,
      status: 'processing'
    });

    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });

    activeConversions.set(conversionId, {
      ...activeConversions.get(conversionId),
      progress: 80,
      status: 'processing'
    });

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    console.log(`[${conversionId}] ✅ PDF created successfully`);
  } finally {
    if (browser) await browser.close();
  }
}

// ============================================================
// Detect conversion type
// ============================================================
function getConversionType(mimetype, ext) {
  const docMimes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  const docExts = ['.docx', '.doc'];

  if (docMimes.includes(mimetype) || docExts.includes(ext.toLowerCase())) {
    return 'document';
  }
  return 'media';
}

// ============================================================
// Upload & Convert endpoint
// ============================================================
app.post('/api/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const targetFormat = req.body.format || 'mp3';
  const originalName = req.body.originalName || req.file.originalname;
  const baseName = path.parse(originalName).name;
  const ext = path.extname(originalName);
  const outputFilename = `${baseName}.${targetFormat}`;
  const outputPath = path.join(outputDir, `${Date.now()}-${outputFilename}`);
  const conversionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const mimeType = mimeTypesMap[targetFormat] || 'application/octet-stream';
  const conversionType = getConversionType(req.file.mimetype, ext);

  // Verify uploaded file
  try {
    const uploadStats = fs.statSync(req.file.path);
    console.log(`[${conversionId}] Upload: ${originalName} (${uploadStats.size} bytes, type: ${conversionType})`);
    if (uploadStats.size === 0) {
      return res.status(400).json({ error: 'Uploaded file is empty' });
    }
  } catch {
    return res.status(400).json({ error: 'Uploaded file not found' });
  }

  activeConversions.set(conversionId, { progress: 0, status: 'processing' });

  res.json({
    conversionId,
    message: 'Conversion started',
    originalName,
    outputFormat: targetFormat
  });

  // ---- Document conversion ----
  if (conversionType === 'document') {
    try {
      await convertDocxToPdf(req.file.path, outputPath, conversionId);

      const stats = fs.statSync(outputPath);
      if (stats.size > 0) {
        activeConversions.set(conversionId, {
          progress: 100,
          status: 'done',
          outputPath,
          outputFilename,
          mimeType,
          fileSize: stats.size
        });
      } else {
        throw new Error('PDF output is empty');
      }
    } catch (err) {
      console.error(`[${conversionId}] ❌ Document conversion failed:`, err.message);
      activeConversions.set(conversionId, {
        progress: 0,
        status: 'error',
        error: 'Document conversion failed: ' + err.message
      });
    } finally {
      fs.unlink(req.file.path, () => {});
    }
    return;
  }

  // ---- Media conversion (FFmpeg) ----
  const totalDuration = await getDuration(req.file.path);
  console.log(`[${conversionId}] Converting: ${originalName} → ${targetFormat} (duration: ${totalDuration}s)`);

  const args = getFFmpegArgs(req.file.path, outputPath, targetFormat);
  console.log(`[${conversionId}] Command: ${ffmpegPath} ${args.join(' ')}`);

  const ffmpegProcess = spawn(ffmpegPath, args);
  let stderrData = '';

  ffmpegProcess.stderr.on('data', (data) => {
    const output = data.toString();
    stderrData += output;
    const timeMatch = output.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
    if (timeMatch && totalDuration > 0) {
      const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
      const percent = Math.min(Math.round((currentTime / totalDuration) * 100), 99);
      activeConversions.set(conversionId, { progress: percent, status: 'processing' });
    }
  });

  ffmpegProcess.on('close', (code) => {
    let outputExists = false;
    let outputSize = 0;
    try {
      const stats = fs.statSync(outputPath);
      outputExists = true;
      outputSize = stats.size;
    } catch {}

    if (outputExists && outputSize > 0) {
      console.log(`[${conversionId}] ✅ Done! Output: ${outputSize} bytes`);
      activeConversions.set(conversionId, {
        progress: 100, status: 'done',
        outputPath, outputFilename, mimeType, fileSize: outputSize
      });
    } else {
      console.error(`[${conversionId}] ❌ Failed (exit code: ${code})`);
      console.error(`[${conversionId}] stderr: ${stderrData.slice(-300)}`);
      activeConversions.set(conversionId, {
        progress: 0, status: 'error',
        error: 'Conversion failed. Make sure the file is a valid media file.'
      });
      if (outputExists) fs.unlink(outputPath, () => {});
    }
    fs.unlink(req.file.path, () => {});
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`[${conversionId}] ❌ Failed to start FFmpeg:`, err.message);
    activeConversions.set(conversionId, {
      progress: 0, status: 'error',
      error: 'FFmpeg not found. Make sure FFmpeg is installed.'
    });
    fs.unlink(req.file.path, () => {});
  });
});

// Check conversion progress
app.get('/api/progress/:id', (req, res) => {
  const conversion = activeConversions.get(req.params.id);
  if (!conversion) return res.status(404).json({ error: 'Conversion not found' });
  res.json(conversion);
});

// Download converted file
app.get('/api/download/:id', (req, res) => {
  const conversion = activeConversions.get(req.params.id);
  if (!conversion || conversion.status !== 'done') {
    return res.status(404).json({ error: 'File not ready' });
  }
  if (!fs.existsSync(conversion.outputPath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  const stats = fs.statSync(conversion.outputPath);
  console.log(`[download] Sending: ${conversion.outputFilename} (${stats.size} bytes)`);

  res.setHeader('Content-Type', conversion.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${conversion.outputFilename}"`);
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Cache-Control', 'no-cache');

  const stream = fs.createReadStream(conversion.outputPath);
  stream.pipe(res);

  stream.on('error', (err) => {
    console.error('[download] Stream error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  });

  stream.on('end', () => {
    console.log(`[download] ✅ Sent: ${conversion.outputFilename}`);
    setTimeout(() => {
      fs.unlink(conversion.outputPath, () => {});
      activeConversions.delete(req.params.id);
    }, 10000);
  });
});

// Error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 500MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

app.listen(PORT, () => {
  console.log(`\n  ⚡ File Converter running at http://localhost:${PORT}\n`);
});
