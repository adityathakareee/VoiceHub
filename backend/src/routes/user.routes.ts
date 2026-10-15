/// <reference path="../types/express.d.ts" />
import { Router, Request, Response } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { UserRole } from '../models/user.model';

const router = Router();

router.patch('/me', requireAuth, UserController.updateProfile);
router.patch('/me/password', requireAuth, UserController.changePassword);

// Role-based authorization test endpoint (Requirement 17 & 41)
router.get('/admin-test', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: `Access granted to ADMIN test endpoint for user ${req.user?.email}`,
    data: { role: req.user?.role },
  });
});

export default router;
