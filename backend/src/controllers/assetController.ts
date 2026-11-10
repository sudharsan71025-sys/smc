import { Request, Response } from 'express';
import { assetService } from '../services/assetService.js';
import { storageService } from '../services/storageService.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const uploadAsset = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }

  const asset = await assetService.uploadAndRegisterAsset(req.file, req.body);
  return ApiResponse.created(res, '3D Asset uploaded and registered successfully', asset);
});

export const getPresignedUrl = asyncHandler(async (_req: Request, _res: Response) => {
  throw ApiError.badRequest(
    'Presigned URLs are deprecated. All 3D assets are uploaded directly and persisted in MongoDB GridFS.'
  );
});

export const getAssets = asyncHandler(async (req: Request, res: Response) => {
  const assets = await assetService.listAssets(req.query as any);
  return ApiResponse.success(res, {
    message: 'Assets retrieved successfully',
    data: assets,
  });
});

export const getAssetById = asyncHandler(async (req: Request, res: Response) => {
  const asset = await assetService.getAssetById(req.params.id);
  return ApiResponse.success(res, {
    message: 'Asset retrieved successfully',
    data: asset,
  });
});

export const deleteAsset = asyncHandler(async (req: Request, res: Response) => {
  await assetService.deleteAsset(req.params.id);
  return ApiResponse.success(res, {
    message: 'Asset deleted successfully',
  });
});

