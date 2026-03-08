const multer = require('multer');
const path = require('path');
const fs = require('fs');

const root = path.join(process.cwd(), 'public', 'uploads', 'chat');
fs.mkdirSync(root, { recursive: true });

const DEFAULT_MAX_CHAT_MEDIA_MB = 50;
const parsedMaxMb = Number(process.env.CHAT_UPLOAD_MAX_MB || DEFAULT_MAX_CHAT_MEDIA_MB);
const MAX_CHAT_MEDIA_MB = Number.isFinite(parsedMaxMb) && parsedMaxMb > 0 ? parsedMaxMb : DEFAULT_MAX_CHAT_MEDIA_MB;
const MAX_CHAT_MEDIA_BYTES = Math.floor(MAX_CHAT_MEDIA_MB * 1024 * 1024);

const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime'
]);

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, root);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : '';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const uploadChatMedia = multer({
  storage,
  limits: {
    fileSize: MAX_CHAT_MEDIA_BYTES,
    files: 1
  },
  fileFilter: function (_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();
    const isImage = mime.startsWith('image/');
    const isVideo = ALLOWED_VIDEO_MIME.has(mime);
    if (!isImage && !isVideo) return cb(new Error('ONLY_IMAGE_OR_VIDEO'));
    return cb(null, true);
  }
});

function resolveChatMedia(file) {
  if (!file || !file.filename) return null;
  const mime = String(file.mimetype || '').toLowerCase();
  const type = mime.startsWith('image/') ? 'image' : 'video';
  return {
    url: `/uploads/chat/${file.filename}`,
    type,
    mime,
    name: String(file.originalname || ''),
    size: Number(file.size || 0)
  };
}

module.exports = {
  uploadChatMedia,
  resolveChatMedia,
  MAX_CHAT_MEDIA_MB
};
