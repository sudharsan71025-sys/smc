'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useModelViewer } from '@/hooks/useModelViewer';
import { Button } from '@/components/ui/button';
import { normalizeModelUrl } from '@/lib/api-url';

interface ModelViewerCanvasProps {
  src?: string;
  iosSrc?: string;
  alt?: string;
  poster?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
  ar?: boolean;
  arModes?: string;
  arPlacement?: 'floor' | 'wall';
  className?: string;
  onModelLoaded?: (loadTimeMs: number) => void;
  onModelError?: (errorMsg: string) => void;
}

interface ModelViewerCustomElement extends HTMLElement {
  resetTurntable?: () => void;
  cameraOrbit?: string;
  fieldOfView?: string;
  src?: string;
}

export function ModelViewerCanvas({
  src,
  iosSrc,
  alt = 'Architectural 3D Model',
  poster,
  autoRotate: initialAutoRotate = false,
  cameraControls = true,
  ar = true,
  arModes = 'webxr scene-viewer quick-look',
  arPlacement = 'wall',
  className = 'w-full h-[520px]',
  onModelLoaded,
  onModelError,
}: ModelViewerCanvasProps) {
  const { isReady, modelViewerRef } = useModelViewer();
  const containerRef = useRef<HTMLDivElement>(null);

  // Loading & Progress State
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const isLoadedRef = useRef(isLoaded);
  isLoadedRef.current = isLoaded;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(initialAutoRotate);
  const [loadDuration, setLoadDuration] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Stable callback references to prevent infinite reload loops
  const onModelLoadedRef = useRef(onModelLoaded);
  onModelLoadedRef.current = onModelLoaded;

  const onModelErrorRef = useRef(onModelError);
  onModelErrorRef.current = onModelError;

  const lastLoadedSrcRef = useRef<string>('');

  // Normalize model URLs to active host
  const normalizedSrc = useMemo(() => normalizeModelUrl(src), [src]);
  const normalizedIosSrc = useMemo(() => normalizeModelUrl(iosSrc), [iosSrc]);

  // Track start time for performance measurement
  const loadStartTimeRef = useRef<number>(Date.now());

  // Set ios-src attribute independently without interfering with 3D WebGL rendering
  useEffect(() => {
    const el = modelViewerRef.current;
    if (el && normalizedIosSrc) {
      el.setAttribute('ios-src', normalizedIosSrc);
    }
  }, [normalizedIosSrc, modelViewerRef]);

  // Attach model-viewer DOM event listeners
  useEffect(() => {
    const el = modelViewerRef.current as (HTMLElement & { loaded?: boolean }) | null;
    if (!el || !normalizedSrc) return;

    // If this model is already loaded in the element, keep it loaded
    if (lastLoadedSrcRef.current === normalizedSrc && (isLoadedRef.current || el.loaded)) {
      setIsLoaded(true);
      setLoadProgress(100);
      return;
    }

    if (lastLoadedSrcRef.current !== normalizedSrc) {
      loadStartTimeRef.current = Date.now();
      setIsLoaded(false);
      setErrorMessage(null);
      setLoadProgress(0);
      el.setAttribute('src', normalizedSrc);
    }

    const handleProgress = (event: Event) => {
      const customEvent = event as CustomEvent<{ totalProgress: number }>;
      const progress = customEvent.detail?.totalProgress ?? 0;
      setLoadProgress(Math.min(100, Math.round(progress * 100)));
    };

    const handleLoad = () => {
      const duration = Date.now() - loadStartTimeRef.current;
      lastLoadedSrcRef.current = normalizedSrc;
      setLoadProgress(100);
      setIsLoaded(true);
      setErrorMessage(null);
      setLoadDuration(duration);
      onModelLoadedRef.current?.(duration);
    };

    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: string }>;
      const detail = customEvent.detail || {};
      const msg =
        detail.type === 'loadfailure'
          ? 'Failed to fetch or parse 3D GLB model.'
          : 'WebGL 3D rendering error encountered while displaying model.';
      setErrorMessage(msg);
      setIsLoaded(false);
      onModelErrorRef.current?.(msg);
    };

    el.addEventListener('progress', handleProgress);
    el.addEventListener('load', handleLoad);
    el.addEventListener('error', handleError);

    // If the element is already loaded, resolve immediately
    if (el.loaded) {
      handleLoad();
    }

    // Safety polling: in case the load event fired before listeners were registered
    const pollTimer = setInterval(() => {
      if (el.loaded) {
        handleLoad();
        clearInterval(pollTimer);
      }
    }, 250);

    return () => {
      clearInterval(pollTimer);
      el.removeEventListener('progress', handleProgress);
      el.removeEventListener('load', handleLoad);
      el.removeEventListener('error', handleError);
    };
  }, [normalizedSrc, isReady, modelViewerRef]);

  // Reset Camera View
  const handleResetCamera = useCallback(() => {
    const el = modelViewerRef.current as ModelViewerCustomElement | null;
    if (el) {
      if (typeof el.resetTurntable === 'function') {
        el.resetTurntable();
      }
      el.cameraOrbit = '0deg 75deg 105%';
      el.fieldOfView = 'auto';
    }
  }, [modelViewerRef]);

  // Toggle Fullscreen
  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for fullscreen change
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Retry loading
  const handleRetry = () => {
    setErrorMessage(null);
    setIsLoaded(false);
    setLoadProgress(0);
    loadStartTimeRef.current = Date.now();
    const el = modelViewerRef.current as ModelViewerCustomElement | null;
    if (el && src) {
      const currentSrc = el.src;
      el.src = '';
      setTimeout(() => {
        el.src = currentSrc;
      }, 50);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative border border-border bg-[#FAFAFA] flex items-center justify-center overflow-hidden select-none ${className}`}
    >
      {/* 1. Loading 3D Engine script */}
      {!isReady ? (
        <div className="flex flex-col items-center justify-center p-8 text-secondary space-y-3">
          <div className="w-6 h-6 border-2 border-border border-t-primary animate-spin" />
          <span className="text-xs tracking-wider uppercase">Loading 3D Engine...</span>
        </div>
      ) : !src ? (
        /* 2. Missing Model URL State */
        <div className="flex flex-col items-center justify-center p-12 text-center space-y-3 bg-white">
          <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
            3D Viewport
          </span>
          <p className="text-sm font-medium text-foreground">No 3D Model Assigned</p>
          <p className="text-xs text-secondary max-w-sm">
            This product does not have a GLB file associated with it yet.
          </p>
        </div>
      ) : (
        /* 3. Official Google model-viewer element */
        <div className="w-full h-full relative">
          {React.createElement('model-viewer', {
            ref: modelViewerRef,
            src: normalizedSrc,
            'ios-src': normalizedIosSrc,
            alt,
            poster,
            'camera-controls': cameraControls ? '' : undefined,
            'auto-rotate': autoRotate ? '' : undefined,
            'auto-rotate-delay': '1000',
            'rotation-per-second': '15deg',
            ar: ar ? '' : undefined,
            'ar-modes': arModes,
            'ar-placement': arPlacement,
            'ar-scale': 'fixed',
            'shadow-intensity': '1.0',
            'shadow-softness': '0.8',
            exposure: '1.0',
            'camera-orbit': '0deg 75deg 105%',
            'min-camera-orbit': 'auto auto 5%',
            'max-camera-orbit': 'auto auto 200%',
            bounds: 'tight',
            'touch-action': 'pan-y',
            'interaction-prompt': 'auto',
            style: {
              width: '100%',
              height: '100%',
              backgroundColor: '#FFFFFF',
              outline: 'none',
            },
          }, [
            // Custom AR Launch slot inside model-viewer
            React.createElement(
              'button',
              {
                key: 'ar-slot-button',
                slot: 'ar-button',
                className:
                  'absolute bottom-4 right-4 bg-[#C5A572] text-[#202020] text-xs font-semibold px-4 py-2 uppercase tracking-wider shadow-sm hover:opacity-90 transition-opacity flex items-center space-x-1.5',
              },
              '📱 View in AR'
            ),
          ])}

          {/* Model Loading Progress Overlay */}
          {!isLoaded && !errorMessage && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 space-y-3 z-10">
              <div className="w-8 h-8 border-2 border-border border-t-[#C5A572] rounded-full animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-xs font-medium text-foreground">
                  Loading 3D Model {loadProgress > 0 && `(${loadProgress}%)`}
                </p>
                <p className="text-[10px] text-secondary">
                  Streaming geometry, textures, and material shaders...
                </p>
              </div>
              {/* Progress Bar */}
              <div className="w-48 h-1 bg-border/60 overflow-hidden">
                <div
                  className="h-full bg-[#C5A572] transition-all duration-200"
                  style={{ width: `${Math.max(5, loadProgress)}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {errorMessage && (
            <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
              <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
                3D Model Error
              </span>
              <p className="text-sm font-medium text-foreground max-w-sm">
                {errorMessage}
              </p>
              <p className="text-xs text-secondary max-w-xs">
                Verify that the GLB file exists in storage and is accessible from your network.
              </p>
              <Button variant="outline" size="sm" onClick={handleRetry} className="text-xs mt-2">
                Retry Loading Model
              </Button>
            </div>
          )}

          {/* Controls HUD Overlay (Visible when model is loaded) */}
          {isLoaded && (
            <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 flex items-center space-x-1 sm:space-x-1.5 z-10 bg-white/95 border border-border p-1 backdrop-blur-sm shadow-sm max-w-[calc(100%-1.25rem)] flex-wrap">
              {/* Reset Camera */}
              <button
                type="button"
                onClick={handleResetCamera}
                title="Reset Camera Framing"
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px] text-secondary hover:text-foreground transition-colors"
              >
                Reset
              </button>

              <span className="text-border">|</span>

              {/* Toggle Turntable Rotation */}
              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                title={autoRotate ? 'Stop Rotation' : 'Auto Rotate'}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px] transition-colors ${
                  autoRotate
                    ? 'font-semibold text-primary'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                {autoRotate ? 'Rotating' : 'Auto Rotate'}
              </button>

              <span className="text-border">|</span>

              {/* Fullscreen */}
              <button
                type="button"
                onClick={handleToggleFullscreen}
                title="Toggle Fullscreen"
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px] text-secondary hover:text-foreground transition-colors"
              >
                {isFullscreen ? 'Exit' : 'Full'}
              </button>
            </div>
          )}

          {/* Performance & Scale Tag */}
          {isLoaded && loadDuration !== null && (
            <div className="absolute bottom-3 left-3 flex items-center space-x-2 z-10">
              <span className="text-[10px] bg-white/90 border border-border text-secondary px-2 py-0.5 backdrop-blur-sm">
                Scale: 1:1 Architectural Scale
              </span>
              <span className="text-[10px] bg-white/90 border border-border text-secondary px-2 py-0.5 backdrop-blur-sm">
                Loaded in {loadDuration} ms
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
