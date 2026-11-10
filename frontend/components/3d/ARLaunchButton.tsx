'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { normalizeModelUrl, getPublicModelUrl } from '@/lib/api-url';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import {
  runARCorePreflight,
  openGooglePlayServicesForARStore,
  checkCameraPermission,
  ARCorePreflightResult,
  CameraPermissionState,
} from '@/utils/arcore-checker';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';
import { X, ExternalLink, Smartphone, Camera, Download, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

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

  // Status & Preflight State
  const [isLaunching, setIsLaunching] = useState(false);
  const [preflightState, setPreflightState] = useState<ARCorePreflightResult | null>(null);

  // Dedicated Dialog States
  const [showARCoreInstallModal, setShowARCoreInstallModal] = useState(false);
  const [showCameraPermissionModal, setShowCameraPermissionModal] = useState(false);
  const [showUnsupportedModal, setShowUnsupportedModal] = useState(false);

  // DOM Overlay Container Ref for WebXR
  const overlayContainerRef = useRef<HTMLDivElement>(null);

  // Normalized URLs
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

  // Auto-resume check when returning from Google Play Store or Settings
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const result = await runARCorePreflight();
        setPreflightState(result);
        if (result.hasImmersiveAR && showARCoreInstallModal) {
          setShowARCoreInstallModal(false);
        }
        if (result.cameraPermission === 'granted' && showCameraPermissionModal) {
          setShowCameraPermissionModal(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [showARCoreInstallModal, showCameraPermissionModal]);

  // Request the real WebXR session synchronously on user gesture
  const startGenuineWebXRSession = async () => {
    if (!navigator.xr) return;

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection'],
        domOverlay: overlayContainerRef.current ? { root: overlayContainerRef.current } : undefined,
      });

      setActiveXRSession(session);
      setShowARCoreInstallModal(false);
      setShowCameraPermissionModal(false);
      setShowUnsupportedModal(false);
    } catch (err: unknown) {
      console.warn('WebXR requestSession exception:', err);
      const errMsg = err instanceof Error ? err.message.toLowerCase() : '';

      // Check if failure is due to missing ARCore on Android
      if (isAndroid && (errMsg.includes('not supported') || errMsg.includes('arcore') || errMsg.includes('service'))) {
        setShowARCoreInstallModal(true);
      } else {
        // Fallback to native Scene Viewer
        if (isAndroid && publicGlbUrl) {
          handleLaunchNativeAndroid();
        } else {
          setShowUnsupportedModal(true);
        }
      }
    }
  };

  // Primary AR Trigger
  const handleMainARClick = async () => {
    if (!normalizedGlbUrl && !publicGlbUrl) {
      alert('Product 3D model is not available for AR inspection.');
      return;
    }

    setIsLaunching(true);

    try {
      // 1. Run Complete ARCore Preflight Check
      const preflight = await runARCorePreflight();
      setPreflightState(preflight);

      // 2. Camera Permission Validation
      const cameraStatus: CameraPermissionState = await checkCameraPermission();
      if (cameraStatus === 'denied') {
        setShowCameraPermissionModal(true);
        setIsLaunching(false);
        return;
      }

      // 3. Android WebXR Check (Google Play Services for AR)
      if (preflight.isAndroid) {
        if (preflight.hasImmersiveAR) {
          // Google Play Services for AR is installed and WebXR is ready!
          await startGenuineWebXRSession();
          setIsLaunching(false);
          return;
        }

        // If immersive-ar is not ready, Google Play Services for AR needs installation/update
        setShowARCoreInstallModal(true);
        setIsLaunching(false);
        return;
      }

      // 4. iOS Validation (Apple ARKit Quick Look)
      if (preflight.isIOS) {
        if (publicUsdzUrl) {
          handleLaunchNativeIOS();
          setIsLaunching(false);
          return;
        }
        setShowUnsupportedModal(true);
        setIsLaunching(false);
        return;
      }

      // 5. Desktop / Unsupported Device
      setShowUnsupportedModal(true);
    } catch (err: unknown) {
      console.error('AR Preflight error:', err);
      if (isAndroid && publicGlbUrl) {
        handleLaunchNativeAndroid();
      } else if (isIOS && publicUsdzUrl) {
        handleLaunchNativeIOS();
      } else {
        setShowUnsupportedModal(true);
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
          <span>{isLaunching ? 'Validating AR System...' : 'View in Augmented Reality (AR)'}</span>
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

      {/* 1. GOOGLE PLAY SERVICES FOR AR (ARCORE) INSTALLATION & UPDATE MODAL */}
      {showARCoreInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white border border-border p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-[#C5A572]" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Google Play Services for AR
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowARCoreInstallModal(false)}
                className="text-secondary hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-secondary leading-relaxed">
              <div className="flex items-start space-x-2.5 p-3 bg-[#FAF7F2] border border-[#C5A572]/40 text-[#202020]">
                <ShieldCheck className="w-4 h-4 text-[#C5A572] flex-shrink-0 mt-0.5" />
                <p>
                  {preflightState?.statusMessage ||
                    'To detect real-world walls and anchor the door at 1:1 physical scale, your Android device requires Google Play Services for AR.'}
                </p>
              </div>

              <div className="space-y-2 border border-border p-3 bg-muted/10">
                <span className="font-semibold text-foreground block">Setup Instructions:</span>
                <p>1. Tap the button below to open Google Play Store.</p>
                <p>2. Install or update <strong>Google Play Services for AR</strong>.</p>
                <p>3. Return here and tap <strong>Resume AR Session</strong>.</p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                variant="gold"
                size="sm"
                onClick={openGooglePlayServicesForARStore}
                className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
              >
                <Download className="w-4 h-4" />
                <span>Install from Google Play Store</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleMainARClick}
                className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-10 border-border"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Resume AR Session</span>
              </Button>

              {publicGlbUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLaunchNativeAndroid}
                  className="w-full text-[11px] text-secondary hover:text-foreground flex items-center justify-center space-x-1"
                >
                  <span>Or try Google Scene Viewer directly</span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. CAMERA PERMISSION BLOCKED MODAL */}
      {showCameraPermissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white border border-border p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Camera className="w-5 h-5 text-red-600" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Camera Access Required
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCameraPermissionModal(false)}
                className="text-secondary hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-secondary leading-relaxed">
              <div className="flex items-start space-x-2.5 p-3 bg-red-50 border border-red-200 text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p>
                  Camera access was blocked by your browser settings. Augmented Reality requires camera feed access to track your physical room.
                </p>
              </div>

              <div className="space-y-2 border border-border p-3 bg-muted/10">
                <span className="font-semibold text-foreground block">How to enable camera access:</span>
                <p>1. Tap the <strong>tune / lock icon</strong> on the left of your browser address bar.</p>
                <p>2. Select <strong>Permissions</strong> → <strong>Camera</strong>.</p>
                <p>3. Choose <strong>Allow</strong>.</p>
                <p>4. Return to this page and tap <strong>Try Again</strong>.</p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                variant="gold"
                size="sm"
                onClick={handleMainARClick}
                className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCameraPermissionModal(false)}
                className="w-full text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. UNSUPPORTED DEVICE / PLATFORM ARCHITECTURE MODAL */}
      {showUnsupportedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white border border-border p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  AR Device Compatibility
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUnsupportedModal(false)}
                className="text-secondary hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-secondary leading-relaxed">
              <p>
                Real-world Augmented Reality requires dedicated spatial tracking sensors and hardware-level Visual-Inertial Odometry (VIO).
              </p>
              <div className="border border-border p-3 bg-muted/20 space-y-1.5">
                <span className="font-semibold text-foreground block">Device Status:</span>
                <p>
                  • <strong>Android:</strong> Supported via Google Chrome with Google Play Services for AR.
                </p>
                <p>
                  • <strong>iOS (iPhone):</strong> Apple blocks browser WebXR in Safari. Apple ARKit Quick Look is available below.
                </p>
                <p>
                  • <strong>Desktop:</strong> Standard computers lack AR hardware sensors. Please open this link on an ARCore-compatible phone.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {isIOS && publicUsdzUrl && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchNativeIOS}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
                >
                  <span>Launch Apple ARKit Quick Look</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}

              {isAndroid && publicGlbUrl && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchNativeAndroid}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
                >
                  <span>Launch Google ARCore Scene Viewer</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUnsupportedModal(false)}
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
