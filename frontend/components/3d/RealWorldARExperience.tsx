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

  // AR State
  const [isPlaced, setIsPlaced] = useState(false);
  const [modelThumbnail, setModelThumbnail] = useState<string | null>(thumbnailUrl || null);
  const [isProductActive, setIsProductActive] = useState(true);

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const placementRingRef = useRef<THREE.Mesh | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Interactive Drag & Raycast Refs
  const isDraggingRef = useRef(false);
  const dragPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.5)); // Vertical wall plane at Z = -2.5m
  const floorPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));   // Floor plane at Y = 0
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

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
  // 2. SETUP THREE.JS SCENE & ARCHITECTURAL LIGHTING
  // =========================================================================
  const initThreeScene = useCallback(() => {
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Realistic natural lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
    sunLight.position.set(2, 4, 3);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    // Perspective Camera matching standard mobile camera FOV
    // Camera is at typical standing eye-level (1.4m above floor) looking forward
    const camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.01,
      30
    );
    camera.position.set(0, 1.4, 0);
    cameraRef.current = camera;

    // Subtle placement touch ring animation in 3D
    const ringGeo = new THREE.RingGeometry(0.08, 0.11, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc5a572,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    scene.add(ringMesh);
    placementRingRef.current = ringMesh;

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

        // Compute Bounding Box to normalize scale (1 unit = 1 meter in real world)
        const box = new THREE.Box3().setFromObject(rawModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        let scaleFactor = 1.0;
        if (size.y > 500) {
          scaleFactor = 0.001; // Exported in mm (e.g. 2100mm)
        } else if (size.y > 30) {
          scaleFactor = 0.01; // Exported in cm (e.g. 210cm)
        } else {
          scaleFactor = 1.0; // Exported in standard meters (e.g. 2.1m)
        }

        rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        rawModel.updateMatrixWorld(true);

        // Center Pivot:
        // - X: centered at 0
        // - Y: bottom at 0 (so door sits flush on floor threshold)
        // - Z: back flush with wall surface (so frame mounts against wall)
        const calibratedBox = new THREE.Box3().setFromObject(rawModel);
        const calibratedCenter = new THREE.Vector3();
        calibratedBox.getCenter(calibratedCenter);

        rawModel.position.x = -calibratedCenter.x;
        rawModel.position.y = -calibratedBox.min.y;
        rawModel.position.z = -calibratedBox.min.z;

        // Wrap inside anchor group
        const anchorGroup = new THREE.Group();
        anchorGroup.add(rawModel);
        anchorGroup.visible = false; // Initially invisible until user taps a location!

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
  // 4. HARDWARE CAMERA & SENSOR TRACKING
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

      // Gyroscope tracking: tilt camera in sync with phone pitch & roll
      const handleOrientation = (e: DeviceOrientationEvent) => {
        if (!cameraRef.current) return;
        if (e.beta !== null && e.gamma !== null) {
          // Subtle pitch adjustment: as user tilts phone, view shifts naturally
          const pitch = (e.beta - 90) * (Math.PI / 180) * 0.5;
          const roll = e.gamma * (Math.PI / 180) * 0.3;
          cameraRef.current.rotation.x = pitch;
          cameraRef.current.rotation.z = -roll;
        }
      };
      window.addEventListener('deviceorientation', handleOrientation);
    } catch (err: unknown) {
      console.warn('Camera access error:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
  }, []);

  // =========================================================================
  // 5. TAP ANYWHERE TO PLACE 3D MODEL (AMAZON / FLIPKART STYLE)
  // =========================================================================
  const handleScreenTap = useCallback(
    (clientX: number, clientY: number) => {
      const camera = cameraRef.current;
      const model = modelRef.current;
      if (!camera || !model) return;

      // 1. Convert touch coordinates to Normalized Device Coordinates (-1 to +1)
      const mouse = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
      );

      // 2. Cast ray from camera through touched screen pixel
      raycasterRef.current.setFromCamera(mouse, camera);

      // 3. Perform AR Raycast against the real-world wall plane (Z = -2.5m) and floor plane (Y = 0)
      const wallIntersection = new THREE.Vector3();
      const hitWall = raycasterRef.current.ray.intersectPlane(
        dragPlaneRef.current,
        wallIntersection
      );

      const floorIntersection = new THREE.Vector3();
      const hitFloor = raycasterRef.current.ray.intersectPlane(
        floorPlaneRef.current,
        floorIntersection
      );

      // Choose most appropriate intersection based on touch ray angle
      let targetX = 0;
      let targetZ = -2.5;

      if (hitWall) {
        targetX = wallIntersection.x;
        targetZ = wallIntersection.z;
      } else if (hitFloor) {
        targetX = floorIntersection.x;
        targetZ = floorIntersection.z;
      }

      // 4. Place 3D model at the EXACT touched location
      // Base sits flush at floor level (Y = 0), matching real doorway installations
      model.position.set(targetX, 0, targetZ);
      model.visible = true;
      setIsPlaced(true);

      // 5. Trigger subtle placement ripple effect at touch location
      if (placementRingRef.current) {
        placementRingRef.current.position.set(targetX, 0.02, targetZ);
        const mat = placementRingRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.9;
        const fade = () => {
          if (mat.opacity > 0.05) {
            mat.opacity -= 0.08;
            requestAnimationFrame(fade);
          } else {
            mat.opacity = 0;
          }
        };
        requestAnimationFrame(fade);
      }
    },
    []
  );

  // =========================================================================
  // 6. TOUCH DRAG-AND-DROP REPOSITIONING
  // =========================================================================
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    // Check if touching near or on the model to drag, or placing for the first time
    const camera = cameraRef.current;
    const model = modelRef.current;
    if (!camera || !model) return;

    if (!isPlaced) {
      // Tap to place for the first time
      handleScreenTap(touch.clientX, touch.clientY);
      return;
    }

    // Check if touching placed model
    const mouse = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, camera);
    const intersects = raycasterRef.current.intersectObjects(model.children, true);

    if (intersects.length > 0) {
      isDraggingRef.current = true;
    } else {
      // Tapping elsewhere on screen relocates the model to the newly tapped location
      handleScreenTap(touch.clientX, touch.clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !modelRef.current || !cameraRef.current) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const mouse = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    );

    // Raycast to the wall plane to update position in real-world space
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    const intersection = new THREE.Vector3();
    const hit = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersection);

    if (hit) {
      // Glide smoothly across the wall while staying on the floor
      modelRef.current.position.x = intersection.x;
      modelRef.current.position.z = intersection.z;
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Mouse handlers for desktop/laptop pairing tests
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isPlaced) {
      handleScreenTap(e.clientX, e.clientY);
      return;
    }

    const camera = cameraRef.current;
    const model = modelRef.current;
    if (!camera || !model) return;

    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, camera);
    const intersects = raycasterRef.current.intersectObjects(model.children, true);

    if (intersects.length > 0) {
      isDraggingRef.current = true;
    } else {
      handleScreenTap(e.clientX, e.clientY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !modelRef.current || !cameraRef.current) return;
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    const intersection = new THREE.Vector3();
    const hit = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersection);
    if (hit) {
      modelRef.current.position.x = intersection.x;
      modelRef.current.position.z = intersection.z;
    }
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
      {/* 1. Live Camera Feed (100% Full Screen Background) */}
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

      {/* 4. THE ONLY VISIBLE UI CONTROL: Small Circular Product Thumbnail (Bottom Center) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsProductActive((prev) => !prev)}
          className={`relative w-18 h-18 sm:w-20 sm:h-20 rounded-full border-2 ${
            isProductActive ? 'border-[#C5A572] ring-4 ring-[#C5A572]/40' : 'border-white/60'
          } bg-white/95 shadow-2xl p-1 flex items-center justify-center active:scale-90 transition-transform duration-150 focus:outline-none`}
          title="Selected Door/Window Model"
        >
          {modelThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={modelThumbnail}
              alt="Product Thumbnail"
              className="w-full h-full object-contain rounded-full"
            />
          ) : (
            // Elegant Architectural Door Silhouette if thumbnail is loading
            <div className="w-full h-full rounded-full bg-[#FAF7F2] flex items-center justify-center border border-[#C5A572]/30">
              <div className="w-6 h-10 border-2 border-[#202020] rounded-t-sm flex items-center justify-end pr-0.5">
                <div className="w-1 h-1 rounded-full bg-[#C5A572]" />
              </div>
            </div>
          )}

          {/* Golden Active Status Ring */}
          {isProductActive && (
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
