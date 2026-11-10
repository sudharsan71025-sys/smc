import mongoose, { Types } from 'mongoose';
import { Readable } from 'stream';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/apiError.js';

let gridFsBucket: any = null;

/**
 * Returns the active MongoDB GridFSBucket instance bound to the current Mongoose DB connection.
 */
export const getGridFSBucket = (): any => {
  if (!gridFsBucket || gridFsBucket.s?.db !== mongoose.connection.db) {
    if (!mongoose.connection.db) {
      throw new Error('MongoDB connection is not established. Cannot access GridFS bucket.');
    }
    gridFsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: env.GRIDFS_BUCKET_NAME || 'models',
    });
  }
  return gridFsBucket;
};

export interface GridFSUploadResult {
  fileId: Types.ObjectId;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
}

export class StorageService {
  /**
   * Sanitizes original filename to preserve extensions (.glb or .usdz) and generate clean names
   */
  private sanitizeFilename(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const base = path
      .basename(originalName, ext)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    return `${base}${ext}`;
  }

  /**
   * Uploads a 3D binary file buffer (GLB or USDZ) directly into MongoDB GridFS
   */
  async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    metadata: Record<string, any> = {}
  ): Promise<GridFSUploadResult> {
    const bucket = getGridFSBucket();
    const filename = this.sanitizeFilename(originalName);

    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: mimeType,
        metadata: {
          ...metadata,
          originalName,
          uploadedAt: new Date(),
        },
      });

      const fileId = uploadStream.id as unknown as Types.ObjectId;

      const readable = Readable.from(buffer);
      readable
        .pipe(uploadStream)
        .on('error', (err: any) => {
          logger.error('MongoDB GridFS upload error:', err);
          reject(ApiError.internal('Failed to persist file in MongoDB GridFS'));
        })
        .on('finish', () => {
          logger.info(`✅ 3D model stored in MongoDB GridFS: ${filename} (ID: ${fileId})`);

          // Canonical API streaming endpoint for Google model-viewer, Quick Look, and Scene Viewer
          const url = `/api/v1/files/${fileId}/${filename}`;

          resolve({
            fileId,
            filename,
            url,
            size: buffer.length,
            mimeType,
          });
        });
    });
  }

  /**
   * Retrieves a file download stream and metadata from MongoDB GridFS by ObjectId
   */
  async getFileStream(
    fileId: string | Types.ObjectId,
    range?: { start: number; end: number }
  ): Promise<{
    file: any;
    stream: NodeJS.ReadableStream;
  }> {
    if (!Types.ObjectId.isValid(fileId)) {
      throw ApiError.badRequest(`Invalid GridFS file ID format: '${fileId}'`);
    }

    const bucket = getGridFSBucket();
    const objectId = new mongoose.Types.ObjectId(fileId.toString());

    const files = await bucket.find({ _id: objectId }).toArray();
    if (!files || files.length === 0) {
      throw ApiError.notFound(`3D model file '${fileId}' not found in MongoDB GridFS`);
    }

    const file = files[0];
    const stream = range
      ? bucket.openDownloadStream(objectId, { start: range.start, end: range.end + 1 })
      : bucket.openDownloadStream(objectId);

    return { file, stream };
  }

  /**
   * Retrieves a file by filename from MongoDB GridFS (latest upload matching filename)
   */
  async getFileStreamByName(
    filename: string,
    range?: { start: number; end: number }
  ): Promise<{
    file: any;
    stream: NodeJS.ReadableStream;
  } | null> {
    const bucket = getGridFSBucket();
    const files = await bucket.find({ filename }).sort({ uploadDate: -1 }).toArray();
    if (!files || files.length === 0) {
      return null;
    }

    const file = files[0];
    const stream = range
      ? bucket.openDownloadStream(file._id, { start: range.start, end: range.end + 1 })
      : bucket.openDownloadStream(file._id);

    return { file, stream };
  }

  /**
   * Deletes a file and its chunks from MongoDB GridFS
   */
  async deleteFile(fileId: string | Types.ObjectId): Promise<void> {
    if (!fileId || !Types.ObjectId.isValid(fileId)) return;
    try {
      const bucket = getGridFSBucket();
      const objectId = new mongoose.Types.ObjectId(fileId.toString());
      await bucket.delete(objectId);
      logger.info(`Deleted file from MongoDB GridFS: ${fileId}`);
    } catch (err) {
      logger.warn(`Could not delete file ${fileId} from GridFS (it may already be deleted):`, err);
    }
  }

  /**
   * Deletes a file from MongoDB GridFS given its URL or filename
   */
  async deleteFileFromUrl(fileUrl?: string): Promise<void> {
    if (!fileUrl) return;
    try {
      // 1. Matches /files/:id or /api/v1/files/:id
      const match = fileUrl.match(/\/files\/([a-fA-F0-9]{24})/);
      if (match && match[1]) {
        await this.deleteFile(match[1]);
        return;
      }

      // 2. Fallback: match by filename
      const parsedFilename = path.basename(fileUrl.split('?')[0].split('#')[0]);
      if (parsedFilename) {
        const bucket = getGridFSBucket();
        const files = await bucket.find({ filename: parsedFilename }).toArray();
        for (const file of files) {
          await bucket.delete(file._id);
          logger.info(`Deleted file from MongoDB GridFS by filename: ${file.filename}`);
        }
      }
    } catch (err) {
      logger.warn(`Failed to clean up GridFS file from URL '${fileUrl}':`, err);
    }
  }
}

export const storageService = new StorageService();
