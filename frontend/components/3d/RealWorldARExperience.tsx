'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { X } from 'lucide-react';

interface WebXRNavigator {
  xr?: {
    isSessionSupported: (mode: string) => Promise<boolean>;
    requestSession: (mode: string, options?: unknown) => Promise<XRSession>;
  };
}

interface RealWorldARExperienceProps {
  glbUrl: string;
  usdzUrl?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RealWorldARExperience({
  glbUrl,
  isOpen,
  onClose,
}: RealWorldARExperienceProps) {
  // DOM Refs
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // AR State
  const [isPlaced, setIsPlaced] = useState(false);
  const [isWebXRActive, setIsWebXRActive] = useState(false);

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const placementReticleRef = useRef<THREE.Group | null>(null);

  // WebXR 6DOF ARCore References
  const xrSessionRef = useRef<XRSession | null>(null);
  const xrRefSpaceRef = useRef<XRReferenceSpace | null>(null);
  const xrHitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const latestHitMatrixRef = useRef<Float32Array | null>(null);

  // Fallback Camera Stream & Animation
  const videoStreamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Interactive Drag & Raycast Refs
  const isDraggingRef = useRef(false);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Normalized GLB Model URL
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);

  // Initial reference orientation for smooth rotation offset
  const initialAlphaRef = useRef<number | null>(null);

  // =========================================================================
  // 1. SETUP THREE.JS SCENE & NATURAL ARCHITECTURAL LIGHTING
  // =========================================================================
  const initThreeScene = useCallback(() => {
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Realistic natural lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunLight.position.set(2, 4, 3);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    // Perspective Camera matching mobile camera FOV
    const camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.01,
      40
    );
    camera.position.set(0, 1.4, 0);
    cameraRef.current = camera;

    // Subtle placement reticle indicating detected real-world surface
    const reticleGroup = new THREE.Group();
    reticleGroup.visible = false;

    const ringGeo = new THREE.RingGeometry(0.12, 0.15, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc5a572,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    reticleGroup.add(ringMesh);

    scene.add(reticleGroup);
    placementReticleRef.current = reticleGroup;

    return { scene, camera };
  }, []);

  // =========================================================================
  // 2. LOAD 3D MODEL & CALIBRATE 1:1 REAL-WORLD PHYSICAL SCALE
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

