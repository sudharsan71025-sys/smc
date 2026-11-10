'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { X } from 'lucide-react';

interface RealWorldARExperienceProps {
  glbUrl: string;
  usdzUrl?: string;
  thumbnailUrl?: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RealWorldARExperience({
  glbUrl,
  thumbnailUrl,
  isOpen,
  onClose,
}: RealWorldARExperienceProps) {
  // DOM Refs
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // AR Placement State
  const [isPlaced, setIsPlaced] = useState(false);
  const [modelThumbnail, setModelThumbnail] = useState<string | null>(thumbnailUrl || null);

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Touch Drag-and-Drop Tracking Refs
  const isDraggingRef = useRef(false);
  const dragStartTouchRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modelStartPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Normalized GLB Model URL
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);

  // =========================================================================
  // 1. GENERATE DYNAMIC 2D SNAPSHOT OF 3D MODEL (FOR CIRCULAR THUMBNAIL)
  // =========================================================================
  const generateModelThumbnail = useCallback((modelGroup: THREE.Group) => {
    try {
      const snapScene = new THREE.Scene();
      const snapCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
      snapCamera.position.set(0, 1.0, 3.2);

      const snapLight = new THREE.DirectionalLight(0xffffff, 2.5);
      snapLight.position.set(1, 2, 2);
      snapScene.add(snapLight);
      snapScene.add(new THREE.AmbientLight(0xffffff, 1.5));

      const clone = modelGroup.clone();
      clone.visible = true;
      snapScene.add(clone);

      const snapRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      snapRenderer.setSize(160, 160);
      snapRenderer.render(snapScene, snapCamera);

      const dataUrl = snapRenderer.domElement.toDataURL('image/png');
      setModelThumbnail(dataUrl);

      snapRenderer.dispose();
    } catch {
      // Fallback silently if offscreen snapshot is unavailable
    }
  }, []);

  // =========================================================================
  // 2. SETUP THREE.JS SCENE
  // =========================================================================
  const initThreeScene = useCallback(() => {
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Realistic natural lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(2, 4, 3);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    // Perspective Camera matching mobile camera FOV
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    camera.position.set(0, 1.4, 0);
    cameraRef.current = camera;

    return { scene, camera };
  }, []);

