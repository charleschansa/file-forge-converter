// ===========================
// FileForge — Client App
// ===========================

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseLink = document.getElementById('browseLink');
const fileCard = document.getElementById('fileCard');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFile = document.getElementById('removeFile');
const formatOptions = document.getElementById('formatOptions');
const convertBtn = document.getElementById('convertBtn');
const progressSection = document.getElementById('progressSection');
const progressLabel = document.getElementById('progressLabel');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');
const doneSection = document.getElementById('doneSection');
const downloadBtn = document.getElementById('downloadBtn');
const newConversionBtn = document.getElementById('newConversionBtn');
const errorSection = document.getElementById('errorSection');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');

// New elements for document support
const fileIconMedia = document.getElementById('fileIconMedia');
const fileIconDoc = document.getElementById('fileIconDoc');
const fileIconContainer = document.getElementById('fileIconContainer');
const conversionBadge = document.getElementById('conversionBadge');
const conversionType = document.getElementById('conversionType');
const conversionTarget = document.getElementById('conversionTarget');
const mediaFormatSection = document.getElementById('mediaFormatSection');
const docFormatSection = document.getElementById('docFormatSection');

let selectedFile = null;
let selectedFormat = 'mp3';
let currentConversionId = null;
let progressPollInterval = null;
let currentFileType = 'media'; // 'media' or 'document'

// Document extensions
const docExtensions = ['.docx', '.doc'];

// ===========================
// File Type Detection
// ===========================
function detectFileType(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (docExtensions.includes(ext)) {
    return 'document';
  }
  return 'media';
}

// ===========================
// Drag & Drop
// ===========================
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

// ===========================
// File Handling
// ===========================
function handleFile(file) {
  selectedFile = file;
  currentFileType = detectFileType(file);

  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);

  // Update UI based on file type
  if (currentFileType === 'document') {
    selectedFormat = 'pdf';
    fileIconMedia.classList.add('hidden');
    fileIconDoc.classList.remove('hidden');
    fileIconContainer.classList.add('file-icon-doc');
    mediaFormatSection.classList.add('hidden');
    docFormatSection.classList.remove('hidden');
    conversionType.textContent = 'Document';
    conversionTarget.textContent = 'PDF';
    conversionBadge.classList.add('badge-doc-mode');
  } else {
    selectedFormat = 'mp3';
    fileIconMedia.classList.remove('hidden');
    fileIconDoc.classList.add('hidden');
    fileIconContainer.classList.remove('file-icon-doc');
    mediaFormatSection.classList.remove('hidden');
    docFormatSection.classList.add('hidden');
    conversionType.textContent = 'Media';
    conversionTarget.textContent = 'Audio';
    conversionBadge.classList.remove('badge-doc-mode');

    // Reset media format selection
    document.querySelectorAll('#formatOptions .format-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#formatOptions .format-btn[data-format="mp3"]').classList.add('active');
  }

  dropZone.classList.add('hidden');
  fileCard.classList.remove('hidden');

  // Reset states
  convertBtn.classList.remove('hidden');
  convertBtn.disabled = false;
  progressSection.classList.add('hidden');
  doneSection.classList.add('hidden');
  errorSection.classList.add('hidden');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function resetToDropZone() {
  selectedFile = null;
  currentConversionId = null;
  currentFileType = 'media';
  fileInput.value = '';
  fileCard.classList.add('hidden');
  dropZone.classList.remove('hidden');
  clearInterval(progressPollInterval);
}

// ===========================
// Remove & Reset
// ===========================
removeFile.addEventListener('click', resetToDropZone);
newConversionBtn.addEventListener('click', resetToDropZone);
retryBtn.addEventListener('click', resetToDropZone);

// ===========================
// Format Selection
// ===========================
formatOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.format-btn');
  if (!btn) return;

  document.querySelectorAll('#formatOptions .format-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedFormat = btn.dataset.format;
});

// ===========================
// Conversion
// ===========================
convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  convertBtn.disabled = true;
  progressSection.classList.remove('hidden');
  doneSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressLabel.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('format', selectedFormat);
  formData.append('originalName', selectedFile.name);

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Upload failed');
    }

    const data = await response.json();
    currentConversionId = data.conversionId;
    progressLabel.textContent = currentFileType === 'document'
      ? 'Converting document...'
      : 'Converting...';

    // Poll for progress
    pollProgress();
  } catch (err) {
    showError(err.message);
  }
});

function pollProgress() {
  progressPollInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/progress/${currentConversionId}`);
      const data = await response.json();

      if (data.status === 'processing') {
        const pct = Math.min(data.progress, 99);
        progressFill.style.width = pct + '%';
        progressPercent.textContent = pct + '%';

        // Show meaningful step labels for document conversion
        if (currentFileType === 'document') {
          if (pct < 30) progressLabel.textContent = 'Reading document...';
          else if (pct < 60) progressLabel.textContent = 'Converting to HTML...';
          else if (pct < 90) progressLabel.textContent = 'Generating PDF...';
          else progressLabel.textContent = 'Finalizing...';
        }
      } else if (data.status === 'done') {
        clearInterval(progressPollInterval);
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressLabel.textContent = 'Done!';

        setTimeout(() => {
          progressSection.classList.add('hidden');
          convertBtn.classList.add('hidden');
          doneSection.classList.remove('hidden');
        }, 500);
      } else if (data.status === 'error') {
        clearInterval(progressPollInterval);
        showError(data.error || 'Conversion failed');
      }
    } catch {
      clearInterval(progressPollInterval);
      showError('Lost connection to server');
    }
  }, 500);
}

function showError(message) {
  progressSection.classList.add('hidden');
  convertBtn.classList.add('hidden');
  errorSection.classList.remove('hidden');
  errorText.textContent = message;
}

// ===========================
// Download
// ===========================
downloadBtn.addEventListener('click', () => {
  if (!currentConversionId) return;
  window.location.href = `/api/download/${currentConversionId}`;
});
