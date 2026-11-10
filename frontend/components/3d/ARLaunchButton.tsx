'use client';

import React, { useState } from 'react';
import { useARCapabilities } from '@/hooks/useARCapabilities';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import { Button, ButtonProps } from '@/components/ui/button';

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
  const { isAndroid, isIOS, supportsQuickLook, supportsSceneViewer } = useARCapabilities();
  const [showGuidanceModal, setShowGuidanceModal] = useState(false);

  // Directly trigger Android Scene Viewer
  const launchSceneViewer = () => {
    if (!glbUrl) {
      alert('3D model URL is missing. Cannot launch AR.');
      return;
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const intentUrl = buildSceneViewerUrl({
      glbUrl,
      title,
      linkUrl: currentUrl,
      resizable: false, // Enforce 1:1 real-world physical scale
      verticalPlacement: placementMode === 'wall',
    });

    window.location.href = intentUrl;
  };

  // Directly trigger in-browser WebXR AR via model-viewer
  const launchWebXR = () => {
    const modelViewerEl = document.querySelector('model-viewer') as
      | (HTMLElement & { activateAR?: () => void; canActivateAR?: boolean })
      | null;

    if (
      modelViewerEl &&
      typeof modelViewerEl.activateAR === 'function' &&
      modelViewerEl.canActivateAR
    ) {
      modelViewerEl.activateAR();
      setShowGuidanceModal(false);
      return;
    }

    // If WebXR activateAR is not directly available, launch Scene Viewer on Android
    if (isAndroid) {
      launchSceneViewer();
    } else {
      setShowGuidanceModal(true);
    }
  };

  // Directly trigger Apple AR Quick Look on iOS
  const launchAppleQuickLook = () => {
    if (!usdzUrl) {
      setShowGuidanceModal(true);
      return;
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const quickLookUrl = buildQuickLookUrl({
      usdzUrl,
      canonicalWebPageURL: currentUrl,
      allowsContentScaling: false, // Strictly lock 1:1 real-world physical scale
    });

    const anchor = document.createElement('a');
    anchor.setAttribute('rel', 'ar');
    anchor.setAttribute('href', quickLookUrl);
    // Apple Quick Look specification requires an <img> child element
    const img = document.createElement('img');
    anchor.appendChild(img);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setShowGuidanceModal(false);
  };

  // Main AR button handler
  const handleMainARClick = () => {
    if (!glbUrl) {
      alert('Product 3D model is not available for AR inspection.');
      return;
    }

    // 1. Android devices: show guidance with one-tap launch to ensure user knows camera/surface steps
    if (isAndroid || supportsSceneViewer) {
      setShowGuidanceModal(true);
      return;
    }

    // 2. iOS devices: launch Apple Quick Look or show informative fallback if USDZ is pending
    if (isIOS || supportsQuickLook) {
      if (usdzUrl) {
        launchAppleQuickLook();
        return;
      } else {
        // Missing USDZ: open modal with clear guidance while maintaining 3D viewer active
        setShowGuidanceModal(true);
        return;
      }
    }

    // 3. Desktop / Unsupported: open guidance modal
    setShowGuidanceModal(true);
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
          className={`w-full tracking-wider uppercase text-xs font-semibold flex items-center justify-center space-x-2 h-12 ${className}`}
          {...props}
        >
          <span>📱</span>
          <span>View in Augmented Reality (AR)</span>
        </Button>
      </div>

      {/* AR Guidance & Launch Modal */}
      {showGuidanceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm">
          <div className="bg-white border border-border max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                  Augmented Reality Experience
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-foreground">{title}</h3>
              </div>
              <button
                onClick={() => setShowGuidanceModal(false)}
                className="text-xs font-bold text-secondary hover:text-foreground p-1.5"
              >
                ✕
              </button>
            </div>

            {/* Step-by-Step AR Guidance */}
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-[#FAF7F2] border border-[#C5A572]/40 text-[#202020] space-y-1">
                <p className="font-semibold text-xs">
                  {isAndroid
                    ? 'Android ARCore Scene Viewer Ready'
                    : isIOS
                    ? usdzUrl
                      ? 'Apple ARKit Quick Look Ready'
                      : 'Apple Quick Look Unavailable'
                    : 'Real-World Architectural Scale Inspection'}
                </p>
                <p className="text-[11px] text-secondary leading-relaxed">
                  {isIOS && !usdzUrl
                    ? 'This product does not have an Apple USDZ asset configured. The regular 3D viewer remains available for interactive on-screen inspection.'
                    : 'The model will be placed in your physical room at actual 1:1 scale (true manufactured dimensions).'}
                </p>
              </div>

              {/* 4 Steps Guide */}
              <div className="space-y-3 text-secondary">
                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <strong className="text-foreground block">Camera Permission</strong>
                    <span>
                      {isIOS
                        ? 'Safari will prompt to open Apple Quick Look using the native ARKit engine.'
                        : 'Allow Google Chrome and Google Play Services for AR (ARCore) to access your camera when prompted.'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <strong className="text-foreground block">
                      {placementMode === 'wall'
                        ? 'Scan Vertical Wall Surface'
                        : 'Scan Floor Surface'}
                    </strong>
                    <span>
                      Aim your device at a well-lit {placementMode === 'wall' ? 'wall' : 'floor'} and slowly move it in a circle to detect surface depth.
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <strong className="text-foreground block">Place at 1:1 Scale</strong>
                    <span>
                      Tap on the detected surface reticle to anchor the architectural model at true manufactured size.
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <strong className="text-foreground block">Reposition & Inspect</strong>
                    <span>
                      {isIOS
                        ? 'Walk around to inspect true physical scale. When finished, tap "Done" to return seamlessly to the showroom website.'
                        : 'Drag with one finger to align with your wall opening. Step closer or walk around to inspect hardware and frame joints.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Launch Actions */}
            <div className="pt-3 border-t border-border space-y-2">
              {isAndroid ? (
                <>
                  <Button
                    variant="gold"
                    size="lg"
                    className="w-full text-xs uppercase tracking-wider font-semibold"
                    onClick={launchSceneViewer}
                  >
                    Launch Android Scene Viewer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={launchWebXR}
                  >
                    Or Launch In-Browser WebXR AR
                  </Button>
                </>
              ) : isIOS ? (
                usdzUrl ? (
                  <Button
                    variant="gold"
                    size="lg"
                    className="w-full text-xs uppercase tracking-wider font-semibold"
                    onClick={launchAppleQuickLook}
                  >
                    Launch Apple AR Quick Look
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/40 border border-border text-[11px] text-secondary">
                      <p className="font-semibold text-foreground pb-1">Apple USDZ Asset Pending</p>
                      <p>
                        Apple AR Quick Look requires a dedicated USDZ file. This product currently only provides a GLB model. You can continue rotating and inspecting the 3D model in your Safari browser.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setShowGuidanceModal(false)}
                    >
                      Continue in 3D Viewport
                    </Button>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <div className="p-3 bg-muted/40 border border-border text-[11px] text-secondary">
                    <p className="font-semibold text-foreground pb-1">Desktop Device Detected</p>
                    <p>
                      To place this door or window on your physical room wall, open this page on an Android phone (with ARCore) or an iPhone (iOS 12+).
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setShowGuidanceModal(false)}
                  >
                    Continue Viewing on Desktop 3D Viewport
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
