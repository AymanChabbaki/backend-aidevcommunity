import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadPost } from '../middleware/upload';
import {
  getPosts, getPost, createPost, updatePost, deletePost,
  toggleLike, getComments, addComment, deleteComment,
} from '../controllers/blog.controller';

const router = Router();

// Posts (reading is public, writing requires auth)
router.get('/', getPosts);
router.get('/:id', getPost);
router.post('/', authenticate, uploadPost.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), createPost);
router.put('/:id', authenticate, uploadPost.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), updatePost);
router.delete('/:id', authenticate, deletePost);

// Likes
router.post('/:id/like', authenticate, toggleLike);

// Comments
router.get('/:id/comments', getComments);
router.post('/:id/comments', authenticate, addComment);
router.delete('/comments/:commentId', authenticate, deleteComment);

export default router;
