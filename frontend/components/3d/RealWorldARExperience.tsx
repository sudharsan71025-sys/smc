'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import { X, Sparkles } from 'lucide-react';

interface WebXRNavigator {
  xr?: {
    isSessionSupported: (mode: string) => Promise<boolean>;
    requestSession: (mode: string, options?: unknown) => Promise<XRSession>;
  };
}

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
  usdzUrl,
  thumbnailUrl,
  productName,
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
  const [isWebXRActive, setIsWebXRActive] = useState(false);

  // Platform detection
  const isIOS = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  }, []);

  const isAndroid = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /android/i.test(navigator.userAgent);
  }, []);

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

  // Normalized GLB & USDZ Model URLs
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);
  const normalizedUsdzUrl = useMemo(() => normalizeModelUrl(usdzUrl), [usdzUrl]);

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

    // Perspective Camera matching mobile camera FOV
    const camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.01,
      30
    );
    camera.position.set(0, 1.4, 0);
    cameraRef.current = camera;

    // Subtle gold placement reticle indicating detected real-world surface
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
          scaleFactor = 0.001; // Exported in mm
        } else if (size.y > 30) {
          scaleFactor = 0.01; // Exported in cm
        } else {
          scaleFactor = 1.0; // Exported in standard meters
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

        // Wrap inside anchor group - attached directly to SCENE in WORLD SPACE (never to camera)
        const anchorGroup = new THREE.Group();
        anchorGroup.add(rawModel);
        anchorGroup.visible = false; // Initially invisible until user taps a location

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
  // 4. WEBXR 6DOF ARCORE WORLD TRACKING SESSION
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
  // 5. HARDWARE CAMERA FEED (FALLBACK)
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

      // Device motion tracking for camera rotation
      const handleOrientation = (e: DeviceOrientationEvent) => {
        if (!cameraRef.current) return;
        if (e.beta !== null && e.gamma !== null) {
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
    if (xrSessionRef.current) {
      xrSessionRef.current.end().catch(() => {});
      xrSessionRef.current = null;
    }
  }, []);

  // =========================================================================
  // 6. TAP TO PLACE 3D MODEL AT REAL WORLD-SPACE LOCATION
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
  // 7. TOUCH DRAG-AND-DROP WORLD-SPACE REPOSITIONING
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
  // 8. NATIVE PLATFORM LAUNCHERS (100% 6DOF WORLD ANCHORING)
  // =========================================================================
  const handleLaunchNativeAR = () => {
    if (isIOS && normalizedUsdzUrl) {
      // Native Apple ARKit Quick Look (LiDAR & VIO World Anchoring)
      const qlUrl = buildQuickLookUrl({
        usdzUrl: normalizedUsdzUrl,
        canonicalWebPageURL: typeof window !== 'undefined' ? window.location.href : '',
        allowsContentScaling: false,
      });
      const a = document.createElement('a');
      a.setAttribute('rel', 'ar');
      a.setAttribute('href', qlUrl);
      const img = document.createElement('img');
      a.appendChild(img);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (isAndroid && normalizedGlbUrl) {
      // Native Android ARCore Scene Viewer (Physical Wall Anchoring)
      const intentUrl = buildSceneViewerUrl({
        glbUrl: normalizedGlbUrl,
        title: productName,
        linkUrl: typeof window !== 'undefined' ? window.location.href : '',
        mode: 'ar_only',
        resizable: false,
        verticalPlacement: true,
      });
      window.location.href = intentUrl;
    }
  };

  // =========================================================================
  // 9. MAIN RUNTIME RENDER LOOP (WITH ARCORE 6DOF VIEWER TRACKING)
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
      // In WebXR, Three.js camera position & orientation are updated automatically
      // by ARCore's 6DOF tracking (frame.getViewerPose).
      // The model remains fixed at its world-space anchor in scene!
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
      const animId = animationFrameIdRef.current;
      if (animId) {
        cancelAnimationFrame(animId);
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

      {/* 3. Minimal Discreet Exit Button (Top Right) */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 flex items-center justify-center text-white/80 hover:text-white transition-all shadow-md active:scale-95"
        title="Exit AR"
      >
        <X className="w-5 h-5" />
      </button>

      {/* 4. Native ARKit / ARCore One-Tap Pill (Top Left - Discreet) */}
      {((isIOS && normalizedUsdzUrl) || isAndroid) && (
        <button
          type="button"
          onClick={handleLaunchNativeAR}
          className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 text-white/90 text-[11px] font-medium flex items-center space-x-1.5 backdrop-blur-sm shadow-md active:scale-95 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C5A572]" />
          <span>{isIOS ? 'Native Apple ARKit' : 'Native Google ARCore'}</span>
        </button>
      )}

      {/* 5. THE ONLY PROMINENT UI CONTROL: Circular Product Thumbnail (Bottom Center) */}
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
            // Architectural Door Silhouette if thumbnail is loading
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
