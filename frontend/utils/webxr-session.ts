'use client';

/**
 * WebXR Session Negotiation and Capability Fallback Engine
 *
 * Implements intelligent, multi-tier capability negotiation for WebXR immersive-ar:
 * 1. Prevents "The specified session configuration is not supported" errors by avoiding
 *    unsupported features in requiredFeatures.
 * 2. Gracefully falls back across DOM Overlay, Hit-Test, and Anchors.
 * 3. Probes and negotiates reference spaces (local-floor -> local -> viewer).
 */

export interface NegotiatedWebXRSession {
  session: XRSession;
  tier: 'full' | 'no-dom-overlay' | 'baseline';
  hasHitTest: boolean;
  hasDOMOverlay: boolean;
  hasAnchors: boolean;
  referenceSpace: XRReferenceSpace;
  referenceSpaceType: 'local-floor' | 'local' | 'viewer';
  hitTestSource: XRHitTestSource | null;
}

export interface SessionNegotiationOptions {
  domOverlayRoot?: HTMLElement | null;
}

export async function negotiateWebXRSession(
  options: SessionNegotiationOptions = {}
): Promise<NegotiatedWebXRSession> {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    throw new Error('WebXR Device API is not available on this browser.');
  }

  const { domOverlayRoot } = options;
  let session: XRSession | null = null;
  let tier: 'full' | 'no-dom-overlay' | 'baseline' = 'full';
  let hasDOMOverlay = false;

  // ---------------------------------------------------------------------------
  // TIER 1: Full Capability (hit-test, dom-overlay, anchors, local-floor)
  // All placed in optionalFeatures so session creation is never blocked
  // ---------------------------------------------------------------------------
  if (domOverlayRoot && typeof document !== 'undefined') {
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: [],
        optionalFeatures: ['hit-test', 'dom-overlay', 'anchors', 'local-floor'],
        domOverlay: { root: domOverlayRoot },
      });
      hasDOMOverlay = true;
      tier = 'full';
    } catch (tier1Err) {
      console.warn('WebXR Tier 1 (with DOM Overlay) failed, attempting Tier 2:', tier1Err);
    }
  }

  // ---------------------------------------------------------------------------
  // TIER 2: Without DOM Overlay (in case DOM overlay root was rejected)
  // ---------------------------------------------------------------------------
  if (!session) {
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: [],
        optionalFeatures: ['hit-test', 'anchors', 'local-floor'],
      });
      tier = 'no-dom-overlay';
      hasDOMOverlay = false;
    } catch (tier2Err) {
      console.warn('WebXR Tier 2 (without DOM Overlay) failed, attempting Tier 3:', tier2Err);
    }
  }

  // ---------------------------------------------------------------------------
  // TIER 3: Baseline Immersive-AR (minimal fallback)
  // ---------------------------------------------------------------------------
  if (!session) {
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: [],
        optionalFeatures: ['local-floor'],
      });
      tier = 'baseline';
      hasDOMOverlay = false;
    } catch (tier3Err) {
      console.warn('WebXR Tier 3 failed, attempting absolute minimal fallback:', tier3Err);
      // Final attempt: completely empty feature set
      session = await navigator.xr.requestSession('immersive-ar');
      tier = 'baseline';
      hasDOMOverlay = false;
    }
  }

  if (!session) {
    throw new Error('Failed to establish WebXR immersive-ar session after all negotiation tiers.');
  }

  // ---------------------------------------------------------------------------
  // REFERENCE SPACE NEGOTIATION: local-floor -> local -> viewer
  // ---------------------------------------------------------------------------
  let referenceSpace: XRReferenceSpace;
  let referenceSpaceType: 'local-floor' | 'local' | 'viewer' = 'local-floor';

  try {
    referenceSpace = (await session.requestReferenceSpace('local-floor')) as XRReferenceSpace;
    referenceSpaceType = 'local-floor';
  } catch {
    try {
      referenceSpace = (await session.requestReferenceSpace('local')) as XRReferenceSpace;
      referenceSpaceType = 'local';
    } catch {
      referenceSpace = (await session.requestReferenceSpace('viewer')) as XRReferenceSpace;
      referenceSpaceType = 'viewer';
    }
  }

  // ---------------------------------------------------------------------------
  // HIT-TEST SOURCE NEGOTIATION
  // ---------------------------------------------------------------------------
  let hitTestSource: XRHitTestSource | null = null;
  let hasHitTest = false;

  try {
    const viewerSpace = (await session.requestReferenceSpace('viewer')) as XRReferenceSpace;
    if (session && 'requestHitTestSource' in session) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hitTestSource = await (session as any).requestHitTestSource({ space: viewerSpace });
      hasHitTest = Boolean(hitTestSource);
    }
  } catch (hitTestErr) {
    console.warn('WebXR hit-test source request not supported or failed:', hitTestErr);
    hitTestSource = null;
    hasHitTest = false;
  }

  const hasAnchors = Boolean(session && 'restorePersistentAnchor' in session);

  return {
    session,
    tier,
    hasHitTest,
    hasDOMOverlay,
    hasAnchors,
    referenceSpace,
    referenceSpaceType,
    hitTestSource,
  };
}
