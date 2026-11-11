'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { normalizeModelUrl, getPublicModelUrl } from '@/lib/api-url';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import { openGooglePlayServicesForARStore } from '@/utils/arcore-checker';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';
import {
  X,
  Smartphone,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Download,
  Copy,
  Check,
} from 'lucide-react';

interface ARLaunchButtonProps extends ButtonProps {
  productId?: string;
  glbUrl?: string;
  usdzUrl?: string;
  title: string;
  placementMode?: 'wall' | 'floor';
  onPlacementModeChange?: (mode: 'wall' | 'floor') => void;
}

type DiagnosisReason =
  | 'insecure_context'
  | 'ios_safari'
  | 'browser_unsupported'
  | 'arcore_not_installed'
  | 'permission_denied'
  | 'desktop'
  | 'general_error';

interface ARDiagnosis {
  reason: DiagnosisReason;
  title: string;
  message: string;
  explanation: string;
  canSceneViewer: boolean;
  canQuickLook: boolean;
  canNativeApp: boolean;
  canPlayStore: boolean;
  canCopyHttpsLink: boolean;
}

export function ARLaunchButton({
  productId,
  glbUrl,
  usdzUrl,
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
  const [diagnosis, setDiagnosis] = useState<ARDiagnosis | null>(null);
  const [copied, setCopied] = useState(false);

  // DOM Overlay Container Ref for WebXR
  const overlayContainerRef = useRef<HTMLDivElement>(null);

  // Normalized Model URLs
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

  // Launch Native Google ARCore Scene Viewer (Android system AR fallback)
  const handleLaunchGoogleSceneViewer = useCallback(() => {
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

  // Launch Native Apple ARKit Quick Look for iOS Safari users
  const handleLaunchAppleQuickLook = useCallback(() => {
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

  // Primary In-Website WebXR AR Trigger
  const handleMainARClick = async () => {
    if (!normalizedGlbUrl && !publicGlbUrl) {
      alert('Product 3D model is not available for AR inspection.');
      return;
    }

    setIsLaunching(true);

    try {
      // -----------------------------------------------------------------------
      // DIAGNOSIS 1: Secure Context Check (HTTPS or localhost)
      // -----------------------------------------------------------------------
      // The W3C WebXR Device API is STRICTLY marked [SecureContext].
      // When accessed over HTTP on a local network IP (e.g. http://192.168.x.x:3000),
      // Google Chrome on Android completely removes navigator.xr from the global scope!
      const isSecureContext =
        typeof window !== 'undefined' &&
        (window.isSecureContext === true ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1');

      if (!isSecureContext) {
        setDiagnosis({
          reason: 'insecure_context',
          title: 'HTTPS Secure Context Required',
          message:
            'Google Chrome for Android strictly blocks the WebXR camera API on non-secure origins (plain HTTP over local Wi-Fi IP).',
          explanation:
            'To protect device privacy, WebXR camera hardware access requires an encrypted HTTPS connection or localhost.',
          canSceneViewer: isAndroid && Boolean(publicGlbUrl),
          canQuickLook: isIOS && Boolean(publicUsdzUrl),
          canNativeApp: isAndroid,
          canPlayStore: false,
          canCopyHttpsLink: true,
        });
        return;
      }

      // -----------------------------------------------------------------------
      // DIAGNOSIS 2: Platform & Browser WebXR Support Check
      // -----------------------------------------------------------------------
      if (typeof navigator === 'undefined' || !navigator.xr) {
        if (isIOS) {
          setDiagnosis({
            reason: 'ios_safari',
            title: 'WebXR Not Supported on iOS Safari',
            message:
              'Apple Safari on iOS does not support the W3C WebXR Device API required for in-browser world tracking.',
            explanation:
              'Apple restricts in-browser camera AR in mobile Safari. You can view this model at 1:1 scale using Apple ARKit Quick Look below.',
            canSceneViewer: false,
            canQuickLook: Boolean(publicUsdzUrl),
            canNativeApp: false,
            canPlayStore: false,
            canCopyHttpsLink: false,
          });
        } else if (isAndroid) {
          setDiagnosis({
            reason: 'browser_unsupported',
            title: 'Google Chrome Required for WebXR',
            message:
              'Your current browser does not have the WebXR Device API enabled.',
            explanation:
              'Please open this page in the official Google Chrome browser on your Android device to run in-website camera AR.',
            canSceneViewer: Boolean(publicGlbUrl),
            canQuickLook: false,
            canNativeApp: true,
            canPlayStore: true,
            canCopyHttpsLink: false,
          });
        } else {
          setDiagnosis({
            reason: 'desktop',
            title: 'Augmented Reality Requires Mobile Device',
            message:
              'WebXR Augmented Reality requires a smartphone with a camera and spatial tracking sensors (Google ARCore or Apple ARKit).',
            explanation:
              'Please open this website on your Android phone using Google Chrome to inspect this door/window at 1:1 scale in your room.',
            canSceneViewer: false,
            canQuickLook: false,
            canNativeApp: false,
            canPlayStore: false,
            canCopyHttpsLink: true,
          });
        }
        return;
      }

      // -----------------------------------------------------------------------
      // DIAGNOSIS 3: Hardware ARCore & 'immersive-ar' Session Support
      // -----------------------------------------------------------------------
      const isImmersiveARSupported = await navigator.xr
        .isSessionSupported('immersive-ar')
        .catch(() => false);

      if (!isImmersiveARSupported) {
        if (isAndroid) {
          setDiagnosis({
            reason: 'arcore_not_installed',
            title: 'Google Play Services for AR Required',
            message:
              'Your Android device supports WebXR, but Google Play Services for AR must be installed or updated to detect real-world walls.',
            explanation:
              'Install or update Google Play Services for AR from the Google Play Store, or view the product using Google Scene Viewer.',
            canSceneViewer: Boolean(publicGlbUrl),
            canQuickLook: false,
            canNativeApp: true,
            canPlayStore: true,
            canCopyHttpsLink: false,
          });
        } else if (isIOS) {
          setDiagnosis({
            reason: 'ios_safari',
            title: 'WebXR Not Supported on iOS Safari',
            message:
              'Apple Safari on iOS does not support in-browser WebXR world tracking.',
            explanation:
              'Apple ARKit Quick Look is available below for native 1:1 scale preview on iPhone.',
            canSceneViewer: false,
            canQuickLook: Boolean(publicUsdzUrl),
            canNativeApp: false,
            canPlayStore: false,
            canCopyHttpsLink: false,
          });
        } else {
          setDiagnosis({
            reason: 'desktop',
            title: 'AR Tracking Unavailable on Desktop',
            message:
              'Desktop browsers lack 6DoF spatial odometry sensors.',
            explanation:
              'Open this page on an ARCore-compatible Android device running Google Chrome.',
            canSceneViewer: false,
            canQuickLook: false,
            canNativeApp: false,
            canPlayStore: false,
            canCopyHttpsLink: true,
          });
        }
        return;
      }

      // -----------------------------------------------------------------------
      // STEP 4: Start WebXR Immersive-AR Session Directly
      // -----------------------------------------------------------------------
      // CRITICAL: Only require 'hit-test'! Do NOT require 'local-floor', as some
      // devices only provide 'local' space initially. We request 'local-floor'
      // dynamically in RealWorldARExperience with fallback to 'local'.
      let session: XRSession;
      try {
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['local-floor', 'dom-overlay', 'anchors', 'plane-detection'],
          domOverlay: overlayContainerRef.current
            ? { root: overlayContainerRef.current }
            : undefined,
        });
      } catch (domOverlayErr) {
        console.warn('requestSession with dom-overlay failed, retrying basic:', domOverlayErr);
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['anchors'],
        });
      }

      // Session started directly inside website!
      setActiveXRSession(session);
      setDiagnosis(null);
    } catch (err: unknown) {
      console.error('WebXR requestSession exception:', err);
      const msg = err instanceof Error ? err.message.toLowerCase() : '';

      if (msg.includes('user denied') || msg.includes('permission')) {
        setDiagnosis({
          reason: 'permission_denied',
          title: 'Camera Permission Denied',
          message:
            'Camera access was denied by your browser settings.',
          explanation:
            'To enable in-browser AR, tap the tune/lock icon next to the address bar in Chrome, tap Permissions → Camera, and choose Allow.',
          canSceneViewer: isAndroid && Boolean(publicGlbUrl),
          canQuickLook: false,
          canNativeApp: isAndroid,
          canPlayStore: false,
          canCopyHttpsLink: false,
        });
      } else if (msg.includes('not supported') || msg.includes('arcore') || msg.includes('service')) {
        setDiagnosis({
          reason: 'arcore_not_installed',
          title: 'Google Play Services for AR Required',
          message:
            'Google Play Services for AR is required to track physical surfaces on Android.',
          explanation:
            'Please install or update Google Play Services for AR from the Google Play Store.',
          canSceneViewer: isAndroid && Boolean(publicGlbUrl),
          canQuickLook: false,
          canNativeApp: isAndroid,
          canPlayStore: true,
          canCopyHttpsLink: false,
        });
      } else {
        setDiagnosis({
          reason: 'general_error',
          title: 'Unable to Start WebXR AR Session',
          message: err instanceof Error ? err.message : 'Unknown WebXR initialization error.',
          explanation:
            'Ensure your device is running the latest Google Chrome and Google Play Services for AR.',
          canSceneViewer: isAndroid && Boolean(publicGlbUrl),
          canQuickLook: isIOS && Boolean(publicUsdzUrl),
          canNativeApp: isAndroid,
          canPlayStore: isAndroid,
          canCopyHttpsLink: false,
        });
      }
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const publicUrl = `https://smc-frontend-cbou.onrender.com/products/${productId || ''}`;
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <>
      <div className="space-y-3" data-product-id={productId}>
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
          aria-label={`View ${title} in Augmented Reality`}
          className={`w-full tracking-wider uppercase text-xs font-semibold flex items-center justify-center space-x-2 h-12 shadow-sm ${className}`}
          {...props}
        >
          <span>📱</span>
          <span>{isLaunching ? 'Connecting WebXR Camera...' : 'View in Augmented Reality (AR)'}</span>
        </Button>
      </div>

      {/* WebXR DOM Overlay Root: mounts the AR experience and close button over live camera */}
      <div ref={overlayContainerRef} id="webxr-dom-overlay-root">
        {activeXRSession && (
          <RealWorldARExperience
            session={activeXRSession}
            glbUrl={normalizedGlbUrl}
            placementMode={placementMode}
            onClose={() => setActiveXRSession(null)}
          />
        )}
      </div>

      {/* Honest Compatibility & Fallback Dialog (Shown ONLY outside session when WebXR cannot start) */}
      {diagnosis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white border border-border p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                {diagnosis.reason === 'insecure_context' ? (
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                ) : (
                  <Smartphone className="w-5 h-5 text-primary" />
                )}
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  {diagnosis.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDiagnosis(null)}
                className="text-secondary hover:text-foreground p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-secondary leading-relaxed">
              <div className="flex items-start space-x-2.5 p-3 bg-muted/20 border border-border text-foreground">
                <AlertCircle className="w-4 h-4 text-[#C5A572] flex-shrink-0 mt-0.5" />
                <p className="font-medium">{diagnosis.message}</p>
              </div>

              <p className="text-[11px] leading-normal">{diagnosis.explanation}</p>

              {/* Insecure Context Special Instructions */}
              {diagnosis.reason === 'insecure_context' && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5 text-[11px]">
                  <span className="font-semibold block">How to run in-browser WebXR on your phone:</span>
                  <p>1. Open the secure HTTPS site: <strong>https://smc-frontend-cbou.onrender.com</strong></p>
                  <p>2. Or for local development via USB: run <code>adb reverse tcp:3000 tcp:3000</code> and open <code>http://localhost:3000</code> on your phone.</p>
                </div>
              )}
            </div>

            {/* Clear, Honest Fallback Options */}
            <div className="space-y-2 pt-2 border-t border-border">
              {/* Fallback A: Google Scene Viewer (Built into Android, no APK install) */}
              {diagnosis.canSceneViewer && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchGoogleSceneViewer}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Launch Google Scene Viewer (Native AR)</span>
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}

              {/* Fallback B: Apple Quick Look (Native iOS ARKit) */}
              {diagnosis.canQuickLook && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchAppleQuickLook}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>View in Apple Quick Look (ARKit)</span>
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}

              {/* Fallback C: Google Play Services for AR Install/Update */}
              {diagnosis.canPlayStore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openGooglePlayServicesForARStore}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-10 border-border"
                >
                  <span>Install Google Play Services for AR</span>
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}

              {/* Fallback D: SMC Native ARCore APK */}
              {diagnosis.canNativeApp && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-10 border-border"
                >
                  <a href="/downloads/smc-door-window-ar.apk" download="smc-door-window-ar.apk">
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Native SMC AR App (.apk)</span>
                  </a>
                </Button>
              )}

              {/* Fallback E: Copy Secure HTTPS Link */}
              {diagnosis.canCopyHttpsLink && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-10 border-border"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied HTTPS Link!' : 'Copy Production HTTPS Link'}</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDiagnosis(null)}
                className="w-full text-xs h-9 text-secondary"
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
