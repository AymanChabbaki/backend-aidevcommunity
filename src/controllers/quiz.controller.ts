import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

// Get all quizzes
export const getAllQuizzes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quizzes = await prisma.quiz.findMany({
    include: {
      _count: {
        select: {
          questions: true,
          attempts: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Update expired quizzes
  const now = new Date();
  const quizzesToUpdate = quizzes.filter(quiz => {
    const endDate = new Date(quiz.endAt);
    const startDate = new Date(quiz.startAt);
    if (now < startDate && quiz.status !== 'UPCOMING') return true;
    if (now >= startDate && now < endDate && quiz.status !== 'ACTIVE') return true;
    if (endDate < now && quiz.status !== 'CLOSED') return true;
    return false;
  });

  if (quizzesToUpdate.length > 0) {
    for (const quiz of quizzesToUpdate) {
      const startDate = new Date(quiz.startAt);
      const endDate = new Date(quiz.endAt);
      let newStatus: 'UPCOMING' | 'ACTIVE' | 'CLOSED' = 'UPCOMING';
      
      if (now < startDate) newStatus = 'UPCOMING';
      else if (now >= startDate && now < endDate) newStatus = 'ACTIVE';
      else newStatus = 'CLOSED';

      await prisma.quiz.update({
        where: { id: quiz.id },
        data: { status: newStatus }
      });
    }
  }

  // Refetch quizzes after update
  const updatedQuizzes = await prisma.quiz.findMany({
    include: {
      _count: {
        select: {
          questions: true,
          attempts: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: updatedQuizzes
  });
});

// Get quiz by ID
export const getQuizById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: 'asc' }
      },
      _count: {
        select: { attempts: true }
      }
    }
  });

  if (!quiz) {
    return res.status(404).json({
      success: false,
      error: 'Quiz not found'
    });
  }

  res.json({
    success: true,
    data: quiz
  });
});

// Create quiz (Admin/Staff only)
export const createQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, coverImage, timeLimit, startAt, endAt, questions } = req.body;

  if (!title || !startAt || !endAt || !questions || questions.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Title, dates, and questions are required'
    });
  }

  const quiz = await prisma.quiz.create({
    data: {
      title,
      description,
      coverImage,
      timeLimit: timeLimit || 30,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      createdBy: req.user!.id,
      questions: {
        create: questions.map((q: any, index: number) => ({
          question: q.question,
          options: q.options,
          points: q.points || 1000,
          order: index
        }))
      }
    },
    include: {
      questions: true
    }
  });

  res.status(201).json({
    success: true,
    data: quiz
  });
});

// Update quiz
export const updateQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, description, coverImage, timeLimit, startAt, endAt, questions } = req.body;

  const quiz = await prisma.quiz.findUnique({ where: { id } });

  if (!quiz) {
    return res.status(404).json({
      success: false,
      error: 'Quiz not found'
    });
  }

  // Delete old questions if new ones provided
  if (questions) {
    await prisma.quizQuestion.deleteMany({
      where: { quizId: id }
    });
  }

  const updatedQuiz = await prisma.quiz.update({
    where: { id },
    data: {
      title,
      description,
      coverImage,
      timeLimit,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
      ...(questions && {
        questions: {
          create: questions.map((q: any, index: number) => ({
            question: q.question,
            options: q.options,
            points: q.points || 1000,
            order: index
          }))
        }
      })
    },
    include: {
      questions: true
    }
  });

  res.json({
    success: true,
    data: updatedQuiz
  });
});

// Delete quiz
export const deleteQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const quiz = await prisma.quiz.findUnique({ where: { id } });

  if (!quiz) {
    return res.status(404).json({
      success: false,
      error: 'Quiz not found'
    });
  }

  await prisma.quiz.delete({ where: { id } });

  res.json({
    success: true,
    message: 'Quiz deleted successfully'
  });
});

// Check if user has attempted quiz
export const checkUserAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const attempt = await prisma.quizAttempt.findUnique({
    where: {
      quizId_userId: {
        quizId: id,
        userId
      }
    },
    include: {
      answers: true
    }
  });

  res.json({
    success: true,
    hasAttempted: !!attempt,
    attempt: attempt
  });
});

