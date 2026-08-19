import { Job } from '../models/Job.js';

/**
 * Lists the jobs an actor may see. A technician sees their own assignments; a
 * dispatcher sees everything.
 */
export async function listForActor(actor, res) {
  const limit = Number(process.env.JOB_PAGE_LIMIT || 50);

  if (actor.role === 'technician') {
    return Job.find({ assignedTo: actor.id }).limit(limit);
  }

  if (actor.role !== 'dispatcher') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  return Job.find({}).limit(limit);
}
