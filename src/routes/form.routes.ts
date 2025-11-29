import { Router } from 'express';
import {
  getAllForms,
  createForm,
  getFormById,
  submitForm,
  getFormResponses,
  exportFormResponses,
  getUserSubmission,
  getUserSubmissions,
  deleteForm
} from '../controllers/form.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', getAllForms);
router.post('/', authenticate, authorize('STAFF', 'ADMIN'), createForm);
router.get('/user-submissions', authenticate, getUserSubmissions);
router.get('/:id', getFormById);
router.post('/:id/submit', authenticate, submitForm);
router.get('/:id/user-submission', authenticate, getUserSubmission);
router.get('/:id/responses', authenticate, authorize('STAFF', 'ADMIN'), getFormResponses);
router.get('/:id/responses/export', authenticate, authorize('STAFF', 'ADMIN'), exportFormResponses);
router.delete('/:id', authenticate, authorize('STAFF', 'ADMIN'), deleteForm);

export default router;
