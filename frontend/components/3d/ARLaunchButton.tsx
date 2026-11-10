'use client';

import React, { useState, useMemo } from 'react';
import { useARCapabilities } from '@/hooks/useARCapabilities';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import { normalizeModelUrl } from '@/lib/api-url';
import { Button, ButtonProps } from '@/components/ui/button';
import { RealWorldARExperience } from './RealWorldARExperience';

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
  const { isAndroid, isIOS } = useARCapabilities();
  const [showRealWorldAR, setShowRealWorldAR] = useState(false);
  const [showGuidanceModal, setShowGuidanceModal] = useState(false);

  // Normalize URLs to guarantee active network/cloud host connectivity
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);
  const normalizedUsdzUrl = useMemo(() => normalizeModelUrl(usdzUrl), [usdzUrl]);

  // Launch the in-camera Real-World AR experience directly
  const handleMainARClick = () => {
    if (!normalizedGlbUrl) {
      alert('Product 3D model is not available for AR inspection.');
      return;
    }
    setShowRealWorldAR(true);
  };

  // Directly trigger Android Scene Viewer (fallback)
  const launchSceneViewer = () => {
    if (!normalizedGlbUrl) return;

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const intentUrl = buildSceneViewerUrl({
      glbUrl: normalizedGlbUrl,
      title,
      linkUrl: currentUrl,
      resizable: false, // Enforce 1:1 real-world physical scale
      verticalPlacement: placementMode === 'wall',
    });

    window.location.href = intentUrl;
  };

  // Directly trigger Apple AR Quick Look on iOS (fallback)
  const launchAppleQuickLook = () => {
    if (!normalizedUsdzUrl) {
      setShowGuidanceModal(true);
      return;
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const quickLookUrl = buildQuickLookUrl({
      usdzUrl: normalizedUsdzUrl,
      canonicalWebPageURL: currentUrl,
      allowsContentScaling: false, // Strictly lock 1:1 real-world physical scale
    });

    const anchor = document.createElement('a');
    anchor.setAttribute('rel', 'ar');
    anchor.setAttribute('href', quickLookUrl);
    const img = document.createElement('img');
    anchor.appendChild(img);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setShowGuidanceModal(false);
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

        {/* Secondary Info / Alternative Options */}
        <div className="flex items-center justify-between text-[11px] text-secondary px-1">
          <button
            type="button"
            onClick={() => setShowGuidanceModal(true)}
            className="underline hover:text-foreground transition-colors"
          >
            AR Instructions & Device Tips
          </button>
          {normalizedUsdzUrl && (
            <button
              type="button"
              onClick={launchAppleQuickLook}
              className="text-[#C5A572] font-semibold hover:underline"
            >
              Direct Apple Quick Look
            </button>
          )}
        </div>
      </div>

      {/* FULL REAL-WORLD CAMERA AR EXPERIENCE */}
      {showRealWorldAR && (
        <RealWorldARExperience
          glbUrl={normalizedGlbUrl}
          usdzUrl={normalizedUsdzUrl}
          productName={title}
          isOpen={showRealWorldAR}
          onClose={() => setShowRealWorldAR(false)}
          initialPlacementMode={placementMode}
        />
      )}

      {/* AR Guidance & Manual Selection Modal */}
      {showGuidanceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm">
          <div className="bg-white border border-border max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                  Augmented Reality Guide
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
                <p className="font-semibold text-xs">Real-World Camera Wall Alignment</p>
                <p className="text-[11px] text-secondary leading-relaxed">
                  The model will be placed in your physical room at actual 1:1 scale (true manufactured dimensions) using your mobile device camera.
                </p>
              </div>

              {/* 4 Steps Guide */}
              <div className="space-y-3 text-secondary">
                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <strong className="text-foreground block">Allow Camera Access</strong>
                    <span>Grant camera permission so your device can display the live room environment.</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <strong className="text-foreground block">
                      {placementMode === 'wall' ? 'Scan Vertical Wall Surface' : 'Scan Floor Surface'}
                    </strong>
                    <span>
                      Aim your phone at a well-lit {placementMode === 'wall' ? 'wall' : 'floor'} and slowly move it across the surface.
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <strong className="text-foreground block">Place at 1:1 Scale</strong>
                    <span>Tap &quot;Place on Wall&quot; to anchor the model at true manufactured size.</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <strong className="text-foreground block">4-Corner Opening Fitting</strong>
                    <span>
                      Use the &quot;Fit Opening&quot; tool to calibrate the boundary frame against your actual doorway or window opening.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Launch Actions */}
            <div className="pt-3 border-t border-border space-y-2">
              <Button
                variant="gold"
                size="lg"
                className="w-full text-xs uppercase tracking-wider font-semibold"
                onClick={() => {
                  setShowGuidanceModal(false);
                  setShowRealWorldAR(true);
                }}
              >
                Launch In-Camera AR Experience
              </Button>

              {isAndroid && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={launchSceneViewer}
                >
                  Or Launch Android Scene Viewer (ARCore)
                </Button>
              )}

              {isIOS && normalizedUsdzUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={launchAppleQuickLook}
                >
                  Or Launch Native Apple AR Quick Look
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
