import SwiftUI
import RealityKit
import ARKit

public struct ARViewContainer: UIViewRepresentable {
    @ObservedObject public var arManager: ARManager

    public init(arManager: ARManager) {
        self.arManager = arManager
    }

    public func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        arManager.configureSession(for: arView)

        // Add Tap Gesture Recognizer
        let tapGesture = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTap(_:))
        )
        arView.addGestureRecognizer(tapGesture)

        // Add Pan Gesture Recognizer for touch drag repositioning
        let panGesture = UIPanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handlePan(_:))
        )
        arView.addGestureRecognizer(panGesture)

        return arView
    }

    public func updateUIView(_ uiView: ARView, context: Context) {}

    public func makeCoordinator() -> Coordinator {
        Coordinator(arManager: arManager)
    }

    public class Coordinator: NSObject {
        private let arManager: ARManager

        init(arManager: ARManager) {
            self.arManager = arManager
        }

        @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
            guard let view = recognizer.view as? ARView else { return }
            let location = recognizer.location(in: view)
            arManager.handleTap(at: location)
        }

        @objc func handlePan(_ recognizer: UIPanGestureRecognizer) {
            guard let view = recognizer.view as? ARView else { return }
            let location = recognizer.location(in: view)
            arManager.handlePan(at: location)
        }
    }
}

