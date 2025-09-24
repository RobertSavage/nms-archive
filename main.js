const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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

// Enhanced utility functions for reliable file operations
const fileUtils = {
    // Create backup of a file with timestamp
    createBackup: (filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = `${filePath}.backup.${timestamp}`;
                fs.copyFileSync(filePath, backupPath);
                
                // Keep only last 5 backups
                const dir = path.dirname(filePath);
                const baseName = path.basename(filePath);
                const backups = fs.readdirSync(dir)
                    .filter(f => f.startsWith(`${baseName}.backup.`))
                    .sort()
                    .reverse();
                
                if (backups.length > 5) {
                    for (let i = 5; i < backups.length; i++) {
                        fs.unlinkSync(path.join(dir, backups[i]));
                    }
                }
                
                return backupPath;
            }
        } catch (error) {
            console.error('Error creating backup:', error);
        }
        return null;
    },

    // Atomic write operation with temporary file
    atomicWrite: (filePath, data, encoding = 'utf-8') => {
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        try {
            // Write to temporary file first
            fs.writeFileSync(tempPath, data, encoding);
            
            // Verify write by reading back
            const written = fs.readFileSync(tempPath, encoding);
            if (written !== data) {
                throw new Error('Data verification failed');
            }
            
            // Atomically move temp file to final location
            fs.renameSync(tempPath, filePath);
            return true;
        } catch (error) {
            // Clean up temp file on error
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
            throw error;
        }
    },

    // Calculate file hash for integrity checking
    calculateHash: (filePath) => {
        try {
            const data = fs.readFileSync(filePath);
            return crypto.createHash('sha256').update(data).digest('hex');
        } catch (error) {
            console.error('Error calculating hash:', error);
            return null;
        }
    },

    // Validate image data
    validateImageData: (base64Data) => {
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Check minimum file size (1KB)
            if (buffer.length < 1024) {
                throw new Error('Image data too small');
            }
            
            // Check for common image file signatures
            const signatures = {
                'jpeg': [0xFF, 0xD8, 0xFF],
                'png': [0x89, 0x50, 0x4E, 0x47],
                'gif': [0x47, 0x49, 0x46, 0x38],
                'webp': [0x52, 0x49, 0x46, 0x46],
                'bmp': [0x42, 0x4D]
            };
            
            let isValidImage = false;
            for (const [format, signature] of Object.entries(signatures)) {
                if (signature.every((byte, i) => buffer[i] === byte)) {
                    isValidImage = true;
                    break;
                }
            }
            
            if (!isValidImage) {
                throw new Error('Invalid image format');
            }
            
            return buffer;
        } catch (error) {
            throw new Error(`Image validation failed: ${error.message}`);
        }
    }
};

// Get the user settings for the app
let user_settings = {};
try {
    user_settings = JSON.parse(fs.readFileSync('user_settings.json', 'utf-8'));
} catch (error) {
    console.error('Error reading user settings:', error);
    user_settings = {};
}

