'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { X, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WebcamPreviewModalProps {
  glbUrl: string;
  title: string;
  onClose: () => void;
}

/**
 * Desktop Webcam 3D Preview (Camera Simulation)
 *
 * Requirements:
 * 1. Explicit user gesture launch only.
 * 2. Uses getUserMedia for live camera background on laptops.
 * 3. Clearly labeled as a 2D camera preview without spatial tracking or wall anchoring.
 * 4. Stops all media tracks immediately on close.
 */
export function WebcamPreviewModal({
  glbUrl,
  title,
  onClose,
}: WebcamPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isLoadingCamera, setIsLoadingCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);

  // Clean shutdown of media tracks
  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopWebcam();
    onClose();
  }, [stopWebcam, onClose]);

  // 1. Initialize Webcam Stream
  useEffect(() => {
    let isDisposed = false;

    const startWebcam = async () => {
      try {
        setIsLoadingCamera(true);
        setCameraError(null);

        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isDisposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsLoadingCamera(false);
      } catch (err: unknown) {
        if (isDisposed) return;
        setIsLoadingCamera(false);
        const name = (err as Error).name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Camera permission was denied. Please allow camera access in browser site settings and retry.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError('No webcam or video capture device was found on this laptop.');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setCameraError(
            'Your webcam is currently in use by another application (e.g. Zoom, Teams, or another tab).'
          );
        } else {
          setCameraError('Unable to access webcam. Please check your camera settings.');
        }
      }
    };

    startWebcam();

    return () => {
      isDisposed = true;
      stopWebcam();
    };
  }, [stopWebcam]);

  // 2. Initialize Three.js Overlaid 3D Viewport
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !normalizedGlbUrl) return;

    let isDisposed = false;
    let animId: number | null = null;

    const scene = new THREE.Scene();
    scene.background = null; // Transparent to allow video behind

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.05,
      50
    );
    camera.position.set(0, 1.2, 2.6);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1.0, 0);
    controls.update();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 1.0);
    fill.position.set(-2, 2, 2);
    scene.add(fill);

    // Load Model
    const loader = new GLTFLoader();
    loader.load(normalizedGlbUrl, (gltf: GLTF) => {
      if (isDisposed) return;
      const rawModel = gltf.scene;

      const box = new THREE.Box3().setFromObject(rawModel);
      const size = new THREE.Vector3();
      box.getSize(size);

      let scaleFactor = 1.0;
      if (size.y > 500) scaleFactor = 0.001;
      else if (size.y > 30) scaleFactor = 0.01;

      rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
      rawModel.updateMatrixWorld(true);

      const calibratedBox = new THREE.Box3().setFromObject(rawModel);
      const center = new THREE.Vector3();
      calibratedBox.getCenter(center);

      rawModel.position.x = -center.x;
      rawModel.position.y = -calibratedBox.min.y;
      rawModel.position.z = -center.z;

      scene.add(rawModel);
    });

    const handleResize = () => {
      if (isDisposed) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      if (isDisposed) return;
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      isDisposed = true;
      if (animId !== null) cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [normalizedGlbUrl]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black flex items-center justify-center select-none">
      {/* 1. Underlying Live Webcam Video Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* 2. Overlaid Transparent Three.js Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-10" />

      {/* 3. Honest Disclaimer Banner */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-black/75 border border-white/20 text-white/90 text-[11px] font-medium backdrop-blur-sm shadow-md flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
        <span>{title} • Desktop Webcam Preview (No spatial tracking / wall detection)</span>
      </div>

      {/* 4. Minimal Close Button */}
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-4 right-4 z-30 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 border border-white/25 flex items-center justify-center text-white/90 hover:text-white transition-all shadow-lg active:scale-95"
        title="Exit Webcam Preview"
        aria-label="Exit Webcam Preview"
      >
        <X className="w-5 h-5" />
      </button>

      {/* 5. Controls Tip (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-20 px-3 py-1.5 rounded-sm bg-black/60 text-white/80 text-[10px] pointer-events-none hidden sm:block">
        Drag to rotate • Scroll to zoom
      </div>

      {/* 6. Loading Indicator */}
      {isLoadingCamera && (
        <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center p-6 space-y-3 text-white text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs uppercase tracking-wider font-medium">Connecting to Laptop Webcam...</p>
          <p className="text-[11px] text-white/60">Please allow camera access when prompted by the browser.</p>
        </div>
      )}

      {/* 7. Error Modal */}
      {cameraError && (
        <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="text-sm font-semibold uppercase text-white tracking-wider">Webcam Access Notice</h3>
          <p className="text-xs text-white/75 leading-relaxed">{cameraError}</p>
          <div className="flex items-center space-x-2 pt-2">
            <Button variant="gold" size="sm" onClick={() => window.location.reload()} className="text-xs">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry Access
            </Button>
            <Button variant="outline" size="sm" onClick={handleClose} className="text-xs border-white/30 text-white">
              Close Preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
