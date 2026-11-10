import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { storageService, getGridFSBucket } from '../services/storageService.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';

/**
 * Determines exact MIME type for 3D formats
 */
function getMimeType(filename: string, declaredType?: string): string {
  if (filename.toLowerCase().endsWith('.usdz')) {
    return 'model/vnd.usdz+zip';
  }
  if (filename.toLowerCase().endsWith('.glb')) {
    return 'model/gltf-binary';
  }
  if (filename.toLowerCase().endsWith('.gltf')) {
    return 'model/gltf+json';
  }
  return declaredType || 'application/octet-stream';
}

/**
 * Streams 3D model files directly from MongoDB GridFS with HTTP Range support
 */
export const streamFile = asyncHandler(async (req: Request, res: Response) => {
  const fileIdentifier = req.params.id;
  const isObjectId = Types.ObjectId.isValid(fileIdentifier);

  // Parse HTTP Range header if requested by browser / model-viewer
  const rangeHeader = req.headers.range;

  let fileInfo: any;
  let fileStream: NodeJS.ReadableStream;

  if (isObjectId) {
    // 1. Fetch file metadata first
    const bucket = getGridFSBucket();
    const files = await bucket.find({ _id: new Types.ObjectId(fileIdentifier) }).toArray();
    if (!files || files.length === 0) {
      throw ApiError.notFound(`File '${fileIdentifier}' not found in MongoDB GridFS`);
    }
    fileInfo = files[0];

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.length - 1;
      const chunksize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileInfo.length}`);
      res.setHeader('Content-Length', chunksize);

      fileStream = bucket.openDownloadStream(fileInfo._id, { start, end: end + 1 });
    } else {
      res.status(200);
      res.setHeader('Content-Length', fileInfo.length);
      fileStream = bucket.openDownloadStream(fileInfo._id);
    }
  } else {
    // Fallback: search by filename
    const result = await storageService.getFileStreamByName(fileIdentifier);
    if (!result) {
      throw ApiError.notFound(`File '${fileIdentifier}' not found in MongoDB GridFS`);
    }
    fileInfo = result.file;
    res.status(200);
    res.setHeader('Content-Length', fileInfo.length);
    fileStream = result.stream;
  }

  const mimeType = getMimeType(fileInfo.filename, fileInfo.contentType);

  // Set essential headers for Apple Quick Look, Google model-viewer, and Scene Viewer
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (req.method === 'HEAD') {
    return res.end();
  }

  fileStream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Stream failed' });
    }
  });

  fileStream.pipe(res);
});

/**
 * Downloads 3D model file as an attachment
 */
export const downloadFile = asyncHandler(async (req: Request, res: Response) => {
  const fileIdentifier = req.params.id;
  const bucket = getGridFSBucket();

  if (!Types.ObjectId.isValid(fileIdentifier)) {
    throw ApiError.badRequest('Invalid file ID format');
  }

  const files = await bucket.find({ _id: new Types.ObjectId(fileIdentifier) }).toArray();
  if (!files || files.length === 0) {
    throw ApiError.notFound('File not found in MongoDB GridFS');
  }

  const file = files[0];
  const mimeType = getMimeType(file.filename, file.contentType);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Length', file.length);

  bucket.openDownloadStream(file._id).pipe(res);
});

/**
 * Returns metadata about a file stored in MongoDB GridFS
 */
export const getFileInfo = asyncHandler(async (req: Request, res: Response) => {
  const fileIdentifier = req.params.id;
  const bucket = getGridFSBucket();

  if (!Types.ObjectId.isValid(fileIdentifier)) {
    throw ApiError.badRequest('Invalid file ID format');
  }

  const files = await bucket.find({ _id: new Types.ObjectId(fileIdentifier) }).toArray();
  if (!files || files.length === 0) {
    throw ApiError.notFound('File not found in MongoDB GridFS');
  }

  const file = files[0];

  return ApiResponse.success(res, {
    message: 'File metadata retrieved from MongoDB GridFS',
    data: {
      id: file._id,
      filename: file.filename,
      sizeBytes: file.length,
      contentType: getMimeType(file.filename, file.contentType),
      uploadDate: file.uploadDate,
      metadata: file.metadata,
    },
  });
});