        // Bounding Box calibration: 1 unit = 1 meter in real world
        const box = new THREE.Box3().setFromObject(rawModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        let scaleFactor = 1.0;
        if (size.y > 500) {
          scaleFactor = 0.001; // Model was modeled in millimeters
        } else if (size.y > 30) {
          scaleFactor = 0.01; // Model was modeled in centimeters
        } else {
          scaleFactor = 1.0; // Standard meters
        }

        rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        rawModel.updateMatrixWorld(true);

        // Center Pivot:
        // - X: centered at 0
        // - Y: bottom at 0 (door rests on floor threshold)
        // - Z: back flush with wall surface (Z = 0)
        const calibratedBox = new THREE.Box3().setFromObject(rawModel);
        const calibratedCenter = new THREE.Vector3();
        calibratedBox.getCenter(calibratedCenter);

        rawModel.position.x = -calibratedCenter.x;
        rawModel.position.y = -calibratedBox.min.y;
        rawModel.position.z = -calibratedBox.min.z;

        // Wrap inside anchor group - attached directly to SCENE in WORLD SPACE (never to camera)
        const anchorGroup = new THREE.Group();
        anchorGroup.add(rawModel);
        anchorGroup.visible = false; // Initially hidden until user taps to anchor to wall

        scene.add(anchorGroup);
        modelRef.current = anchorGroup;
      } catch (err: unknown) {
        console.error('Failed to load GLB model for AR:', err);
      }
    },
    [normalizedGlbUrl]
  );

  // =========================================================================
  // 3. WEBXR 6DOF ARCORE WORLD TRACKING SESSION
  // =========================================================================
  const startWebXRSession = useCallback(async () => {
    if (!('xr' in navigator)) return false;
    const xrNav = navigator as unknown as WebXRNavigator;
    if (!xrNav.xr) return false;

    try {
      const supported = await xrNav.xr.isSessionSupported('immersive-ar');
      if (!supported) return false;

      const session = await xrNav.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection'],
        domOverlay: { root: mountRef.current },
      });

      xrSessionRef.current = session;
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.xr.enabled = true;
        await renderer.xr.setSession(session);
      }

      // 6DOF world reference space established by ARCore
      const refSpace = (await session.requestReferenceSpace('local-floor').catch(() =>
        session.requestReferenceSpace('local')
      )) as XRReferenceSpace;
      xrRefSpaceRef.current = refSpace;

      // Hit-test source for real-world surface raycasting
      const viewerSpace = (await session.requestReferenceSpace('viewer')) as XRReferenceSpace;
      const hitTestSource = (await (
        session as unknown as { requestHitTestSource: (opts: unknown) => Promise<XRHitTestSource> }
      ).requestHitTestSource({ space: viewerSpace })) as XRHitTestSource;
      xrHitTestSourceRef.current = hitTestSource;

      setIsWebXRActive(true);

      session.addEventListener('end', () => {
        xrSessionRef.current = null;
        xrHitTestSourceRef.current = null;
        setIsWebXRActive(false);
        onClose();
      });

      return true;
    } catch (err: unknown) {
      console.warn('WebXR 6DOF session failed to initialize:', err);
      return false;
    }
  }, [onClose]);

  // =========================================================================
  // 4. HARDWARE CAMERA FEED WITH TRUE 3D WORLD-SPACE ORIENTATION
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

      // Full 3D orientation tracking for camera in world space
      // When phone rotates left/right (yaw), camera rotates in world space,
      // so the placed door stays anchored to its world coordinates and leaves view naturally.
      const handleOrientation = (e: DeviceOrientationEvent) => {
        if (!cameraRef.current) return;
        if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
          if (initialAlphaRef.current === null) {
            initialAlphaRef.current = e.alpha;
          }
          const degToRad = Math.PI / 180;
          const deltaAlpha = (e.alpha - initialAlphaRef.current) * degToRad;
          const pitch = (e.beta - 90) * degToRad * 0.8;
          const roll = -e.gamma * degToRad * 0.5;

          // Apply rotation in world space (order: YXZ)
          cameraRef.current.rotation.set(pitch, -deltaAlpha, roll, 'YXZ');
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
    if (xrSessionRef.current) {
      xrSessionRef.current.end().catch(() => {});
      xrSessionRef.current = null;
    }
  }, []);

  // =========================================================================
  // 5. TAP TO PLACE 3D MODEL AT REAL WORLD-SPACE LOCATION
  // =========================================================================
  const handlePlaceAtWorldPose = useCallback(
    (worldPosition: THREE.Vector3, worldQuaternion?: THREE.Quaternion) => {
      const model = modelRef.current;
      if (!model) return;

      // Attach model in SCENE WORLD SPACE (completely detached from camera)
      model.position.copy(worldPosition);
      if (worldQuaternion) {
        model.quaternion.copy(worldQuaternion);
      }
      model.visible = true;
      setIsPlaced(true);

      // Hide placement reticle once anchored
      if (placementReticleRef.current) {
        placementReticleRef.current.visible = false;
      }
    },
    []
  );

  const handleScreenTap = useCallback(
    (clientX: number, clientY: number) => {
      const camera = cameraRef.current;
      const model = modelRef.current;
      if (!camera || !model) return;

      // Mode A: WebXR ARCore Hit-Testing (6DOF Real World Anchor)
      if (isWebXRActive && latestHitMatrixRef.current) {
        const matrix = new THREE.Matrix4().fromArray(latestHitMatrixRef.current);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(position, quaternion, scale);

        handlePlaceAtWorldPose(position, quaternion);
        return;
      }

      // Mode B: Raycast against physical floor/wall in 3D world space
      const mouse = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouse, camera);

      // Real-world ground plane at Y = 0 (floor) and vertical wall at Z = -2.5m
      const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.5);
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

      const wallHit = new THREE.Vector3();
      const floorHit = new THREE.Vector3();
      const hitWall = raycasterRef.current.ray.intersectPlane(wallPlane, wallHit);
      const hitFloor = raycasterRef.current.ray.intersectPlane(floorPlane, floorHit);

      if (hitWall) {
        handlePlaceAtWorldPose(new THREE.Vector3(wallHit.x, 0, wallHit.z));
      } else if (hitFloor) {
        handlePlaceAtWorldPose(new THREE.Vector3(floorHit.x, 0, floorHit.z));
      }
    },
    [isWebXRActive, handlePlaceAtWorldPose]
  );

  // =========================================================================
  // 6. TOUCH DRAG-AND-DROP WORLD-SPACE REPOSITIONING
  // =========================================================================
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    const camera = cameraRef.current;
    const model = modelRef.current;
    if (!camera || !model) return;

    if (!isPlaced) {
      handleScreenTap(touch.clientX, touch.clientY);
      return;
    }

    // Check if touching the model to initiate drag
    const mouse = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, camera);
    const intersects = raycasterRef.current.intersectObjects(model.children, true);

    if (intersects.length > 0) {
      isDraggingRef.current = true;
    } else {
      // Tap elsewhere to reposition model
      handleScreenTap(touch.clientX, touch.clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !modelRef.current || !cameraRef.current) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];

    // Mode A: WebXR continuous surface hit-testing during drag
    if (isWebXRActive && latestHitMatrixRef.current) {
      const matrix = new THREE.Matrix4().fromArray(latestHitMatrixRef.current);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);

      modelRef.current.position.copy(position);
      return;
    }

    // Mode B: Raycast along the wall plane in world space
    const mouse = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.5);
    const intersection = new THREE.Vector3();
    const hit = raycasterRef.current.ray.intersectPlane(wallPlane, intersection);

    if (hit) {
      modelRef.current.position.x = intersection.x;
      modelRef.current.position.z = intersection.z;
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Mouse handlers for desktop browser testing
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
    const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.5);
    const intersection = new THREE.Vector3();
    const hit = raycasterRef.current.ray.intersectPlane(wallPlane, intersection);
    if (hit) {
      modelRef.current.position.x = intersection.x;
      modelRef.current.position.z = intersection.z;
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // =========================================================================
  // 7. MAIN RUNTIME RENDER LOOP (WITH ARCORE 6DOF VIEWER TRACKING)
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

    // Load Model
    loadModel(scene);

    // Attempt WebXR 6DOF Session on Android, or start Camera stream
    startWebXRSession().then((webxrStarted) => {
      if (!webxrStarted) {
        startCamera();
      }
    });

    // 6DOF Animation Loop
    const renderLoop = (_time: number, frame?: XRFrame) => {
      if (frame && xrHitTestSourceRef.current && xrRefSpaceRef.current && !isPlaced) {
        const hitResults = frame.getHitTestResults(xrHitTestSourceRef.current);
        if (hitResults.length > 0) {
          const hit = hitResults[0];
          const hitPose = hit.getPose(xrRefSpaceRef.current);
          if (hitPose) {
            latestHitMatrixRef.current = hitPose.transform.matrix;
            if (placementReticleRef.current) {
              placementReticleRef.current.visible = true;
              placementReticleRef.current.matrix.fromArray(hitPose.transform.matrix);
              placementReticleRef.current.matrix.decompose(
                placementReticleRef.current.position,
                placementReticleRef.current.quaternion,
                placementReticleRef.current.scale
              );
            }
          }
        }
      }

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(renderLoop);

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
      renderer.setAnimationLoop(null);
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
  }, [isOpen, initThreeScene, loadModel, startWebXRSession, startCamera, stopCamera, isPlaced]);

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
      {/* 1. Live Camera Feed (100% Full Screen Background when WebXR DOM overlay is inactive) */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
      />

      {/* 2. WebGL 3D Layer (6DOF World Anchoring) */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none" />

      {/* 3. Minimal Discreet Exit Button (Top Right) - The ONLY UI element */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 flex items-center justify-center text-white/80 hover:text-white transition-all shadow-md active:scale-95"
        title="Exit AR"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
