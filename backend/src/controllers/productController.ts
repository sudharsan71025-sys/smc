import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { productService } from '../services/productService.js';
import { storageService } from './../services/storageService.js';
import { validate3DFileBuffer } from '../middleware/upload.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

interface MulterFilesMap {
  [fieldname: string]: Express.Multer.File[];
}

export const createProduct = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const files = (req.files as MulterFilesMap) || {};
  const glbFile =
    files['glbFile']?.[0] || files['glb']?.[0] || files['file']?.[0];
  const usdzFile = files['usdzFile']?.[0] || files['usdz']?.[0];

  const name = (req.body.name || req.body.title || '').trim();
  if (!name || name.length < 2) {
    throw ApiError.badRequest('Product name must be at least 2 characters');
  }

  let glbUrl = (req.body.glbUrl || '').trim();
  let usdzUrl = (req.body.usdzUrl || '').trim() || undefined;
  let glbFileId: Types.ObjectId | undefined;
  let usdzFileId: Types.ObjectId | undefined;

  const protocol = req.protocol;
  const host = req.get('host') || 'localhost:5000';

  // Process uploaded GLB file if present into MongoDB GridFS
  if (glbFile) {
    validate3DFileBuffer(glbFile, 'glb');
    const uploadResult = await storageService.uploadFile(
      glbFile.buffer,
      glbFile.originalname,
      'model/gltf-binary',
      { type: 'glb', originalName: glbFile.originalname }
    );
    glbFileId = uploadResult.fileId;
    glbUrl = `${protocol}://${host}${uploadResult.url}`;
  }

  // Process uploaded USDZ file if present into MongoDB GridFS
  if (usdzFile) {
    validate3DFileBuffer(usdzFile, 'usdz');
    const uploadResult = await storageService.uploadFile(
      usdzFile.buffer,
      usdzFile.originalname,
      'model/vnd.usdz+zip',
      { type: 'usdz', originalName: usdzFile.originalname }
    );
    usdzFileId = uploadResult.fileId;
    usdzUrl = `${protocol}://${host}${uploadResult.url}`;
  }

  if (!glbUrl) {
    throw ApiError.badRequest('Primary GLB 3D model (.glb) is required');
  }

  const status = req.body.status === 'published' ? 'published' : 'draft';
  const createdBy = req.user?._id;

  if (!createdBy) {
    throw ApiError.unauthorized('Authentication required to create products');
  }

  const product = await productService.createProduct({
    name,
    glbUrl,
    usdzUrl,
    glbFileId,
    usdzFileId,
    status,
    createdBy,
  });

  return ApiResponse.created(res, 'Product created successfully', product);
});

export const getAdminProducts = asyncHandler(async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const products = await productService.getAdminProducts({
    search: search ? String(search) : undefined,
    status: status === 'draft' || status === 'published' ? status : undefined,
  });

  const publishedCount = products.filter((p) => p.status === 'published').length;
  const draftCount = products.filter((p) => p.status === 'draft').length;

  return ApiResponse.success(res, {
    message: 'Admin products retrieved successfully',
    data: products,
    meta: {
      total: products.length,
      published: publishedCount,
      draft: draftCount,
    },
  });
});

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query;
  const products = await productService.getPublishedProducts({
    search: search ? String(search) : undefined,
  });

  return ApiResponse.success(res, {
    message: 'Published products retrieved successfully',
    data: products,
    meta: {
      total: products.length,
    },
  });
});

export const getProductById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const isAdmin = req.user?.role === 'admin';
  const product = await productService.getProductById(req.params.id, isAdmin);

  return ApiResponse.success(res, {
    message: 'Product retrieved successfully',
    data: product,
  });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as MulterFilesMap) || {};
  const glbFile =
    files['glbFile']?.[0] || files['glb']?.[0] || files['file']?.[0];
  const usdzFile = files['usdzFile']?.[0] || files['usdz']?.[0];

  let glbUrl = req.body.glbUrl;
  let usdzUrl = req.body.usdzUrl;
  let glbFileId: Types.ObjectId | undefined;
  let usdzFileId: Types.ObjectId | undefined;

  const protocol = req.protocol;
  const host = req.get('host') || 'localhost:5000';

  // Process newly uploaded GLB replacement in MongoDB GridFS
  if (glbFile) {
    validate3DFileBuffer(glbFile, 'glb');
    const uploadResult = await storageService.uploadFile(
      glbFile.buffer,
      glbFile.originalname,
      'model/gltf-binary',
      { type: 'glb', originalName: glbFile.originalname }
    );
    glbFileId = uploadResult.fileId;
    glbUrl = `${protocol}://${host}${uploadResult.url}`;
  }

  // Process newly uploaded USDZ replacement in MongoDB GridFS
  if (usdzFile) {
    validate3DFileBuffer(usdzFile, 'usdz');
    const uploadResult = await storageService.uploadFile(
      usdzFile.buffer,
      usdzFile.originalname,
      'model/vnd.usdz+zip',
      { type: 'usdz', originalName: usdzFile.originalname }
    );
    usdzFileId = uploadResult.fileId;
    usdzUrl = `${protocol}://${host}${uploadResult.url}`;
  }

  const name = req.body.name || req.body.title;
  const status = req.body.status;

  const product = await productService.updateProduct(req.params.id, {
    name,
    glbUrl,
    usdzUrl,
    glbFileId,
    usdzFileId,
    status,
  });

  return ApiResponse.success(res, {
    message: 'Product updated successfully',
    data: product,
  });
});

export const publishProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.publishProduct(req.params.id);

  return ApiResponse.success(res, {
    message: 'Product published successfully and is now visible to users',
    data: product,
  });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.params.id);

  return ApiResponse.success(res, {
    message: 'Product deleted successfully',
  });
});
