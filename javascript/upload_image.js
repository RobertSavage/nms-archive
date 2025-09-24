// javascript/upload_image.js
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

// Enhanced UI feedback
function showUploadProgress(message, isError = false) {
  const progressEl = document.createElement('div');
  progressEl.className = `upload-progress ${isError ? 'error' : 'success'}`;
  progressEl.textContent = message;
  progressEl.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: var(--radius);
    background: ${isError ? 'var(--danger)' : 'var(--success)'};
    color: white;
    font-weight: 500;
    z-index: 1000;
    animation: slideIn 0.3s ease;
    box-shadow: var(--shadow);
  `;
  
  document.body.appendChild(progressEl);
  
  setTimeout(() => {
    progressEl.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => progressEl.remove(), 300);
  }, 3000);
}

// Enhanced drag & drop with visual feedback
let dragCounter = 0;

dropZone.addEventListener('dragenter', e => {
  e.preventDefault();
  dragCounter++;
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', e => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dropZone.classList.remove('dragover');
    dragCounter = 0;
  }
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  dragCounter = 0;
  
  if (e.dataTransfer.files.length > 0) {
    handleFileUpload(e.dataTransfer.files[0]);
  }
});

// Enhanced paste support
dropZone.addEventListener('paste', e => {
  e.preventDefault();
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) {
      handleFileUpload(item.getAsFile());
      break;
    }
  }
});

// Click to browse
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    handleFileUpload(fileInput.files[0]);
  }
});

// Enhanced upload handler with better error handling and validation
async function handleFileUpload(file) {
  if (!file) {
    showUploadProgress('No file selected', true);
    return;
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showUploadProgress('Please upload a valid image file', true);
    return;
  }

  // Validate file size (max 50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    showUploadProgress('Image file too large (max 50MB)', true);
    return;
  }

  // Show upload progress
  showUploadProgress(`Uploading ${file.name}...`);
  
  // Add loading state to drop zone
  dropZone.classList.add('uploading');
  dropZone.innerHTML = '<p>Processing upload...</p>';

  try {
    const reader = new FileReader();
    
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(',')[1];
        if (!base64Data) {
          throw new Error('No Base64 data generated');
        }

        console.log(`Uploading image: ${file.name} (${file.size} bytes)`);
        
        // Enhanced write with detailed response
        const result = await window.imageAPI.writeImage(file.name, base64Data);
        
        if (result.success) {
          showUploadProgress(`Successfully uploaded ${result.fileName}`);
          console.log('Upload successful:', result);
          
          // Reset UI
          document.querySelector('.add-image-container').classList.add('hidden');
          document.querySelector('.image-display').classList.remove('hidden');
          
          // Refresh gallery
          if (window.loadGallery) {
            await window.loadGallery();
          }
        } else {
          throw new Error('Upload failed with unknown error');
        }
        
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        showUploadProgress(`Upload failed: ${uploadError.message}`, true);
      } finally {
        // Reset drop zone
        resetDropZone();
        fileInput.value = '';
      }
    };

    reader.onerror = () => {
      console.error('File reader error');
      showUploadProgress('Failed to read file', true);
      resetDropZone();
      fileInput.value = '';
    };

    // Start reading the file
    reader.readAsDataURL(file);
    
  } catch (error) {
    console.error('Unexpected error during upload:', error);
    showUploadProgress(`Unexpected error: ${error.message}`, true);
    resetDropZone();
    fileInput.value = '';
  }
}

function resetDropZone() {
  dropZone.classList.remove('uploading');
  dropZone.innerHTML = '<p>Drag & drop, paste, or click to upload</p>';
}

// Listen for upload notifications from main process
if (window.imageAPI) {
  window.imageAPI.onImageWriteSuccess((event, data) => {
    console.log('Upload success notification:', data);
    showUploadProgress(`Successfully saved ${data.fileName} (${(data.fileSize / 1024).toFixed(1)}KB)`);
  });

  window.imageAPI.onImageWriteError((event, data) => {
    console.error('Upload error notification:', data);
    showUploadProgress(`Upload failed: ${data.error}`, true);
  });
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

.drop-zone.uploading {
  border-color: var(--accent) !important;
  background: rgba(108, 92, 231, 0.1) !important;
  pointer-events: none;
}

.drop-zone.uploading p {
  color: var(--accent);
  font-weight: 600;
}
`;
document.head.appendChild(style);
