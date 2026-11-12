import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Asset3D } from '../models/Asset3D.js';

async function verifyDatabase() {
  logger.info('==================================================');
  logger.info('  MongoDB & Mongoose Architecture Verification    ');
  logger.info('==================================================');

  let memoryServer: MongoMemoryServer | null = null;
  let isUsingMemoryServer = false;

  logger.info(`Checking configured connection string: ${env.MONGODB_URI}`);

  try {
    // 1. Attempt connection to primary configured URI
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 2000,
      dbName: env.MONGODB_DB_NAME,
    });
    logger.info(' Connected to target MongoDB server successfully!');
  } catch {
    logger.warn(' Target MongoDB not responding (daemon may not be started locally).');
    logger.info(' Initializing MongoMemoryServer to verify Mongoose ODM & schemas...');

    try {
      memoryServer = await MongoMemoryServer.create();
      const memoryUri = memoryServer.getUri();
      await mongoose.connect(memoryUri);
      isUsingMemoryServer = true;
      logger.info(` Connected to In-Memory MongoDB at ${memoryUri}`);
    } catch (memErr) {
      logger.error('Failed to launch memory server:', memErr);
      process.exit(1);
    }
  }

  try {
    // 2. Verify Schema Compilation & CRUD on Mongoose Models
    logger.info(' Verifying Mongoose Model schemas (Category, Asset3D, Product)...');

    const testCategory = await Category.create({
      name: 'Modern Sliding Doors',
      slug: `test-sliding-doors-${Date.now()}`,
      type: 'door',
      description: 'Architectural sliding door category',
    });
    logger.info(` Category model verified. Created ID: ${testCategory._id}`);

    const testAsset = await Asset3D.create({
      name: 'Sliding Door LOD0 GLB',
      originalFileName: 'door-sliding-lod0.glb',
      format: 'glb',
      url: 'http://localhost:5000/api/v1/files/models/test-door.glb',
      fileKey: 'test-door.glb',
      bucket: 'models',
      fileSize: 2450000,
      mimeType: 'model/gltf-binary',
      lodLevel: 'lod0',
      polycount: 14200,
      isArReady: true,
    });
    logger.info(` Asset3D model verified. Created ID: ${testAsset._id}`);

    const testProduct = await Product.create({
      name: 'Minimalist Aluminum Sliding Door',
      glbUrl: testAsset.url,
      glbFileId: testAsset._id,
      createdBy: new mongoose.Types.ObjectId(),
      status: 'published',
    });
    logger.info(` Product model verified. Created ID: ${testProduct._id}`);

    // Clean up test records
    await Product.findByIdAndDelete(testProduct._id);
    await Asset3D.findByIdAndDelete(testAsset._id);
    await Category.findByIdAndDelete(testCategory._id);
    logger.info(' Cleaned up test records.');

    logger.info('==================================================');
    logger.info(' MongoDB & Mongoose Architecture is 100% OPERATIONAL!');
    if (isUsingMemoryServer) {
      logger.info(' Note: Verified using in-memory MongoDB. When deploying,');
      logger.info(' set MONGODB_URI in backend/.env to your MongoDB Atlas or server instance.');
    }
    logger.info('==================================================');
  } finally {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
    }
  }
}

verifyDatabase().catch((err) => {
  logger.error('Verification failed:', err);
  process.exit(1);
});
