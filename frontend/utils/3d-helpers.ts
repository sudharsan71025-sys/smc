export interface ARCapabilities {
  supportsWebXR: boolean;
  supportsQuickLook: boolean; // iOS ARKit
  supportsSceneViewer: boolean; // Android ARCore Scene Viewer
  isAndroid: boolean;
  isIOS: boolean;
  isDesktop: boolean;
}

/**
 * Checks client device AR capabilities
 */
export const checkARCapabilities = (): ARCapabilities => {
  if (typeof window === 'undefined') {
    return {
      supportsWebXR: false,
      supportsQuickLook: false,
      supportsSceneViewer: false,
      isAndroid: false,
      isIOS: false,
      isDesktop: true,
    };
  }

  const userAgent = navigator.userAgent || navigator.vendor;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !('MSStream' in window);
  const isAndroid = /android/i.test(userAgent);
  const isDesktop = !isIOS && !isAndroid;

  // iOS Quick Look: check if anchor element supports rel=ar
  const a = document.createElement('a');
  const supportsQuickLook =
    isIOS && Boolean(a.relList && a.relList.supports && a.relList.supports('ar'));

  const supportsWebXR = 'xr' in navigator;

  return {
    supportsWebXR,
    supportsQuickLook,
    supportsSceneViewer: isAndroid,
    isAndroid,
    isIOS,
    isDesktop,
  };
};

/**
 * Checks whether the client browser can genuinely initiate a WebXR immersive-ar session.
 * On Android Chrome with Google Play Services for AR installed, this returns true.
 * On iOS Safari (where Apple blocks WebXR immersive-ar), this returns false.
 */
export const checkImmersiveARSupport = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('xr' in navigator)) {
    return false;
  }
  try {
    const supported = await navigator.xr?.isSessionSupported('immersive-ar');
    return Boolean(supported);
  } catch {
    return false;
  }
};

export interface SceneViewerOptions {
  glbUrl: string;
  title: string;
  linkUrl: string;
  resizable?: boolean;
  verticalPlacement?: boolean;
  mode?: 'ar_only' | 'ar_preferred';
}

/**
 * Generates an Android Scene Viewer intent URI according to Google ARCore specification
 * - file: raw GLB URL
 * - mode=ar_only: forces camera AR mode with real-world surface detection and world anchoring
 * - resizable=false: locks to 1:1 real-world physical scale
 * - enable_vertical_placement: enables vertical wall plane detection
 * - link: URL to return to upon exiting Scene Viewer
 * - S.browser_fallback_url: fallback web URL if ARCore is missing
 */
export const buildSceneViewerUrl = (
  glbUrlOrOptions: string | SceneViewerOptions,
  titleParam?: string,
  linkParam?: string
): string => {
  let glbUrl: string;
  let title: string;
  let linkUrl: string;
  let resizable = false;
  let verticalPlacement = true;
  let mode: 'ar_only' | 'ar_preferred' = 'ar_only';

  if (typeof glbUrlOrOptions === 'object') {
    glbUrl = glbUrlOrOptions.glbUrl;
    title = glbUrlOrOptions.title;
    linkUrl = glbUrlOrOptions.linkUrl;
    if (glbUrlOrOptions.resizable !== undefined) {
      resizable = glbUrlOrOptions.resizable;
    }
    if (glbUrlOrOptions.verticalPlacement !== undefined) {
      verticalPlacement = glbUrlOrOptions.verticalPlacement;
    }
    if (glbUrlOrOptions.mode !== undefined) {
      mode = glbUrlOrOptions.mode;
    }
  } else {
    glbUrl = glbUrlOrOptions;
    title = titleParam || 'Architectural Model';
    linkUrl = linkParam || (typeof window !== 'undefined' ? window.location.href : '');
  }

  const encodedModelUrl = encodeURIComponent(glbUrl);
  const encodedTitle = encodeURIComponent(title);
  const encodedLink = encodeURIComponent(linkUrl);
  const encodedFallback = encodeURIComponent(linkUrl || glbUrl);

  let query = `file=${encodedModelUrl}&mode=${mode}&title=${encodedTitle}&link=${encodedLink}&resizable=${resizable}`;
  if (verticalPlacement) {
    query += `&enable_vertical_placement=true`;
  }

  return `intent://arvr.google.com/scene-viewer/1.0?${query}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;S.browser_fallback_url=${encodedFallback};end;`;
};

export interface QuickLookOptions {
  usdzUrl: string;
  allowsContentScaling?: boolean; // Defaults to false (locks to 1:1 real manufactured size)
  canonicalWebPageURL?: string; // Canonical URL to return to
}

/**
 * Generates an Apple AR Quick Look URL with fragment parameters according to Apple ARKit specification:
 * - #allowsContentScaling=0: locks virtual model to 1:1 physical scale, disabling user pinch-to-resize
 * - #canonicalWebPageURL: canonical URL for webpage return
 */
export const buildQuickLookUrl = (
  usdzUrlOrOptions: string | QuickLookOptions,
  canonicalWebPageURLParam?: string
): string => {
  let usdzUrl: string;
  let allowsContentScaling = false; // strictly lock 1:1 scale by default
  let canonicalWebPageURL: string | undefined;

  if (typeof usdzUrlOrOptions === 'object') {
    usdzUrl = usdzUrlOrOptions.usdzUrl;
    if (usdzUrlOrOptions.allowsContentScaling !== undefined) {
      allowsContentScaling = usdzUrlOrOptions.allowsContentScaling;
    }
    canonicalWebPageURL = usdzUrlOrOptions.canonicalWebPageURL;
  } else {
    usdzUrl = usdzUrlOrOptions;
    canonicalWebPageURL = canonicalWebPageURLParam;
  }

  if (!usdzUrl) return '';

  // Separate any existing fragment
  const [baseUrl] = usdzUrl.split('#');
  const params: string[] = [];

  // #allowsContentScaling=0 locks model to 100% true physical scale
  if (!allowsContentScaling) {
    params.push('allowsContentScaling=0');
  }

  if (canonicalWebPageURL) {
    params.push(`canonicalWebPageURL=${encodeURIComponent(canonicalWebPageURL)}`);
  }

  return params.length > 0 ? `${baseUrl}#${params.join('&')}` : baseUrl;
};

/**
 * Normalizes dimension input (meters for 3D engine vs mm for manufacture)
 */
export const mmToMeters = (mm: number): number => mm / 1000;
export const metersToMm = (meters: number): number => meters * 1000;
