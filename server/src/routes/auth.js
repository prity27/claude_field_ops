import { Router } from 'express';
import * as auth from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.js';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../lib/cookies.js';
import { config } from '../config/env.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

// BE-01-02 AC-3. Applied to the credential-guessing surfaces only — login and the two reset
// endpoints — rather than globally, so a legitimate client is never throttled for reading.
const credentialLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// These five are the only unauthenticated routes besides /health (BE-01-05 AC-2).

authRouter.post(
  '/auth/login',
  credentialLimiter,
  validateBody({
    email: { required: true, type: 'string', maxLength: 254 },
    password: { required: true, type: 'string', maxLength: 200 },
  }),
  async (req, res, next) => {
    try {
      const { email, password } = req.validated;
      const { user, accessToken, refreshToken, csrfToken } = await auth.login(email, password);
      setAuthCookies(res, {
        accessToken,
        refreshToken,
        csrfToken,
        accessTtl: config.accessTtlSeconds,
        refreshTtl: config.refreshTtlSeconds,
      });
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/auth/refresh', async (req, res, next) => {
  try {
    const { accessToken } = await auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    setAuthCookies(res, { accessToken, accessTtl: config.accessTtlSeconds });
    res.status(200).json({ refreshed: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/logout', async (req, res, next) => {
  try {
    await auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    res.status(200).json({ loggedOut: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  '/auth/password-reset/request',
  credentialLimiter,
  validateBody({ email: { required: true, type: 'string', maxLength: 254 } }),
  async (req, res, next) => {
    try {
      await auth.requestPasswordReset(req.validated.email);
      // BE-01-04 AC-1: identical response whether or not the account exists. Nothing about
      // the outcome reaches the caller, which is the entire point of the story.
      res.status(202).json({ requested: true });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/auth/password-reset/complete',
  credentialLimiter,
  validateBody({
    token: { required: true, type: 'string', maxLength: 200 },
    password: { required: true, type: 'string', minLength: 12, maxLength: 200 },
  }),
  async (req, res, next) => {
    try {
      await auth.completePasswordReset(req.validated.token, req.validated.password);
      clearAuthCookies(res);
      res.status(200).json({ reset: true });
    } catch (err) {
      next(err);
    }
  },
);
