import mongoose, { Schema, Document, Types } from 'mongoose';

export type ProductStatus = 'draft' | 'published';

export interface IProduct extends Document {
  _id: Types.ObjectId;
  name: string;
  glbFileId?: Types.ObjectId;
  usdzFileId?: Types.ObjectId;
  glbUrl: string;
  usdzUrl?: string;
  status: ProductStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // Compatibility virtual getter
  title?: string;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters'],
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    glbFileId: {
      type: Schema.Types.ObjectId,
      index: true,
      default: undefined,
    },
    usdzFileId: {
      type: Schema.Types.ObjectId,
      index: true,
      default: undefined,
    },
    glbUrl: {
      type: String,
      required: [true, 'GLB model URL is required'],
      trim: true,
    },
    usdzUrl: {
      type: String,
      trim: true,
      default: undefined,
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'published'],
        message: 'Status must be either draft or published',
      },
      default: 'draft',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Product creator is required'],
      index: true,
    },
  },
  {
    collection: 'products',
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for high-performance query execution
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ name: 'text' });

// Virtual for title compatibility (so components accessing item.title resolve to item.name)
ProductSchema.virtual('title').get(function () {
  return this.name;
});

export const Product = mongoose.model<IProduct>('Product', ProductSchema);
