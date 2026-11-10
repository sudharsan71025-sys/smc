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

export function RealWorldARExperience({
  session,
  glbUrl,
  placementMode = 'wall',
  onClose,
}: RealWorldARExperienceProps) {
  // DOM Overlay Container Ref
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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
    sceneRef.current = scene;

    // Realistic ambient and directional lighting for physical room blending
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.8);
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

    // Small center dot for precision aim
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
        console.error('Failed to load GLB model for genuine WebXR AR:', err);
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
        // Vertical Wall Alignment:
        // Extract the surface normal vector from the hit quaternion
        const wallNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(hitQuaternion);

        // If the normal is roughly horizontal (a wall), align door outward along the normal
        // while strictly locking Y-axis straight UP (0, 1, 0).
        const projectedNormal = new THREE.Vector3(wallNormal.x, 0, wallNormal.z).normalize();
        if (projectedNormal.lengthSq() > 0.01) {
          const rotationMatrix = new THREE.Matrix4();
          // Target forward direction points out of wall; up direction is strictly world UP
          rotationMatrix.lookAt(new THREE.Vector3(0, 0, 0), projectedNormal, new THREE.Vector3(0, 1, 0));
          modelGroup.quaternion.setFromRotationMatrix(rotationMatrix);
        } else {
          // Fallback: orient toward camera position projected on horizontal plane
          const camPos = new THREE.Vector3();
          camera.getWorldPosition(camPos);
          const dir = new THREE.Vector3(camPos.x - hitPosition.x, 0, camPos.z - hitPosition.z).normalize();
          modelGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        }

        // Store wall plane in world coordinates for touch dragging
        const wallNormalForPlane = new THREE.Vector3(0, 0, 1).applyQuaternion(modelGroup.quaternion);
        currentWallPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
          wallNormalForPlane,
          hitPosition
        );
      } else {
        // Floor Placement: orient door upright, facing towards camera in horizontal plane
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const lookDir = new THREE.Vector3(camPos.x - hitPosition.x, 0, camPos.z - hitPosition.z).normalize();
        modelGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lookDir);
        currentWallPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hitPosition.y);
      }

      modelGroup.visible = true;
      setIsPlaced(true);

      // Hide placement reticle
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

    // If already placed, check if touching the door model to drag
    const mouse = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, camera);
    const intersects = raycasterRef.current.intersectObjects(modelGroup.children, true);

    if (intersects.length > 0) {
      isDraggingRef.current = true;
    } else if (latestHitPoseRef.current) {
      // Tap elsewhere reposition to the newly hit location
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
      // Slide model along wall surface in world space
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

    const container = canvasContainerRef.current;
    if (!container) return;

    const { scene, camera } = initScene();

    // Initialize WebGL Renderer with alpha transparency for AR camera compositing
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

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
          if (!isPlacedRef.current && latestHitPoseRef.current) {
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

          // Three.js automatically updates the camera's true 6DoF position and orientation
          // from ARCore via renderer.xr.updateCamera(camera)!
          // The model remains locked to its world coordinates in scene.

          // Real-World Surface Hit-Testing:
          if (xrHitTestSourceRef.current && xrRefSpaceRef.current && !isPlacedRef.current) {
            const hitResults = frame.getHitTestResults(xrHitTestSourceRef.current);
            if (hitResults.length > 0) {
              const hit = hitResults[0];
              const hitPose = hit.getPose(xrRefSpaceRef.current);
              if (hitPose) {
                latestHitPoseRef.current = hitPose;
                const reticle = reticleGroupRef.current;
                if (reticle) {
                  reticle.visible = true;
                  reticle.matrix.fromArray(hitPose.transform.matrix);
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
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
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
      className="fixed inset-0 z-50 overflow-hidden select-none touch-none bg-transparent"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. WebGL Three.js Canvas Container (WebXR renders camera in hardware background) */}
      <div ref={canvasContainerRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* 2. Minimal Discreet Close Button (Top Right) - The ONLY visible UI control */}
      <button
        type="button"
        onClick={handleExit}
        className="absolute top-5 right-5 z-50 w-11 h-11 rounded-full bg-black/50 hover:bg-black/75 border border-white/20 flex items-center justify-center text-white/90 hover:text-white transition-all shadow-lg active:scale-90 pointer-events-auto"
        title="Exit AR"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
