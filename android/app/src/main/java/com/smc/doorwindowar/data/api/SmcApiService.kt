package com.smc.doorwindowar.data.api

import com.smc.doorwindowar.data.model.ApiResponse
import com.smc.doorwindowar.data.model.HandoffVerifyData
import com.smc.doorwindowar.data.model.HandoffVerifyRequest
import com.smc.doorwindowar.data.model.ProductData
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit

interface SmcApiService {

    @GET("api/v1/products")
    suspend fun getProducts(): Response<ApiResponse<List<ProductData>>>

    @GET("api/v1/products/{id}")
    suspend fun getProductById(
        @Path("id") productId: String
    ): Response<ApiResponse<ProductData>>

    @POST("api/v1/auth/verify-handoff")
    suspend fun verifyHandoffToken(
        @Body request: HandoffVerifyRequest
    ): Response<ApiResponse<HandoffVerifyData>>

    companion object {
        // Production Render Backend URL (public HTTPS endpoint serving MongoDB GridFS)
        const val DEFAULT_BASE_URL = "https://smc-backend-gt5i.onrender.com/"

        fun create(baseUrl: String = DEFAULT_BASE_URL): SmcApiService {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()

            return Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(SmcApiService::class.java)
        }
    }
}
