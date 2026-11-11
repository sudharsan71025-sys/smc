'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { X } from 'lucide-react';

interface RealWorldARExperienceProps {
  session: XRSession;
  glbUrl: string;
  placementMode?: 'wall' | 'floor';
  onClose: () => void;
}

/**
 * Pure In-Website WebXR 6DoF Real-World Augmented Reality Experience.
 *
 * Renders Three.js directly on top of the native device camera feed.
 * Uses WebXR Hit-Testing to detect physical walls and floors.
 * Anchors the 3D model in scene world space at the exact tapped physical location.
 * When the user rotates or moves the phone, the model remains permanently fixed
 * at that real-world position.
 */
export function RealWorldARExperience({
  session,
  glbUrl,
  placementMode = 'wall',
  onClose,
}: RealWorldARExperienceProps) {
  // DOM References
  const overlayRef = useRef<HTMLDivElement>(null);

  // AR Placement State
  const [isPlaced, setIsPlaced] = useState(false);
  const isPlacedRef = useRef(false);
  isPlacedRef.current = isPlaced;

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const reticleGroupRef = useRef<THREE.Group | null>(null);

  // WebXR References
  const xrRefSpaceRef = useRef<XRReferenceSpace | null>(null);
  const xrHitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const latestHitPoseRef = useRef<XRPose | null>(null);

  // Touch Drag & Repositioning Refs
  const isDraggingRef = useRef(false);
  const currentWallPlaneRef = useRef<THREE.Plane | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Normalized GLB URL
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);

  // =========================================================================
  // 1. SETUP THREE.JS SCENE WITH ARCHITECTURAL LIGHTING
  // =========================================================================
  const initScene = useCallback(() => {
    const scene = new THREE.Scene();
    scene.background = null; // CRITICAL: null background allows camera pass-through
    sceneRef.current = scene;

    // Realistic ambient and directional lighting for physical room blending
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
    sunLight.position.set(1.5, 4, 2.5);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
    fillLight.position.set(-2, 2, 2);
    scene.add(fillLight);

    // Perspective Camera: In WebXR, Three.js updates projection matrix and pose
    // directly from ARCore / device VIO on every frame.
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
    scene.add(camera);
    cameraRef.current = camera;

    // Subtle gold placement reticle indicating detected real-world surface
    const reticleGroup = new THREE.Group();
    reticleGroup.visible = false;
    reticleGroup.matrixAutoUpdate = false;

    // Ring geometry indicating detected plane orientation
    const ringGeo = new THREE.RingGeometry(0.12, 0.15, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc5a572,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    reticleGroup.add(ringMesh);

    // Center dot for precision aim
    const dotGeo = new THREE.CircleGeometry(0.02, 16);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    reticleGroup.add(new THREE.Mesh(dotGeo, dotMat));

    scene.add(reticleGroup);
    reticleGroupRef.current = reticleGroup;

    return { scene, camera };
  }, []);

  // =========================================================================
  // 2. LOAD GLB MODEL & CALIBRATE 1:1 REAL-WORLD SCALE & WALL PIVOT
  // =========================================================================
  const loadGlbModel = useCallback(
    async (scene: THREE.Scene) => {
      if (!normalizedGlbUrl) return;

      const loader = new GLTFLoader();
      try {
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(normalizedGlbUrl, resolve, undefined, reject);
        });

        const rawModel = gltf.scene;

        // 1. Calculate Bounding Box to calibrate 1:1 real-world physical scale
        const box = new THREE.Box3().setFromObject(rawModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        let scaleFactor = 1.0;
        if (size.y > 500) {
          scaleFactor = 0.001; // Model was exported in millimeters (CAD / Blender)
        } else if (size.y > 30) {
          scaleFactor = 0.01; // Model was exported in centimeters
        } else {
          scaleFactor = 1.0; // Standard meters (1 unit = 1 meter)
        }

        rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        rawModel.updateMatrixWorld(true);

        // 2. Calibrate Origin / Pivot:
        // - X: centered at 0
        // - Y: bottom threshold at 0 (door rests on floor threshold)
        // - Z: back of door frame flush with wall at Z = 0
        const calibratedBox = new THREE.Box3().setFromObject(rawModel);
        const calibratedCenter = new THREE.Vector3();
        calibratedBox.getCenter(calibratedCenter);

        rawModel.position.x = -calibratedCenter.x;
        rawModel.position.y = -calibratedBox.min.y;
        rawModel.position.z = -calibratedBox.min.z;

        // 3. World Anchor Group: Direct child of scene (never child of camera)
        const anchorGroup = new THREE.Group();
        anchorGroup.add(rawModel);
        anchorGroup.visible = false; // Hidden until user taps a real physical surface

        scene.add(anchorGroup);
        modelGroupRef.current = anchorGroup;
      } catch (err: unknown) {
        console.error('Failed to load GLB model for WebXR AR:', err);
      }
    },
    [normalizedGlbUrl]
  );

  // =========================================================================
  // 3. PLACE MODEL AT REAL WORLD-SPACE HIT POSE (100% WORLD ANCHORED)
  // =========================================================================
  const placeModelAtWorldHit = useCallback(
    (hitPose: XRPose) => {
      const modelGroup = modelGroupRef.current;
      const camera = cameraRef.current;
      if (!modelGroup || !camera) return;

      const hitMatrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
      const hitPosition = new THREE.Vector3();
      const hitQuaternion = new THREE.Quaternion();
      const hitScale = new THREE.Vector3();
      hitMatrix.decompose(hitPosition, hitQuaternion, hitScale);

      // Attach model in SCENE WORLD SPACE at the real-world hit location
      modelGroup.position.copy(hitPosition);

      if (placementMode === 'wall') {
        // In WebXR hit-testing, the surface normal points along the +Z axis of the hit pose
        const wallNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(hitQuaternion);

        // Project normal onto horizontal XZ plane to extract wall yaw
        const forward = new THREE.Vector3(wallNormal.x, 0, wallNormal.z).normalize();

        if (forward.lengthSq() > 0.01) {
          // Lock Pitch (X = 0) and Roll (Z = 0) to ensure the door stands 100% upright against the wall
          const yaw = Math.atan2(forward.x, forward.z);
          modelGroup.rotation.set(0, yaw, 0);

          // Configure mathematical plane for subsequent touch drag repositioning
          currentWallPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
            forward,
            hitPosition
          );
        } else {
          modelGroup.rotation.set(0, 0, 0);
          currentWallPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
            new THREE.Vector3(0, 0, 1),
            hitPosition
          );
        }
      } else {
        // Floor placement: face camera horizontally
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const dx = camPos.x - hitPosition.x;
        const dz = camPos.z - hitPosition.z;
        const yaw = Math.atan2(dx, dz);
        modelGroup.rotation.set(0, yaw, 0);
        currentWallPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hitPosition.y);
      }

      modelGroup.visible = true;
      setIsPlaced(true);

      // Hide placement reticle once anchored
      if (reticleGroupRef.current) {
        reticleGroupRef.current.visible = false;
      }
    },
    [placementMode]
  );

  // =========================================================================
  // 4. TOUCH-TO-PLACE & TOUCH DRAG-AND-DROP ON REAL PHYSICAL SURFACE
  // =========================================================================
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    const modelGroup = modelGroupRef.current;
    const camera = cameraRef.current;
    if (!modelGroup || !camera) return;

    // If model is not yet placed, tapping places it at current hit pose
    if (!isPlacedRef.current) {
      if (latestHitPoseRef.current) {
        placeModelAtWorldHit(latestHitPoseRef.current);
      }
      return;
    }

    // If already placed, check if touching near the door model to drag
    const mouse = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, camera);
    const intersects = raycasterRef.current.intersectObjects(modelGroup.children, true);

    if (intersects.length > 0) {
      isDraggingRef.current = true;
    } else if (latestHitPoseRef.current) {
      // Tap elsewhere repositions the door to the newly hit real location
      placeModelAtWorldHit(latestHitPoseRef.current);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !modelGroupRef.current || !cameraRef.current) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    // Raycast touch ray against the real-world wall plane in world coordinates
    const wallPlane = currentWallPlaneRef.current;
    if (!wallPlane) return;

    const mouse = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);

    const intersection = new THREE.Vector3();
    const hit = raycasterRef.current.ray.intersectPlane(wallPlane, intersection);
    if (hit) {
      // Slide model along wall surface in 6DoF world space
      modelGroupRef.current.position.copy(intersection);
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // =========================================================================
  // 5. GENUINE WEBXR 6DOF AR ENGINE & RENDER LOOP
  // =========================================================================
  useEffect(() => {
    if (!session) return;

    const { scene, camera } = initScene();

    // Initialize WebGL Renderer with alpha transparency for camera compositing
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // CRITICAL: 100% transparent clear color for camera pass-through
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    // Attach canvas to document.body OUTSIDE the domOverlay root.
    // In W3C WebXR, canvas inside domOverlay blocks camera pass-through!
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.style.zIndex = '0';
    document.body.appendChild(renderer.domElement);

    // Load selected product model
    loadGlbModel(scene);

    let isDisposed = false;

    // Attach WebXR session and establish real-world reference spaces
    const startXRPipeline = async () => {
      try {
        await renderer.xr.setSession(session);

        // 1. Establish 6DOF World Reference Space (local-floor puts origin at physical floor)
        const refSpace = (await session.requestReferenceSpace('local-floor').catch(() =>
          session.requestReferenceSpace('local')
        )) as XRReferenceSpace;
        xrRefSpaceRef.current = refSpace;

        // 2. Establish Real-World Surface Raycasting (Hit-Test Source)
        const viewerSpace = (await session.requestReferenceSpace('viewer')) as XRReferenceSpace;
        const hitTestSource = (await (
          session as unknown as { requestHitTestSource: (opts: unknown) => Promise<XRHitTestSource> }
        ).requestHitTestSource({ space: viewerSpace })) as XRHitTestSource;
        xrHitTestSourceRef.current = hitTestSource;

        // 3. Handle WebXR Select (Tap) Event
        const onSelect = () => {
          if (latestHitPoseRef.current) {
            placeModelAtWorldHit(latestHitPoseRef.current);
          }
        };
        session.addEventListener('select', onSelect);

        // 4. Handle Session End
        session.addEventListener('end', () => {
          if (!isDisposed) {
            onClose();
          }
        });

        // 5. Main 6DOF Animation Loop
        renderer.setAnimationLoop((_time: number, frame?: XRFrame) => {
          if (isDisposed || !frame) return;

          // Real-World Surface Hit-Testing:
          if (xrHitTestSourceRef.current && xrRefSpaceRef.current) {
            const hitResults = frame.getHitTestResults(xrHitTestSourceRef.current);
            if (hitResults.length > 0) {
              const hit = hitResults[0];
              const hitPose = hit.getPose(xrRefSpaceRef.current);
              if (hitPose) {
                latestHitPoseRef.current = hitPose;

                // Show reticle only before the door is placed
                if (reticleGroupRef.current) {
                  reticleGroupRef.current.visible = !isPlacedRef.current;
                  reticleGroupRef.current.matrix.fromArray(hitPose.transform.matrix);
                }
              }
            } else {
              if (reticleGroupRef.current) {
                reticleGroupRef.current.visible = false;
              }
            }
          }

          renderer.render(scene, camera);
        });
      } catch (err: unknown) {
        console.error('Failed to initialize WebXR pipeline:', err);
      }
    };

    startXRPipeline();

    return () => {
      isDisposed = true;
      renderer.setAnimationLoop(null);
      if (xrHitTestSourceRef.current) {
        xrHitTestSourceRef.current.cancel();
      }
      if (renderer.domElement && document.body.contains(renderer.domElement)) {
        document.body.removeChild(renderer.domElement);
      }
      renderer.dispose();
      session.end().catch(() => {});
    };
  }, [session, initScene, loadGlbModel, placeModelAtWorldHit, onClose]);

  // Clean exit handler
  const handleExit = () => {
    session.end().catch(() => {});
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      style={{ backgroundColor: 'transparent' }}
      className="fixed inset-0 z-50 overflow-hidden select-none touch-none bg-transparent pointer-events-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Minimal Discreet Close Button (Top Right) */}
      <button
        type="button"
        onClick={handleExit}
        className="absolute top-5 right-5 z-50 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 border border-white/25 flex items-center justify-center text-white/90 hover:text-white transition-all shadow-lg active:scale-90 pointer-events-auto"
        title="Exit AR"
        aria-label="Exit AR Session"
      >
        <X className="w-5 h-5" />
      </button>

      {/* 2. Surface Guidance Pill */}
      {!isPlaced && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none px-4 py-2 rounded-full bg-black/60 border border-white/20 text-white/90 text-xs tracking-wider uppercase font-medium shadow-md backdrop-blur-sm">
          Aim camera at a wall and tap to place
        </div>
      )}
    </div>
  );
}
