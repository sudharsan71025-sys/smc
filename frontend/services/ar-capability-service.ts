'use client';

/**
 * SMC Centralized AR & Device Capability Service
 *
 * Provides comprehensive, unified cross-platform capability detection:
 * - W3C WebXR Device API presence
 * - W3C WebXR 'immersive-ar' support
 * - Secure Context (HTTPS or localhost)
 * - Optional AR feature support (hit-test, anchors, plane-detection, dom-overlay)
 * - WebGL 1 / WebGL 2 availability
 * - Camera hardware presence & permission state
 * - Device platform (Android, iOS, Desktop)
 * - Safe recommended experience mode
 */

export type ARRecommendedMode =
  | 'webxr-immersive' // Supported Android / ARCore WebXR
  | 'ios-fallback'     // iOS Safari fallback
  | 'webcam-preview'   // Desktop with webcam
  | 'desktop-3d'       // Desktop without webcam or WebXR
  | 'incompatible';    // Insecure context or missing WebGL

export interface ARDeviceCapabilities {
  isSecureContext: boolean;
  hasWebXR: boolean;
  supportsImmersiveAR: boolean;
  supportsHitTest: boolean;
  supportsAnchors: boolean;
  supportsPlaneDetection: boolean;
  supportsDOMOverlay: boolean;
  supportsWebGL: boolean;
  cameraPermission: 'granted' | 'prompt' | 'denied' | 'unknown';
  hasCameraHardware: boolean;
  isMobile: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isDesktop: boolean;
  recommendedMode: ARRecommendedMode;
  incompatibilityReason?: string;
}

class ARCapabilityService {
  private cachedCapabilities: ARDeviceCapabilities | null = null;
  private isEvaluating = false;
  private evalPromise: Promise<ARDeviceCapabilities> | null = null;

  /**
   * Evaluates all client runtime capabilities.
   * Caches result for performance, but allows forced re-evaluation.
   */
  public async evaluate(forceRefresh = false): Promise<ARDeviceCapabilities> {
    if (this.cachedCapabilities && !forceRefresh) {
      return this.cachedCapabilities;
    }

    if (this.isEvaluating && this.evalPromise) {
      return this.evalPromise;
    }

    this.isEvaluating = true;
    this.evalPromise = this.performEvaluation();

    try {
      this.cachedCapabilities = await this.evalPromise;
      return this.cachedCapabilities;
    } finally {
      this.isEvaluating = false;
      this.evalPromise = null;
    }
  }

  private async performEvaluation(): Promise<ARDeviceCapabilities> {
    if (typeof window === 'undefined') {
      return this.getSSRDefaultCapabilities();
    }

    // 1. Secure Context (HTTPS or localhost)
    const isSecureContext =
      window.isSecureContext === true ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    // 2. Platform & Device Category Detection
    const userAgent = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !('MSStream' in window);
    const isAndroid = /android/i.test(userAgent);
    const isMobile = isAndroid || isIOS || /mobile/i.test(userAgent);
    const isDesktop = !isMobile;

    // 3. WebGL Support
    let supportsWebGL = false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      supportsWebGL = Boolean(gl);
    } catch {
      supportsWebGL = false;
    }

    // 4. WebXR Core & immersive-ar Support
    const hasWebXR = typeof navigator !== 'undefined' && 'xr' in navigator && Boolean(navigator.xr);
    let supportsImmersiveAR = false;
    if (hasWebXR && navigator.xr) {
      try {
        supportsImmersiveAR = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      } catch {
        supportsImmersiveAR = false;
      }
    }

    // 5. Extended AR Feature Prototype Detection
    const supportsHitTest = typeof window !== 'undefined' && 'XRHitTestSource' in window;
    const supportsAnchors = typeof window !== 'undefined' && 'XRAnchor' in window;
    const supportsPlaneDetection = typeof window !== 'undefined' && 'XRPlane' in window;
    const supportsDOMOverlay =
      typeof window !== 'undefined' &&
      ('XRDOMOverlay' in window || (document && 'xrOverlay' in document.body));

    // 6. Camera Permission Query
    let cameraPermission: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';
    if (navigator.permissions && navigator.permissions.query) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await navigator.permissions.query({ name: 'camera' as any });
        cameraPermission = perm.state as 'granted' | 'prompt' | 'denied';
      } catch {
        cameraPermission = 'unknown';
      }
    }

    // 7. Camera Hardware Enumeration
    let hasCameraHardware = false;
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        hasCameraHardware = devices.some((d) => d.kind === 'videoinput');
      } catch {
        // If enumeration blocked, assume true on mobile, false on desktop
        hasCameraHardware = isMobile;
      }
    }

    // 8. Determine Recommended Mode & Incompatibility Explanation
    let recommendedMode: ARRecommendedMode = 'desktop-3d';
    let incompatibilityReason: string | undefined;

    if (!isSecureContext) {
      recommendedMode = 'incompatible';
      incompatibilityReason =
        'Camera and WebXR access require an encrypted HTTPS connection or localhost.';
    } else if (!supportsWebGL) {
      recommendedMode = 'incompatible';
      incompatibilityReason =
        'WebGL is not supported or hardware acceleration is disabled in this browser.';
    } else if (supportsImmersiveAR) {
      recommendedMode = 'webxr-immersive';
    } else if (isIOS) {
      recommendedMode = 'ios-fallback';
      incompatibilityReason =
        'Apple Safari on iOS does not support the W3C WebXR Device API for in-browser camera tracking.';
    } else if (isDesktop && hasCameraHardware) {
      recommendedMode = 'webcam-preview';
      incompatibilityReason =
        'Immersive AR requires mobile spatial tracking sensors. Desktop webcam preview is available.';
    } else if (isDesktop) {
      recommendedMode = 'desktop-3d';
      incompatibilityReason =
        'Immersive AR requires a smartphone with ARCore and motion tracking sensors.';
    } else {
      recommendedMode = 'desktop-3d';
      incompatibilityReason =
        'Your Android browser does not support WebXR immersive-ar. Ensure Google Chrome and Google Play Services for AR are installed.';
    }

    return {
      isSecureContext,
      hasWebXR,
      supportsImmersiveAR,
      supportsHitTest,
      supportsAnchors,
      supportsPlaneDetection,
      supportsDOMOverlay,
      supportsWebGL,
      cameraPermission,
      hasCameraHardware,
      isMobile,
      isAndroid,
      isIOS,
      isDesktop,
      recommendedMode,
      incompatibilityReason,
    };
  }

  private getSSRDefaultCapabilities(): ARDeviceCapabilities {
    return {
      isSecureContext: true,
      hasWebXR: false,
      supportsImmersiveAR: false,
      supportsHitTest: false,
      supportsAnchors: false,
      supportsPlaneDetection: false,
      supportsDOMOverlay: false,
      supportsWebGL: true,
      cameraPermission: 'unknown',
      hasCameraHardware: false,
      isMobile: false,
      isAndroid: false,
      isIOS: false,
      isDesktop: true,
      recommendedMode: 'desktop-3d',
    };
  }
}

export const arCapabilityService = new ARCapabilityService();
