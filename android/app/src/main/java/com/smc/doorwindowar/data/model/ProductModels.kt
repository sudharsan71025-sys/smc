package com.smc.doorwindowar.data.model

import com.google.gson.annotations.SerializedName

data class ApiResponse<T>(
    @SerializedName("success") val success: Boolean,
    @SerializedName("statusCode") val statusCode: Int,
    @SerializedName("message") val message: String?,
    @SerializedName("data") val data: T?
)

data class ProductData(
    @SerializedName("_id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("title") val title: String?,
    @SerializedName("glbUrl") val glbUrl: String,
    @SerializedName("usdzUrl") val usdzUrl: String?,
    @SerializedName("glbFileId") val glbFileId: String?,
    @SerializedName("usdzFileId") val usdzFileId: String?,
    @SerializedName("status") val status: String,
    @SerializedName("dimensions") val dimensions: ProductDimensions?
) {
    val displayName: String
        get() = name.ifBlank { title ?: "Architectural Model" }
}

data class ProductDimensions(
    @SerializedName("defaultWidth") val width: Float = 1.0f,
    @SerializedName("defaultHeight") val height: Float = 2.1f,
    @SerializedName("defaultDepth") val depth: Float = 0.15f,
    @SerializedName("unit") val unit: String = "meters"
)

data class HandoffVerifyRequest(
    @SerializedName("token") val token: String
)

data class HandoffVerifyData(
    @SerializedName("valid") val valid: Boolean,
    @SerializedName("productId") val productId: String,
    @SerializedName("userId") val userId: String?
)

