import { createApp } from './app';
import { env } from './config/env';
import { logger } from './shared/logger';

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Sukun backend listening on port ${env.port}`);
});
