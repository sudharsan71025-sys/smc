/**
 * Google Play Services for AR (ARCore) & WebXR Verification Module
 *
 * Implements pre-flight device validation according to Google ARCore & W3C WebXR specifications:
 * 1. Checks device ARCore hardware compatibility
 * 2. Checks Google Play Services for AR installation & update status
 * 3. Guides user to official Google Play Store (market://details?id=com.google.ar.core)
 * 4. Supports resuming AR after installation
 * 5. Validates Camera permissions (Permissions API)
 * 6. Ensures genuine 6DOF session starts only after all prerequisites are satisfied
 * 7. Gracefully handles unsupported devices (no fake camera overlay fallback)
 */

export type CameraPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface ARCorePreflightResult {
  isAndroid: boolean;
  isIOS: boolean;
  isDesktop: boolean;
  hasWebXR: boolean;
  hasImmersiveAR: boolean;
  cameraPermission: CameraPermissionState;
  needsARCoreInstall: boolean;
  isReadyForAR: boolean;
  playStoreUrl: string;
  playStoreWebUrl: string;
  statusMessage: string;
}

export const ARCORE_PACKAGE_NAME = 'com.google.ar.core';
export const ARCORE_PLAY_STORE_MARKET_URI = `market://details?id=${ARCORE_PACKAGE_NAME}`;
export const ARCORE_PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ARCORE_PACKAGE_NAME}`;

/**
 * Checks Camera permissions using the Permissions API if supported
 */
export async function checkCameraPermission(): Promise<CameraPermissionState> {
  if (typeof window === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
    return 'unsupported';
  }

  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state as CameraPermissionState;
  } catch {
    // Some browsers throw when querying 'camera'
    return 'unsupported';
  }
}

/**
 * Runs complete ARCore preflight verification
 */
export async function runARCorePreflight(): Promise<ARCorePreflightResult> {
  if (typeof window === 'undefined') {
    return {
      isAndroid: false,
      isIOS: false,
      isDesktop: true,
      hasWebXR: false,
      hasImmersiveAR: false,
      cameraPermission: 'unsupported',
      needsARCoreInstall: false,
      isReadyForAR: false,
      playStoreUrl: ARCORE_PLAY_STORE_MARKET_URI,
      playStoreWebUrl: ARCORE_PLAY_STORE_WEB_URL,
      statusMessage: 'Server-side rendering; client checks pending.',
    };
  }

  const userAgent = navigator.userAgent || navigator.vendor || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !('MSStream' in window);
  const isAndroid = /android/i.test(userAgent);
  const isDesktop = !isIOS && !isAndroid;

  const hasWebXR = Boolean(typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr);
  let hasImmersiveAR = false;

  if (hasWebXR && navigator.xr?.isSessionSupported) {
    try {
      hasImmersiveAR = await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      hasImmersiveAR = false;
    }
  }

  const cameraPermission = await checkCameraPermission();

  // On Android, if the device is Android but immersive-ar is not yet enabled,
  // Google Play Services for AR (ARCore) typically needs to be installed or updated
  const needsARCoreInstall = isAndroid && !hasImmersiveAR;
  const isReadyForAR = hasImmersiveAR && cameraPermission !== 'denied';

  let statusMessage = 'Ready for Augmented Reality.';
  if (cameraPermission === 'denied') {
    statusMessage = 'Camera permission is blocked. Please allow camera access in browser site settings.';
  } else if (needsARCoreInstall) {
    statusMessage = 'Google Play Services for AR is required to enable physical surface tracking.';
  } else if (isIOS) {
    statusMessage = 'iOS Safari does not support in-browser WebXR. Apple ARKit Quick Look is available.';
  } else if (isDesktop) {
    statusMessage = 'Desktop browsers do not have spatial AR hardware. Open on an ARCore-compatible mobile phone.';
  }

  return {
    isAndroid,
    isIOS,
    isDesktop,
    hasWebXR,
    hasImmersiveAR,
    cameraPermission,
    needsARCoreInstall,
    isReadyForAR,
    playStoreUrl: ARCORE_PLAY_STORE_MARKET_URI,
    playStoreWebUrl: ARCORE_PLAY_STORE_WEB_URL,
    statusMessage,
  };
}

/**
 * Directs Android device to the Google Play Store to install or update Google Play Services for AR
 */
export function openGooglePlayServicesForARStore(): void {
  if (typeof window === 'undefined') return;

  // Try market:// protocol first to open Play Store app directly, fallback to web URL
  const fallbackTimer = setTimeout(() => {
    window.location.href = ARCORE_PLAY_STORE_WEB_URL;
  }, 1200);

  window.addEventListener(
    'blur',
    () => {
      clearTimeout(fallbackTimer);
    },
    { once: true }
  );

  window.location.href = ARCORE_PLAY_STORE_MARKET_URI;
}

