import winston from 'winston';
import { env } from '../config/env';

export const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});
