// javascript/index.js
document.addEventListener('DOMContentLoaded', async () => {
  // —— UI elements ——  
  const addImageBtn = document.getElementById('add-image-button');
  const uploadContainer = document.querySelector('.add-image-container');
  const uploadBack = document.getElementById('upload-back');
  const gallery = document.querySelector('.image-display');

  const detailsPane = document.querySelector('.details.page');
  const detailsBack = document.getElementById('details-back');
  const deleteBtn = document.getElementById('delete-btn');
  const imgEl = detailsPane.querySelector('.details-image');
  const descEl = detailsPane.querySelector('.details-desc');
  const bubbleContainer = detailsPane.querySelector('.tag-bubble-container');
  const addTagBtn = document.getElementById('add-tag-btn');
  const tagSelector = detailsPane.querySelector('.tag-selector');

  // —— Filter UI elements ——  
  const filterBtn = document.getElementById('filter-tag-btn');
  const filterSelector = document.getElementById('filter-selector');
  const filterBubbles = document.querySelector('.filter-bubble-container');
  let filterTags = [];

  // —— Popup toggles ——  
  addImageBtn.addEventListener('click', () => uploadContainer.classList.toggle('hidden'));
  uploadBack.addEventListener('click', () => uploadContainer.classList.add('hidden'));
  detailsBack.addEventListener('click', () => {
    detailsPane.classList.add('hidden');
    gallery.classList.remove('hidden');
    tagSelector.classList.add('hidden');
  });

  // —— Load tags once ——  
  const allTags = await window.imageAPI.getAllTags();
  let images    = {};

  // —— Helpers ——  
  function renderBubbles(tags) {
    bubbleContainer.innerHTML = '';
    tags.forEach(tag => {
      const span = document.createElement('span');
      span.classList.add('tag-bubble');
      span.textContent = tag;
      bubbleContainer.appendChild(span);
    });
  }

  function toggleTagSelector(show = null) {
    if (show === null) {
      tagSelector.classList.toggle('hidden');
      tagSelector.classList.toggle('visible');
    } else {
      tagSelector.classList.toggle('hidden', !show);
      tagSelector.classList.toggle('visible', show);
    }
  }

  function renderTagSelector(currentImage) {
    tagSelector.innerHTML = '';
    Object.entries(allTags).forEach(([category, tagList]) => {
      const catTitle = document.createElement('div');
      catTitle.classList.add('category-title');
      catTitle.textContent = category;
      tagSelector.appendChild(catTitle);

      tagList.forEach(tag => {
        const btn = document.createElement('button');
        btn.classList.add('tag-button');
        btn.textContent = tag;
        if (currentImage.tags.includes(tag)) btn.classList.add('active');

        btn.addEventListener('click', async () => {
          let updated;
          if (currentImage.tags.includes(tag)) {
            updated = currentImage.tags.filter(t => t !== tag);
            btn.classList.remove('active');
          } else {
            updated = [...currentImage.tags, tag];
            btn.classList.add('active');
          }
          await window.imageAPI.updateImageTags(currentImage.file_name, updated);
          currentImage.tags = updated;
          renderBubbles(updated);
        });

        tagSelector.appendChild(btn);
      });
    });
  }

  // Enhanced loadGallery with error handling and loading states
  async function loadGallery() {
    try {
      // Show loading state
      gallery.innerHTML = '<div class="loading-spinner">Loading images...</div>';
      
      console.log('Loading gallery...');
      const images = await window.imageAPI.getAllImages();
      
      // Clear loading state
      gallery.innerHTML = '';
      
      // Store images globally for filtering
      window.images = images;
      
      const imageEntries = Object.values(images);
      console.log(`Loaded ${imageEntries.length} images`);
      
      if (imageEntries.length === 0) {
        gallery.innerHTML = '<div class="empty-state">No images found. Click "Add Image" to get started!</div>';
        return;
      }
      
      imageEntries.forEach((data, index) => {
        const card = document.createElement('div');
        card.classList.add('image-card');
        
        // Add loading class initially
        card.classList.add('loading');
        
        const img = document.createElement('img');
        img.src = `file://${data.full_image_path}`;
        img.alt = data.file_name;
        
        // Show integrity warning if present
        if (data.integrity_warning) {
          const warning = document.createElement('div');
          warning.className = 'integrity-warning';
          warning.textContent = '⚠️';
          warning.title = 'File integrity warning - image may be corrupted';
          card.appendChild(warning);
        }
        
        // Handle image load events
        img.onload = () => {
          card.classList.remove('loading');
          console.log(`Image loaded: ${data.file_name}`);
        };
        
        img.onerror = () => {
          card.classList.remove('loading');
          card.classList.add('error');
          console.error(`Failed to load image: ${data.file_name}`);
          img.alt = 'Failed to load image';
          img.src = 'data:image/svg+xml;base64,' + btoa(`
            <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
              <rect width="100%" height="100%" fill="#333"/>
              <text x="50%" y="50%" text-anchor="middle" fill="#666" font-family="Arial" font-size="12">
                Image not found
              </text>
            </svg>
          `);
        };
        
        card.appendChild(img);
        gallery.appendChild(card);

        // Enhanced click handler with error handling
        card.addEventListener('click', () => {
          try {
            imgEl.src = img.src;
            imgEl.alt = data.file_name;
            descEl.value = data.description || '';
            renderBubbles(data.tags || []);
            toggleTagSelector(false);
            gallery.classList.add('hidden');
            detailsPane.classList.remove('hidden');
          } catch (error) {
            console.error('Error opening image details:', error);
            alert(`Failed to open image details: ${error.message}`);
          }
        });
      });
      
    } catch (error) {
      console.error('Error loading gallery:', error);
      gallery.innerHTML = `<div class="error-state">Failed to load images: ${error.message}</div>`;
    }
  }

  // expose for upload script
  window.loadGallery = loadGallery;

  // initial load
  await loadGallery();

  // optional: refresh on images-updated event
  window.addEventListener('images-updated', async () => {
    uploadContainer.classList.add('hidden');
    detailsPane.classList.add('hidden');
    tagSelector.classList.add('hidden');
    gallery.classList.remove('hidden');
    await loadGallery();
  });

  // —— “+ Add Tag” toggles selector ——  
  addTagBtn.addEventListener('click', () => {
    const current = Object.values(images)
      .find(i => i.file_name === imgEl.alt);
    if (!current) return;
    renderTagSelector(current);
    toggleTagSelector();
  });

  // —— Click outside closes tag-selector ——  
  document.addEventListener('click', e => {
    if (!tagSelector.contains(e.target) && e.target !== addTagBtn) {
      toggleTagSelector(false);
    }
  });

  // Enhanced delete button with better error handling
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
      const fileName = imgEl.alt;
      console.log(`Deleting image: ${fileName}`);
      
      const result = await window.imageAPI.deleteImage(fileName);
      
      if (result.success) {
        console.log('Delete successful:', result);
        detailsPane.classList.add('hidden');
        gallery.classList.remove('hidden');
        await loadGallery();
      } else {
        throw new Error('Delete operation failed');
      }
      
    } catch (error) {
      console.error('Delete error:', error);
      alert(`Failed to delete image: ${error.message}`);
    }
  });

  // —— Filter helpers ——  
  function renderFilterBubbles() {
    filterBubbles.innerHTML = '';
    filterTags.forEach(tag => {
      const span = document.createElement('span');
      span.classList.add('filter-bubble');
      span.textContent = tag;
      span.addEventListener('click', () => {
        filterTags = filterTags.filter(t => t !== tag);
        renderFilterBubbles();
        updateGalleryFilter();
      });
      filterBubbles.appendChild(span);
    });
  }

  function toggleFilterSelector() {
    filterSelector.classList.toggle('visible');
  }

  function renderFilterSelector() {
    filterSelector.innerHTML = '';
    Object.entries(allTags).forEach(([category, tagList]) => {
      const catTitle = document.createElement('div');
      catTitle.classList.add('category-title');
      catTitle.textContent = category;
      filterSelector.appendChild(catTitle);

      tagList.forEach(tag => {
        const btn = document.createElement('button');
        btn.classList.add('tag-button');
        btn.textContent = tag;
        if (filterTags.includes(tag)) btn.classList.add('active');
        btn.addEventListener('click', () => {
          if (filterTags.includes(tag)) {
            filterTags = filterTags.filter(t => t !== tag);
            btn.classList.remove('active');
          } else {
            filterTags.push(tag);
            btn.classList.add('active');
          }
          renderFilterBubbles();
          updateGalleryFilter();
        });
        filterSelector.appendChild(btn);
      });
    });
  }

  function updateGalleryFilter() {
    document.querySelectorAll('.image-card').forEach(card => {
      const name = card.querySelector('img').alt;
      const imageObj = window.images[name] || {};
      const matches = filterTags.every(tag => (imageObj.tags || []).includes(tag));
      card.style.display = matches ? '' : 'none';
    });
  }

  // —— Filter events ——  
  filterBtn.addEventListener('click', () => {
    renderFilterSelector();
    toggleFilterSelector();
  });
  document.addEventListener('click', e => {
    if (!filterSelector.contains(e.target) && e.target !== filterBtn) {
      filterSelector.classList.remove('visible');
    }
  });

  // —— Health Check functionality ——
  const healthCheckBtn = document.getElementById('health-check-btn');
  const healthCheckModal = document.querySelector('.health-check-modal');
  const healthClose = document.getElementById('health-close');
  const runHealthCheck = document.getElementById('run-health-check');
  const repairDatabase = document.getElementById('repair-database');
  const healthResults = document.getElementById('health-results');

  healthCheckBtn.addEventListener('click', () => {
    healthCheckModal.classList.remove('hidden');
  });

  healthClose.addEventListener('click', () => {
    healthCheckModal.classList.add('hidden');
  });

  runHealthCheck.addEventListener('click', async () => {
    try {
      runHealthCheck.disabled = true;
      runHealthCheck.textContent = 'Running...';
      healthResults.innerHTML = '<div class="loading-spinner">Running health check...</div>';

      const results = await window.imageAPI.healthCheck();
      displayHealthResults(results);

    } catch (error) {
      console.error('Health check error:', error);
      healthResults.innerHTML = `<div class="error-state">Health check failed: ${error.message}</div>`;
    } finally {
      runHealthCheck.disabled = false;
      runHealthCheck.textContent = 'Run Health Check';
    }
  });

  repairDatabase.addEventListener('click', async () => {
    if (!confirm('This will repair the database and may remove corrupted entries. Continue?')) return;

    try {
      repairDatabase.disabled = true;
      repairDatabase.textContent = 'Repairing...';

      const results = await window.imageAPI.repairDatabase();
      
      if (results.success) {
        alert(`Repair completed: ${results.message}`);
        if (results.repaired) {
          await loadGallery(); // Reload gallery after repair
        }
      }

    } catch (error) {
      console.error('Repair error:', error);
      alert(`Repair failed: ${error.message}`);
    } finally {
      repairDatabase.disabled = false;
      repairDatabase.textContent = 'Repair Database';
    }
  });

  function displayHealthResults(results) {
    const html = `
      <div class="health-results">
        <div class="health-item">
          <span>Manager File</span>
          <span class="health-status ${results.managerExists ? 'good' : 'error'}">
            ${results.managerExists ? 'OK' : 'Missing'}
          </span>
        </div>
        <div class="health-item">
          <span>Images Directory</span>
          <span class="health-status ${results.imagesPathExists ? 'good' : 'error'}">
            ${results.imagesPathExists ? 'OK' : 'Missing'}
          </span>
        </div>
        <div class="health-item">
          <span>Total Images</span>
          <span class="health-status good">${results.totalImages}</span>
        </div>
        <div class="health-item">
          <span>Valid Images</span>
          <span class="health-status ${results.validImages === results.totalImages ? 'good' : 'warning'}">
            ${results.validImages}
          </span>
        </div>
        <div class="health-item">
          <span>Missing Files</span>
          <span class="health-status ${results.missingFiles.length === 0 ? 'good' : 'warning'}">
            ${results.missingFiles.length}
          </span>
        </div>
        <div class="health-item">
          <span>Orphaned Files</span>
          <span class="health-status ${results.orphanedFiles.length === 0 ? 'good' : 'warning'}">
            ${results.orphanedFiles.length}
          </span>
        </div>
        <div class="health-item">
          <span>Corrupted Images</span>
          <span class="health-status ${results.corruptedImages.length === 0 ? 'good' : 'error'}">
            ${results.corruptedImages.length}
          </span>
        </div>
        <div class="health-item">
          <span>Backups Available</span>
          <span class="health-status ${results.backupsAvailable >= 2 ? 'good' : 'warning'}">
            ${results.backupsAvailable}
          </span>
        </div>
        ${results.recommendations.length > 0 ? `
          <div class="recommendations">
            <h4>Recommendations:</h4>
            <ul>
              ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
    healthResults.innerHTML = html;
  }

  // Listen for system notifications
  if (window.imageAPI) {
    window.imageAPI.onImageDeleteSuccess((event, data) => {
      console.log('Delete success notification:', data);
    });

    window.imageAPI.onImageDeleteError((event, data) => {
      console.error('Delete error notification:', data);
      alert(`Delete failed: ${data.error}`);
    });

    window.imageAPI.onImageTagsUpdated((event, data) => {
      console.log('Tags updated notification:', data);
    });

    window.imageAPI.onImageTagsUpdateError((event, data) => {
      console.error('Tag update error notification:', data);
      alert(`Tag update failed: ${data.error}`);
    });
  }
});
