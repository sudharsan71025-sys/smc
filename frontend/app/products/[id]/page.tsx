'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import { ModelViewerCanvas } from '@/components/3d/ModelViewerCanvas';
import { ARLaunchButton } from '@/components/3d/ARLaunchButton';
import { buildQuickLookUrl } from '@/utils/3d-helpers';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { productService } from '@/services/product-service';
import { Product } from '@/types/product';

export default function ProductViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { token, isLoading: authLoading, isAdmin } = useAuth({
    requireAuth: true,
    redirectTo: '/login',
  });

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [placementMode, setPlacementMode] = useState<'wall' | 'floor'>('wall');

  const handleModelLoaded = useCallback((ms: number) => {
    setLoadTimeMs(ms);
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setIsLoading(true);
        const data = await productService.getProductById(id, token || undefined);
        setProduct(data);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Product not found or not published.';
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
      fetchProduct();
    }
  }, [id, authLoading, token]);

  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-8 text-xs text-secondary">
        Verifying authentication...
      </div>
    );
  }

  const displayName = product?.name || product?.title || 'Architectural Model';
  const glbUrl = product?.glbUrl;
  const usdzUrl = product?.usdzUrl;
  const quickLookUrl = usdzUrl
    ? buildQuickLookUrl({
        usdzUrl,
        canonicalWebPageURL: typeof window !== 'undefined' ? window.location.href : undefined,
        allowsContentScaling: false,
      })
    : undefined;

  return (
    <div className="container max-w-7xl mx-auto px-6 sm:px-8 py-8 space-y-8">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="px-0 hover:bg-transparent text-secondary hover:text-foreground"
        >
          <Link href="/dashboard" className="inline-flex items-center space-x-1.5 text-xs">
            <span>←</span>
            <span>Back to Collection</span>
          </Link>
        </Button>

        {product && (
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase tracking-wider text-secondary">
              Product ID: {product._id.slice(-6)}
            </span>
            {product.status === 'draft' ? (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 border border-border bg-muted/40 text-secondary">
                Draft Preview (Admin)
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 border border-[#C5A572]/40 bg-[#FAF7F2] text-[#202020]">
                Live Published
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="p-20 text-center text-xs text-secondary space-y-3">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin mx-auto" />
          <p>Retrieving 3D product from MongoDB...</p>
        </div>
      ) : errorMessage && !product ? (
        <Card className="p-12 text-center space-y-3 border-border">
          <p className="text-sm font-medium text-foreground">{errorMessage}</p>
          <p className="text-xs text-secondary max-w-md mx-auto">
            This door or window model could not be loaded from the catalog. Return to the collection dashboard to choose an active model.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2 text-xs">
            <Link href="/dashboard">Return to Collection</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ========================================================= */}
          {/* 3D VIEWPORT (GOOGLE MODEL-VIEWER)                         */}
          {/* ========================================================= */}
          <div className="lg:col-span-8 space-y-3">
            <ModelViewerCanvas
              src={glbUrl}
              iosSrc={quickLookUrl}
              alt={displayName}
              cameraControls
              autoRotate={false}
              arPlacement={placementMode}
              className="w-full h-[420px] sm:h-[540px] lg:h-[620px]"
              onModelLoaded={handleModelLoaded}
            />

            {/* Gesture Guide & Shortcuts */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-secondary gap-2 pt-1 border-t border-border/50">
              <p>
                <strong>Controls:</strong> Left-click drag to rotate • Wheel/Pinch to zoom • Right-click drag to pan.
              </p>
              {loadTimeMs !== null && (
                <p className="text-[10px] text-primary font-medium">
                  Model verified & rendered in {loadTimeMs} ms
                </p>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* PRODUCT INFORMATION & MODEL VALIDATION                    */}
          {/* ========================================================= */}
          <div className="lg:col-span-4 space-y-6">
            <div className="border border-border p-6 bg-white space-y-6">
              {/* Product Header */}
              <div className="space-y-2 border-b border-border pb-6">
                <span className="text-[10px] uppercase tracking-widest text-primary font-semibold block">
                  Architectural 3D System
                </span>
                <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-foreground">
                  {displayName}
                </h1>
              </div>

              {/* Model Validation & Specs */}
              <div className="space-y-3 border-b border-border pb-6 text-xs">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground block">
                  3D Model Specifications
                </span>
                <div className="space-y-2 text-secondary">
                  <div className="flex justify-between items-center">
                    <span>File Format:</span>
                    <span className="font-semibold text-foreground">glTF 2.0 Binary (.glb)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Apple AR (iOS):</span>
                    <span className="font-semibold text-foreground">
                      {usdzUrl ? 'USDZ Configured (Quick Look)' : 'USDZ Pending (3D Fallback)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Orientation:</span>
                    <span className="font-semibold text-foreground">Y-Up (Vertical Standard)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Target Scale:</span>
                    <span className="font-semibold text-foreground">1:1 Real-World Scale</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>AR Placement:</span>
                    <span className="font-semibold text-foreground">Wall Surface Anchor</span>
                  </div>
                </div>
              </div>

              {/* View in AR Action */}
              <div className="space-y-3 pt-2">
                <ARLaunchButton
                  glbUrl={glbUrl}
                  usdzUrl={quickLookUrl}
                  title={displayName}
                  placementMode={placementMode}
                  onPlacementModeChange={setPlacementMode}
                  className="w-full h-12"
                />
                <p className="text-[11px] text-secondary text-center leading-normal">
                  Launches Apple AR Quick Look on iOS and Google Scene Viewer on Android for physical room projection.
                </p>
              </div>

              {/* Admin Management Link */}
              {isAdmin && (
                <div className="pt-4 border-t border-border">
                  <Button asChild variant="outline" size="sm" className="w-full text-xs">
                    <Link href="/admin">Manage in Admin Dashboard</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
