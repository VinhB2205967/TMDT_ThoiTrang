const multer = require('multer');
const path = require('path');
const fs = require('fs');

const root = path.join(process.cwd(), 'public', 'uploads', 'openclip-query');
fs.mkdirSync(root, { recursive: true });

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, root);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const uploadOpenclipQuery = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter: function (_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) return cb(new Error('ONLY_IMAGE'));
    return cb(null, true);
  }
});

module.exports = {
  uploadOpenclipQuery
};
