'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { normalizeModelUrl, getPublicModelUrl } from '@/lib/api-url';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';
import {
  X,
  Smartphone,
  AlertCircle,
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

  // ---------------------------------------------------------------------------
  // 1. PRIMARY ACTION: LAUNCH NATIVE ANDROID ARCORE APP DIRECTLY
  // ---------------------------------------------------------------------------
  const handleLaunchNativeAndroidApp = useCallback(async () => {
    if (!productId) {
      alert('Product ID is missing.');
      return;
    }

    setIsLaunching(true);
    try {
      // 1. Request short-lived, single-use handoff token from backend
      let handoffToken = '';
      try {
        const tokenRes = await fetch('/api/v1/auth/handoff-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        });
        if (tokenRes.ok) {
          const json = await tokenRes.json();
          handoffToken = json.data?.handoffToken || '';
        }
      } catch (e) {
        console.warn('Could not generate handoff token, proceeding with public ID:', e);
      }

      // 2. Build verified Android Intent URI
      // If SMC Native AR is installed -> Android switches to com.smc.doorwindowar.ArActivity!
      // If NOT installed -> Android redirects to download the APK.
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const fallbackUrl = encodeURIComponent(`${currentOrigin}/downloads/smc-door-window-ar.apk`);
      const tokenParam = handoffToken ? `?token=${encodeURIComponent(handoffToken)}` : '';

      const intentUrl = `intent://product/${productId}${tokenParam}#Intent;scheme=smcar;package=com.smc.doorwindowar;action=android.intent.action.VIEW;S.browser_fallback_url=${fallbackUrl};end;`;

      window.location.href = intentUrl;
    } finally {
      setIsLaunching(false);
    }
  }, [productId]);

  // ---------------------------------------------------------------------------
  // 2. LAUNCH GOOGLE SCENE VIEWER (Android system AR without APK)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 3. LAUNCH APPLE ARKIT QUICK LOOK (iOS Safari native .usdz viewer)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 4. IN-BROWSER WEBXR IMMERSIVE-AR LAUNCHER (Chrome Android)
  // ---------------------------------------------------------------------------
  const handleLaunchInBrowserWebXR = async () => {
    if (!normalizedGlbUrl && !publicGlbUrl) {
      alert('Product 3D model is not available for AR inspection.');
      return;
    }

    setIsLaunching(true);

    try {
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
            'Google Chrome for Android blocks WebXR camera access on plain HTTP local network IPs.',
          explanation:
            'WebXR camera access requires an encrypted HTTPS connection or localhost.',
          canSceneViewer: isAndroid && Boolean(publicGlbUrl),
          canQuickLook: isIOS && Boolean(publicUsdzUrl),
          canNativeApp: isAndroid,
          canPlayStore: false,
          canCopyHttpsLink: true,
        });
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.xr) {
        if (isIOS) {
          handleLaunchAppleQuickLook();
        } else if (isAndroid) {
          handleLaunchNativeAndroidApp();
        } else {
          setDiagnosis({
            reason: 'desktop',
            title: 'Augmented Reality Requires Mobile Device',
            message: 'WebXR Augmented Reality requires a smartphone with a camera and spatial tracking sensors.',
            explanation: 'Open this website on your Android phone using Google Chrome or install the SMC Native AR App.',
            canSceneViewer: false,
            canQuickLook: false,
            canNativeApp: false,
            canPlayStore: false,
            canCopyHttpsLink: true,
          });
        }
        return;
      }

      const isImmersiveARSupported = await navigator.xr
        .isSessionSupported('immersive-ar')
        .catch(() => false);

      if (!isImmersiveARSupported) {
        if (isAndroid) {
          handleLaunchNativeAndroidApp();
        } else if (isIOS) {
          handleLaunchAppleQuickLook();
        }
        return;
      }

      // Start WebXR session with DOM overlay
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
        console.warn('requestSession with dom-overlay failed, retrying basic:', domOverlayErr);
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['anchors'],
        });
      }

      setActiveXRSession(session);
      setDiagnosis(null);
    } catch (err: unknown) {
      console.error('WebXR requestSession exception:', err);
      if (isAndroid) {
        handleLaunchNativeAndroidApp();
      }
    } finally {
      setIsLaunching(false);
    }
  };

  // Main Click Handler: Routes to the optimal native platform experience
  const handleMainARClick = async () => {
    if (isAndroid) {
      await handleLaunchNativeAndroidApp();
    } else if (isIOS) {
      handleLaunchAppleQuickLook();
    } else {
      handleLaunchInBrowserWebXR();
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
          <span>
            {isLaunching
              ? 'Launching AR...'
              : isAndroid
              ? 'Open in SMC Native AR App'
              : isIOS
              ? 'View in Apple AR (ARKit)'
              : 'View in Augmented Reality (AR)'}
          </span>
        </Button>

        {/* Android Alternative Launch Shortcuts */}
        {isAndroid && (
          <div className="flex items-center justify-between text-[11px] text-secondary px-1 pt-0.5">
            <button
              type="button"
              onClick={handleLaunchInBrowserWebXR}
              className="hover:text-foreground underline underline-offset-2"
            >
              In-Browser WebXR
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleLaunchGoogleSceneViewer}
              className="hover:text-foreground underline underline-offset-2"
            >
              Scene Viewer
            </button>
            <span>•</span>
            <a
              href="/downloads/smc-door-window-ar.apk"
              download="smc-door-window-ar.apk"
              className="hover:text-foreground underline underline-offset-2 flex items-center space-x-0.5"
            >
              <span>Download .APK</span>
            </a>
          </div>
        )}
      </div>

      {/* WebXR DOM Overlay Root: mounts the transparent close button over camera */}
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

      {/* Compatibility & Fallback Dialog */}
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
                  <span className="font-semibold block">How to run AR on your phone:</span>
                  <p>1. Open the secure HTTPS site: <strong>https://smc-frontend-cbou.onrender.com</strong></p>
                  <p>2. Or download and install the Native SMC AR APK below.</p>
                </div>
              )}
            </div>

            <div className="pt-2 space-y-2 border-t border-border">
              {/* Native Android App Intent */}
              {diagnosis.canNativeApp && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchNativeAndroidApp}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Launch SMC Native Android App</span>
                </Button>
              )}

              {/* Download APK */}
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

              {/* Google Scene Viewer */}
              {diagnosis.canSceneViewer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLaunchGoogleSceneViewer}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-10 border-border"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Launch Google Scene Viewer</span>
                </Button>
              )}

              {/* Apple Quick Look */}
              {diagnosis.canQuickLook && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleLaunchAppleQuickLook}
                  className="w-full text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 h-11"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>View in Apple Quick Look (ARKit)</span>
                </Button>
              )}

              {/* Copy Link */}
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
