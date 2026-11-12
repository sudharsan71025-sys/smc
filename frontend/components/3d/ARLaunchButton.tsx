'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { normalizeModelUrl } from '@/lib/api-url';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';
import { X, Smartphone, AlertCircle, ShieldAlert } from 'lucide-react';

interface ARLaunchButtonProps extends ButtonProps {
  productId?: string;
  glbUrl?: string;
  usdzUrl?: string;
  title: string;
  placementMode?: 'wall' | 'floor';
  onPlacementModeChange?: (mode: 'wall' | 'floor') => void;
}

type IncompatibilityReason =
  | 'insecure_context'
  | 'ios_safari'
  | 'browser_unsupported'
  | 'desktop'
  | 'session_error';

interface CompatibilityNotice {
  reason: IncompatibilityReason;
  title: string;
  message: string;
  guidance: string;
}

/**
 * Pure In-Website WebXR AR Launch Button
 *
 * Implements direct browser AR launching via navigator.xr.requestSession('immersive-ar').
 * No external app launches, no APK downloads, no Scene Viewer or Quick Look redirects.
 */
export function ARLaunchButton({
  productId,
  glbUrl,
  title,
  placementMode = 'wall',
  onPlacementModeChange,
  className,
  ...props
}: ARLaunchButtonProps) {
  // Active In-Website WebXR Session
  const [activeXRSession, setActiveXRSession] = useState<XRSession | null>(null);

  // Status & Preflight State
  const [isLaunching, setIsLaunching] = useState(false);
  const [notice, setNotice] = useState<CompatibilityNotice | null>(null);

  // DOM Overlay Container Ref for WebXR
  const overlayContainerRef = useRef<HTMLDivElement>(null);

  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);

  // Platform detection
  const isIOS = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  }, []);

  const isDesktop = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }, []);

  // ---------------------------------------------------------------------------
  // MAIN ACTION: START WEBXR IMMERSIVE-AR SESSION IN BROWSER
  // ---------------------------------------------------------------------------
  const handleLaunchInBrowserAR = useCallback(async () => {
    if (!normalizedGlbUrl) {
      alert('Product 3D model is not available for AR visualization.');
      return;
    }

    setIsLaunching(true);

    try {
      // 1. Check HTTPS Secure Context
      const isSecureContext =
        typeof window !== 'undefined' &&
        (window.isSecureContext === true ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1');

      if (!isSecureContext) {
        setNotice({
          reason: 'insecure_context',
          title: 'HTTPS Secure Context Required',
          message:
            'Google Chrome blocks WebXR camera access on unencrypted connections.',
          guidance:
            'WebXR camera access requires a secure HTTPS connection or localhost. Please access the website using https://.',
        });
        return;
      }

      // 2. Check Device Type (Desktop vs Mobile)
      if (isDesktop) {
        setNotice({
          reason: 'desktop',
          title: 'Mobile Device Required',
          message:
            'WebXR Augmented Reality requires a smartphone with a camera and spatial motion sensors.',
          guidance:
            'Please open this page on an Android smartphone running Google Chrome to view this model in your room.',
        });
        return;
      }

      // 3. Check iOS Safari Support
      if (isIOS) {
        setNotice({
          reason: 'ios_safari',
          title: 'iOS Browser AR Limitation',
          message:
            'Apple Safari does not support the W3C WebXR Device API required for in-browser real-world camera tracking.',
          guidance:
            'Please explore the architectural door using the interactive 3D viewer above, or use an ARCore-compatible Android device running Google Chrome for in-browser AR.',
        });
        return;
      }

      // 4. Check WebXR API Availability
      if (typeof navigator === 'undefined' || !navigator.xr) {
        setNotice({
          reason: 'browser_unsupported',
          title: 'Browser WebXR Not Supported',
          message:
            'Your current browser does not expose the WebXR Device API required for real-world camera tracking.',
          guidance:
            'Please open this page in Google Chrome on an Android device supporting Google Play Services for AR (ARCore).',
        });
        return;
      }

      // 5. Check immersive-ar Session Support
      const isImmersiveARSupported = await navigator.xr
        .isSessionSupported('immersive-ar')
        .catch(() => false);

      if (!isImmersiveARSupported) {
        setNotice({
          reason: 'browser_unsupported',
          title: 'Immersive AR Unsupported',
          message:
            'Your device or browser does not support the WebXR immersive-ar session mode.',
          guidance:
            'Verify that Google Chrome is up to date and that "Google Play Services for AR" is installed and enabled on your Android phone.',
        });
        return;
      }

      // 6. Request WebXR Immersive-AR Session directly from user gesture
      let session: XRSession;
      try {
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['local-floor', 'dom-overlay', 'anchors'],
          domOverlay: overlayContainerRef.current
            ? { root: overlayContainerRef.current }
            : undefined,
        });
      } catch (domOverlayErr) {
        console.warn('requestSession with dom-overlay failed, retrying without dom-overlay:', domOverlayErr);
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['local-floor', 'anchors'],
        });
      }

      setActiveXRSession(session);
      setNotice(null);
    } catch (err: unknown) {
      console.error('WebXR requestSession error:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown WebXR initialization error';
      setNotice({
        reason: 'session_error',
        title: 'Unable to Start AR Session',
        message: errMsg,
        guidance:
          'Ensure camera permissions are granted in Chrome site settings and try again.',
      });
    } finally {
      setIsLaunching(false);
    }
  }, [normalizedGlbUrl, isDesktop, isIOS]);

  return (
    <>
      <div className="space-y-3" data-product-id={productId}>
        {/* Placement Selector (Wall vs Floor) */}
        <div className="flex items-center justify-between border border-border p-2 bg-muted/20 text-xs">
          <span className="text-secondary font-medium">Placement Surface:</span>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => onPlacementModeChange?.('wall')}
              className={`px-2.5 py-1 text-[11px] transition-colors ${
                placementMode === 'wall'
                  ? 'bg-white font-semibold text-foreground border border-border shadow-xs'
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
                  ? 'bg-white font-semibold text-foreground border border-border shadow-xs'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              Floor
            </button>
          </div>
        </div>

        {/* Primary Single Action: OPEN IN BROWSER */}
        <Button
          variant="gold"
          size="lg"
          onClick={handleLaunchInBrowserAR}
          disabled={isLaunching}
          aria-label={`Open ${title} in Browser Augmented Reality`}
          className={`w-full tracking-wider uppercase text-xs font-semibold flex items-center justify-center space-x-2 h-12 shadow-sm ${className}`}
          {...props}
        >
          <span>📱</span>
          <span>{isLaunching ? 'Starting WebXR AR...' : 'OPEN IN BROWSER'}</span>
        </Button>
      </div>

      {/* WebXR DOM Overlay Root: transparent container mounting minimal close button */}
      <div
        ref={overlayContainerRef}
        id="webxr-dom-overlay-root"
        style={{ backgroundColor: 'transparent' }}
      >
        {activeXRSession && (
          <RealWorldARExperience
            session={activeXRSession}
            glbUrl={normalizedGlbUrl}
            placementMode={placementMode}
            onClose={() => setActiveXRSession(null)}
          />
        )}
      </div>

      {/* Honest Compatibility Dialog */}
      {notice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-border p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                {notice.reason === 'insecure_context' ? (
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                ) : (
                  <Smartphone className="w-5 h-5 text-primary" />
                )}
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  {notice.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-secondary hover:text-foreground p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-secondary leading-relaxed">
              <div className="flex items-start space-x-2.5 p-3 bg-muted/20 border border-border text-foreground">
                <AlertCircle className="w-4 h-4 text-[#C5A572] flex-shrink-0 mt-0.5" />
                <p className="font-medium">{notice.message}</p>
              </div>

              <p className="text-[11px] leading-normal">{notice.guidance}</p>
            </div>

            <div className="pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNotice(null)}
                className="w-full text-xs h-10 border-border"
              >
                Got It
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
