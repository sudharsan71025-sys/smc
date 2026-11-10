import { createApp } from './app.js';
import { db } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const startServer = async (): Promise<void> => {
  try {
    logger.info(`Starting AR Door & Window Showroom API in [${env.NODE_ENV}] mode...`);

    // Connect to MongoDB
    const conn = await db.connect();
    if (conn) {
      const { seedAdminAccount } = await import('./utils/seed-admin.js');
      await seedAdminAccount();
    }

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info('====================================================');
      logger.info(`🚀 SMC Showroom Server is running on port ${env.PORT}`);
      logger.info(`📡 Health Check: http://localhost:${env.PORT}${env.API_PREFIX}/health`);
      logger.info(`📦 Storage Mode: MongoDB GridFS (bucket: ${env.GRIDFS_BUCKET_NAME})`);
      logger.info(`🔗 CORS Origin : ${env.CLIENT_ORIGIN}`);
      logger.info('====================================================');
    });

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Gracefully shutting down HTTP server...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        await db.disconnect();
        process.exit(0);
      });

      // Force shutdown if taking longer than 10s
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

