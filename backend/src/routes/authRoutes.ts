import { Router } from 'express';
import { register, login, logout, getMe, createHandoffToken, verifyHandoffToken } from '../controllers/authController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { registerSchema, loginSchema } from '../validators/authValidator.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', validateRequest(registerSchema), register);
router.post('/login', validateRequest(loginSchema), login);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);
router.post('/handoff-token', optionalAuthenticate, createHandoffToken);
router.post('/verify-handoff', verifyHandoffToken);

export default router;
