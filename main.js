const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

let mainWindow;
app.on('ready', () => {
    mainWindow = new BrowserWindow({
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: false,
            nodeIntegration: false,
        },
    });
    
    mainWindow.loadFile('pages/index.html');
});


// Get the user settigs for the app
let user_settings = fs.readFileSync('user_settings.json', 'utf-8')
user_settings = JSON.parse(user_settings)


// If there is no user settigs for a file path add it
if (!Object.keys(user_settings).includes('images_path')){
    user_settings['images_path'] = path.join(os.homedir(), 'Documents', 'nms-archive-images');
    fs.writeFileSync('user_settings.json', JSON.stringify(user_settings));
}


// Read images handler function
ipcMain.handle('read-image', async (filePath) => {
    try {
      const data = fs.readFileSync(filePath);
      return data.toString('base64');
    } catch (error) {
      console.error('Error reading image:', error);
      throw error;
    }
});


// Write images handler function
// main.js
ipcMain.handle('write-image', async (event, fileName, data) => {
    try {
      // Ensure images_path exists
      const imagesPath = user_settings['images_path'];
      if (!fs.existsSync(imagesPath)) {
        fs.mkdirSync(imagesPath, { recursive: true });
      }
  
      // Load current manager JSON
      const managerFile = 'image_manager.json';
      let imageManager = JSON.parse(fs.readFileSync(managerFile, 'utf-8'));
  
      // Split name and ext
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
  
      // Find a unique filename
      let uniqueName = fileName;
      let counter = 1;
      // While name already in JSON or on disk, bump counter
      while (
        imageManager[uniqueName] ||
        fs.existsSync(path.join(imagesPath, uniqueName))
      ) {
        uniqueName = `${base}_${counter}${ext}`;
        counter++;
      }
  
      // Write the file
      const filePath = path.join(imagesPath, uniqueName);
      const buffer   = Buffer.from(data, 'base64');
      fs.writeFileSync(filePath, buffer);
  
      // Update JSON
      imageManager[uniqueName] = {
        file_name: uniqueName,
        tags: [],
        description: '',
        date_uploaded: new Date().toISOString(),
      };
      fs.writeFileSync(managerFile, JSON.stringify(imageManager, null, 2), 'utf-8');
  
      return filePath;
    } catch (error) {
      console.error('Error writing image:', error);
      throw error;
    }
  });
  


// Write images handler function
ipcMain.handle('get-all-images', async (event) => {
    try {
        // Get images from image manager
        let image_manager = fs.readFileSync('image_manager.json', 'utf-8')
        image_manager = JSON.parse(image_manager)
        
        // get the full path of the image and add it to the JSON
        for (let index = 0; index < Object.keys(image_manager).length; index++) {
            image_manager[Object.keys(image_manager)[index]]['full_image_path'] = path.join(user_settings['images_path'], Object.keys(image_manager)[index]);
        }

        // Return the obj
        return image_manager;

    } catch (error) {
        console.error('Error fetching image:', error);
        throw error;
    }
});


// Write images handler function
ipcMain.handle('get-all-tags', async (event) => {
    try {
        // Get images from image manager
        let tags = fs.readFileSync('tags.json', 'utf-8')
        tags = JSON.parse(tags)

        return tags;

    } catch (error) {
        console.error('Error fetching tags:', error);
        throw error;
    }
});

const managerPath = path.join(__dirname, 'image_manager.json');
ipcMain.handle('update-image-tags', async (event, fileName, tags) => {
    // 1. Read the JSON
    const raw = fs.readFileSync(managerPath, 'utf-8');
    const imageManager = JSON.parse(raw);
  
    // 2. Update the specific image entry
    if (!imageManager[fileName]) {
      throw new Error(`Image ${fileName} not found in manager`);
    }
    imageManager[fileName].tags = tags;
  
    // 3. Write it back
    fs.writeFileSync(managerPath, JSON.stringify(imageManager, null, 2), 'utf-8');
  
    // 4. Return the updated record
    return imageManager[fileName];
  });

  // main.js (add below your existing handlers)

ipcMain.handle('delete-image', async (event, fileName) => {
    const imagesPath = user_settings['images_path'];
    const managerFile = 'image_manager.json';
  
    // Load and parse JSON
    let imageManager = JSON.parse(fs.readFileSync(managerFile, 'utf-8'));
  
    // If not found, bail
    if (!imageManager[fileName]) {
      throw new Error(`Image "${fileName}" not found in manager`);
    }
  
    // Delete the file on disk
    const filePath = path.join(imagesPath, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  
    // Remove from JSON and write back
    delete imageManager[fileName];
    fs.writeFileSync(managerFile, JSON.stringify(imageManager, null, 2), 'utf-8');
  
    return true;
  });
  