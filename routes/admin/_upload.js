const multer = require('multer');
const path = require('path');
const fs = require('fs');

function createImageUpload(subDir, options = {}) {
  const root = path.join(process.cwd(), 'public', 'uploads', subDir);
  fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, root);
    },
    filename: function (_req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: options.maxSize || 2 * 1024 * 1024, files: 1 },
    fileFilter: function (_req, file, cb) {
      const ok = /^image\//.test(String(file.mimetype || ''));
      cb(ok ? null : new Error('ONLY_IMAGE'), ok);
    }
  });
}

function createMediaUpload(subDir, options = {}) {
  const root = path.join(process.cwd(), 'public', 'uploads', subDir);
  fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, root);
    },
    filename: function (_req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.ogg', '.mov'];
      const safeExt = allowExt.includes(ext) ? ext : '.bin';
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: options.maxSize || 20 * 1024 * 1024, files: options.maxFiles || 1 },
    fileFilter: function (_req, file, cb) {
      const type = String(file.mimetype || '');
      const ok = /^image\//.test(type) || /^video\//.test(type);
      cb(ok ? null : new Error('ONLY_IMAGE_OR_VIDEO'), ok);
    }
  });
}

module.exports = {
  createImageUpload,
  createMediaUpload
};
