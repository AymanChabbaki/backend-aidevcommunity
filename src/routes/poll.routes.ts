import { Router } from 'express';
import {
  getAllPolls,
  getPollById,
  createPoll,
  vote,
  getPollResults,
  getUserVote,
  deletePoll,
  getMyVotes
} from '../controllers/poll.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', getAllPolls);
router.get('/user/votes', authenticate, getMyVotes);
router.get('/:id', getPollById);
router.post('/', authenticate, authorize('STAFF', 'ADMIN'), createPoll);
router.post('/:id/vote', authenticate, vote);
router.get('/:id/results', getPollResults);
router.get('/:id/user-vote', authenticate, getUserVote);
router.delete('/:id', authenticate, authorize('STAFF', 'ADMIN'), deletePoll);

export default router;
