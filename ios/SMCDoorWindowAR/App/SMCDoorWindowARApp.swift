import SwiftUI
import RealityKit
import ARKit

@main
struct SMCDoorWindowARApp: App {
    @StateObject private var arManager = ARManager()
    @State private var activeProduct: ProductData?
    @State private var showingAR = false
    @State private var handoffToken: String?

    var body: some Scene {
        WindowGroup {
            ZStack {
                if showingAR, let product = activeProduct {
                    // Full-Screen Immersive ARKit / RealityKit Camera Feed
                    ARViewContainer(arManager: arManager)
                        .ignoresSafeArea()

                    AROverlayView(arManager: arManager) {
                        showingAR = false
                        arManager.resetPlacement()
                    }
                } else {
                    // Fallback Catalog Browser
                    ProductCatalogView { product in
                        launchAR(for: product)
                    }
                }
            }
            .onOpenURL { url in
                handleIncomingURL(url)
            }
        }
    }

    private func launchAR(for product: ProductData) {
        guard let usdzUrl = product.usdzUrl, !usdzUrl.isEmpty else {
            // If USDZ not uploaded yet, prompt user
            return
        }

        self.activeProduct = product
        self.showingAR = true
        arManager.loadModel(from: usdzUrl)
    }

    private func handleIncomingURL(_ url: URL) {
        // Formats handled:
        // 1. smcar://product/{id}?token={token}
        // 2. https://smc-frontend-cbou.onrender.com/ar/{id}?token={token}
        var productId: String?

        if url.scheme == "smcar" {
            productId = url.lastPathComponent
        } else if url.scheme == "https" || url.scheme == "http" {
            productId = url.lastPathComponent
        }

        guard let id = productId, !id.isEmpty else { return }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let token = components?.queryItems?.first(where: { $0.name == "token" })?.value
        self.handoffToken = token

        Task {
            do {
                let product = try await SmcApiService.shared.getProductById(id)
                await MainActor.run {
                    self.launchAR(for: product)
                }
            } catch {
                print("Failed to resolve product via deep link: \(error)")
            }
        }
    }
}

