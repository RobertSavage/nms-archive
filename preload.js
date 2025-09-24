const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('imageAPI', {
  readImage: (filePath) => ipcRenderer.invoke('read-image', filePath),
  writeImage: (fileName, data) => {
    console.log('IN PRELOAD - fileName:', fileName);
    console.log('IN PRELOAD - data length:', data ? data.length : 'No data');
    return ipcRenderer.invoke('write-image', fileName, data);
  },
  getAllImages: () => {return ipcRenderer.invoke('get-all-images')},
  getAllTags: () => {return ipcRenderer.invoke('get-all-tags')},
  updateImageTags: (fileName, tags) => 
    ipcRenderer.invoke('update-image-tags', fileName, tags),
  deleteImage: (fileName) => ipcRenderer.invoke('delete-image', fileName),
  healthCheck: () => ipcRenderer.invoke('health-check'),
  repairDatabase: (options) => ipcRenderer.invoke('repair-database', options),

  // Event listeners for notifications
  onImageWriteSuccess: (callback) => ipcRenderer.on('image-write-success', callback),
  onImageWriteError: (callback) => ipcRenderer.on('image-write-error', callback),
  onImageDeleteSuccess: (callback) => ipcRenderer.on('image-delete-success', callback),
  onImageDeleteError: (callback) => ipcRenderer.on('image-delete-error', callback),
  onImageTagsUpdated: (callback) => ipcRenderer.on('image-tags-updated', callback),
  onImageTagsUpdateError: (callback) => ipcRenderer.on('image-tags-update-error', callback),

});
