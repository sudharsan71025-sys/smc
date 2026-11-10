import { FilterQuery, Types } from 'mongoose';
import { Product, IProduct, ProductStatus } from '../models/Product.js';
import { storageService } from './storageService.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';

export interface CreateProductInput {
  name: string;
  glbUrl: string;
  usdzUrl?: string;
  glbFileId?: Types.ObjectId;
  usdzFileId?: Types.ObjectId;
  status?: ProductStatus;
  createdBy: string | Types.ObjectId;
}

export interface UpdateProductInput {
  name?: string;
  glbUrl?: string;
  usdzUrl?: string;
  glbFileId?: Types.ObjectId;
  usdzFileId?: Types.ObjectId;
  status?: ProductStatus;
}

export class ProductService {
  /**
   * Create a new product (Draft or Published)
   */
  async createProduct(data: CreateProductInput): Promise<IProduct> {
    const product = await Product.create({
      name: data.name.trim(),
      glbUrl: data.glbUrl.trim(),
      usdzUrl: data.usdzUrl?.trim() || undefined,
      glbFileId: data.glbFileId,
      usdzFileId: data.usdzFileId,
      status: data.status || 'draft',
      createdBy: new Types.ObjectId(data.createdBy.toString()),
    });

    logger.info(`Product created: ${product.name} [${product.status}] (ID: ${product._id})`);
    return product;
  }

  /**
   * Get all products for Admin (both Draft and Published)
   */
  async getAdminProducts(params?: {
    search?: string;
    status?: 'draft' | 'published';
  }): Promise<IProduct[]> {
    const filter: FilterQuery<IProduct> = {};

    if (params?.status) {
      filter.status = params.status;
    }

    if (params?.search) {
      filter.name = { $regex: params.search, $options: 'i' };
    }

    const products = await Product.find(filter)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });

    return products;
  }

  /**
   * Get only published products for Users / Public Website
   */
  async getPublishedProducts(params?: { search?: string }): Promise<IProduct[]> {
    const filter: FilterQuery<IProduct> = { status: 'published' };

    if (params?.search) {
      filter.name = { $regex: params.search, $options: 'i' };
    }

    const products = await Product.find(filter)
      .select('name glbUrl usdzUrl status createdAt updatedAt')
      .sort({ createdAt: -1 });

    return products;
  }

  /**
   * Get product by ID (Enforces published status unless allowDraft is true)
   */
  async getProductById(id: string, allowDraft = false): Promise<IProduct> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest(`Invalid product ID format: '${id}'`);
    }

    const product = await Product.findById(id).populate('createdBy', 'name email');

    if (!product) {
      throw ApiError.notFound(`Product with ID '${id}' not found`);
    }

    if (!allowDraft && product.status !== 'published') {
      throw ApiError.notFound('Product is currently in draft and not visible to users');
    }

    return product;
  }

  /**
   * Update product metadata or file URLs
   */
  async updateProduct(id: string, updateData: UpdateProductInput): Promise<IProduct> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest(`Invalid product ID format: '${id}'`);
    }

    const existing = await Product.findById(id);
    if (!existing) {
      throw ApiError.notFound(`Product with ID '${id}' not found`);
    }

    // If new GLB is uploaded, clean up old GLB from GridFS
    if (updateData.glbFileId && existing.glbFileId && !updateData.glbFileId.equals(existing.glbFileId)) {
      await storageService.deleteFile(existing.glbFileId);
    } else if (updateData.glbUrl && updateData.glbUrl !== existing.glbUrl) {
      await storageService.deleteFileFromUrl(existing.glbUrl);
    }

    // If new USDZ is uploaded or changed, clean up old USDZ from GridFS
    if (updateData.usdzFileId && existing.usdzFileId && !updateData.usdzFileId.equals(existing.usdzFileId)) {
      await storageService.deleteFile(existing.usdzFileId);
    } else if (updateData.usdzUrl && updateData.usdzUrl !== existing.usdzUrl) {
      await storageService.deleteFileFromUrl(existing.usdzUrl);
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      {
        ...(updateData.name ? { name: updateData.name.trim() } : {}),
        ...(updateData.glbUrl ? { glbUrl: updateData.glbUrl.trim() } : {}),
        ...(updateData.usdzUrl !== undefined ? { usdzUrl: updateData.usdzUrl?.trim() || undefined } : {}),
        ...(updateData.glbFileId ? { glbFileId: updateData.glbFileId } : {}),
        ...(updateData.usdzFileId !== undefined ? { usdzFileId: updateData.usdzFileId } : {}),
        ...(updateData.status ? { status: updateData.status } : {}),
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!updated) {
      throw ApiError.notFound(`Product with ID '${id}' not found`);
    }

    logger.info(`Product updated: ${updated.name} (ID: ${updated._id})`);
    return updated;
  }

  /**
   * Explicitly publish a draft product
   */
  async publishProduct(id: string): Promise<IProduct> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest(`Invalid product ID format: '${id}'`);
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { status: 'published' },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!product) {
      throw ApiError.notFound(`Product with ID '${id}' not found`);
    }

    logger.info(`Product published: ${product.name} (ID: ${product._id})`);
    return product;
  }

  /**
   * Delete product and clean up its 3D files from storage
   */
  async deleteProduct(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest(`Invalid product ID format: '${id}'`);
    }

    const product = await Product.findById(id);
    if (!product) {
      throw ApiError.notFound(`Product with ID '${id}' not found`);
    }

    // Clean up files in MongoDB GridFS to maintain database storage consistency
    if (product.glbFileId) {
      await storageService.deleteFile(product.glbFileId);
    } else if (product.glbUrl) {
      await storageService.deleteFileFromUrl(product.glbUrl);
    }

    if (product.usdzFileId) {
      await storageService.deleteFile(product.usdzFileId);
    } else if (product.usdzUrl) {
      await storageService.deleteFileFromUrl(product.usdzUrl);
    }

    await Product.findByIdAndDelete(id);
    logger.info(`Product and associated 3D models deleted: ${product.name} (ID: ${id})`);
  }
}

export const productService = new ProductService();
