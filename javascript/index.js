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

  async function loadGallery() {
    gallery.innerHTML = '';
    images = await window.imageAPI.getAllImages();
    Object.values(images).forEach(data => {
      const card = document.createElement('div');
      card.classList.add('image-card');

      const img = document.createElement('img');
      img.src = `file://${data.full_image_path}`;
      img.alt = data.file_name;
      card.appendChild(img);
      gallery.appendChild(card);

      card.addEventListener('click', () => {
        imgEl.src = img.src;
        imgEl.alt = data.file_name;
        descEl.value = data.description || '';
        renderBubbles(data.tags || []);
        toggleTagSelector(false);
        gallery.classList.add('hidden');
        detailsPane.classList.remove('hidden');
      });
    });
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

  // —— Delete button ——  
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete this image?')) return;
    await window.imageAPI.deleteImage(imgEl.alt);
    detailsPane.classList.add('hidden');
    gallery.classList.remove('hidden');
    await loadGallery();
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
      const imageObj = images[name] || {};
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
});
