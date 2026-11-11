import SwiftUI

public struct AROverlayView: View {
    @ObservedObject public var arManager: ARManager
    public let onDismiss: () -> Void

    public init(arManager: ARManager, onDismiss: @escaping () -> Void) {
        self.arManager = arManager
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            // Top Bar with Minimal Close Button and Surface Badge
            VStack {
                HStack {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                            .background(Color.black.opacity(0.6))
                            .clipShape(Circle())
                    }
                    .accessibilityLabel("Close AR Session")

                    Spacer()

                    if arManager.isWallDetected {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 8, height: 8)
                            Text("WALL DETECTED")
                                .font(.system(size: 10, weight: .bold))
                                .tracking(1)
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.6))
                        .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)

                Spacer()

                // Bottom Guidance Pill
                if !arManager.isPlaced || arManager.isLoadingModel {
                    VStack(spacing: 8) {
                        if arManager.isLoadingModel {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(1.1)
                        }

                        Text(arManager.trackingStateMessage)
                            .font(.system(size: 12, weight: .medium))
                            .multilineTextAlignment(.center)
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color.black.opacity(0.75))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .padding(.bottom, 36)
                    .padding(.horizontal, 24)
                }
            }
        }
    }
}