  // =========================================================================
  // 3. LOAD 3D MODEL & CALIBRATE 1:1 REAL-WORLD SCALE
  // =========================================================================
  const loadModel = useCallback(
    async (scene: THREE.Scene) => {
      if (!normalizedGlbUrl) return;

      const loader = new GLTFLoader();
      try {
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(normalizedGlbUrl, resolve, undefined, reject);
        });

        const rawModel = gltf.scene;

        // Compute Bounding Box to normalize scale (1 unit = 1 meter)
        const box = new THREE.Box3().setFromObject(rawModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        let scaleFactor = 1.0;
        if (size.y > 500) {
          scaleFactor = 0.001; // Exported in mm
        } else if (size.y > 30) {
          scaleFactor = 0.01; // Exported in cm
        } else {
          scaleFactor = 1.0; // Exported in meters
        }

        rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        rawModel.updateMatrixWorld(true);

        // Center Pivot so bottom sits flush on floor and back touches wall
        const calibratedBox = new THREE.Box3().setFromObject(rawModel);
        const calibratedCenter = new THREE.Vector3();
        calibratedBox.getCenter(calibratedCenter);

        rawModel.position.x = -calibratedCenter.x;
        rawModel.position.y = -calibratedBox.min.y;
        rawModel.position.z = -calibratedBox.min.z;

        // Wrap inside anchor group
        const anchorGroup = new THREE.Group();
        anchorGroup.add(rawModel);
        anchorGroup.visible = false;

        // Initial default placement pose (2.0 meters in front, standing on floor)
        anchorGroup.position.set(0, 0, -2.0);

        scene.add(anchorGroup);
        modelRef.current = anchorGroup;

        // If thumbnail not provided by admin, generate 2D thumbnail from model
        if (!thumbnailUrl) {
          generateModelThumbnail(anchorGroup);
        }
      } catch (err: unknown) {
        console.error('Failed to load GLB model for AR:', err);
      }
    },
    [normalizedGlbUrl, thumbnailUrl, generateModelThumbnail]
  );

  // =========================================================================
  // 4. HARDWARE CAMERA INITIALIZATION
  // =========================================================================
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      console.warn('Camera stream error:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
    if (xrSessionRef.current) {
      xrSessionRef.current.end().catch(() => {});
      xrSessionRef.current = null;
    }
  }, []);

  // =========================================================================
  // 5. ONE-TAP 3D MODEL PLACEMENT
  // =========================================================================
  const handleThumbnailTap = useCallback(() => {
    if (!modelRef.current) return;

    if (!isPlaced) {
      // Place model in front of camera
      modelRef.current.position.set(0, 0, -2.0);
      modelRef.current.rotation.set(0, 0, 0);
      modelRef.current.visible = true;
      setIsPlaced(true);
    } else {
      // If already placed, re-center model smoothly in current camera view
      modelRef.current.position.set(0, 0, -2.0);
      modelRef.current.rotation.set(0, 0, 0);
    }
  }, [isPlaced]);

  // =========================================================================
  // 6. TOUCH DRAG-AND-DROP REPOSITIONING
  // =========================================================================
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!modelRef.current || !isPlaced) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    isDraggingRef.current = true;
    dragStartTouchRef.current = { x: touch.clientX, y: touch.clientY };
    modelStartPositionRef.current.copy(modelRef.current.position);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !modelRef.current || !isPlaced) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const deltaX = (touch.clientX - dragStartTouchRef.current.x) / window.innerWidth;
    const deltaY = (touch.clientY - dragStartTouchRef.current.y) / window.innerHeight;

    // Real-world scale drag sensitivity along wall plane (approx 2.8m width at 2m depth)
    const newX = modelStartPositionRef.current.x + deltaX * 2.8;
    const newY = Math.max(0, modelStartPositionRef.current.y - deltaY * 2.8);

    modelRef.current.position.x = newX;
    modelRef.current.position.y = newY;
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Mouse drag support for testing on laptop/desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!modelRef.current || !isPlaced) return;
    isDraggingRef.current = true;
    dragStartTouchRef.current = { x: e.clientX, y: e.clientY };
    modelStartPositionRef.current.copy(modelRef.current.position);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !modelRef.current || !isPlaced) return;
    const deltaX = (e.clientX - dragStartTouchRef.current.x) / window.innerWidth;
    const deltaY = (e.clientY - dragStartTouchRef.current.y) / window.innerHeight;

    modelRef.current.position.x = modelStartPositionRef.current.x + deltaX * 2.8;
    modelRef.current.position.y = Math.max(0, modelStartPositionRef.current.y - deltaY * 2.8);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // =========================================================================
  // 7. MAIN RUNTIME RENDER LOOP
  // =========================================================================
  useEffect(() => {
    if (!isOpen) return;

    const container = mountRef.current;
    if (!container) return;

    const { scene, camera } = initThreeScene();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Load Model & Start Camera
    loadModel(scene);
    startCamera();

    // Render loop
    const render = () => {
      renderer.render(scene, camera);
      animationFrameIdRef.current = requestAnimationFrame(render);
    };
    render();

    // Resize handler
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      stopCamera();
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (rendererRef.current.domElement && container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, [isOpen, initThreeScene, loadModel, startCamera, stopCamera]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black overflow-hidden select-none touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 1. Live Hardware Camera Feed (100% Full Screen Background) */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
      />

      {/* 2. WebGL 3D Layer */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none" />

      {/* 3. Minimal Discreet Exit Button (Top Right) */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 flex items-center justify-center text-white/80 hover:text-white transition-all shadow-md active:scale-95"
        title="Exit AR"
      >
        <X className="w-5 h-5" />
      </button>

      {/* 4. THE ONLY VISIBLE CONTROL: Small Circular Product Thumbnail (Bottom Center) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <button
          type="button"
          onClick={handleThumbnailTap}
          className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full border-2 border-[#C5A572] bg-white/95 shadow-2xl p-1 flex items-center justify-center active:scale-90 transition-transform duration-150 focus:outline-none"
          title="Tap to place door/window in room"
        >
          {modelThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={modelThumbnail}
              alt="Door Product"
              className="w-full h-full object-contain rounded-full"
            />
          ) : (
            // Elegant Architectural Door Silhouette if image loading
            <div className="w-full h-full rounded-full bg-[#FAF7F2] flex items-center justify-center border border-[#C5A572]/30">
              <div className="w-6 h-10 border-2 border-[#202020] rounded-t-sm flex items-center justify-end pr-0.5">
                <div className="w-1 h-1 rounded-full bg-[#C5A572]" />
              </div>
            </div>
          )}

          {/* Subtle Golden Ping Indicator if model is not placed yet */}
          {!isPlaced && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A572] opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#C5A572]" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
