'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { normalizeModelUrl, getPublicModelUrl } from '@/lib/api-url';
import { buildSceneViewerUrl, buildQuickLookUrl, checkImmersiveARSupport } from '@/utils/3d-helpers';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';
import { X, ExternalLink, Smartphone } from 'lucide-react';

interface ARLaunchButtonProps extends ButtonProps {
  glbUrl?: string;
  usdzUrl?: string;
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
  // Active WebXR Session
  const [activeXRSession, setActiveXRSession] = useState<XRSession | null>(null);

  // Fallback / Architecture Modal State
  const [showCompatibilityModal, setShowCompatibilityModal] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  // DOM Overlay Container Ref for WebXR
  const overlayContainerRef = useRef<HTMLDivElement>(null);

  // Normalize URLs
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);
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

  // Launch Native Android ARCore Scene Viewer
  const handleLaunchNativeAndroid = useCallback(() => {
    if (!publicGlbUrl) return;
    const intentUrl = buildSceneViewerUrl({
      glbUrl: publicGlbUrl,
      title,
      linkUrl: typeof window !== 'undefined' ? window.location.href : '',
      mode: 'ar_only',
      resizable: false,
      verticalPlacement: placementMode === 'wall',
    });
    window.location.href = intentUrl;
  }, [publicGlbUrl, title, placementMode]);

  // Launch Native Apple ARKit Quick Look
  const handleLaunchNativeIOS = useCallback(() => {
    if (!publicUsdzUrl) return;
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
  }, [publicUsdzUrl]);

  // Primary AR Trigger - Must handle user activation directly for WebXR
  const handleMainARClick = async () => {
    if (!normalizedGlbUrl && !publicGlbUrl) {
      alert('Product 3D model is not available for AR inspection.');
      return;
    }

    setIsLaunching(true);

    try {
      // 1. Check if browser can genuinely run WebXR immersive-ar
      const webxrSupported = await checkImmersiveARSupport();

      if (webxrSupported && navigator.xr) {
        // Request WebXR session directly in this user activation event stack
        const session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test', 'local-floor'],
          optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection'],
          domOverlay: overlayContainerRef.current ? { root: overlayContainerRef.current } : undefined,
        });

        setActiveXRSession(session);
        setIsLaunching(false);
        return;
      }

      // 2. If WebXR is not supported in this browser (e.g. iOS Safari or unsupported Android browser):
      // On Android: Launch Native Google ARCore Scene Viewer directly
      if (isAndroid && publicGlbUrl) {
        handleLaunchNativeAndroid();
        setIsLaunching(false);
        return;
      }

      // On iOS: Launch Native Apple ARKit Quick Look directly
      if (isIOS && publicUsdzUrl) {
        handleLaunchNativeIOS();
        setIsLaunching(false);
        return;
      }

      // 3. Otherwise show the honest compatibility modal
      setShowCompatibilityModal(true);
    } catch (err: unknown) {
      console.warn('WebXR requestSession failed or was rejected:', err);
      // Fallback to Native AR options
      if (isAndroid && publicGlbUrl) {
        handleLaunchNativeAndroid();
      } else if (isIOS && publicUsdzUrl) {
        handleLaunchNativeIOS();
      } else {
        setShowCompatibilityModal(true);
      }
    } finally {
      setIsLaunching(false);
    }
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
          disabled={isLaunching}
          className={`w-full tracking-wider uppercase text-xs font-semibold flex items-center justify-center space-x-2 h-12 shadow-sm ${className}`}
          {...props}
        >
          <span>📱</span>
          <span>{isLaunching ? 'Initializing AR...' : 'View in Augmented Reality (AR)'}</span>
        </Button>
      </div>

      {/* Hidden DOM Overlay Root for WebXR Session */}
      <div ref={overlayContainerRef} id="webxr-dom-overlay-root" />

      {/* ACTIVE GENUINE WEBXR 6DOF AR SESSION */}
      {activeXRSession && (
        <RealWorldARExperience
          session={activeXRSession}
          glbUrl={normalizedGlbUrl}
          placementMode={placementMode}
          onClose={() => setActiveXRSession(null)}
        />
      )}

      {/* HONEST AR ARCHITECTURE & COMPATIBILITY MODAL */}
      {showCompatibilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white border border-border p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Real-World AR Setup
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCompatibilityModal(false)}
                className="text-secondary hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-secondary leading-relaxed">
              <p>
                Genuine world-anchored AR requires hardware-level Visual-Inertial Odometry (VIO) to detect physical walls and lock the 3D model in place.
              </p>
              <div className="border border-border p-3 bg-muted/20 space-y-1.5">
                <span className="font-semibold text-foreground block">Browser AR Architecture Status:</span>
                <p>
                  • <strong>Android:</strong> Supported via Google Chrome with WebXR or Native Google ARCore.
                </p>
                <p>
                  • <strong>iOS (iPhone):</strong> Apple blocks browser WebXR in Safari; Apple ARKit Quick Look is required for physical LiDAR/camera wall tracking.
                </p>
                <p>
                  • <strong>Desktop:</strong> Web browsers lack spatial sensors and cameras. Open this page on a mobile phone to project at 1:1 scale.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {isAndroid && publicGlbUrl && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchNativeAndroid}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5"
                >
                  <span>Launch Google ARCore Scene Viewer</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}

              {isIOS && publicUsdzUrl && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchNativeIOS}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5"
                >
                  <span>Launch Apple ARKit Quick Look</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCompatibilityModal(false)}
                className="w-full text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
