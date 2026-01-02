import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getAllQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  checkUserAttempt,
  submitQuizAnswers,
  getQuizLeaderboard,
  getMonthlyLeaderboard,
  deleteQuizParticipant
} from '../controllers/quiz.controller';

const router = express.Router();

// Public routes
router.get('/monthly-leaderboard', getMonthlyLeaderboard);

// Protected routes
router.get('/', authenticate, getAllQuizzes);
router.get('/:id', authenticate, getQuizById);
router.get('/:id/attempt', authenticate, checkUserAttempt);
router.get('/:id/leaderboard', authenticate, getQuizLeaderboard);
router.post('/:id/submit', authenticate, submitQuizAnswers);

// Admin/Staff only routes
router.post('/', authenticate, authorize('STAFF', 'ADMIN'), createQuiz);
router.put('/:id', authenticate, authorize('STAFF', 'ADMIN'), updateQuiz);
router.delete('/:id', authenticate, authorize('STAFF', 'ADMIN'), deleteQuiz);
router.delete('/:id/participants/:userId', authenticate, authorize('STAFF', 'ADMIN'), deleteQuizParticipant);

export default router;
