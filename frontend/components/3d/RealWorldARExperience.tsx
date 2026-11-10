'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeModelUrl } from '@/lib/api-url';
import { buildSceneViewerUrl, buildQuickLookUrl } from '@/utils/3d-helpers';
import { Button } from '@/components/ui/button';
import {
  RotateCcw,
  Scan,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface WebXRNavigator {
  xr?: {
    isSessionSupported: (mode: string) => Promise<boolean>;
    requestSession: (mode: string, options?: unknown) => Promise<XRSession>;
  };
}

interface RealWorldARExperienceProps {
  glbUrl: string;
  usdzUrl?: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  initialPlacementMode?: 'wall' | 'floor';
}

type SurfaceType = 'none' | 'wall' | 'floor';
type ARMode = 'webxr' | 'camera_video';

interface ModelDimensions {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  originalScale: number;
}

export function RealWorldARExperience({
  glbUrl,
  usdzUrl,
  productName,
  isOpen,
  onClose,
  initialPlacementMode = 'wall',
}: RealWorldARExperienceProps) {
  // Container & Canvas refs
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // AR Engine state
  const [activeMode, setActiveMode] = useState<ARMode>('camera_video');
  const [isWebXRSupported, setIsWebXRSupported] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Surface detection & placement state
  const [detectedSurface, setDetectedSurface] = useState<SurfaceType>(initialPlacementMode);
  const [isPlaced, setIsPlaced] = useState(false);
  const [guidanceMessage, setGuidanceMessage] = useState(
    'Point your camera at a well-lit wall and move slowly to scan the surface.'
  );

  // 3D Model dimensions & measurement
  const [dimensions, setDimensions] = useState<ModelDimensions>({
    widthCm: 100,
    heightCm: 210,
    depthCm: 10,
    originalScale: 1,
  });

  // Interactive adjustment controls
  const [activeTab, setActiveTab] = useState<'position' | 'rotate' | 'calibrate'>('position');
  const [elevationCm, setElevationCm] = useState(0); // Height above floor (0 for doors, ~90 for windows)
  const [yawRotationDeg, setYawRotationDeg] = useState(0);

  // 4-Corner Opening Calibration Mode
  const [isCalibratingOpening, setIsCalibratingOpening] = useState(false);
  const [openingWidthCm, setOpeningWidthCm] = useState(100);
  const [openingHeightCm, setOpeningHeightCm] = useState(210);

  // Internal Three.js scene references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const reticleRef = useRef<THREE.Group | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const xrRefSpaceRef = useRef<XRReferenceSpace | null>(null);
  const xrHitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // Orientation sensor state for Camera Video AR
  const deviceOrientationRef = useRef<{ beta: number; gamma: number }>({ beta: 90, gamma: 0 });

  // Normalized URLs
  const normalizedGlbUrl = useMemo(() => normalizeModelUrl(glbUrl), [glbUrl]);
  const normalizedUsdzUrl = useMemo(() => normalizeModelUrl(usdzUrl), [usdzUrl]);

  // Check WebXR capabilities
  useEffect(() => {
    if (typeof window !== 'undefined' && 'xr' in navigator) {
      const xrNav = navigator as unknown as WebXRNavigator;
      if (xrNav.xr) {
        xrNav.xr
          .isSessionSupported('immersive-ar')
          .then((supported: boolean) => {
            setIsWebXRSupported(supported);
            if (supported) {
              setActiveMode('webxr');
            }
          })
          .catch(() => {
            setIsWebXRSupported(false);
          });
      }
    }
  }, []);

  // =========================================================================
  // 1. SETUP THREE.JS SCENE & RETICLE
  // =========================================================================
  const initScene = useCallback(() => {
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Realistic architectural lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(2, 4, 3);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xd4af37, 0.4); // Subtle gold bounce
    fillLight.position.set(-2, 1, 1);
    scene.add(fillLight);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    camera.position.set(0, 1.4, 0);
    cameraRef.current = camera;

    // Build Luxury Surface Reticle
    const reticleGroup = new THREE.Group();
    reticleGroup.visible = false;

    // Outer ring
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

    // Inner crosshair / center point
    const centerGeo = new THREE.CircleGeometry(0.02, 16);
    centerGeo.rotateX(-Math.PI / 2);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0x202020 });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    reticleGroup.add(centerMesh);

    // Direction indicator pointer (shows which way the door faces)
    const pointerGeo = new THREE.ConeGeometry(0.025, 0.08, 16);
    pointerGeo.rotateX(Math.PI / 2);
    pointerGeo.translate(0, 0, -0.2);
    const pointerMat = new THREE.MeshBasicMaterial({ color: 0xc5a572 });
    const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
    reticleGroup.add(pointerMesh);

    scene.add(reticleGroup);
    reticleRef.current = reticleGroup;

    return { scene, camera };
  }, []);

  // =========================================================================
  // 2. LOAD 3D MODEL & CALCULATE REAL-WORLD SCALE
  // =========================================================================
  const load3DModel = useCallback(
    async (scene: THREE.Scene) => {
      if (!normalizedGlbUrl) return;

      const loader = new GLTFLoader();
      try {
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(normalizedGlbUrl, resolve, undefined, reject);
        });

        const rawModel = gltf.scene;
        rawModel.visible = false;

        // Measure raw bounding box
        const rawBox = new THREE.Box3().setFromObject(rawModel);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);

        // Normalize unit: detect if model is in mm, cm, or meters
        let scaleFactor = 1.0;
        if (rawSize.y > 500) {
          // Model was exported in millimeters (e.g., 2100mm)
          scaleFactor = 0.001;
        } else if (rawSize.y > 30) {
          // Model was exported in centimeters (e.g., 210cm)
          scaleFactor = 0.01;
        } else {
          // Model was exported in standard meters (e.g., 2.1m)
          scaleFactor = 1.0;
        }

        // Apply scale so 1 Three.js unit = 1 real-world meter
        rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        rawModel.updateMatrixWorld(true);

        // Recompute measured dimensions after normalization
        const calibratedBox = new THREE.Box3().setFromObject(rawModel);
        const calibratedSize = new THREE.Vector3();
        calibratedBox.getSize(calibratedSize);
        const calibratedCenter = new THREE.Vector3();
        calibratedBox.getCenter(calibratedCenter);

        const measuredWidthCm = Math.round(calibratedSize.x * 100);
        const measuredHeightCm = Math.round(calibratedSize.y * 100);
        const measuredDepthCm = Math.round(calibratedSize.z * 100);

        setDimensions({
          widthCm: measuredWidthCm || 100,
          heightCm: measuredHeightCm || 210,
          depthCm: measuredDepthCm || 10,
          originalScale: scaleFactor,
        });

        setOpeningWidthCm(measuredWidthCm || 100);
        setOpeningHeightCm(measuredHeightCm || 210);

        // Center pivot so:
        // - X: centered (0)
        // - Y: bottom at 0 (so door sits flush on floor/threshold)
        // - Z: back flush with wall surface (so frame mounts cleanly against wall)
        rawModel.position.x = -calibratedCenter.x;
        rawModel.position.y = -calibratedBox.min.y;
        rawModel.position.z = -calibratedBox.min.z;

        // Wrap inside an anchor group for stable transformations
        const anchorGroup = new THREE.Group();
        anchorGroup.add(rawModel);
        anchorGroup.visible = false;

        scene.add(anchorGroup);
        modelRef.current = anchorGroup;
      } catch (err: unknown) {
        console.error('Failed to load 3D GLB model for AR:', err);
        setErrorMessage(
          'Failed to load the 3D model for AR view. Verify the GLB file exists and is accessible.'
        );
      }
    },
    [normalizedGlbUrl]
  );

  // =========================================================================
  // 3. CAMERA VIDEO STREAM (Fallback for iOS Safari & non-WebXR mobile)
  // =========================================================================
  const startCameraVideo = useCallback(async () => {
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

      // Listen for gyroscope / orientation to align with wall pitch
      const handleOrientation = (e: DeviceOrientationEvent) => {
        if (e.beta !== null && e.gamma !== null) {
          deviceOrientationRef.current = { beta: e.beta, gamma: e.gamma };
        }
      };
      window.addEventListener('deviceorientation', handleOrientation);

      setGuidanceMessage('Scanning wall surface... Aim your phone at the target wall.');
      setDetectedSurface('wall');
    } catch (err: unknown) {
      console.warn('Camera access denied or unavailable:', err);
      setErrorMessage(
        'Camera permission was denied or camera is unavailable. Please allow camera access in your browser settings to preview in AR.'
      );
    }
  }, []);

  const stopCameraVideo = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
  }, []);

  // =========================================================================
  // 4. WEBXR IMMERSIVE-AR ENGINE (Android Chrome)
  // =========================================================================
  const startWebXRSession = useCallback(async () => {
    if (!('xr' in navigator)) return;
    const xrNav = navigator as unknown as WebXRNavigator;
    if (!xrNav.xr) return;

    try {
      const session = await xrNav.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection', 'light-estimation'],
        domOverlay: { root: mountRef.current },
      });

      xrSessionRef.current = session;
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.xr.enabled = true;
        await renderer.xr.setSession(session);
      }

      const refSpace = await session.requestReferenceSpace('viewer');
      const hitTestSource = (await (session as unknown as { requestHitTestSource: (opts: unknown) => Promise<XRHitTestSource> }).requestHitTestSource({ space: refSpace })) as XRHitTestSource;
      xrHitTestSourceRef.current = hitTestSource;

      const localRefSpace = await session.requestReferenceSpace('local');
      xrRefSpaceRef.current = localRefSpace;

      session.addEventListener('end', () => {
        xrSessionRef.current = null;
        xrHitTestSourceRef.current = null;
        onClose();
      });

      setGuidanceMessage('Move your phone slowly across the wall to detect installation planes.');
    } catch (err: unknown) {
      console.warn('WebXR session failed, falling back to Camera Video mode:', err);
      setActiveMode('camera_video');
      await startCameraVideo();
    }
  }, [onClose, startCameraVideo]);

  // =========================================================================
  // 5. MAIN RENDER LOOP & REAL-TIME SURFACE HIT TESTING
  // =========================================================================
  useEffect(() => {
    if (!isOpen) return;

    const container = mountRef.current;
    if (!container) return;

    const { scene, camera } = initScene();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Load Model
    load3DModel(scene);

    // Initialize Mode
    if (activeMode === 'webxr' && isWebXRSupported) {
      startWebXRSession();
    } else {
      startCameraVideo();
    }

    // Animation & Raycast Loop
    const renderLoop = (_time: number, frame?: XRFrame) => {
      // Mode A: WebXR Hit Testing
      if (frame && xrHitTestSourceRef.current && xrRefSpaceRef.current && !isPlaced) {
        const hitTestResults = frame.getHitTestResults(xrHitTestSourceRef.current);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const hitPose = hit.getPose(xrRefSpaceRef.current);

          if (hitPose && reticleRef.current) {
            reticleRef.current.visible = true;
            reticleRef.current.matrix.fromArray(hitPose.transform.matrix);
            reticleRef.current.matrix.decompose(
              reticleRef.current.position,
              reticleRef.current.quaternion,
              reticleRef.current.scale
            );

            // Extract normal vector from orientation matrix (col 1: Y, col 2: Z)
            const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(
              reticleRef.current.quaternion
            );

            if (Math.abs(normal.y) < 0.5) {
              setDetectedSurface('wall');
              setGuidanceMessage('Vertical Wall Detected. Tap "Place on Wall" to position.');
            } else {
              setDetectedSurface('floor');
              setGuidanceMessage('Floor Detected. Aim towards wall for vertical door placement.');
            }
          }
        } else {
          if (reticleRef.current) reticleRef.current.visible = false;
          setDetectedSurface('none');
        }
      }

      // Mode B: Camera Video Raycasting (for iOS Safari & universal mobile)
      if (activeMode === 'camera_video' && reticleRef.current && !isPlaced) {
        reticleRef.current.visible = true;
        // Position reticle on virtual wall 2.0m in front of camera
        reticleRef.current.position.set(0, 1.4, -2.0);
        reticleRef.current.rotation.set(0, 0, 0); // Vertical plane orientation
        setDetectedSurface('wall');
        setGuidanceMessage('Wall Plane Calibrated. Tap "Place on Wall" to anchor the model.');
      }

      renderer.render(scene, camera);
    };

    if (activeMode === 'webxr') {
      renderer.setAnimationLoop(renderLoop);
    } else {
      const loop = () => {
        renderLoop(performance.now());
        animationFrameIdRef.current = requestAnimationFrame(loop);
      };
      loop();
    }

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
      stopCameraVideo();
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (rendererRef.current.domElement && container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, [
    isOpen,
    activeMode,
    isWebXRSupported,
    initScene,
    load3DModel,
    startWebXRSession,
    startCameraVideo,
    stopCameraVideo,
    isPlaced,
  ]);

  // =========================================================================
  // 6. MODEL PLACEMENT & ANCHORING
  // =========================================================================
  const handlePlaceModel = useCallback(() => {
    if (!reticleRef.current || !modelRef.current) return;

    // Anchor model at reticle's current position and rotation
    modelRef.current.position.copy(reticleRef.current.position);
    modelRef.current.quaternion.copy(reticleRef.current.quaternion);

    // Apply elevation offset
    modelRef.current.position.y += elevationCm / 100;

    modelRef.current.visible = true;
    setIsPlaced(true);
    reticleRef.current.visible = false;

    setGuidanceMessage(
      'Model anchored to wall. Use the controls below to nudge, rotate, or calibrate opening.'
    );
  }, [elevationCm]);

  // =========================================================================
  // 7. REAL-WORLD POSITION & ROTATION ADJUSTMENTS
  // =========================================================================
  const handleNudge = useCallback((axis: 'x' | 'y' | 'z', amountMeters: number) => {
    if (!modelRef.current) return;
    if (axis === 'x') modelRef.current.position.x += amountMeters;
    if (axis === 'y') modelRef.current.position.y += amountMeters;
    if (axis === 'z') modelRef.current.position.z += amountMeters;
  }, []);

  const handleRotate = useCallback((degrees: number) => {
    if (!modelRef.current) return;
    setYawRotationDeg((prev) => {
      const next = (prev + degrees) % 360;
      modelRef.current!.rotation.y = (next * Math.PI) / 180;
      return next;
    });
  }, []);

  const handleElevationChange = useCallback((cm: number) => {
    setElevationCm(cm);
    if (modelRef.current && reticleRef.current) {
      modelRef.current.position.y = reticleRef.current.position.y + cm / 100;
    }
  }, []);

  const handleResetPosition = useCallback(() => {
    setIsPlaced(false);
    if (modelRef.current) modelRef.current.visible = false;
    if (reticleRef.current) reticleRef.current.visible = true;
    setElevationCm(0);
    setYawRotationDeg(0);
    setGuidanceMessage('Scanning wall surface... Aim your phone at the target wall.');
  }, []);

  // =========================================================================
  // 8. 4-CORNER / BOUNDARY OPENING CALIBRATION
  // =========================================================================
  const handleApplyOpeningFit = useCallback(() => {
    if (!modelRef.current) return;

    // Compute scale ratio based on measured real-world dimensions
    const scaleX = openingWidthCm / dimensions.widthCm;
    const scaleY = openingHeightCm / dimensions.heightCm;

    modelRef.current.scale.set(scaleX, scaleY, 1.0);
    setIsCalibratingOpening(false);
    setGuidanceMessage(
      `Model aligned to opening: ${openingWidthCm} cm (W) × ${openingHeightCm} cm (H).`
    );
  }, [openingWidthCm, openingHeightCm, dimensions]);

  // External Scene Viewer launch fallback
  const handleLaunchSceneViewer = () => {
    const intentUrl = buildSceneViewerUrl({
      glbUrl: normalizedGlbUrl,
      title: productName,
      linkUrl: typeof window !== 'undefined' ? window.location.href : '',
      resizable: false,
      verticalPlacement: true,
    });
    window.location.href = intentUrl;
  };

  // External Apple Quick Look launch fallback
  const handleLaunchQuickLook = () => {
    if (!normalizedUsdzUrl) return;
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#151515] text-[#202020] flex flex-col overflow-hidden select-none">
      {/* 1. Camera Video Feed (Active in Camera Video Mode) */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
      />

      {/* 2. WebGL 3D Layer */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-10 touch-none" />

      {/* 3. Top Architectural HUD Header */}
      <div className="relative z-20 flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent text-white">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#C5A572] animate-pulse" />
          <div className="leading-tight">
            <span className="text-[10px] uppercase tracking-widest text-[#C5A572] font-semibold block">
              Real-World AR Placement
            </span>
            <h2 className="text-xs sm:text-sm font-medium truncate max-w-[200px] sm:max-w-xs">
              {productName}
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Surface Indicator Pill */}
          <span
            className={`text-[10px] uppercase font-semibold px-2 py-0.5 border ${
              detectedSurface === 'wall'
                ? 'bg-[#C5A572]/20 border-[#C5A572] text-[#C5A572]'
                : detectedSurface === 'floor'
                ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                : 'bg-white/10 border-white/20 text-white/70'
            }`}
          >
            {detectedSurface === 'wall'
              ? 'Wall Detected'
              : detectedSurface === 'floor'
              ? 'Floor Detected'
              : 'Scanning...'}
          </span>

          {/* Exit AR Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors"
            title="Exit AR"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. Real-World Guidance Banner */}
      <div className="relative z-20 px-4 py-1.5 flex justify-center">
        <div className="bg-black/75 backdrop-blur-md border border-[#C5A572]/40 text-white px-3.5 py-1.5 rounded-full shadow-lg max-w-md flex items-center space-x-2 text-center animate-fade-in">
          {isPlaced ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#C5A572] flex-shrink-0" />
          ) : (
            <Scan className="w-3.5 h-3.5 text-[#C5A572] animate-spin flex-shrink-0" />
          )}
          <span className="text-[11px] sm:text-xs font-medium text-[#FAF7F2]">
            {guidanceMessage}
          </span>
        </div>
      </div>

      {/* 5. 4-Corner Opening Calibration Overlay */}
      {isCalibratingOpening && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-6">
          <div className="relative w-64 sm:w-80 h-96 sm:h-[480px] border-2 border-dashed border-[#C5A572] bg-[#C5A572]/5 pointer-events-auto flex flex-col justify-between p-3 shadow-2xl">
            {/* Corner Indicators */}
            <div className="absolute -top-2 -left-2 w-4 h-4 bg-[#C5A572] border-2 border-white" />
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-[#C5A572] border-2 border-white" />
            <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-[#C5A572] border-2 border-white" />
            <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#C5A572] border-2 border-white" />

            <div className="text-center bg-black/80 text-white p-2 border border-[#C5A572]/40">
              <span className="text-[10px] uppercase tracking-wider text-[#C5A572] block font-semibold">
                Wall Opening Boundary
              </span>
              <p className="text-xs font-bold text-white">
                {openingWidthCm} cm × {openingHeightCm} cm
              </p>
            </div>

            {/* Dimension Sliders */}
            <div className="space-y-3 bg-black/85 text-white p-3 border border-white/10 text-xs">
              <div>
                <div className="flex justify-between pb-1 text-[11px]">
                  <span>Opening Width:</span>
                  <span className="font-bold text-[#C5A572]">{openingWidthCm} cm</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={240}
                  value={openingWidthCm}
                  onChange={(e) => setOpeningWidthCm(Number(e.target.value))}
                  className="w-full accent-[#C5A572]"
                />
              </div>

              <div>
                <div className="flex justify-between pb-1 text-[11px]">
                  <span>Opening Height:</span>
                  <span className="font-bold text-[#C5A572]">{openingHeightCm} cm</span>
                </div>
                <input
                  type="range"
                  min={120}
                  max={300}
                  value={openingHeightCm}
                  onChange={(e) => setOpeningHeightCm(Number(e.target.value))}
                  className="w-full accent-[#C5A572]"
                />
              </div>

              <div className="flex space-x-2 pt-1">
                <Button
                  variant="gold"
                  size="sm"
                  onClick={handleApplyOpeningFit}
                  className="w-full text-xs font-semibold uppercase tracking-wider"
                >
                  Snap Model to Opening
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCalibratingOpening(false)}
                  className="w-1/3 text-xs bg-white text-black"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Bottom Placement & Alignment Controls Panel */}
      <div className="mt-auto relative z-20 bg-white/95 backdrop-blur-md border-t border-border shadow-2xl p-3 sm:p-4 text-[#202020] space-y-3">
        {/* Real Dimensions Readout */}
        <div className="flex items-center justify-between text-[11px] text-secondary border-b border-border/50 pb-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-foreground">Manufactured 1:1 Scale:</span>
            <span>
              {dimensions.widthCm}cm (W) × {dimensions.heightCm}cm (H) × {dimensions.depthCm}cm (D)
            </span>
          </div>

          <div className="flex items-center space-x-1">
            {/* Quick external platform links */}
            {normalizedUsdzUrl && (
              <button
                type="button"
                onClick={handleLaunchQuickLook}
                className="text-[10px] text-[#C5A572] font-semibold underline hover:text-black"
              >
                Apple Quick Look
              </button>
            )}
            {activeMode === 'webxr' && (
              <button
                type="button"
                onClick={handleLaunchSceneViewer}
                className="text-[10px] text-secondary hover:text-foreground pl-2"
              >
                Scene Viewer
              </button>
            )}
          </div>
        </div>

        {/* Primary Action Button (Place vs Position) */}
        {!isPlaced ? (
          <div className="flex space-x-2">
            <Button
              variant="gold"
              size="lg"
              onClick={handlePlaceModel}
              disabled={detectedSurface === 'none'}
              className="w-full h-12 text-xs uppercase tracking-wider font-semibold shadow-md flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Place on Real Wall</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Control Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-muted/40 p-1 border border-border text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('position')}
                className={`py-1.5 text-center font-medium transition-colors ${
                  activeTab === 'position'
                    ? 'bg-white shadow-sm font-semibold text-foreground border border-border'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Position & Height
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rotate')}
                className={`py-1.5 text-center font-medium transition-colors ${
                  activeTab === 'rotate'
                    ? 'bg-white shadow-sm font-semibold text-foreground border border-border'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Rotation
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('calibrate');
                  setIsCalibratingOpening(true);
                }}
                className={`py-1.5 text-center font-medium transition-colors ${
                  activeTab === 'calibrate'
                    ? 'bg-white shadow-sm font-semibold text-[#C5A572] border border-border'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Fit Opening (4-Corner)
              </button>
            </div>

            {/* TAB 1: Position & Height Offset */}
            {activeTab === 'position' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary font-medium">Floor Clearance / Window Elevation:</span>
                  <span className="font-bold text-foreground">{elevationCm} cm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={elevationCm}
                  onChange={(e) => handleElevationChange(Number(e.target.value))}
                  className="w-full accent-[#C5A572]"
                />

                {/* Nudge D-Pad */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-secondary">Fine-tune along wall:</span>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNudge('x', -0.02)}
                      className="h-8 px-2"
                      title="Move Left 2cm"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNudge('y', 0.02)}
                      className="h-8 px-2"
                      title="Move Up 2cm"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNudge('y', -0.02)}
                      className="h-8 px-2"
                      title="Move Down 2cm"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNudge('x', 0.02)}
                      className="h-8 px-2"
                      title="Move Right 2cm"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Rotation */}
            {activeTab === 'rotate' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary font-medium">Wall Alignment Angle:</span>
                  <span className="font-bold text-foreground">{yawRotationDeg}°</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotate(-90)}
                    className="text-xs"
                  >
                    -90°
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotate(-15)}
                    className="text-xs"
                  >
                    -15°
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotate(15)}
                    className="text-xs"
                  >
                    +15°
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotate(90)}
                    className="text-xs"
                  >
                    +90°
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 3: Fit Opening Mode Trigger */}
            {activeTab === 'calibrate' && (
              <div className="p-2.5 bg-[#FAF7F2] border border-[#C5A572]/40 text-xs text-[#202020] space-y-2">
                <p className="font-semibold text-[11px] text-[#C5A572] uppercase tracking-wider">
                  Architectural Opening Fitting Active
                </p>
                <p className="text-[11px] text-secondary leading-relaxed">
                  The dashed frame on screen outlines your target opening. Adjust width and height to match your physical doorway or window rough opening.
                </p>
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => setIsCalibratingOpening(true)}
                  className="w-full text-xs uppercase"
                >
                  Adjust Boundary Corners
                </Button>
              </div>
            )}

            {/* Global Actions Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetPosition}
                className="text-xs flex items-center space-x-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Re-Scan Wall</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs border-border text-foreground hover:bg-muted"
              >
                Finish Inspection
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Error / Warning Alert Modal */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white border border-border p-6 max-w-sm w-full space-y-4 text-center">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">AR Camera Notice</h3>
            <p className="text-xs text-secondary">{errorMessage}</p>
            <div className="pt-2 flex space-x-2">
              <Button
                variant="gold"
                size="sm"
                onClick={() => setErrorMessage(null)}
                className="w-full text-xs"
              >
                Dismiss
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="w-full text-xs"
              >
                Exit AR
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
