'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { productService } from '@/services/product-service';
import { Product, ProductStatus } from '@/types/product';
import { ModelViewerCanvas } from '@/components/3d/ModelViewerCanvas';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export default function AdminDashboardPage() {
  const router = useRouter();
  const { token, isLoading: authLoading, isAdmin } = useAuth({
    requireAuth: true,
    requiredRole: 'admin',
    redirectTo: '/login',
  });

  // Upload Form State
  const [productName, setProductName] = useState('');
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [usdzFile, setUsdzFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Products List State
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'published' | 'draft'>('all');
  const [metaCounts, setMetaCounts] = useState({ total: 0, published: 0, draft: 0 });

  // Preview Modal State
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState<ProductStatus>('draft');
  const [editGlbFile, setEditGlbFile] = useState<File | null>(null);
  const [editUsdzFile, setEditUsdzFile] = useState<File | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Fetch admin products
  const loadProducts = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoadingList(true);
      const res = await productService.getAdminProducts(token);
      setProducts(res.data);
      setMetaCounts(res.meta);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load products';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsLoadingList(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && isAdmin && token) {
      loadProducts();
    }
  }, [authLoading, isAdmin, token, loadProducts]);

  // Frontend GLB File Validation
  const handleGlbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setGlbFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.glb')) {
      setValidationError('Primary 3D model must be a .glb file format.');
      setGlbFile(null);
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError('GLB file size exceeds maximum 50 MB limit.');
      setGlbFile(null);
      e.target.value = '';
      return;
    }

    setGlbFile(file);
  };

  // Frontend USDZ File Validation
  const handleUsdzChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setUsdzFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.usdz')) {
      setValidationError('Apple AR model must be a .usdz file format.');
      setUsdzFile(null);
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError('USDZ file size exceeds maximum 50 MB limit.');
      setUsdzFile(null);
      e.target.value = '';
      return;
    }

    setUsdzFile(file);
  };

  // Upload & Create Product Workflow
  const handleUploadSubmit = async (e: React.FormEvent, targetStatus: ProductStatus) => {
    e.preventDefault();
    setNotification(null);
    setValidationError(null);

    if (!productName.trim() || productName.trim().length < 2) {
      setValidationError('Please enter a valid product name (minimum 2 characters).');
      return;
    }

    if (!glbFile) {
      setValidationError('Primary GLB 3D model (.glb) is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', productName.trim());
      formData.append('glbFile', glbFile);
      if (usdzFile) {
        formData.append('usdzFile', usdzFile);
      }
      formData.append('status', targetStatus);

      const created = await productService.createProduct(formData, token!);
      setNotification({
        type: 'success',
        message:
          targetStatus === 'published'
            ? `Product "${created.name}" uploaded and published live.`
            : `Product "${created.name}" uploaded and saved as Draft. Preview it below.`,
      });

      // Reset form
      setProductName('');
      setGlbFile(null);
      setUsdzFile(null);

      // Refresh list and optionally open preview
      await loadProducts();
      if (targetStatus === 'draft') {
        setPreviewProduct(created);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error uploading product.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Publish Draft Product
  const handlePublish = async (id: string, name: string) => {
    if (!token) return;
    try {
      await productService.publishProduct(id, token);
      setNotification({
        type: 'success',
        message: `Product "${name}" is now published and visible to users.`,
      });
      await loadProducts();
      if (previewProduct?._id === id) {
        setPreviewProduct((prev) => (prev ? { ...prev, status: 'published' } : null));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish product.';
      setNotification({ type: 'error', message: msg });
    }
  };

  // Delete Product
  const handleDelete = async (id: string, name: string) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete "${name}"? This removes the 3D files from storage.`)) {
      return;
    }

    try {
      await productService.deleteProduct(id, token);
      setNotification({
        type: 'success',
        message: `Product "${name}" and associated 3D models were deleted.`,
      });
      setProducts((prev) => prev.filter((p) => p._id !== id));
      if (previewProduct?._id === id) {
        setPreviewProduct(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete product.';
      setNotification({ type: 'error', message: msg });
    }
  };

  // Open Edit Modal
  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditStatus(product.status);
    setEditGlbFile(null);
    setEditUsdzFile(null);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !token) return;

    if (!editName.trim() || editName.trim().length < 2) {
      alert('Product name must be at least 2 characters');
      return;
    }

    setIsSavingEdit(true);
    try {
      if (editGlbFile || editUsdzFile) {
        // Multipart update
        const formData = new FormData();
        formData.append('name', editName.trim());
        formData.append('status', editStatus);
        if (editGlbFile) formData.append('glbFile', editGlbFile);
        if (editUsdzFile) formData.append('usdzFile', editUsdzFile);
        await productService.updateProduct(editingProduct._id, formData, token);
      } else {
        // JSON metadata update
        await productService.updateProduct(
          editingProduct._id,
          { name: editName.trim(), status: editStatus },
          token
        );
      }

      setNotification({
        type: 'success',
        message: `Product "${editName}" updated successfully.`,
      });
      setEditingProduct(null);
      await loadProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update product';
      alert(msg);
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-8 text-xs text-secondary">
        Verifying administrator authorization...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-8">
        <Card className="max-w-md p-8 text-center space-y-3 border-border">
          <p className="text-sm font-semibold text-red-600">Access Restricted</p>
          <p className="text-xs text-secondary">
            Only administrators are authorized to access the product management console.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
            Return to User Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const filteredProducts = products.filter((p) => {
    if (filterTab === 'published') return p.status === 'published';
    if (filterTab === 'draft') return p.status === 'draft';
    return true;
  });

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
      {/* Page Title & Stats */}
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-foreground">
            Admin <span className="font-semibold text-primary">Dashboard</span>
          </h1>
          <p className="text-xs sm:text-sm text-secondary">
            Upload 3D models, inspect them in real-time, and publish products for user AR experiences.
          </p>
        </div>

        {/* Stats Counters */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-xs w-full sm:w-auto">
          <div className="border border-border px-3 py-2 bg-white text-center shadow-sm">
            <span className="text-secondary block text-[10px] uppercase tracking-wider">Total</span>
            <span className="font-semibold text-foreground text-sm">{metaCounts.total}</span>
          </div>
          <div className="border border-[#C5A572]/40 bg-[#FAF7F2] px-3 py-2 text-center shadow-sm">
            <span className="text-secondary block text-[10px] uppercase tracking-wider">Published</span>
            <span className="font-semibold text-primary text-sm">{metaCounts.published}</span>
          </div>
          <div className="border border-border px-3 py-2 bg-white text-center shadow-sm">
            <span className="text-secondary block text-[10px] uppercase tracking-wider">Drafts</span>
            <span className="font-semibold text-secondary text-sm">{metaCounts.draft}</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 border text-xs flex items-center justify-between ${
            notification.type === 'success'
              ? 'border-[#C5A572]/40 bg-[#FAF7F2] text-[#202020]'
              : 'border-red-200 bg-red-50 text-red-600'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs font-bold ml-4 hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* Validation Alert */}
      {validationError && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-600 text-xs">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: UPLOAD 3D PRODUCT FORM                        */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-border">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold">Upload 3D Product</CardTitle>
              <CardDescription>
                Provide the product name and attach the 3D model files.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form className="space-y-5">
                {/* 1. Product Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="productName">Product Name *</Label>
                  <Input
                    id="productName"
                    type="text"
                    placeholder="e.g. Minimalist Sliding Glass Door"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                {/* 2. Primary GLB 3D Model File */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="glbFile">Primary 3D Model (GLB) *</Label>
                    <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                      Required
                    </span>
                  </div>
                  <div className="border border-dashed border-border p-4 text-center space-y-2 bg-muted/20 hover:border-primary transition-colors">
                    <input
                      id="glbFile"
                      type="file"
                      accept=".glb"
                      onChange={handleGlbChange}
                      disabled={isSubmitting}
                      className="text-xs text-secondary file:mr-3 file:py-1.5 file:px-3 file:border file:border-border file:text-xs file:bg-white file:text-foreground cursor-pointer w-full"
                    />
                    {glbFile ? (
                      <div className="text-xs text-primary font-medium truncate pt-1 flex items-center justify-center space-x-1">
                        <span>✓ {glbFile.name}</span>
                        <span className="text-secondary text-[11px]">
                          ({(glbFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-secondary">
                        Blender-exported binary format (.glb, max 50 MB)
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Optional USDZ Apple AR Format */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="usdzFile">Apple AR Format (USDZ)</Label>
                    <span className="text-[10px] uppercase tracking-wider text-secondary">
                      Optional
                    </span>
                  </div>
                  <div className="border border-dashed border-border p-4 text-center space-y-2 bg-muted/20 hover:border-border transition-colors">
                    <input
                      id="usdzFile"
                      type="file"
                      accept=".usdz"
                      onChange={handleUsdzChange}
                      disabled={isSubmitting}
                      className="text-xs text-secondary file:mr-3 file:py-1.5 file:px-3 file:border file:border-border file:text-xs file:bg-white file:text-foreground cursor-pointer w-full"
                    />
                    {usdzFile ? (
                      <div className="text-xs text-foreground font-medium truncate pt-1 flex items-center justify-center space-x-1">
                        <span>✓ {usdzFile.name}</span>
                        <span className="text-secondary text-[11px]">
                          ({(usdzFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-secondary">
                        For iOS Quick Look native AR (.usdz, max 50 MB)
                      </p>
                    )}
                  </div>
                </div>

                {/* Workflow Buttons: Save as Draft vs Publish Immediately */}
                <div className="pt-2 space-y-2">
                  <Button
                    type="button"
                    variant="gold"
                    size="lg"
                    className="w-full tracking-wider uppercase text-xs font-semibold"
                    disabled={isSubmitting}
                    onClick={(e) => handleUploadSubmit(e, 'published')}
                  >
                    {isSubmitting ? 'Uploading & Publishing...' : 'Upload & Publish Live'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={isSubmitting}
                    onClick={(e) => handleUploadSubmit(e, 'draft')}
                  >
                    Save as Draft (Preview First)
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: PUBLISHED PRODUCTS & DRAFTS LIST             */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm uppercase tracking-wider font-semibold text-foreground">
              Product Catalog ({filteredProducts.length})
            </h2>

            {/* Filter Tabs */}
            <div className="flex items-center space-x-1 border border-border p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`text-xs px-2.5 py-1 ${
                  filterTab === 'all'
                    ? 'bg-white font-semibold text-foreground shadow-sm'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                All ({metaCounts.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('published')}
                className={`text-xs px-2.5 py-1 ${
                  filterTab === 'published'
                    ? 'bg-white font-semibold text-primary shadow-sm'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Published ({metaCounts.published})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('draft')}
                className={`text-xs px-2.5 py-1 ${
                  filterTab === 'draft'
                    ? 'bg-white font-semibold text-foreground shadow-sm'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Drafts ({metaCounts.draft})
              </button>
            </div>
          </div>

          <Card className="border-border">
            {isLoadingList ? (
              <div className="p-16 text-center text-xs text-secondary">
                Loading products from catalog...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-16 text-center space-y-2">
                <p className="text-sm font-medium text-foreground">No Products Found</p>
                <p className="text-xs text-secondary">
                  {filterTab === 'published'
                    ? 'No products are currently published for users.'
                    : filterTab === 'draft'
                    ? 'No draft products currently pending publication.'
                    : 'Use the upload form to add your first 3D door or window model.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredProducts.map((item) => (
                  <div
                    key={item._id}
                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                  >
                    {/* Product Metadata */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-sm font-medium text-foreground truncate">
                          {item.name}
                        </span>
                        {item.status === 'published' ? (
                          <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 border border-[#C5A572]/40 bg-[#FAF7F2] text-[#202020]">
                            Published
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 border border-border bg-muted/40 text-secondary">
                            Draft
                          </span>
                        )}
                      </div>

                      {/* Model Format Tags */}
                      <div className="flex items-center space-x-2 text-[11px] text-secondary">
                        <span className="px-1.5 py-0.2 bg-foreground/5 border border-border">
                          GLB
                        </span>
                        {item.usdzUrl && (
                          <span className="px-1.5 py-0.2 bg-foreground/5 border border-border">
                            USDZ (iOS AR)
                          </span>
                        )}
                        <span className="text-[10px] text-secondary/70">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 self-start md:self-center flex-wrap gap-y-1">
                      {/* Preview Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewProduct(item)}
                        className="text-xs"
                      >
                        Preview 3D
                      </Button>

                      {/* Publish Button (for Drafts) */}
                      {item.status === 'draft' && (
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={() => handlePublish(item._id, item.name)}
                          className="text-xs uppercase tracking-wider"
                        >
                          Publish
                        </Button>
                      )}

                      {/* Edit Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(item)}
                        className="text-xs"
                      >
                        Edit
                      </Button>

                      {/* Delete Button */}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(item._id, item.name)}
                        className="text-xs"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3D MODEL PREVIEW MODAL                                    */}
      {/* ========================================================= */}
      {previewProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm">
          <div className="bg-white border border-border max-w-3xl w-full p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-secondary">
                  Admin 3D Preview
                </span>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">
                  {previewProduct.name}
                </h3>
              </div>
              <button
                onClick={() => setPreviewProduct(null)}
                className="text-sm font-semibold text-secondary hover:text-foreground p-1"
              >
                ✕ Close
              </button>
            </div>

            {/* 3D Canvas */}
            <div className="border border-border">
              <ModelViewerCanvas
                src={previewProduct.glbUrl}
                iosSrc={previewProduct.usdzUrl}
                alt={previewProduct.name}
                cameraControls
                autoRotate
                className="w-full h-[280px] sm:h-[400px]"
              />
            </div>

            {/* Metadata & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-2">
              <div className="space-y-0.5 text-secondary">
                <p>
                  Status:{' '}
                  <span className="font-semibold text-foreground uppercase">
                    {previewProduct.status}
                  </span>
                </p>
                <p className="truncate max-w-sm">
                  GLB URL: <span className="text-foreground">{previewProduct.glbUrl}</span>
                </p>
                {previewProduct.usdzUrl && (
                  <p className="truncate max-w-sm">
                    USDZ URL: <span className="text-foreground">{previewProduct.usdzUrl}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {previewProduct.status === 'draft' && (
                  <Button
                    variant="gold"
                    size="sm"
                    className="text-xs uppercase tracking-wider"
                    onClick={() => handlePublish(previewProduct._id, previewProduct.name)}
                  >
                    Publish Product Now
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPreviewProduct(null)}
                >
                  Close Preview
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EDIT PRODUCT MODAL                                        */}
      {/* ========================================================= */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-border max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground">
                Edit Product
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-sm font-semibold text-secondary hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="editName">Product Name</Label>
                <Input
                  id="editName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editStatus">Publication Status</Label>
                <select
                  id="editStatus"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ProductStatus)}
                  className="flex h-11 w-full border border-border bg-white px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary"
                >
                  <option value="draft">Draft (Hidden from users)</option>
                  <option value="published">Published (Visible to users)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editGlb">Replace GLB Model (Optional)</Label>
                <input
                  id="editGlb"
                  type="file"
                  accept=".glb"
                  onChange={(e) => setEditGlbFile(e.target.files?.[0] || null)}
                  className="text-xs text-secondary file:mr-3 file:py-1 file:px-2 file:border file:border-border file:text-xs file:bg-white cursor-pointer w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editUsdz">Replace USDZ Model (Optional)</Label>
                <input
                  id="editUsdz"
                  type="file"
                  accept=".usdz"
                  onChange={(e) => setEditUsdzFile(e.target.files?.[0] || null)}
                  className="text-xs text-secondary file:mr-3 file:py-1 file:px-2 file:border file:border-border file:text-xs file:bg-white cursor-pointer w-full"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingProduct(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="sm"
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
