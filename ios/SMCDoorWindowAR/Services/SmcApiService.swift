import Foundation

public final class SmcApiService {
    public static let shared = SmcApiService()

    // Public HTTPS Render Production backend serving MongoDB GridFS
    public var baseUrl = "https://smc-backend-gt5i.onrender.com"

    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 45.0
        config.timeoutIntervalForResource = 120.0
        self.session = URLSession(configuration: config)
    }

    public func getProducts() async throws -> [ProductData] {
        guard let url = URL(string: "\(baseUrl)/api/v1/products") else {
            throw URLError(.badURL)
        }

        let (data, response) = try await session.data(from: url)
        try validateResponse(response)

        let decoded = try JSONDecoder().decode(ApiResponse<[ProductData]>.self, from: data)
        return decoded.data ?? []
    }

    public func getProductById(_ id: String) async throws -> ProductData {
        guard let url = URL(string: "\(baseUrl)/api/v1/products/\(id)") else {
            throw URLError(.badURL)
        }

        let (data, response) = try await session.data(from: url)
        try validateResponse(response)

        let decoded = try JSONDecoder().decode(ApiResponse<ProductData>.self, from: data)
        guard let product = decoded.data else {
            throw URLError(.resourceUnavailable)
        }
        return product
    }

    public func verifyHandoffToken(_ token: String) async throws -> HandoffVerifyData {
        guard let url = URL(string: "\(baseUrl)/api/v1/auth/verify-handoff") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = HandoffVerifyRequest(token: token)
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let decoded = try JSONDecoder().decode(ApiResponse<HandoffVerifyData>.self, from: data)
        guard let result = decoded.data else {
            throw URLError(.cannotParseResponse)
        }
        return result
    }

    public func downloadUsdzToTempFile(from urlString: String) async throws -> URL {
        // Normalize localhost to public Render endpoint if needed
        var resolvedUrl = urlString
        if resolvedUrl.contains("localhost:5000") {
            resolvedUrl = resolvedUrl.replacingOccurrences(of: "http://localhost:5000", with: baseUrl)
        }

        guard let url = URL(string: resolvedUrl) else {
            throw URLError(.badURL)
        }

        let (tempLocation, response) = try await session.download(from: url)
        try validateResponse(response)

        // RealityKit expects a .usdz extension on the local disk
        let destinationUrl = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("usdz")

        try FileManager.default.moveItem(at: tempLocation, to: destinationUrl)
        return destinationUrl
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}

