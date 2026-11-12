'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { NegotiatedWebXRSession } from '@/utils/webxr-session';
import { X } from 'lucide-react';

interface RealWorldARExperienceProps {
  negotiated: NegotiatedWebXRSession;
  glbUrl: string;
  placementMode?: 'wall' | 'floor';
  onClose: () => void;
}

interface WebXRAnchor {
  anchorSpace: XRSpace;
  delete?: () => void;
}

/**
 * Pure In-Website WebXR 6DoF Real-World Augmented Reality Experience.
 *
 * Implements:
 * 1. 100% Transparent WebGL pipeline for real camera pass-through (Zero Black Screen).
 * 2. Three.js WebXRManager synchronization with negotiated reference space.
 * 3. Surface hit-testing prioritizing vertical wall surfaces for doors/windows.
 * 4. Fallback viewer-space placement if hit-test is unsupported by hardware.
 * 5. World-space 6DoF anchoring and touch-drag repositioning.
 * 6. Minimal discreet close control only.
 */
export function RealWorldARExperience({
  negotiated,
  glbUrl,
  placementMode = 'wall',
  onClose,
}: RealWorldARExperienceProps) {
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

  // WebXR References from Negotiation
  const session = negotiated.session;
  const xrRefSpaceRef = useRef<XRReferenceSpace>(negotiated.referenceSpace);
  const xrHitTestSourceRef = useRef<XRHitTestSource | null>(negotiated.hitTestSource);
  const latestHitPoseRef = useRef<XRPose | null>(null);
  const latestHitResultRef = useRef<XRHitTestResult | null>(null);
  const activeAnchorRef = useRef<WebXRAnchor | null>(null);

  // Touch Drag & Repositioning Refs
  const isDraggingRef = useRef(false);
  const currentWallPlaneRef = useRef<THREE.Plane | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

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

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
    scene.add(camera);
    cameraRef.current = camera;

    // Subtle gold placement reticle indicating detected real-world surface
    const reticleGroup = new THREE.Group();
    reticleGroup.visible = false;
    reticleGroup.matrixAutoUpdate = false;

    // Outer Ring
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

    // Center dot for precision placement
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
          scaleFactor = 0.001; // Model was exported in millimeters
        } else if (size.y > 30) {
          scaleFactor = 0.01; // Model was exported in centimeters
        } else {
          scaleFactor = 1.0; // Standard meters (1 unit = 1 meter)
        }

        rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        rawModel.updateMatrixWorld(true);

        // 2. Calibrate Origin / Pivot:
        // - X: centered at 0
        // - Y: bottom threshold at 0 (door rests on floor)
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
    async (hitPose: XRPose, hitResult?: XRHitTestResult | null) => {
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
        const wallNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(hitQuaternion);
        const forward = new THREE.Vector3(wallNormal.x, 0, wallNormal.z).normalize();

        if (forward.lengthSq() > 0.01) {
          const yaw = Math.atan2(forward.x, forward.z);
          modelGroup.rotation.set(0, yaw, 0);

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
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const dx = camPos.x - hitPosition.x;
        const dz = camPos.z - hitPosition.z;
        const yaw = Math.atan2(dx, dz);
        modelGroup.rotation.set(0, yaw, 0);
        currentWallPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hitPosition.y);
      }

      // Try creating WebXR Anchor where supported
      if (hitResult && 'createAnchor' in hitResult) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anchor = await (hitResult as any).createAnchor();
          if (anchor) {
            activeAnchorRef.current = anchor;
          }
        } catch (anchorErr) {
          console.debug('WebXR anchor creation not supported or failed, using world pose:', anchorErr);
        }
      }

      modelGroup.visible = true;
      setIsPlaced(true);

      if (reticleGroupRef.current) {
        reticleGroupRef.current.visible = false;
      }
    },
    [placementMode]
  );

  // Fallback placement for devices where hit-testing is unavailable
  const placeModelInFrontOfUser = useCallback(() => {
    const modelGroup = modelGroupRef.current;
    const camera = cameraRef.current;
    if (!modelGroup || !camera) return;

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);

    // Place 1.8 meters in front of user, standing on floor
    const placementPos = camPos.clone().add(camDir.multiplyScalar(1.8));
    placementPos.y = 0; // Grounded to floor reference space

    modelGroup.position.copy(placementPos);
    const yaw = Math.atan2(camDir.x, camDir.z);
    modelGroup.rotation.set(0, yaw, 0);

    currentWallPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 0, 1), -placementPos.z);
    modelGroup.visible = true;
    setIsPlaced(true);
  }, []);

  // =========================================================================
  // 4. TOUCH-TO-PLACE & TOUCH DRAG-AND-DROP ON REAL PHYSICAL SURFACE
  // =========================================================================
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    const modelGroup = modelGroupRef.current;
    const camera = cameraRef.current;
    if (!modelGroup || !camera) return;

    // If model is not yet placed, tapping places it
    if (!isPlacedRef.current) {
      if (latestHitPoseRef.current) {
        placeModelAtWorldHit(latestHitPoseRef.current, latestHitResultRef.current);
      } else {
        placeModelInFrontOfUser();
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
      placeModelAtWorldHit(latestHitPoseRef.current, latestHitResultRef.current);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !modelGroupRef.current || !cameraRef.current) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

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

    // 1. Initialize WebGL Renderer with alpha transparency and zero background
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // 100% transparent clear color for camera pass-through
    renderer.autoClear = true;
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    // Synchronize Three.js WebXRManager with negotiated reference space
    renderer.xr.setReferenceSpaceType(negotiated.referenceSpaceType);

    // Keep canvas invisible in 2D DOM so it never blocks the hardware camera compositor
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.style.opacity = '1';
    renderer.domElement.style.zIndex = '0';
    document.body.appendChild(renderer.domElement);

    // Load selected product model
    loadGlbModel(scene);

    let isDisposed = false;

    // Attach WebXR session
    const startXRPipeline = async () => {
      try {
        await renderer.xr.setSession(session);

        // Handle WebXR Select (Tap) Event
        const onSelect = () => {
          if (latestHitPoseRef.current) {
            placeModelAtWorldHit(latestHitPoseRef.current, latestHitResultRef.current);
          } else {
            placeModelInFrontOfUser();
          }
        };
        session.addEventListener('select', onSelect);

        // Handle Session End
        session.addEventListener('end', () => {
          if (!isDisposed) {
            onClose();
          }
        });

        // Main 6DOF Animation Loop
        renderer.setAnimationLoop((_time: number, frame?: XRFrame) => {
          if (isDisposed || !frame) return;

          // Real-World Surface Hit-Testing
          if (xrHitTestSourceRef.current && xrRefSpaceRef.current) {
            const hitResults = frame.getHitTestResults(xrHitTestSourceRef.current);
            if (hitResults.length > 0) {
              const hit = hitResults[0];
              const hitPose = hit.getPose(xrRefSpaceRef.current);
              if (hitPose) {
                latestHitPoseRef.current = hitPose;
                latestHitResultRef.current = hit;

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

          // Update pose from WebXR Anchor if active
          if (
            activeAnchorRef.current &&
            xrRefSpaceRef.current &&
            modelGroupRef.current &&
            !isDraggingRef.current
          ) {
            const anchorPose = frame.getPose(activeAnchorRef.current.anchorSpace, xrRefSpaceRef.current);
            if (anchorPose) {
              modelGroupRef.current.position.set(
                anchorPose.transform.position.x,
                anchorPose.transform.position.y,
                anchorPose.transform.position.z
              );
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const activeHitSource = xrHitTestSourceRef.current;
      if (activeHitSource) {
        activeHitSource.cancel();
      }
      if (renderer.domElement && document.body.contains(renderer.domElement)) {
        document.body.removeChild(renderer.domElement);
      }
      renderer.dispose();
      session.end().catch(() => {});
    };
  }, [
    session,
    negotiated.referenceSpaceType,
    initScene,
    loadGlbModel,
    placeModelAtWorldHit,
    placeModelInFrontOfUser,
    onClose,
  ]);

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
      {/* 
        Minimal Discreet Close Control Only
        The AR screen contains:
        - Full-screen live camera (rendered by WebXR layer underneath)
        - Minimal close control only
        (No product selector circles, badges, scanning labels, or bottom buttons)
      */}
      <button
        type="button"
        onClick={handleExit}
        className="absolute top-5 right-5 z-50 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 border border-white/25 flex items-center justify-center text-white/90 hover:text-white transition-all shadow-lg active:scale-90 pointer-events-auto"
        title="Exit AR"
        aria-label="Exit AR Session"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
