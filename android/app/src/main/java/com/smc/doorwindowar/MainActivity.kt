package com.smc.doorwindowar

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.ar.core.ArCoreApk
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException
import com.smc.doorwindowar.data.api.SmcApiService
import com.smc.doorwindowar.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Main Entry Point and Deep Link Router for the SMC Native AR System.
 *
 * Routes deep links from the web application (smcar://product/{id}?token=... or
 * https://smc-frontend-cbou.onrender.com/ar/{id}) directly into the native 6DoF ARCore session.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val apiService = SmcApiService.create()

    private var targetProductId: String? = null
    private var targetHandoffToken: String? = null
    private var userRequestedInstall = true

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            checkArCoreAndProceed()
        } else {
            binding.tvStatus.text = "Camera permission is required for real-world AR tracking."
            Toast.makeText(this, "Camera permission required for AR", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        handleIncomingIntent(intent)
        setupActions()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let {
            handleIncomingIntent(it)
        }
    }

    private fun handleIncomingIntent(intent: Intent) {
        val uri: Uri? = intent.data
        if (uri != null) {
            Log.d(TAG, "Received deep link URI: $uri")
            val (productId, token) = parseDeepLinkUri(uri)
            if (!productId.isNullOrBlank()) {
                targetProductId = productId
                targetHandoffToken = token
                binding.tvStatus.text = "Loading product: $productId"
                verifyAndLaunchAr()
                return
            }
        }

        binding.tvStatus.text = "Tap 'Launch AR Showcase' or scan a product from the SMC website."
    }

    private fun parseDeepLinkUri(uri: Uri): Pair<String?, String?> {
        val scheme = uri.scheme
        var productId: String? = null
        val token = uri.getQueryParameter("token")

        if (scheme == "smcar") {
            // Expected URI format: smcar://product/{productId}?token={token}
            productId = uri.lastPathSegment
        } else if (scheme == "https" || scheme == "http") {
            // Expected URI format: https://smc-frontend-cbou.onrender.com/ar/{productId}
            productId = uri.lastPathSegment
        }

        return Pair(productId, token)
    }

    private fun setupActions() {
        binding.btnLaunchSample.setOnClickListener {
            if (targetProductId.isNullOrBlank()) {
                // Fetch first available product from catalog
                fetchFirstProductAndLaunch()
            } else {
                verifyAndLaunchAr()
            }
        }
    }

    private fun fetchFirstProductAndLaunch() {
        binding.tvStatus.text = "Fetching products from SMC architectural catalog..."
        binding.btnLaunchSample.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    apiService.getProducts()
                }

                if (response.isSuccessful && !response.body()?.data.isNullOrEmpty()) {
                    val products = response.body()!!.data!!
                    val firstProduct = products.first()
                    targetProductId = firstProduct.id
                    binding.tvStatus.text = "Found ${firstProduct.displayName}. Initializing AR..."
                    verifyAndLaunchAr()
                } else {
                    binding.tvStatus.text = "No published products found in SMC catalog."
                    Toast.makeText(this@MainActivity, "No published products found", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching products", e)
                binding.tvStatus.text = "Could not connect to catalog: ${e.localizedMessage}"
                Toast.makeText(this@MainActivity, "Catalog connection error", Toast.LENGTH_SHORT).show()
            } finally {
                binding.btnLaunchSample.isEnabled = true
            }
        }
    }

    private fun verifyAndLaunchAr() {
        // Step 1: Ensure camera permission is granted
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            return
        }

        // Step 2: Check Google Play Services for AR installation & availability
        checkArCoreAndProceed()
    }

    private fun checkArCoreAndProceed() {
        try {
            when (ArCoreApk.getInstance().requestInstall(this, userRequestedInstall)) {
                ArCoreApk.InstallStatus.INSTALLED -> {
                    launchArActivity()
                }
                ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                    userRequestedInstall = false
                    binding.tvStatus.text = "Please install or update Google Play Services for AR."
                }
            }
        } catch (e: UnavailableUserDeclinedInstallationException) {
            binding.tvStatus.text = "ARCore installation was declined. AR features unavailable."
            Toast.makeText(this, "AR requires Google Play Services for AR", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Log.e(TAG, "ARCore check failed", e)
            binding.tvStatus.text = "Device not supported for ARCore: ${e.localizedMessage}"
            Toast.makeText(this, "ARCore initialization error: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
        }
    }

    private fun launchArActivity() {
        val id = targetProductId
        if (id.isNullOrBlank()) {
            binding.tvStatus.text = "Select a product first."
            return
        }

        val arIntent = Intent(this, ArActivity::class.java).apply {
            putExtra(ArActivity.EXTRA_PRODUCT_ID, id)
            putExtra(ArActivity.EXTRA_HANDOFF_TOKEN, targetHandoffToken)
        }
        startActivity(arIntent)
    }

    companion object {
        private const val TAG = "SMC_MainActivity"
    }
}

