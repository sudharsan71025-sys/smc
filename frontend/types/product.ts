export type ProductStatus = 'draft' | 'published';

export interface MaterialOption {
  name: string;
  code: string;
  hexColor: string;
  roughness: number;
  metalness: number;
  textureUrl?: string;
  priceModifier: number;
}

export interface HardwareOption {
  name: string;
  code: string;
  finish: string;
  price: number;
}

export interface Product {
  _id: string;
  name: string;
  glbUrl: string;
  usdzUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  status: ProductStatus;
  createdBy?: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
  title?: string;

  // Optional fields for component compatibility
  dimensions?: {
    defaultWidth: number;
    defaultHeight: number;
    defaultDepth: number;
    unit: string;
  };
  customizable?: {
    widthRange: { min: number; max: number };
    heightRange: { min: number; max: number };
    materials: Array<{
      name: string;
      code: string;
      hexColor: string;
      roughness: number;
      metalness: number;
      textureUrl?: string;
      priceModifier: number;
    }>;
    hardware: Array<{
      name: string;
      code: string;
      finish: string;
      price: number;
    }>;
  };
  assets?: {
    primaryGlb?: { url?: string };
    iosUsdz?: { url?: string };
    thumbnailUrl?: string;
    galleryImages?: string[];
  };
  productType?: 'door' | 'window';
  basePrice?: number;
  currency?: string;
  description?: string;
  slug?: string;
  subType?: string;
}
