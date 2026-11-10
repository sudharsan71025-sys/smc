'use client';

import React, { useState, useMemo } from 'react';
import { normalizeModelUrl, getPublicModelUrl } from '@/lib/api-url';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';

interface ARLaunchButtonProps extends ButtonProps {
  glbUrl?: string;
  usdzUrl?: string;
  thumbnailUrl?: string;
  title: string;
  placementMode?: 'wall' | 'floor';
  onPlacementModeChange?: (mode: 'wall' | 'floor') => void;
}

export function ARLaunchButton({
  glbUrl,
  usdzUrl,
  title,
  placementMode = 'wall',
  onPlacementModeChange,
  className,
  ...props
}: ARLaunchButtonProps) {
  const [showRealWorldAR, setShowRealWorldAR] = useState(false);

  // Normalize URLs to guarantee active network/cloud host connectivity
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);
  const normalizedUsdzUrl = useMemo(() => normalizeModelUrl(usdzUrl), [usdzUrl]);
  const publicGlbUrl = useMemo(() => getPublicModelUrl(glbUrl), [glbUrl]);
  const publicUsdzUrl = useMemo(() => getPublicModelUrl(usdzUrl), [usdzUrl]);

  // Platform detection
  const isIOS = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  }, []);

  const isAndroid = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /android/i.test(navigator.userAgent);
  }, []);

  // Launch the in-camera Real-World AR experience directly
  const handleMainARClick = () => {
    if (!normalizedGlbUrl && !publicGlbUrl) {
      alert('Product 3D model is not available for AR inspection.');
      return;
    }

    // 1. Android: Native Google ARCore Scene Viewer
    // Runs OS-level Visual-Inertial Odometry (VIO) with vertical wall plane detection,
    // persistent 6DOF world anchor, and 1:1 real-world physical scale.
    if (isAndroid && publicGlbUrl) {
      const intentUrl = buildSceneViewerUrl({
        glbUrl: publicGlbUrl,
        title,
        linkUrl: typeof window !== 'undefined' ? window.location.href : '',
        mode: 'ar_only',
        resizable: false,
        verticalPlacement: placementMode === 'wall',
      });
      window.location.href = intentUrl;
      return;
    }

    // 2. iOS: Native Apple ARKit Quick Look
    // Runs Apple's native LiDAR/camera ARKit engine with vertical wall anchoring.
    if (isIOS && publicUsdzUrl) {
      const qlUrl = buildQuickLookUrl({
        usdzUrl: publicUsdzUrl,
        canonicalWebPageURL: typeof window !== 'undefined' ? window.location.href : '',
        allowsContentScaling: false,
      });
      const a = document.createElement('a');
      a.setAttribute('rel', 'ar');
      a.setAttribute('href', qlUrl);
      const img = document.createElement('img');
      a.appendChild(img);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 3. Desktop / WebXR Fallback: Clean full-screen camera AR
    setShowRealWorldAR(true);
  };

  return (
    <>
      <div className="space-y-3">
        {/* Placement Selector (Wall vs Floor) */}
        <div className="flex items-center justify-between border border-border p-2 bg-muted/20 text-xs">
          <span className="text-secondary font-medium">AR Surface Anchor:</span>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => onPlacementModeChange?.('wall')}
              className={`px-2.5 py-1 text-[11px] transition-colors ${
                placementMode === 'wall'
                  ? 'bg-white font-semibold text-foreground border border-border shadow-sm'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              Vertical Wall
            </button>
            <button
              type="button"
              onClick={() => onPlacementModeChange?.('floor')}
              className={`px-2.5 py-1 text-[11px] transition-colors ${
                placementMode === 'floor'
                  ? 'bg-white font-semibold text-foreground border border-border shadow-sm'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              Floor
            </button>
          </div>
        </div>

        {/* Primary View in AR Button */}
        <Button
          variant="gold"
          size="lg"
          onClick={handleMainARClick}
          className={`w-full tracking-wider uppercase text-xs font-semibold flex items-center justify-center space-x-2 h-12 shadow-sm ${className}`}
          {...props}
        >
          <span>📱</span>
          <span>View in Augmented Reality (AR)</span>
        </Button>
      </div>

      {/* FULL REAL-WORLD CAMERA AR EXPERIENCE */}
      {showRealWorldAR && (
        <RealWorldARExperience
          glbUrl={normalizedGlbUrl}
          usdzUrl={normalizedUsdzUrl}
          isOpen={showRealWorldAR}
          onClose={() => setShowRealWorldAR(false)}
        />
      )}
    </>
  );
}
