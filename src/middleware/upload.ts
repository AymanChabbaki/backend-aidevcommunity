import multer from 'multer';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'aidevcommunity',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`
    };
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only images and PDFs are allowed'));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB default
  },
  fileFilter
});

// ─── Blog post upload (images + videos via Cloudinary) ───────────────────────

const postStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    return {
      folder: 'aidevcommunity/blog',
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: isVideo
        ? ['mp4', 'mov', 'avi', 'webm', 'mkv']
        : ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      ...(isVideo ? {} : { transformation: [{ width: 1200, height: 1200, crop: 'limit' }] }),
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
    };
  },
} as any);

const postFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi|webm|mkv/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
  if (ext && mime) cb(null, true);
  else cb(new Error('Only images and videos are allowed'));
};

export const uploadPost = multer({
  storage: postStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB for videos
  fileFilter: postFileFilter,
});
