const multer = require('multer');
const path = require('path');
const fs = require('fs');

const root = path.join(process.cwd(), 'public', 'uploads', 'openclip-query');
fs.mkdirSync(root, { recursive: true });

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/bmp',
  'image/x-ms-bmp'
]);

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

function detectSupportedImage(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { ext: '.jpg', mime: 'image/jpeg' };
    }

    if (
      buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a
    ) {
      return { ext: '.png', mime: 'image/png' };
    }

    if (
      buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { ext: '.webp', mime: 'image/webp' };
    }

    if (buffer.length >= 2 && buffer.toString('ascii', 0, 2) === 'BM') {
      return { ext: '.bmp', mime: 'image/bmp' };
    }
  } catch {}

  return null;
}

function removeUploadedFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, root);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = SUPPORTED_EXTENSIONS.has(ext) ? ext : '.jpg';
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
    if (!SUPPORTED_MIME_TYPES.has(mime)) return cb(new Error('UNSUPPORTED_IMAGE_TYPE'));
    return cb(null, true);
  }
});

function validateOpenclipQueryFile(req, _res, next) {
  const file = req && req.file ? req.file : null;
  if (!file || !file.path) return next();

  const detected = detectSupportedImage(file.path);
  if (!detected) {
    removeUploadedFile(file.path);
    return next(new Error('UNSUPPORTED_IMAGE_TYPE'));
  }

  const currentExt = path.extname(file.path || '').toLowerCase();
  if (currentExt === detected.ext || (currentExt === '.jpeg' && detected.ext === '.jpg')) {
    file.mimetype = detected.mime;
    return next();
  }

  const nextName = `${path.basename(file.filename || file.path, currentExt)}${detected.ext}`;
  const nextPath = path.join(path.dirname(file.path), nextName);

  try {
    fs.renameSync(file.path, nextPath);
    file.path = nextPath;
    file.filename = nextName;
    file.mimetype = detected.mime;
    return next();
  } catch {
    removeUploadedFile(file.path);
    return next(new Error('UNSUPPORTED_IMAGE_TYPE'));
  }
}

module.exports = {
  uploadOpenclipQuery,
  validateOpenclipQueryFile
};
