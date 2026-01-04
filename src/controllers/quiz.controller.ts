import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { sendEmail } from '../lib/email';

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

  const quiz = await prisma.quiz.findUnique({ 
    where: { id },
    include: {
      attempts: true,
      questions: true
    }
  });

  if (!quiz) {
    return res.status(404).json({
      success: false,
      error: 'Quiz not found'
    });
  }

  // Check if quiz has attempts - if yes, only allow updating basic info, not questions
  const hasAttempts = quiz.attempts && quiz.attempts.length > 0;

  if (hasAttempts && questions && questions.length > 0) {
    // Check if questions are being modified
    const questionsChanged = JSON.stringify(quiz.questions) !== JSON.stringify(questions);
    
    if (questionsChanged) {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify questions after users have taken the quiz. You can only update title, description, cover image, and time settings.'
      });
    }
  }

  // Update quiz basic info (always allowed)
  await prisma.quiz.update({
    where: { id },
    data: {
      title,
      description,
      coverImage,
      timeLimit,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
    }
  });

  // Only update questions if quiz has no attempts
  if (!hasAttempts && questions && questions.length > 0) {
    // Delete old questions
    await prisma.quizQuestion.deleteMany({
      where: { quizId: id }
    });

    // Create new questions
    await prisma.quizQuestion.createMany({
      data: questions.map((q: any, index: number) => ({
        quizId: id,
        question: q.question,
        options: q.options,
        points: q.points || 1000,
        order: index
      }))
    });
  }

  // Fetch updated quiz with questions
  const finalQuiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: 'asc' }
      }
    }
  });

  res.json({
    success: true,
    data: finalQuiz,
    message: hasAttempts ? 'Quiz updated (questions preserved due to existing attempts)' : 'Quiz updated successfully'
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
  const { 
    answers, 
    tabSwitches = 0, 
    afkIncidents = 0, 
    inactivityPeriods = [],
    screenshotAttempts = 0,
    detectedExtensions = []
  } = req.body; // [{questionId, selectedOption, timeSpent}]
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

  // 3. Check if many answers are suspiciously fast
  const tooFastAnswers = answers.filter((ans: any) => ans.timeSpent < 1000).length;
  if (tooFastAnswers > answers.length * 0.5) { // More than 50% answered in less than 1 second
    suspiciousActivities.push(`${tooFastAnswers} answers submitted in less than 1 second`);
    isFlagged = true;
  }

  // 4. Check AFK incidents (being away from keyboard during quiz)
  if (afkIncidents > 2) {
    suspiciousActivities.push(`${afkIncidents} AFK incidents detected (extended periods without activity)`);
    isFlagged = true;
  }

  // 5. Phone cheating detection - consistent medium delays pattern
  // If user consistently takes 5-20 seconds per question (time to type on phone and search)
  const mediumDelayAnswers = answers.filter((ans: any) => ans.timeSpent >= 5000 && ans.timeSpent <= 20000).length;
  const consistentTimingPattern = mediumDelayAnswers > answers.length * 0.7; // More than 70% in this range
  
  // Calculate time variance to detect too-consistent patterns
  const mean = avgTimePerQuestion;
  const variance = answers.reduce((sum: number, ans: any) => {
    return sum + Math.pow(ans.timeSpent - mean, 2);
  }, 0) / answers.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = standardDeviation / mean;
  
  // Low variation (< 0.3) with medium delays suggests phone usage
  if (consistentTimingPattern && coefficientOfVariation < 0.3 && avgTimePerQuestion > 5000) {
    suspiciousActivities.push(`Suspicious timing pattern detected (consistent ${Math.round(avgTimePerQuestion / 1000)}s delays suggest external device usage)`);
    isFlagged = true;
  }

  // 6. Check for very long delays (suspiciously long on specific questions)
  const veryLongAnswers = answers.filter((ans: any) => ans.timeSpent > 30000).length; // > 30 seconds
  if (veryLongAnswers > 2) {
    suspiciousActivities.push(`${veryLongAnswers} questions took more than 30 seconds (possible research time)`);
    isFlagged = true;
  }

  // 7. Analyze inactivity periods for phone cheating patterns
  if (inactivityPeriods && inactivityPeriods.length > 0) {
    const longInactivity = inactivityPeriods.filter((period: any) => period.duration > 15000).length;
    if (longInactivity > 1) {
      suspiciousActivities.push(`${longInactivity} extended inactivity periods detected (possible phone usage or distraction)`);
      if (longInactivity > 3) {
        isFlagged = true;
      }
    }
  }

  // 8. Check screenshot attempts
  if (screenshotAttempts > 0) {
    suspiciousActivities.push(`${screenshotAttempts} screenshot attempt(s) detected and blocked`);
    if (screenshotAttempts > 2) {
      isFlagged = true;
    }
  }

  // 9. Check for suspicious browser extensions
  if (detectedExtensions && detectedExtensions.length > 0) {
    suspiciousActivities.push(`Suspicious browser extensions detected: ${detectedExtensions.join(', ')}`);
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
      afkIncidents,
      screenshotAttempts,
      suspiciousExtensions: detectedExtensions.length > 0 ? detectedExtensions : undefined,
      inactivityPeriods: inactivityPeriods.length > 0 ? inactivityPeriods : undefined,
      isFlagged,
      flagReason: suspiciousActivities.length > 0 ? suspiciousActivities.join('; ') : null,
      suspiciousActivity: suspiciousActivities.length > 0 
        ? { activities: suspiciousActivities, timestamp: new Date() } 
        : undefined,
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
      afkIncidents: attempt.afkIncidents,
      screenshotAttempts: attempt.screenshotAttempts,
      suspiciousExtensions: attempt.suspiciousExtensions,
      inactivityPeriods: attempt.inactivityPeriods,
      hasPenalty: attempt.flagReason ? attempt.flagReason.includes('PENALTY') : false,
      rank: index + 1
    };
  });

  res.json({
    success: true,
    data: leaderboard
  });
});

