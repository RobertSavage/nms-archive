// javascript/upload_image.js
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

// Drag & drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
});

// Paste
dropZone.addEventListener('paste', e => {
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
  if (fileInput.files.length) handleFileUpload(fileInput.files[0]);
});

// Upload handler
async function handleFileUpload(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload a valid image file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const base64Data = reader.result.split(',')[1];
      if (!base64Data) throw new Error('No Base64 data');
      await window.imageAPI.writeImage(file.name, base64Data);

      // 1) Hide upload popup
      document.querySelector('.add-image-container').classList.add('hidden');
      // 2) Show gallery
      document.querySelector('.image-display').classList.remove('hidden');
      // 3) Refresh gallery
      if (window.loadGallery) await window.loadGallery();
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload image. Please try again.');
    }
    // Reset the input so same file can be selected again
    fileInput.value = '';
  };
  reader.readAsDataURL(file);
}
