import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const POST_INCLUDE = (userId?: string) => ({
  author: { select: { id: true, displayName: true, photoUrl: true } },
  _count: { select: { likes: true, comments: true } },
  ...(userId
    ? {
        likes: { where: { userId }, select: { id: true } },
      }
    : {}),
});

// ─── Posts ────────────────────────────────────────────────────────────────────

export const getPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
  const skip = (page - 1) * limit;
  const userId = req.user?.id;

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: POST_INCLUDE(userId),
    }),
    prisma.post.count(),
  ]);

  const shaped = posts.map((p) => ({
    ...p,
    likedByMe: userId ? p.likes?.length > 0 : false,
    likes: undefined,
  }));

  res.json({ success: true, data: shaped, total, page, limit });
});

export const getPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      ...POST_INCLUDE(userId),
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, displayName: true, photoUrl: true } } },
      },
    },
  });

  if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

  res.json({
    success: true,
    data: { ...post, likedByMe: userId ? post.likes?.length > 0 : false, likes: undefined },
  });
});

export const createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Content is required' });
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const imageFile = files?.image?.[0];
  const videoFile = files?.video?.[0];

  // Enforce 5 MB cap on images (global multer limit is 100 MB for videos)
  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: 'Image must be 5 MB or less.' });
  }

  const post = await prisma.post.create({
    data: {
      content: content.trim(),
      authorId: userId,
      imageUrl: (imageFile as any)?.path || null,
      videoUrl: (videoFile as any)?.path || null,
    },
    include: POST_INCLUDE(userId),
  });

  res.status(201).json({
    success: true,
    data: { ...post, likedByMe: false, likes: undefined },
  });
});

export const updatePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Post not found' });
  if (existing.authorId !== userId && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { content, removeImage, removeVideo } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const imageFile = files?.image?.[0];
  const videoFile = files?.video?.[0];

  // Enforce 5 MB cap on images
  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: 'Image must be 5 MB or less.' });
  }

  const post = await prisma.post.update({
    where: { id },
    data: {
      ...(content !== undefined ? { content: content.trim() } : {}),
      ...(imageFile ? { imageUrl: (imageFile as any).path } : removeImage === 'true' ? { imageUrl: null } : {}),
      ...(videoFile ? { videoUrl: (videoFile as any).path } : removeVideo === 'true' ? { videoUrl: null } : {}),
    },
    include: POST_INCLUDE(userId),
  });

  res.json({
    success: true,
    data: { ...post, likedByMe: post.likes?.length > 0, likes: undefined },
  });
});

export const deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Post not found' });
  if (existing.authorId !== userId && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  await prisma.post.delete({ where: { id } });
  res.json({ success: true });
});

// ─── Likes ────────────────────────────────────────────────────────────────────

export const toggleLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId: id, userId } },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    const count = await prisma.postLike.count({ where: { postId: id } });
    return res.json({ success: true, liked: false, count });
  }

  await prisma.postLike.create({ data: { postId: id, userId } });
  const count = await prisma.postLike.count({ where: { postId: id } });
  res.json({ success: true, liked: true, count });
});

// ─── Comments ─────────────────────────────────────────────────────────────────

const COMMENT_INCLUDE = (userId?: string) => ({
  user: { select: { id: true, displayName: true, photoUrl: true } },
  _count: { select: { likes: true, replies: true } },
  ...(userId ? { likes: { where: { userId }, select: { id: true } } } : {}),
});

export const getComments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const comments = await (prisma.postComment as any).findMany({
    where: { postId: id, parentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      ...COMMENT_INCLUDE(userId),
      replies: {
        orderBy: { createdAt: 'asc' },
        include: COMMENT_INCLUDE(userId),
      },
    },
  });

  const shapeComment = (c: any) => ({
    ...c,
    likedByMe: userId ? (c.likes?.length ?? 0) > 0 : false,
    likes: undefined,
  });

  const shaped = (comments as any[]).map((c) => ({
    ...shapeComment(c),
    replies: (c.replies ?? []).map(shapeComment),
  }));

  res.json({ success: true, data: shaped });
});

export const addComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const { content, parentId } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Comment cannot be empty' });
  }

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

  const comment = await (prisma.postComment as any).create({
    data: { postId: id, userId, content: content.trim(), parentId: parentId || null },
    include: {
      user: { select: { id: true, displayName: true, photoUrl: true } },
      _count: { select: { likes: true, replies: true } },
    },
  });

  res.status(201).json({ success: true, data: { ...comment, likedByMe: false, replies: [] } });
});

export const deleteComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const userId = req.user!.id;

  const comment = await prisma.postComment.findUnique({ where: { id: commentId } });
  if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
  if (comment.userId !== userId && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  await prisma.postComment.delete({ where: { id: commentId } });
  res.json({ success: true });
});

export const toggleCommentLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const userId = req.user!.id;

  const db = prisma as any;

  const existing = await db.postCommentLike.findUnique({
    where: { commentId_userId: { commentId, userId } },
  });

  if (existing) {
    await db.postCommentLike.delete({ where: { id: existing.id } });
    const count = await db.postCommentLike.count({ where: { commentId } });
    return res.json({ success: true, liked: false, count });
  }

  await db.postCommentLike.create({ data: { commentId, userId } });
  const count = await db.postCommentLike.count({ where: { commentId } });
  res.json({ success: true, liked: true, count });
});