// Reduce points from a participant (for cheating penalties)
export const reduceParticipantPoints = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;
  const { pointsToReduce, reason } = req.body;

  if (!pointsToReduce || pointsToReduce <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Points to reduce must be a positive number'
    });
  }

  const attempt = await prisma.quizAttempt.findUnique({
    where: {
      quizId_userId: {
        quizId: id,
        userId
      }
    },
    include: {
      user: true
    }
  });

  if (!attempt) {
    return res.status(404).json({
      success: false,
      error: 'Quiz attempt not found'
    });
  }

  const newScore = Math.max(0, attempt.totalScore - pointsToReduce);
  const reductionReason = reason || 'Points reduced due to cheating detection';

  await prisma.quizAttempt.update({
    where: {
      quizId_userId: {
        quizId: id,
        userId
      }
    },
    data: {
      totalScore: newScore,
      flagReason: attempt.flagReason 
        ? `${attempt.flagReason}; PENALTY: ${pointsToReduce} points reduced - ${reductionReason}`
        : `PENALTY: ${pointsToReduce} points reduced - ${reductionReason}`,
      isFlagged: true
    }
  });

  // Send email notification to the user
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  
  if (quiz && attempt.user.email) {
    const emailSubject = `⚠️ Quiz Points Reduced - ${quiz.title}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 8px;">
        <h2 style="color: #856404; margin-top: 0;">⚠️ Points Penalty Applied</h2>
        
        <p style="font-size: 16px; color: #333;">Hello <strong>${attempt.user.displayName}</strong>,</p>
        
        <p style="font-size: 16px; color: #333;">
          We have detected suspicious activity during your attempt at the quiz <strong>"${quiz.title}"</strong>.
        </p>

        <div style="background-color: #fff; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
          <h3 style="color: #dc3545; margin-top: 0;">Cheating Evidence Detected:</h3>
          <p style="margin: 5px 0;"><strong>Original Score:</strong> ${attempt.totalScore} points</p>
          <p style="margin: 5px 0;"><strong>Points Reduced:</strong> ${pointsToReduce} points</p>
          <p style="margin: 5px 0;"><strong>New Score:</strong> ${newScore} points</p>
          <p style="margin: 10px 0;"><strong>Reason:</strong> ${reductionReason}</p>
        </div>

        <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="color: #721c24; margin: 0;"><strong>⚠️ Important:</strong> Academic integrity is essential. Future violations may result in complete disqualification from quizzes.</p>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          If you believe this is an error, please contact the quiz administrator for clarification.
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">This is an automated message. Please do not reply to this email.</p>
      </div>
    `;

    try {
      await sendEmail(attempt.user.email, emailSubject, emailHtml);
    } catch (emailError) {
      console.error('Failed to send penalty email:', emailError);
      // Continue even if email fails
    }
  }

  res.json({
    success: true,
    message: `Successfully reduced ${pointsToReduce} points from ${attempt.user.displayName}`,
    data: {
      oldScore: attempt.totalScore,
      newScore: newScore,
      pointsReduced: pointsToReduce
    }
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
        quizCount: 0,
        hasPenalty: false
      };
    }
    acc[userId].totalScore += attempt.totalScore;
    acc[userId].quizCount += 1;
    // Check if any attempt has a penalty
    if (attempt.flagReason && attempt.flagReason.includes('PENALTY')) {
      acc[userId].hasPenalty = true;
    }
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
