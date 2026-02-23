import { Router } from 'express';
import {
  getAllPodcasts,
  getPodcastById,
  createPodcast,
  updatePodcast,
  deletePodcast,
  getAllPodcastSubjects,
  getPodcastSubjectById,
  createPodcastSubject,
  voteForPodcastSubject,
  unvoteForPodcastSubject,
  getUserVoteForSubject,
  updatePodcastSubjectStatus,
  deletePodcastSubject
} from '../controllers/podcast.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Podcast routes
router.get('/', getAllPodcasts);
router.get('/:id', getPodcastById);
router.post('/', authenticate, authorize('STAFF', 'ADMIN'), createPodcast);
router.put('/:id', authenticate, authorize('STAFF', 'ADMIN'), updatePodcast);
router.delete('/:id', authenticate, authorize('STAFF', 'ADMIN'), deletePodcast);

// Podcast subjects routes
router.get('/subjects/all', getAllPodcastSubjects);
router.get('/subjects/:id', getPodcastSubjectById);
router.post('/subjects', authenticate, createPodcastSubject);
router.post('/subjects/:id/vote', authenticate, voteForPodcastSubject);
router.delete('/subjects/:id/vote', authenticate, unvoteForPodcastSubject);
router.get('/subjects/:id/user-vote', authenticate, getUserVoteForSubject);
router.patch('/subjects/:id/status', authenticate, authorize('STAFF', 'ADMIN'), updatePodcastSubjectStatus);
router.delete('/subjects/:id', authenticate, authorize('STAFF', 'ADMIN'), deletePodcastSubject);

export default router;
