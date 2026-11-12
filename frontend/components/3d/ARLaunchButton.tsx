'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { normalizeModelUrl } from '@/lib/api-url';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';
import { WebcamPreviewModal } from './WebcamPreviewModal';
import { arCapabilityService } from '@/services/ar-capability-service';
import {
  negotiateWebXRSession,
  NegotiatedWebXRSession,
} from '@/utils/webxr-session';
import { X, Smartphone, AlertCircle, ShieldAlert, Camera, Eye } from 'lucide-react';

interface ARLaunchButtonProps extends ButtonProps {
  productId?: string;
  glbUrl?: string;
  usdzUrl?: string;
  title: string;
  placementMode?: 'wall' | 'floor';
  onPlacementModeChange?: (mode: 'wall' | 'floor') => void;
}

type NoticeType =
  | 'desktop_info'
  | 'ios_limitation'
  | 'insecure_context'
  | 'permission_denied'
  | 'unsupported_ar';

interface CompatibilityNotice {
  type: NoticeType;
  title: string;
  message: string;
  guidance: string;
  allowWebcamPreview?: boolean;
}

/**
 * SMC Enterprise In-Browser WebXR AR & Cross-Device Launch Button
 *
 * Implements:
 * 1. Single primary action: "OPEN IN BROWSER".
 * 2. Multi-tier WebXR capability negotiation (eliminating session configuration rejections).
 * 3. Transparent WebGL camera pass-through (eliminating black screens).
 * 4. Separate desktop capability handling with optional 2D webcam preview.
 * 5. Strict adherence to W3C WebXR specifications and device security contexts.
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
  // Active Negotiated WebXR Session
  const [activeNegotiatedSession, setActiveNegotiatedSession] =
    useState<NegotiatedWebXRSession | null>(null);

  // Desktop Webcam Preview Mode State
  const [isWebcamPreviewOpen, setIsWebcamPreviewOpen] = useState(false);

  // Status & Preflight State
  const [isLaunching, setIsLaunching] = useState(false);
  const [notice, setNotice] = useState<CompatibilityNotice | null>(null);

  // DOM Overlay Container Ref for WebXR
  const overlayContainerRef = useRef<HTMLDivElement>(null);

  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);

  // ---------------------------------------------------------------------------
  // MAIN ACTION: START WEBXR IMMERSIVE-AR SESSION OR CROSS-DEVICE WORKFLOW
  // ---------------------------------------------------------------------------
  const handleLaunchInBrowserAR = useCallback(async () => {
    if (!normalizedGlbUrl) {
      alert('Product 3D model is not available for AR visualization.');
      return;
    }

    setIsLaunching(true);

    try {
      // 1. Evaluate live capabilities
      const caps = await arCapabilityService.evaluate(true);

      // 2. Handle Insecure Context
      if (!caps.isSecureContext) {
        setNotice({
          type: 'insecure_context',
          title: 'HTTPS Secure Context Required',
          message:
            'Google Chrome blocks WebXR and camera access on unencrypted connections.',
          guidance:
            'WebXR requires HTTPS or localhost. If testing over local Wi-Fi, open chrome://flags on your phone, search for "unsafely-treat-insecure-origin-as-secure", add this IP address, and relaunch Chrome.',
        });
        return;
      }

      // 3. Handle Desktop / Laptop Environments
      if (caps.isDesktop) {
        setNotice({
          type: 'desktop_info',
          title: 'Desktop Environment Detected',
          message:
            'Full-screen world-anchored AR with physical wall detection requires an ARCore-compatible smartphone with spatial motion sensors.',
          guidance:
            'You can inspect the 3D model at 1:1 scale using the 3D viewer, or open the camera preview simulation on your laptop webcam below.',
          allowWebcamPreview: caps.hasCameraHardware,
        });
        return;
      }

      // 4. Handle iOS Safari Limitation
      if (caps.isIOS) {
        setNotice({
          type: 'ios_limitation',
          title: 'iOS Browser AR Notice',
          message:
            'Apple Safari on iOS does not support the W3C WebXR Device API required for in-browser real-world camera tracking.',
          guidance:
            'Please explore the architectural door using the interactive 3D viewer above, or open this page on an Android phone running Google Chrome for in-browser WebXR AR.',
        });
        return;
      }

      // 5. Handle Missing WebXR or Unsupported immersive-ar on Android
      if (!caps.supportsImmersiveAR) {
        setNotice({
          type: 'unsupported_ar',
          title: 'Immersive AR Unsupported',
          message:
            'Your current browser or device does not support WebXR immersive-ar session mode.',
          guidance:
            'Ensure you are using Google Chrome on an Android phone that has "Google Play Services for AR" (ARCore) installed and updated from the Google Play Store.',
        });
        return;
      }

      // 6. Safe Multi-Tier Capability Negotiation (Zero "Session Configuration Not Supported" Rejections)
      const negotiated = await negotiateWebXRSession({
        domOverlayRoot: overlayContainerRef.current,
      });

      setActiveNegotiatedSession(negotiated);
      setNotice(null);
    } catch (err: unknown) {
      console.error('WebXR session initiation error:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown WebXR initialization error';

      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
        setNotice({
          type: 'permission_denied',
          title: 'Camera Permission Denied',
          message:
            'Chrome blocked camera access for this session. Camera access is required to render your physical room.',
          guidance:
            'Tap the lock or site settings icon in your Chrome address bar, set Camera to "Allow", and try again.',
        });
      } else {
        setNotice({
          type: 'unsupported_ar',
          title: 'Unable to Start AR Session',
          message: errMsg,
          guidance:
            'Check camera permissions in Chrome settings and verify Google Play Services for AR is active.',
        });
      }
    } finally {
      setIsLaunching(false);
    }
  }, [normalizedGlbUrl]);

  return (
    <>
      <div className="space-y-3" data-product-id={productId}>
        {/* Placement Surface Selector (Wall vs Floor) */}
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

      {/* WebXR DOM Overlay Root: mounts transparent minimal close button */}
      <div
        ref={overlayContainerRef}
        id="webxr-dom-overlay-root"
        style={{ backgroundColor: 'transparent' }}
      >
        {activeNegotiatedSession && (
          <RealWorldARExperience
            negotiated={activeNegotiatedSession}
            glbUrl={normalizedGlbUrl}
            placementMode={placementMode}
            onClose={() => setActiveNegotiatedSession(null)}
          />
        )}
      </div>

      {/* Desktop Laptop Webcam Simulation Modal */}
      {isWebcamPreviewOpen && (
        <WebcamPreviewModal
          glbUrl={normalizedGlbUrl}
          title={title}
          onClose={() => setIsWebcamPreviewOpen(false)}
        />
      )}

      {/* Cross-Device Compatibility & Guidance Dialog */}
      {notice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-border p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                {notice.type === 'insecure_context' ? (
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

            <div className="pt-2 border-t border-border space-y-2">
              {/* Optional Laptop Webcam Simulation Action */}
              {notice.allowWebcamPreview && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    setNotice(null);
                    setIsWebcamPreviewOpen(true);
                  }}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Start Laptop Webcam Preview</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setNotice(null)}
                className="w-full text-xs h-10 border-border"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                <span>Continue with 3D Studio Viewer</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
