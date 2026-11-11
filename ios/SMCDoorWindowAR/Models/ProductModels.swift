import Foundation

public struct ApiResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let statusCode: Int
    public let message: String?
    public let data: T?
}

public struct ProductData: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let title: String?
    public let glbUrl: String?
    public let usdzUrl: String?
    public let glbFileId: String?
    public let usdzFileId: String?
    public let status: String
    public let dimensions: ProductDimensions?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, title, glbUrl, usdzUrl, glbFileId, usdzFileId, status, dimensions
    }

    public var displayName: String {
        if !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return name
        }
        return title ?? "Architectural Model"
    }
}

public struct ProductDimensions: Decodable {
    public let defaultWidth: Float?
    public let defaultHeight: Float?
    public let defaultDepth: Float?
    public let unit: String?
}

public struct HandoffVerifyRequest: Encodable {
    public let token: String
    
    public init(token: String) {
        self.token = token
    }
}

public struct HandoffVerifyData: Decodable {
    public let valid: Bool
    public let productId: String
    public let userId: String?
}

