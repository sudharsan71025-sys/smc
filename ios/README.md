# SMC Doors & Windows — Native iOS ARKit & RealityKit Application

Native iOS Augmented Reality client built with Swift, Apple ARKit, and RealityKit for real-world vertical wall plane detection, 6DoF Visual-Inertial Odometry, world-space anchor attachment, and physical door/window placement at 1:1 scale.

## Architecture

- **Technology**: Swift 5.9+, ARKit 6, RealityKit 3, SwiftUI.
- **Hardware Support**: iPhone 11+, iPhone 12 Pro/13 Pro/14 Pro/15 Pro/16 Pro (with LiDAR mesh classification), iPad Pro (2020+).
- **3D Asset Pipeline**: Apple USDZ (.usdz) streamed directly from MongoDB GridFS.
- **Deep Linking**:
  - Custom URL Scheme: `smcar://product/{id}?token={handoffToken}`
  - Universal Link: `https://smc-frontend-cbou.onrender.com/ar/{id}`
- **Security**: Single-use, short-lived handoff tokens (`/api/v1/auth/verify-handoff`).

## Setup in Xcode

1. Open Xcode on macOS.
2. Select **Open Existing Project** or create a new iOS App target named `SMCDoorWindowAR` with bundle ID `com.smc.doorwindowar`.
3. Add the files under `SMCDoorWindowAR/` to the target.
4. Ensure the **Camera Usage Description** in `Info.plist` is maintained.
5. Select a physical iOS device and click **Run** (Cmd + R).

