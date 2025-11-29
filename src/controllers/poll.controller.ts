import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export const getAllPolls = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;

  const where: any = {};
  
  if (status) {
    where.status = status;
  }

  const polls = await prisma.poll.findMany({
    where,
    include: {
      _count: {
        select: { votes: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Calculate vote counts per option
  const pollsWithVoteCounts = await Promise.all(polls.map(async (poll) => {
    const options = poll.options as any[];
    const votes = await prisma.vote.findMany({
      where: { pollId: poll.id },
      select: { optionId: true }
    });

    const voteCounts: Record<string, number> = {};
    votes.forEach(vote => {
      voteCounts[vote.optionId] = (voteCounts[vote.optionId] || 0) + 1;
    });

    const optionsWithCounts = options.map(option => ({
      ...option,
      _count: { votes: voteCounts[option.id] || 0 }
    }));

    return {
      ...poll,
      options: optionsWithCounts
    };
  }));

  res.json({
    success: true,
    data: pollsWithVoteCounts
  });
});

export const getPollById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      _count: {
        select: { votes: true }
      }
    }
  });

  if (!poll) {
    return res.status(404).json({
      success: false,
      error: 'Poll not found'
    });
  }

  // Get creator info
  const creator = await prisma.user.findUnique({
    where: { id: poll.createdBy },
    select: {
      id: true,
      displayName: true,
      email: true
    }
  });

  // Calculate vote counts per option
  const options = poll.options as any[];
  const votes = await prisma.vote.findMany({
    where: { pollId: poll.id },
    select: { optionId: true }
  });

  const voteCounts: Record<string, number> = {};
  votes.forEach(vote => {
    voteCounts[vote.optionId] = (voteCounts[vote.optionId] || 0) + 1;
  });

  const optionsWithCounts = options.map(option => ({
    ...option,
    _count: { votes: voteCounts[option.id] || 0 }
  }));

  res.json({
    success: true,
    data: {
      ...poll,
      createdBy: creator,
      options: optionsWithCounts
    }
  });
});

export const createPoll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { question, options, startAt, endAt, visibility } = req.body;

  const poll = await prisma.poll.create({
    data: {
      question,
      options,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      visibility: visibility || 'PUBLIC',
      createdBy: req.user!.id
    }
  });

  res.status(201).json({
    success: true,
    data: poll
  });
});

export const vote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { optionId } = req.body;

  const poll = await prisma.poll.findUnique({ where: { id } });

  if (!poll) {
    return res.status(404).json({
      success: false,
      error: 'Poll not found'
    });
  }

  // Check if poll is active
  const now = new Date();
  if (now < poll.startAt || now > poll.endAt) {
    return res.status(400).json({
      success: false,
      error: 'Poll is not active'
    });
  }

  // Check if user already voted
  const existingVote = await prisma.vote.findUnique({
    where: {
      pollId_userId: {
        pollId: id,
        userId: req.user!.id
      }
    }
  });

  if (existingVote) {
    return res.status(400).json({
      success: false,
      error: 'You have already voted in this poll'
    });
  }

  const vote = await prisma.vote.create({
    data: {
      pollId: id,
      userId: req.user!.id,
      optionId
    }
  });

  res.status(201).json({
    success: true,
    data: vote,
    message: 'Vote recorded successfully'
  });
});

export const getPollResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      votes: {
        select: {
          optionId: true,
          user: {
            select: {
              displayName: true
            }
          }
        }
      }
    }
  });

  if (!poll) {
    return res.status(404).json({
      success: false,
      error: 'Poll not found'
    });
  }

  // Count votes per option
  const results: any = {};
  poll.votes.forEach((vote: typeof poll.votes[0]) => {
    if (!results[vote.optionId]) {
      results[vote.optionId] = 0;
    }
    results[vote.optionId]++;
  });

  res.json({
    success: true,
    data: {
      poll: {
        id: poll.id,
        question: poll.question,
        options: poll.options,
        totalVotes: poll.votes.length
      },
      results
    }
  });
});

export const getUserVote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const vote = await prisma.vote.findUnique({
    where: {
      pollId_userId: {
        pollId: id,
        userId: req.user.id
      }
    }
  });

  res.json({
    success: true,
    data: vote
  });
});

export const deletePoll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const poll = await prisma.poll.findUnique({ where: { id } });

  if (!poll) {
    return res.status(404).json({
      success: false,
      error: 'Poll not found'
    });
  }

  // Check if user is the creator or admin
  if (poll.createdBy !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to delete this poll'
    });
  }

  await prisma.poll.delete({ where: { id } });

  res.json({
    success: true,
    message: 'Poll deleted successfully'
  });
});

export const getMyVotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const votes = await prisma.vote.findMany({
    where: { userId },
    include: {
      poll: {
        select: {
          id: true,
          question: true,
          status: true,
          options: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: votes
  });
});
