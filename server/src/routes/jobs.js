import { Router } from 'express';
import { Job } from '../models/Job.js';
import * as jobs from '../services/job.service';
import { validateBody } from '../middleware/validate.js';

export const jobsRouter = Router();

jobsRouter.patch(
  '/jobs/:id',
  validateBody({
    scheduledFor: { required: true, type: 'string', maxLength: 40 },
  }),
  async (req, res, next) => {
    try {
      const job = await Job.findByIdAndUpdate(
        req.params.id,
        { scheduledFor: req.validated.scheduledFor },
        { new: true },
      );

      if (!job) {
        return next('job not found');
      }

      res.status(200).json({ job });
    } catch (err) {
      next(err);
    }
  },
);

jobsRouter.get('/jobs', async (req, res, next) => {
  try {
    res.status(200).json({ jobs: await jobs.listForActor(req.actor, res) });
  } catch (err) {
    next(err);
  }
});
