import { Product } from '../types/product';
import { getApiBaseUrl } from '../lib/api-url';

export class ProductService {
  /**
   * Fetch all products for Admin (Drafts and Published)
   */
  async getAdminProducts(token: string): Promise<{
    data: Product[];
    meta: { total: number; published: number; draft: number };
  }> {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/products/admin`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch admin products');
    }

    const json = await res.json();
    return {
      data: json.data || [],
      meta: json.meta || { total: 0, published: 0, draft: 0 },
    };
  }

  /**
   * Fetch only published products for Users / Public catalog
   */
  async getPublishedProducts(search?: string): Promise<Product[]> {
    const baseUrl = getApiBaseUrl();
    const url = new URL(`${baseUrl}/products`);
    if (search) {
      url.searchParams.set('search', search);
    }

    const res = await fetch(url.toString(), {
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch products');
    }

    const json = await res.json();
    return json.data || [];
  }

  /**
   * Fetch a single product by ID
   */
  async getProductById(id: string, token?: string): Promise<Product> {
    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}/products/${id}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Product not found or not published');
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Create a new product (with GLB file and optional USDZ file)
   */
  async createProduct(formData: FormData, token: string): Promise<Product> {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create product');
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Update an existing product
   */
  async updateProduct(
    id: string,
    data: FormData | { name?: string; status?: 'draft' | 'published' },
    token: string
  ): Promise<Product> {
    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    let body: BodyInit;
    if (data instanceof FormData) {
      body = data;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
    }

    const res = await fetch(`${baseUrl}/products/${id}`, {
      method: 'PUT',
      headers,
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update product');
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Explicitly publish a product to make it visible to users
   */
  async publishProduct(id: string, token: string): Promise<Product> {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/products/${id}/publish`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to publish product');
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Delete product and clean up 3D files from storage
   */
  async deleteProduct(id: string, token: string): Promise<void> {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/products/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete product');
    }
  }
}

export const productService = new ProductService();
