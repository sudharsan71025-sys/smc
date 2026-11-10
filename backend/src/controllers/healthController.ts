import { Request, Response } from 'express';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  const dbStatus = db.getStatus();
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();

  const isHealthy = dbStatus.isConnected;

  return ApiResponse.success(res, {
    statusCode: isHealthy ? 200 : 503,
    message: isHealthy
      ? 'AR Door & Window Showroom API is fully operational'
      : 'AR Showroom API running with degraded database connectivity',
    data: {
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'smc-ar-door-window-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        formatted: `${Math.floor(uptimeSeconds / 60)}m ${Math.floor(uptimeSeconds % 60)}s`,
      },
      database: {
        type: 'MongoDB',
        state: dbStatus.state,
        connected: dbStatus.isConnected,
        host: dbStatus.host || 'unknown',
        databaseName: dbStatus.name || env.MONGODB_DB_NAME,
      },
      storage: {
        provider: 'mongodb-gridfs',
        bucket: env.GRIDFS_BUCKET_NAME,
      },
      memory: {
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
      },
    },
  });
});

