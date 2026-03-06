import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { generate, uploadPhoto } from '../controllers/womensday.controller';

// ─── Cloudinary storage for workshop photos ──────────────────────────────────
const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req: unknown, file: Express.Multer.File) => ({
    folder: 'womens-day-workshop',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1024, height: 1024, crop: 'limit' }],
    public_id: `photo-${Date.now()}-${file.originalname.split('.')[0]}`,
  }),
} as never);

const uploadMiddleware = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

const router = Router();

// Public — no auth required (workshop activity)
router.post('/generate', generate);
router.post('/upload-photo', uploadMiddleware.single('photo'), uploadPhoto);

export default router;
