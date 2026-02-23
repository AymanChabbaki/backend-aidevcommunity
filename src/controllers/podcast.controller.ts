import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

// Podcast endpoints
export const getAllPodcasts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;

  const where: any = {};
  
  if (status) {
    where.status = status;
  }

  const podcasts = await prisma.podcast.findMany({
    where,
    orderBy: { publishedAt: 'desc' }
  });

  res.json(podcasts);
});

export const getPodcastById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const podcast = await prisma.podcast.findUnique({
    where: { id }
  });

  if (!podcast) {
    res.status(404).json({ message: 'Podcast not found' });
    return;
  }

  // Increment views
  await prisma.podcast.update({
    where: { id },
    data: { views: podcast.views + 1 }
  });

  res.json({ ...podcast, views: podcast.views + 1 });
});

export const createPodcast = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, youtubeUrl, thumbnailUrl, duration, publishedAt, discordLink, status } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const podcast = await prisma.podcast.create({
    data: {
      title,
      description,
      youtubeUrl,
      thumbnailUrl,
      duration,
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      discordLink,
      status: status || 'published',
      createdBy: userId
    }
  });

  res.status(201).json(podcast);
});

export const updatePodcast = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, description, youtubeUrl, thumbnailUrl, duration, publishedAt, discordLink, status } = req.body;

  const podcast = await prisma.podcast.update({
    where: { id },
    data: {
      title,
      description,
      youtubeUrl,
      thumbnailUrl,
      duration,
      publishedAt: publishedAt ? new Date(publishedAt) : undefined,
      discordLink,
      status
    }
  });

  res.json(podcast);
});

export const deletePodcast = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.podcast.delete({
    where: { id }
  });

  res.json({ message: 'Podcast deleted' });
});

// Podcast Subject endpoints
export const getAllPodcastSubjects = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;

  const where: any = {};
  
  if (status) {
    where.status = status;
  } else {
    // By default, show only approved and pending subjects
    where.status = { in: ['approved', 'pending'] };
  }

  const subjects = await prisma.podcastSubject.findMany({
    where,
    include: {
      _count: {
        select: { subjectVotes: true }
      }
    },
    orderBy: { votes: 'desc' }
  });

  res.json(subjects);
});

export const getPodcastSubjectById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const subject = await prisma.podcastSubject.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subjectVotes: true }
      }
    }
  });

  if (!subject) {
    res.status(404).json({ message: 'Podcast subject not found' });
    return;
  }

  res.json(subject);
});

export const createPodcastSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description } = req.body;
  const userId = req.user?.id;

  const subject = await prisma.podcastSubject.create({
    data: {
      title,
      description,
      submittedBy: userId
    }
  });

  res.status(201).json(subject);
});

export const voteForPodcastSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  // Check if user already voted
  const existingVote = await prisma.podcastSubjectVote.findUnique({
    where: {
      subjectId_userId: {
        subjectId: id,
        userId
      }
    }
  });

  if (existingVote) {
    res.status(400).json({ message: 'You have already voted for this subject' });
    return;
  }

  // Create vote and increment count
  await prisma.$transaction([
    prisma.podcastSubjectVote.create({
      data: {
        subjectId: id,
        userId
      }
    }),
    prisma.podcastSubject.update({
      where: { id },
      data: {
        votes: { increment: 1 }
      }
    })
  ]);

  const updatedSubject = await prisma.podcastSubject.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subjectVotes: true }
      }
    }
  });

  res.json(updatedSubject);
});

export const unvoteForPodcastSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  // Check if user has voted
  const existingVote = await prisma.podcastSubjectVote.findUnique({
    where: {
      subjectId_userId: {
        subjectId: id,
        userId
      }
    }
  });

  if (!existingVote) {
    res.status(400).json({ message: 'You have not voted for this subject' });
    return;
  }

  // Delete vote and decrement count
  await prisma.$transaction([
    prisma.podcastSubjectVote.delete({
      where: {
        subjectId_userId: {
          subjectId: id,
          userId
        }
      }
    }),
    prisma.podcastSubject.update({
      where: { id },
      data: {
        votes: { decrement: 1 }
      }
    })
  ]);

  const updatedSubject = await prisma.podcastSubject.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subjectVotes: true }
      }
    }
  });

  res.json(updatedSubject);
});

export const getUserVoteForSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const vote = await prisma.podcastSubjectVote.findUnique({
    where: {
      subjectId_userId: {
        subjectId: id,
        userId
      }
    }
  });

  res.json({ hasVoted: !!vote, vote });
});

export const updatePodcastSubjectStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const subject = await prisma.podcastSubject.update({
    where: { id },
    data: { status }
  });

  res.json(subject);
});

export const deletePodcastSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.podcastSubject.delete({
    where: { id }
  });

  res.json({ message: 'Podcast subject deleted' });
});
