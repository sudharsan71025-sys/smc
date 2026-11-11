import SwiftUI

public struct ProductCatalogView: View {
    @State private var products: [ProductData] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    public let onSelectProduct: (ProductData) -> Void

    public init(onSelectProduct: @escaping (ProductData) -> Void) {
        self.onSelectProduct = onSelectProduct
    }

    public var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.08, green: 0.08, blue: 0.09)
                    .ignoresSafeArea()

                if isLoading {
                    VStack(spacing: 12) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color(red: 0.85, green: 0.65, blue: 0.13)))
                        Text("Loading Architectural Models...")
                            .font(.system(size: 13))
                            .foregroundColor(.gray)
                    }
                } else if let error = errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 32))
                            .foregroundColor(.orange)
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        Button("Retry") {
                            loadCatalog()
                        }
                        .foregroundColor(.black)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Color(red: 0.85, green: 0.65, blue: 0.13))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                } else if products.isEmpty {
                    VStack(spacing: 8) {
                        Text("No Published Products Found")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                        Text("Publish products from the SMC admin panel or open via website deep link.")
                            .font(.system(size: 12))
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }
                } else {
                    List(products) { product in
                        Button(action: { onSelectProduct(product) }) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(product.displayName)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.white)
                                    Text(product.usdzUrl != nil ? "USDZ & AR Ready" : "GLB Ready")
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(red: 0.85, green: 0.65, blue: 0.13))
                                }
                                Spacer()
                                Image(systemName: "arkit")
                                    .font(.system(size: 20))
                                    .foregroundColor(.white.opacity(0.8))
                            }
                            .padding(.vertical, 8)
                        }
                        .listRowBackground(Color(red: 0.12, green: 0.12, blue: 0.14))
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("SMC AR System")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { loadCatalog() }) {
                        Image(systemName: "arrow.clockwise")
                            .foregroundColor(Color(red: 0.85, green: 0.65, blue: 0.13))
                    }
                }
            }
        }
        .onAppear {
            if products.isEmpty {
                loadCatalog()
            }
        }
    }

    private func loadCatalog() {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                let items = try await SmcApiService.shared.getProducts()
                self.products = items
                self.isLoading = false
            } catch {
                self.errorMessage = "Failed to load catalog: \(error.localizedDescription)"
                self.isLoading = false
            }
        }
    }
}

