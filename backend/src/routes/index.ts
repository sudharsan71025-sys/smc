import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import productRoutes from './productRoutes.js';
import assetRoutes from './assetRoutes.js';
import authRoutes from './authRoutes.js';
import fileRoutes from './fileRoutes.js';
import { checkDbConnection } from '../middleware/checkDbConnection.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/products', checkDbConnection, productRoutes);
router.use('/files', checkDbConnection, fileRoutes);
router.use('/assets', checkDbConnection, assetRoutes);
router.use('/auth', checkDbConnection, authRoutes);

export default router;