// Submit quiz answers
export const submitQuizAnswers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { answers, tabSwitches = 0 } = req.body; // [{questionId, selectedOption, timeSpent}]
  const userId = req.user!.id;

  // Check if already attempted
  const existingAttempt = await prisma.quizAttempt.findUnique({
    where: {
      quizId_userId: {
        quizId: id,
        userId
      }
    }
  });

  if (existingAttempt) {
    return res.status(400).json({
      success: false,
      error: 'You have already attempted this quiz'
    });
  }

  // Get quiz with questions
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: true
    }
  });

  if (!quiz) {
    return res.status(404).json({
      success: false,
      error: 'Quiz not found'
    });
  }

  // Check if quiz is active
  const now = new Date();
  if (now < new Date(quiz.startAt) || now > new Date(quiz.endAt)) {
    return res.status(400).json({
      success: false,
      error: 'Quiz is not active'
    });
  }

  // Anti-cheat detection
  const suspiciousActivities: string[] = [];
  let isFlagged = false;

  // 1. Check tab switches (more than 3 is suspicious)
  if (tabSwitches > 3) {
    suspiciousActivities.push(`Switched tabs ${tabSwitches} times`);
    isFlagged = true;
  }

  // 2. Check answer speed - too fast is suspicious
  const avgTimePerQuestion = answers.reduce((sum: number, ans: any) => sum + ans.timeSpent, 0) / answers.length;
  if (avgTimePerQuestion < 2000) { // Less than 2 seconds per question
    suspiciousActivities.push(`Answered too fast (avg ${Math.round(avgTimePerQuestion)}ms per question)`);
    isFlagged = true;
  }

  // 3. Check if all answers are suspiciously fast
  const tooFastAnswers = answers.filter((ans: any) => ans.timeSpent < 1000).length;
  if (tooFastAnswers > answers.length * 0.5) { // More than 50% answered in less than 1 second
    suspiciousActivities.push(`${tooFastAnswers} answers submitted in less than 1 second`);
    isFlagged = true;
  }

  // Calculate scores
  let totalScore = 0;
  const answerData = answers.map((answer: any) => {
    const question = quiz.questions.find(q => q.id === answer.questionId);
    if (!question) return null;

    const options = question.options as any[];
    const selectedOption = options.find(opt => opt.id === answer.selectedOption);
    const isCorrect = selectedOption?.isCorrect || false;

    let pointsEarned = 0;
    if (isCorrect) {
      // Kahoot-style scoring: faster answer = more points
      const maxPoints = question.points;
      const timeLimit = quiz.timeLimit * 1000; // convert to ms
      const timeSpent = Math.min(answer.timeSpent, timeLimit);
      const timeBonus = 1 - (timeSpent / timeLimit) * 0.5; // 50-100% of points
      pointsEarned = Math.round(maxPoints * timeBonus);
      totalScore += pointsEarned;
    }

    return {
      questionId: answer.questionId,
      userId,
      selectedOption: answer.selectedOption,
      isCorrect,
      timeSpent: answer.timeSpent,
      pointsEarned
    };
  }).filter(Boolean);

  // Create attempt and answers
  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId: id,
      userId,
      totalScore,
      tabSwitches,
      isFlagged,
      flagReason: suspiciousActivities.length > 0 ? suspiciousActivities.join('; ') : null,
      suspiciousActivity: suspiciousActivities.length > 0 ? { activities: suspiciousActivities, timestamp: new Date() } : null,
      answers: {
        create: answerData
      }
    },
    include: {
      answers: {
        include: {
          question: true
        }
      }
    }
  });

  // Calculate rank
  const rank = await prisma.quizAttempt.count({
    where: {
      quizId: id,
      totalScore: {
        gt: totalScore
      }
    }
  }) + 1;

  res.json({
    success: true,
    attempt,
    totalScore,
    rank
  });
});

// Get quiz leaderboard
export const getQuizLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: id },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          photoUrl: true
        }
      },
      answers: {
        select: {
          isCorrect: true
        }
      }
    },
    orderBy: { totalScore: 'desc' },
    take: 50
  });

  // Format leaderboard data with correct/incorrect counts
  const leaderboard = attempts.map((attempt, index) => {
    const correctAnswers = attempt.answers.filter(answer => answer.isCorrect).length;
    const incorrectAnswers = attempt.answers.filter(answer => !answer.isCorrect).length;
    
    return {
      userId: attempt.userId,
      displayName: attempt.user.displayName,
      email: attempt.user.email,
      profilePicture: attempt.user.photoUrl,
      totalScore: attempt.totalScore,
      correctAnswers,
      incorrectAnswers,
      totalQuestions: correctAnswers + incorrectAnswers,
      isFlagged: attempt.isFlagged,
      flagReason: attempt.flagReason,
      tabSwitches: attempt.tabSwitches,
      rank: index + 1
    };
  });

  res.json({
    success: true,
    data: leaderboard
  });
});

// Get monthly global leaderboard
export const getMonthlyLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get all attempts from this month
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      completedAt: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          photoUrl: true
        }
      }
    }
  });

  // Group by user and sum scores
  const userScores = attempts.reduce((acc: any, attempt) => {
    const userId = attempt.userId;
    if (!acc[userId]) {
      acc[userId] = {
        userId: userId,
        displayName: attempt.user.displayName,
        email: attempt.user.email,
        profilePicture: attempt.user.photoUrl,
        totalScore: 0,
        quizCount: 0
      };
    }
    acc[userId].totalScore += attempt.totalScore;
    acc[userId].quizCount += 1;
    return acc;
  }, {});

  // Convert to array and sort
  const leaderboard = Object.values(userScores)
    .sort((a: any, b: any) => b.totalScore - a.totalScore)
    .slice(0, 50)
    .map((entry: any, index) => ({
      ...entry,
      rank: index + 1
    }));

  res.json({
    success: true,
    data: leaderboard
  });
});

// Delete participant from quiz (Admin/Staff only)
export const deleteQuizParticipant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: quizId, userId } = req.params;

  // Verify quiz exists
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId }
  });

  if (!quiz) {
    res.status(404).json({
      success: false,
      message: 'Quiz not found'
    });
    return;
  }

  // Delete all attempts for this user in this quiz
  const deleted = await prisma.quizAttempt.deleteMany({
    where: {
      quizId: quizId,
      userId: userId
    }
  });

  if (deleted.count === 0) {
    res.status(404).json({
      success: false,
      message: 'Participant not found in this quiz'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Participant deleted successfully',
    deletedCount: deleted.count
  });
});
