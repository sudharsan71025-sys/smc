// WebXR Device API TypeScript Definitions
// Compliant with W3C WebXR Device API and WebXR Hit Test Module

declare interface XRHitTestSource {
  cancel(): void;
}

declare interface XRHitTestResult {
  getPose(baseSpace: XRSpace): XRPose | undefined;
}

declare interface XRSpace extends EventTarget {}

declare interface XRReferenceSpace extends XRSpace {
  getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace;
}

declare interface XRRigidTransform {
  readonly position: DOMPointReadOnly;
  readonly orientation: DOMPointReadOnly;
  readonly matrix: Float32Array;
  readonly inverse: XRRigidTransform;
}

declare interface XRPose {
  readonly transform: XRRigidTransform;
  readonly emulatedPosition: boolean;
}

declare interface XRViewerPose extends XRPose {
  readonly views: ReadonlyArray<XRView>;
}

declare interface XRView {
  readonly eye: 'none' | 'left' | 'right';
  readonly projectionMatrix: Float32Array;
  readonly transform: XRRigidTransform;
}

declare interface XRFrame {
  readonly session: XRSession;
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | undefined;
  getHitTestResults(hitTestSource: XRHitTestSource): XRHitTestResult[];
}

declare interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: HTMLElement };
}

declare interface XRSession extends EventTarget {
  readonly renderState: XRRenderState;
  requestReferenceSpace(type: 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded'): Promise<XRReferenceSpace>;
  requestHitTestSource(options: { space: XRSpace }): Promise<XRHitTestSource>;
  updateRenderState(renderStateInit: XRRenderStateInit): Promise<void>;
  requestAnimationFrame(callback: (time: DOMHighResTimeStamp, frame: XRFrame) => void): number;
  cancelAnimationFrame(handle: number): void;
  end(): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}

declare interface XRRenderState {
  readonly baseLayer?: XRWebGLLayer;
}

declare interface XRRenderStateInit {
  baseLayer?: XRWebGLLayer;
  depthFar?: number;
  depthNear?: number;
  inlineVerticalFieldOfView?: number;
}

declare class XRWebGLLayer {
  constructor(session: XRSession, context: WebGLRenderingContext | WebGL2RenderingContext, options?: any);
  readonly framebuffer: WebGLFramebuffer | null;
  readonly framebufferWidth: number;
  readonly framebufferHeight: number;
}

declare interface XRSystem extends EventTarget {
  isSessionSupported(mode: 'inline' | 'immersive-vr' | 'immersive-ar'): Promise<boolean>;
  requestSession(mode: 'inline' | 'immersive-vr' | 'immersive-ar', options?: XRSessionInit): Promise<XRSession>;
}

declare interface Navigator {
  readonly xr?: XRSystem;
}