// If there is no user settings for a file path add it
if (!user_settings.images_path) {
    user_settings.images_path = path.join(os.homedir(), 'Documents', 'nms-archive-images');
    try {
        fileUtils.atomicWrite('user_settings.json', JSON.stringify(user_settings, null, 2));
    } catch (error) {
        console.error('Error saving user settings:', error);
    }
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


// Enhanced write images handler function with reliability improvements
ipcMain.handle('write-image', async (event, fileName, data) => {
    const managerFile = path.join(__dirname, 'image_manager.json');
    let tempImagePath = null;
    
    try {
        // Validate input parameters
        if (!fileName || typeof fileName !== 'string') {
            throw new Error('Invalid filename provided');
        }
        if (!data || typeof data !== 'string') {
            throw new Error('Invalid image data provided');
        }
        
        // Validate and convert image data
        const buffer = fileUtils.validateImageData(data);
        
        // Ensure images directory exists
        const imagesPath = user_settings.images_path;
        if (!fs.existsSync(imagesPath)) {
            fs.mkdirSync(imagesPath, { recursive: true });
        }
        
        // Create backup of manager file before modification
        const backupPath = fileUtils.createBackup(managerFile);
        console.log(`Created backup: ${backupPath}`);
        
        // Load current manager JSON with error handling
        let imageManager = {};
        try {
            if (fs.existsSync(managerFile)) {
                const managerData = fs.readFileSync(managerFile, 'utf-8');
                imageManager = JSON.parse(managerData);
            }
        } catch (parseError) {
            console.error('Error parsing image manager, creating new one:', parseError);
            imageManager = {};
        }
        
        // Generate unique filename with enhanced logic
        const ext = path.extname(fileName).toLowerCase();
        const base = path.basename(fileName, ext);
        const sanitizedBase = base.replace(/[^a-zA-Z0-9_-]/g, '_'); // Sanitize filename
        
        let uniqueName = `${sanitizedBase}${ext}`;
        let counter = 1;
        const maxAttempts = 1000; // Prevent infinite loops
        
        while (
            (imageManager[uniqueName] || fs.existsSync(path.join(imagesPath, uniqueName))) 
            && counter < maxAttempts
        ) {
            uniqueName = `${sanitizedBase}_${counter}${ext}`;
            counter++;
        }
        
        if (counter >= maxAttempts) {
            throw new Error('Unable to generate unique filename');
        }
        
        // Write the image file with error recovery
        const filePath = path.join(imagesPath, uniqueName);
        tempImagePath = filePath; // Track for cleanup
        
        let writeAttempts = 0;
        const maxWriteAttempts = 3;
        let writeSuccess = false;
        
        while (!writeSuccess && writeAttempts < maxWriteAttempts) {
            try {
                fs.writeFileSync(filePath, buffer);
                
                // Verify the written file
                const writtenData = fs.readFileSync(filePath);
                if (writtenData.length !== buffer.length) {
                    throw new Error('File size mismatch after write');
                }
                
                const originalHash = crypto.createHash('sha256').update(buffer).digest('hex');
                const writtenHash = crypto.createHash('sha256').update(writtenData).digest('hex');
                
                if (originalHash !== writtenHash) {
                    throw new Error('File integrity check failed');
                }
                
                writeSuccess = true;
                console.log(`Successfully wrote image: ${uniqueName}`);
            } catch (writeError) {
                writeAttempts++;
                console.error(`Write attempt ${writeAttempts} failed:`, writeError);
                
                // Clean up failed attempt
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                
                if (writeAttempts >= maxWriteAttempts) {
                    throw new Error(`Failed to write image after ${maxWriteAttempts} attempts: ${writeError.message}`);
                }
                
                // Wait briefly before retry
                await new Promise(resolve => setTimeout(resolve, 100 * writeAttempts));
            }
        }
        
        // Calculate file hash for integrity tracking
        const fileHash = fileUtils.calculateHash(filePath);
        
        // Update JSON with atomic write
        imageManager[uniqueName] = {
            file_name: uniqueName,
            tags: [],
            description: '',
            date_uploaded: new Date().toISOString(),
            file_size: buffer.length,
            file_hash: fileHash,
            original_name: fileName
        };
        
        // Atomic write of updated manager file
        try {
            fileUtils.atomicWrite(managerFile, JSON.stringify(imageManager, null, 2));
            console.log('Successfully updated image manager');
        } catch (managerError) {
            // If manager update fails, clean up the image file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            throw new Error(`Failed to update image manager: ${managerError.message}`);
        }
        
        // Send progress notification to UI
        if (mainWindow) {
            mainWindow.webContents.send('image-write-success', {
                fileName: uniqueName,
                filePath: filePath,
                fileSize: buffer.length
            });
        }
        
        return {
            success: true,
            filePath: filePath,
            fileName: uniqueName,
            fileSize: buffer.length,
            hash: fileHash
        };
        
    } catch (error) {
        console.error('Error in write-image:', error);
        
        // Cleanup on error
        if (tempImagePath && fs.existsSync(tempImagePath)) {
            try {
                fs.unlinkSync(tempImagePath);
                console.log('Cleaned up temporary image file');
            } catch (cleanupError) {
                console.error('Error cleaning up temporary file:', cleanupError);
            }
        }
        
        // Send error notification to UI
        if (mainWindow) {
            mainWindow.webContents.send('image-write-error', {
                error: error.message,
                originalFileName: fileName
            });
        }
        
        throw error;
    }
});
  


// Enhanced get-all-images handler with reliability improvements
ipcMain.handle('get-all-images', async (event) => {
    const managerFile = path.join(__dirname, 'image_manager.json');
    
    try {
        // Check if manager file exists
        if (!fs.existsSync(managerFile)) {
            console.log('Image manager file not found, returning empty object');
            return {};
        }
        
        // Load and parse image manager with validation
        let imageManager = {};
        try {
            const managerData = fs.readFileSync(managerFile, 'utf-8');
            imageManager = JSON.parse(managerData);
        } catch (parseError) {
            console.error('Error parsing image manager:', parseError);
            // Try to recover from backup
            const backupFiles = fs.readdirSync(__dirname)
                .filter(f => f.startsWith('image_manager.json.backup.'))
                .sort()
                .reverse();
                
            if (backupFiles.length > 0) {
                console.log(`Attempting recovery from backup: ${backupFiles[0]}`);
                try {
                    const backupData = fs.readFileSync(path.join(__dirname, backupFiles[0]), 'utf-8');
                    imageManager = JSON.parse(backupData);
                    console.log('Successfully recovered from backup');
                } catch (backupError) {
                    console.error('Backup recovery failed:', backupError);
                    throw new Error('Image manager corrupted and backup recovery failed');
                }
            } else {
                throw new Error('Image manager corrupted and no backup available');
            }
        }
        
        // Validate and clean up the image manager
        const validatedManager = {};
        const imagesPath = user_settings.images_path;
        let cleanupNeeded = false;
        
        for (const [fileName, imageData] of Object.entries(imageManager)) {
            try {
                const fullPath = path.join(imagesPath, fileName);
                
                // Check if file exists
                if (!fs.existsSync(fullPath)) {
                    console.warn(`Image file missing: ${fileName}`);
                    cleanupNeeded = true;
                    continue;
                }
                
                // Verify file integrity if hash is available
                if (imageData.file_hash) {
                    const currentHash = fileUtils.calculateHash(fullPath);
                    if (currentHash !== imageData.file_hash) {
                        console.warn(`File integrity check failed for: ${fileName}`);
                        // Mark but don't remove - let user decide
                        imageData.integrity_warning = true;
                    }
                }
                
                // Add full path and validate data structure
                validatedManager[fileName] = {
                    file_name: imageData.file_name || fileName,
                    tags: Array.isArray(imageData.tags) ? imageData.tags : [],
                    description: imageData.description || '',
                    date_uploaded: imageData.date_uploaded || new Date().toISOString(),
                    file_size: imageData.file_size || 0,
                    file_hash: imageData.file_hash || null,
                    original_name: imageData.original_name || fileName,
                    full_image_path: fullPath,
                    integrity_warning: imageData.integrity_warning || false
                };
                
            } catch (error) {
                console.error(`Error validating image ${fileName}:`, error);
                cleanupNeeded = true;
            }
        }
        
        // If cleanup is needed, update the manager file
        if (cleanupNeeded) {
            console.log('Cleaning up image manager...');
            try {
                fileUtils.createBackup(managerFile);
                fileUtils.atomicWrite(managerFile, JSON.stringify(validatedManager, null, 2));
                console.log('Image manager cleaned up successfully');
            } catch (cleanupError) {
                console.error('Error cleaning up image manager:', cleanupError);
            }
        }
        
        console.log(`Loaded ${Object.keys(validatedManager).length} images`);
        return validatedManager;
        
    } catch (error) {
        console.error('Error in get-all-images:', error);
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

// Enhanced update-image-tags handler with reliability improvements
ipcMain.handle('update-image-tags', async (event, fileName, tags) => {
    const managerPath = path.join(__dirname, 'image_manager.json');
    
    try {
        // Validate input parameters
        if (!fileName || typeof fileName !== 'string') {
            throw new Error('Invalid filename provided');
        }
        
        if (!Array.isArray(tags)) {
            throw new Error('Tags must be an array');
        }
        
        // Sanitize tags - remove duplicates and validate strings
        const sanitizedTags = [...new Set(tags)]
            .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
            .map(tag => tag.trim());
        
        console.log(`Updating tags for ${fileName}:`, sanitizedTags);
        
        // Create backup before modification
        const backupPath = fileUtils.createBackup(managerPath);
        console.log(`Created backup for tag update: ${backupPath}`);
        
        // Read the JSON with error handling
        let imageManager = {};
        try {
            if (fs.existsSync(managerPath)) {
                const raw = fs.readFileSync(managerPath, 'utf-8');
                imageManager = JSON.parse(raw);
            }
        } catch (parseError) {
            console.error('Error parsing image manager during tag update:', parseError);
            throw new Error('Image manager corrupted, cannot update tags');
        }
        
        // Check if image exists
        if (!imageManager[fileName]) {
            throw new Error(`Image ${fileName} not found in manager`);
        }
        
        // Store original tags for rollback if needed
        const originalTags = imageManager[fileName].tags || [];
        
        // Update the tags and timestamp
        imageManager[fileName].tags = sanitizedTags;
        imageManager[fileName].last_modified = new Date().toISOString();
        
        // Atomic write with validation
        try {
            fileUtils.atomicWrite(managerPath, JSON.stringify(imageManager, null, 2));
            console.log(`Successfully updated tags for ${fileName}`);
        } catch (writeError) {
            console.error('Error writing updated tags:', writeError);
            throw new Error(`Failed to save tag updates: ${writeError.message}`);
        }
        
        // Send success notification to UI
        if (mainWindow) {
            mainWindow.webContents.send('image-tags-updated', {
                fileName: fileName,
                newTags: sanitizedTags,
                previousTags: originalTags
            });
        }
        
        // Return the updated record
        return {
            success: true,
            fileName: fileName,
            updatedData: imageManager[fileName],
            changedTags: {
                added: sanitizedTags.filter(tag => !originalTags.includes(tag)),
                removed: originalTags.filter(tag => !sanitizedTags.includes(tag))
            }
        };
        
    } catch (error) {
        console.error('Error in update-image-tags:', error);
        
        // Send error notification to UI
        if (mainWindow) {
            mainWindow.webContents.send('image-tags-update-error', {
                fileName: fileName,
                error: error.message
            });
        }
        
        throw error;
    }
});

  // main.js (add below your existing handlers)

// Enhanced delete-image handler with reliability improvements
ipcMain.handle('delete-image', async (event, fileName) => {
    const imagesPath = user_settings.images_path;
    const managerFile = path.join(__dirname, 'image_manager.json');
    
    try {
        // Validate input
        if (!fileName || typeof fileName !== 'string') {
            throw new Error('Invalid filename provided');
        }
        
        // Create backup before any modifications
        const backupPath = fileUtils.createBackup(managerFile);
        console.log(`Created backup before delete: ${backupPath}`);
        
        // Load and parse JSON with error handling
        let imageManager = {};
        try {
            if (fs.existsSync(managerFile)) {
                const managerData = fs.readFileSync(managerFile, 'utf-8');
                imageManager = JSON.parse(managerData);
            }
        } catch (parseError) {
            console.error('Error parsing image manager during delete:', parseError);
            throw new Error('Image manager corrupted, cannot perform delete operation');
        }
        
        // Check if image exists in manager
        if (!imageManager[fileName]) {
            throw new Error(`Image "${fileName}" not found in manager`);
        }
        
        const imageData = imageManager[fileName];
        const filePath = path.join(imagesPath, fileName);
        
        // Verify file exists before attempting delete
        if (fs.existsSync(filePath)) {
            try {
                // Optionally verify file integrity before delete
                if (imageData.file_hash) {
                    const currentHash = fileUtils.calculateHash(filePath);
                    if (currentHash !== imageData.file_hash) {
                        console.warn(`File integrity warning during delete: ${fileName}`);
                    }
                }
                
                // Delete the physical file
                fs.unlinkSync(filePath);
                console.log(`Successfully deleted image file: ${fileName}`);
            } catch (deleteError) {
                console.error(`Error deleting file ${fileName}:`, deleteError);
                throw new Error(`Failed to delete image file: ${deleteError.message}`);
            }
        } else {
            console.warn(`Image file not found on disk: ${fileName}`);
            // Continue with JSON cleanup even if file doesn't exist
        }
        
        // Remove from JSON manager with atomic write
        delete imageManager[fileName];
        
        try {
            fileUtils.atomicWrite(managerFile, JSON.stringify(imageManager, null, 2));
            console.log(`Successfully removed ${fileName} from image manager`);
        } catch (updateError) {
            console.error('Error updating image manager during delete:', updateError);
            throw new Error(`Failed to update image manager: ${updateError.message}`);
        }
        
        // Send success notification to UI
        if (mainWindow) {
            mainWindow.webContents.send('image-delete-success', {
                fileName: fileName,
                deletedData: imageData
            });
        }
        
        return {
            success: true,
            fileName: fileName,
            message: 'Image deleted successfully'
        };
        
    } catch (error) {
        console.error('Error in delete-image:', error);
        
        // Send error notification to UI
        if (mainWindow) {
            mainWindow.webContents.send('image-delete-error', {
                fileName: fileName,
                error: error.message
            });
        }
        
        throw error;
    }
});
  

// Health check and repair functionality
ipcMain.handle("health-check", async (event) => {
    const managerFile = path.join(__dirname, "image_manager.json");
    const imagesPath = user_settings.images_path;
    
    try {
        console.log("Running health check...");
        
        const results = {
            managerExists: fs.existsSync(managerFile),
            imagesPathExists: fs.existsSync(imagesPath),
            totalImages: 0,
            validImages: 0,
            orphanedFiles: [],
            corruptedImages: [],
            missingFiles: [],
            backupsAvailable: 0,
            recommendations: []
        };
        
        // Check backups
        const backupFiles = fs.readdirSync(__dirname)
            .filter(f => f.startsWith("image_manager.json.backup."));
        results.backupsAvailable = backupFiles.length;
        
        if (!results.managerExists) {
            results.recommendations.push("Image manager file is missing. Restore from backup or reinitialize.");
            return results;
        }
        
        // Load and validate manager file
        let imageManager = {};
        try {
            const managerData = fs.readFileSync(managerFile, "utf-8");
            imageManager = JSON.parse(managerData);
            results.totalImages = Object.keys(imageManager).length;
        } catch (parseError) {
            results.recommendations.push("Image manager file is corrupted. Restore from backup.");
            return results;
        }
        
        // Check each image
        for (const [fileName, imageData] of Object.entries(imageManager)) {
            const filePath = path.join(imagesPath, fileName);
            
            if (!fs.existsSync(filePath)) {
                results.missingFiles.push(fileName);
                continue;
            }
            
            // Check file integrity if hash available
            if (imageData.file_hash) {
                const currentHash = fileUtils.calculateHash(filePath);
                if (currentHash !== imageData.file_hash) {
                    results.corruptedImages.push({
                        fileName: fileName,
                        expectedHash: imageData.file_hash,
                        actualHash: currentHash
                    });
                    continue;
                }
            }
            
            results.validImages++;
        }
        
        console.log("Health check completed:", results);
        return results;
        
    } catch (error) {
        console.error("Error during health check:", error);
        throw error;
    }
});
