import Foundation
import ARKit
import RealityKit
import Combine

@MainActor
public final class ARManager: NSObject, ObservableObject, ARSessionDelegate {
    @Published public var trackingStateMessage: String = "Scanning for physical wall surfaces..."
    @Published public var isWallDetected: Bool = false
    @Published public var isPlaced: Bool = false
    @Published public var isLoadingModel: Bool = false
    @Published public var errorMessage: String? = null

    public weak var arView: ARView?
    private var modelEntity: ModelEntity?
    private var activeAnchorEntity: AnchorEntity?
    private var cancellables = Set<AnyCancellable>()

    public override init() {
        super.init()
    }

    public func configureSession(for arView: ARView) {
        self.arView = arView
        arView.session.delegate = self

        guard ARWorldTrackingConfiguration.isSupported else {
            errorMessage = "ARKit World Tracking is not supported on this device."
            return
        }

        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.vertical, .horizontal]
        configuration.environmentTexturing = .automatic

        // Enable LiDAR scene reconstruction when hardware is available (iPhone 12 Pro+, iPad Pro)
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) {
            configuration.sceneReconstruction = .meshWithClassification
        }

        arView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    public func loadModel(from usdzUrlString: String) {
        isLoadingModel = true
        trackingStateMessage = "Streaming 3D model from SMC architectural catalog..."

        Task {
            do {
                let localFileUrl = try await SmcApiService.shared.downloadUsdzToTempFile(from: usdzUrlString)
                let entity = try await ModelEntity.loadModel(contentsOf: localFileUrl)

                // Strict 1:1 real manufactured scale
                entity.scale = SIMD3<Float>(1.0, 1.0, 1.0)
                self.modelEntity = entity
                self.isLoadingModel = false
                self.trackingStateMessage = "Point camera at a wall and tap to place door at 1:1 scale."
            } catch {
                self.isLoadingModel = false
                self.errorMessage = "Failed to load USDZ: \(error.localizedDescription)"
            }
        }
    }

    public func handleTap(at screenPoint: CGPoint) {
        guard let arView = arView, let model = modelEntity else { return }

        // Perform raycast against detected vertical wall planes
        let results = arView.raycast(from: screenPoint, allowing: .estimatedPlane, alignment: .vertical)
        guard let bestResult = results.first else {
            trackingStateMessage = "Aim at a detected vertical wall surface."
            return
        }

        placeModelOnWall(bestResult: bestResult, model: model)
    }

    public func handlePan(at screenPoint: CGPoint) {
        guard isPlaced, let arView = arView, let currentAnchor = activeAnchorEntity else { return }

        // Raycast to reposition along physical wall
        let results = arView.raycast(from: screenPoint, allowing: .estimatedPlane, alignment: .vertical)
        guard let bestResult = results.first else { return }

        // Update world transform
        currentAnchor.transform = Transform(matrix: bestResult.worldTransform)
    }

    private func placeModelOnWall(bestResult: ARRaycastResult, model: ModelEntity) {
        guard let arView = arView else { return }

        // Remove previous anchor if repositioning
        if let existing = activeAnchorEntity {
            arView.scene.removeAnchor(existing)
        }

        // Create new AnchorEntity pinned in 6DoF real world space
        let anchor = AnchorEntity(world: bestResult.worldTransform)
        anchor.addChild(model)
        arView.scene.addAnchor(anchor)

        self.activeAnchorEntity = anchor
        self.isPlaced = true
        self.trackingStateMessage = "Door placed at 1:1 scale. Drag along the wall to reposition."
    }

    public func resetPlacement() {
        if let existing = activeAnchorEntity {
            arView?.scene.removeAnchor(existing)
            activeAnchorEntity = nil
        }
        isPlaced = false
        trackingStateMessage = "Point camera at a wall and tap to place door."
    }

    // MARK: - ARSessionDelegate
    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        // Detect if any vertical planes are currently tracked
        let verticalPlanes = frame.anchors.compactMap { $0 as? ARPlaneAnchor }.filter { $0.alignment == .vertical }
        isWallDetected = !verticalPlanes.isEmpty
    }

    public func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        switch camera.trackingState {
        case .normal:
            if !isPlaced {
                trackingStateMessage = "Slowly pan your phone to map the room wall."
            }
        case .limited(let reason):
            switch reason {
            case .excessiveMotion:
                trackingStateMessage = "Excessive camera movement. Move slower."
            case .insufficientFeatures:
                trackingStateMessage = "Low lighting or texture. Point camera at features."
            case .initializing:
                trackingStateMessage = "Initializing ARKit VIO..."
            case .relocalizing:
                trackingStateMessage = "Relocalizing position in room..."
            @unknown default:
                trackingStateMessage = "Aligning AR camera..."
            }
        case .notAvailable:
            trackingStateMessage = "AR tracking is currently unavailable."
        }
    }
}

