'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { RotateCw, RefreshCw, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ModelDimensions {
  widthCm: number;
  heightCm: number;
  depthCm: number;
}

interface Three3DViewerProps {
  src?: string;
  alt?: string;
  className?: string;
  autoRotate?: boolean;
  onModelLoaded?: (loadTimeMs: number, dimensions?: ModelDimensions) => void;
  onModelError?: (errorMsg: string) => void;
}

/**
 * Pure Three.js 3D Architectural Viewer
 *
 * Implements interactive 3D inspection using Three.js and GLTFLoader.
 * Features orbit rotation, zoom, pan, studio architectural lighting,
 * 1:1 metric scale validation, and real-world dimension calculation.
 */
export function Three3DViewer({
  src,
  alt = 'Architectural 3D Model',
  className = 'w-full h-[520px]',
  autoRotate: initialAutoRotate = false,
  onModelLoaded,
  onModelError,
}: Three3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js References
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentModelRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const initialCameraPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.2, 2.5));
  const initialTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.0, 0));

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(initialAutoRotate);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState<ModelDimensions | null>(null);

  const normalizedSrc = useMemo(() => normalizeModelUrl(src), [src]);

  // Keep callback refs stable
  const onModelLoadedRef = useRef(onModelLoaded);
  onModelLoadedRef.current = onModelLoaded;

  const onModelErrorRef = useRef(onModelError);
  onModelErrorRef.current = onModelError;

  // Toggle Auto-rotation
  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      if (controlsRef.current) {
        controlsRef.current.autoRotate = next;
      }
      return next;
    });
  }, []);

  // Reset Camera View
  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.copy(initialCameraPosRef.current);
    controlsRef.current.target.copy(initialTargetRef.current);
    controlsRef.current.update();
  }, []);

  // Fullscreen Toggle
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.warn('Could not enter fullscreen:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.warn('Could not exit fullscreen:', err);
      }
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // ---------------------------------------------------------------------------
  // MAIN THREE.JS SETUP & MODEL LOADING
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfcfcfc);
    sceneRef.current = scene;

    // 2. Camera
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 50);
    camera.position.set(0, 1.2, 2.8);
    scene.add(camera);
    cameraRef.current = camera;

    // 3. Renderer with ACESFilmic Tone Mapping for photorealistic PBR architectural materials
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    controls.maxDistance = 10;
    controls.minDistance = 0.5;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Do not go below floor plane
    controlsRef.current = controls;

    // 5. Studio Architectural Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1.2);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-3, 3, 2);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
    backLight.position.set(0, 4, -4);
    scene.add(backLight);

    // Subtle Ground Shadow Plane / Grid
    const gridHelper = new THREE.GridHelper(6, 12, 0xd0d0d0, 0xeaeaea);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // 6. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (isDisposed || !entries[0]) return;
      const { width: newW, height: newH } = entries[0].contentRect;
      if (newW > 0 && newH > 0 && rendererRef.current && cameraRef.current) {
        cameraRef.current.aspect = newW / newH;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(newW, newH);
      }
    });
    resizeObserver.observe(container);

    // 7. Load GLB Model
    if (normalizedSrc) {
      setIsLoading(true);
      setLoadingProgress(0);
      setErrorMessage(null);
      const startTime = Date.now();

      const loader = new GLTFLoader();
      loader.load(
        normalizedSrc,
        (gltf: GLTF) => {
          if (isDisposed) return;

          const rawModel = gltf.scene;

          // Remove any previous model
          if (currentModelRef.current) {
            scene.remove(currentModelRef.current);
          }

          // A. Measure raw bounding box to compute scale
          const rawBox = new THREE.Box3().setFromObject(rawModel);
          const rawSize = new THREE.Vector3();
          rawBox.getSize(rawSize);

          let scaleFactor = 1.0;
          if (rawSize.y > 500) {
            scaleFactor = 0.001; // mm -> meters
          } else if (rawSize.y > 30) {
            scaleFactor = 0.01; // cm -> meters
          } else {
            scaleFactor = 1.0; // standard meters
          }

          rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
          rawModel.updateMatrixWorld(true);

          // B. Compute calibrated metric dimensions (in centimeters)
          const metricBox = new THREE.Box3().setFromObject(rawModel);
          const metricSize = new THREE.Vector3();
          metricBox.getSize(metricSize);

          const computedDims: ModelDimensions = {
            widthCm: Math.round(metricSize.x * 100),
            heightCm: Math.round(metricSize.y * 100),
            depthCm: Math.round(metricSize.z * 100),
          };
          setDimensions(computedDims);

          // C. Calibrate Pivot:
          // X centered at 0
          // Y resting on ground threshold (Y = 0)
          // Z centered at 0
          const center = new THREE.Vector3();
          metricBox.getCenter(center);
          rawModel.position.x = -center.x;
          rawModel.position.y = -metricBox.min.y; // Ground the bottom
          rawModel.position.z = -center.z;

          const modelGroup = new THREE.Group();
          modelGroup.add(rawModel);
          scene.add(modelGroup);
          currentModelRef.current = modelGroup;

          // D. Position camera nicely based on model height
          const modelHeight = metricSize.y || 2.1;
          const targetY = modelHeight * 0.5;
          const distance = Math.max(modelHeight * 1.5, 2.5);

          controls.target.set(0, targetY, 0);
          camera.position.set(0, targetY + 0.2, distance);
          controls.update();

          initialCameraPosRef.current.set(0, targetY + 0.2, distance);
          initialTargetRef.current.set(0, targetY, 0);

          setIsLoading(false);
          setLoadingProgress(100);

          const elapsedMs = Date.now() - startTime;
          onModelLoadedRef.current?.(elapsedMs, computedDims);
        },
        (xhr) => {
          if (xhr.lengthComputable && xhr.total > 0) {
            const percent = Math.round((xhr.loaded / xhr.total) * 100);
            setLoadingProgress(percent);
          }
        },
        (err) => {
          if (isDisposed) return;
          console.error('Three3DViewer GLTF Load Error:', err);
          setIsLoading(false);
          const msg = 'Failed to load 3D architectural model.';
          setErrorMessage(msg);
          onModelErrorRef.current?.(msg);
        }
      );
    } else {
      setIsLoading(false);
    }

    // 8. Animation Loop
    const animate = () => {
      if (isDisposed) return;
      animFrameIdRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Cleanup
    return () => {
      isDisposed = true;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      // Traverse and dispose geometries and materials
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
    };
  }, [normalizedSrc, autoRotate]);

  return (
    <div
      ref={containerRef}
      className={`relative bg-[#FCFCFC] border border-border overflow-hidden select-none ${className}`}
      aria-label={alt}
    >
      {/* Three.js Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#FCFCFC]/90 backdrop-blur-xs flex flex-col items-center justify-center p-4 space-y-3 z-20">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <div className="space-y-1 text-center">
            <p className="text-xs font-semibold text-foreground tracking-wider uppercase">
              Loading 3D Architectural Model
            </p>
            {loadingProgress > 0 && (
              <p className="text-[11px] text-secondary font-mono">{loadingProgress}%</p>
            )}
          </div>
          {loadingProgress > 0 && (
            <div className="w-36 h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error Overlay */}
      {errorMessage && !isLoading && (
        <div className="absolute inset-0 bg-[#FCFCFC] flex flex-col items-center justify-center p-6 space-y-3 z-20 text-center">
          <AlertCircle className="w-8 h-8 text-secondary" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {errorMessage}
          </p>
          <p className="text-[11px] text-secondary max-w-xs">
            Verify network connectivity and ensure the 3D model asset is published in MongoDB GridFS.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="text-xs mt-2"
          >
            Retry Loading
          </Button>
        </div>
      )}

      {/* Real-World Dimension Overlay Tag */}
      {dimensions && !isLoading && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 bg-white/90 border border-border text-[10px] font-mono text-secondary tracking-tight backdrop-blur-xs shadow-xs">
          <span className="text-primary font-semibold">1:1 SCALE: </span>
          <span>{dimensions.widthCm} W × {dimensions.heightCm} H × {dimensions.depthCm} D cm</span>
        </div>
      )}

      {/* Control Buttons (Top Right) */}
      <div className="absolute top-3 right-3 z-10 flex items-center space-x-1.5">
        <button
          type="button"
          onClick={toggleAutoRotate}
          className={`p-2 bg-white/90 border border-border transition-colors shadow-xs ${
            autoRotate ? 'text-primary border-primary' : 'text-secondary hover:text-foreground'
          }`}
          title={autoRotate ? 'Disable turntable rotation' : 'Enable turntable rotation'}
          aria-label="Toggle turntable rotation"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={resetCamera}
          className="p-2 bg-white/90 border border-border text-secondary hover:text-foreground transition-colors shadow-xs"
          title="Reset 3D camera position"
          aria-label="Reset camera"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 bg-white/90 border border-border text-secondary hover:text-foreground transition-colors shadow-xs"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen 3D Inspection'}
          aria-label="Toggle fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Interactive Helper Footer */}
      {!isLoading && !errorMessage && (
        <div className="absolute bottom-2.5 right-3 z-10 text-[10px] text-secondary/80 pointer-events-none hidden sm:block">
          Rotate • Zoom • Pan
        </div>
      )}
    </div>
  );
}

