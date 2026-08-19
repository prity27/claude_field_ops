import { Router } from 'express';
import * as users from '../services/user.service.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/authorize.js';
import { ROLES } from '../models/User.js';

export const usersRouter = Router();

usersRouter.post(
  '/users',
  // The permission is declared here, at the route, not inside the handler (BE-01-06 AC-2).
  requireRole('dispatcher'),
  validateBody({
    email: { required: true, type: 'string', maxLength: 254 },
    name: { required: true, type: 'string', maxLength: 120 },
    password: { required: true, type: 'string', minLength: 12, maxLength: 200 },
    role: { required: true, type: 'string', enum: ROLES },
  }),
  async (req, res, next) => {
    try {
      const user = await users.provision(req.validated, req.actor);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  },
);

usersRouter.get('/users/me', (req, res) => {
  res.status(200).json({ actor: req.actor });
});
