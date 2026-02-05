const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DEBUG_LOG_PATH = '/Users/harsha_reddy/3PLFAST/.cursor/debug.log';
const debugLog = (location, message, data, hypothesisId) => {
  try {
    const logEntry = JSON.stringify({location, message, data, timestamp:Date.now(), sessionId:'debug-session', runId:'run1', hypothesisId}) + '\n';
    fs.appendFileSync(DEBUG_LOG_PATH, logEntry);
  } catch(e) {}
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // For avatar uploads, only allow images
  if (file.fieldname === 'avatar') {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('image/');

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image formats (.png, .jpg, .jpeg, .gif, .webp) are allowed for avatars!'));
    }
  } else {
    // For other uploads, allow jpeg, jpg, png, pdf
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg, .jpeg and .pdf format allowed!'));
    }
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

module.exports = upload;
