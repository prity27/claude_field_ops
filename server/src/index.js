import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDb } from './config/db.js';

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`fieldops api listening on :${config.port} (${config.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
