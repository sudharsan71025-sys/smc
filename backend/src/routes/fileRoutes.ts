import { Router } from 'express';
import { streamFile, downloadFile, getFileInfo } from '../controllers/fileController.js';

const router = Router();

// Stream 3D model file directly from MongoDB GridFS
// Supports /files/:id and /files/:id/:filename (with .glb or .usdz extension)
router.get('/:id', streamFile);
router.get('/:id/download', downloadFile);
router.get('/:id/info', getFileInfo);
router.get('/:id/:filename', streamFile);

export default router;

