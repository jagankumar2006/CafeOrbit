const fs = require('fs');
const path = require('path');

// Ensure local uploads directory exists on the server
const localUploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(localUploadsDir)) {
  fs.mkdirSync(localUploadsDir, { recursive: true });
}

/**
 * Saves a file buffer to the local uploads folder
 * @param {Buffer} fileBuffer
 * @param {string} key file key (e.g. 'products/item1.jpg')
 * @param {string} contentType e.g. 'image/jpeg', 'application/pdf'
 * @returns {Promise<string>} The file's relative URL path
 */
async function uploadFile(fileBuffer, key, contentType) {
  const fileName = key.replace(/\//g, '_');
  const localPath = path.join(localUploadsDir, fileName);
  fs.writeFileSync(localPath, fileBuffer);
  console.log(`[File Service] File saved locally: ${localPath}`);
  return `/uploads/${fileName}`;
}

/**
 * Returns the local download URL path for a saved file
 * @param {string} key file key
 * @returns {string} Relative URL path
 */
function getDownloadUrl(key) {
  const fileName = key.replace(/\//g, '_');
  return `/uploads/${fileName}`;
}

module.exports = {
  uploadFile,
  getDownloadUrl
};
