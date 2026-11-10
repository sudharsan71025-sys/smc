import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import path from 'path';
import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';

const ALLOWED_3D_EXTENSIONS = new Set(['.glb', '.usdz']);

const ALLOWED_ALL_EXTENSIONS = new Set([
  '.glb',
  '.gltf',
  '.usdz',
  '.bin',
  '.hdr',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

// Memory storage to validate in RAM and stream directly to MongoDB GridFS
const storage = multer.memoryStorage();

// General file upload filter
const generalFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_ALL_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      ApiError.badRequest(
        `Unsupported file type '${ext}'. Allowed types: ${Array.from(ALLOWED_ALL_EXTENSIONS).join(', ')}`
      )
    );
  }
};

// Strict 3D model filter for Product uploads (GLB and USDZ only)
const modelFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_3D_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      ApiError.badRequest(
        `Invalid file type '${ext}'. Product 3D model must be a GLB (.glb) file or an optional USDZ (.usdz) file.`
      )
    );
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter: generalFileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

export const uploadProductModelsMiddleware = multer({
  storage,
  fileFilter: modelFileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
}).fields([
  { name: 'glbFile', maxCount: 1 },
  { name: 'usdzFile', maxCount: 1 },
  { name: 'glb', maxCount: 1 },
  { name: 'usdz', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

/**
 * Validates binary structure and magic bytes of uploaded 3D files
 */
export const validate3DFileBuffer = (
  file: Express.Multer.File,
  expectedType: 'glb' | 'usdz'
): void => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (expectedType === 'glb') {
    if (ext !== '.glb') {
      throw ApiError.badRequest(
        `Primary 3D model must have .glb extension. Received: ${ext}`
      );
    }

    if (!file.buffer || file.buffer.length < 12) {
      throw ApiError.badRequest('Uploaded GLB file is empty or corrupted');
    }

    // GLB files start with magic ASCII "glTF" (0x67, 0x6C, 0x54, 0x46)
    const magic = file.buffer.toString('ascii', 0, 4);
    if (magic !== 'glTF') {
      throw ApiError.badRequest(
        'Invalid GLB file: binary header does not match the glTF 2.0 binary specification'
      );
    }
  } else if (expectedType === 'usdz') {
    if (ext !== '.usdz') {
      throw ApiError.badRequest(
        `Apple AR model must have .usdz extension. Received: ${ext}`
      );
    }

    if (!file.buffer || file.buffer.length < 4) {
      throw ApiError.badRequest('Uploaded USDZ file is empty or corrupted');
    }

    // USDZ files are zip archives and start with 'PK' (0x50, 0x4B)
    const isZip = file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
    if (!isZip) {
      throw ApiError.badRequest(
        'Invalid USDZ file: binary header does not match zip container specification'
      );
    }
  }
};
