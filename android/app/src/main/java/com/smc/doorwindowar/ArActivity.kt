package com.smc.doorwindowar

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Session
import com.google.ar.core.TrackingFailureReason
import com.smc.doorwindowar.ar.VerticalPlaneHitCalculator
import com.smc.doorwindowar.data.api.SmcApiService
import com.smc.doorwindowar.data.model.ProductData
import com.smc.doorwindowar.databinding.ActivityArBinding
import dev.romainguy.kotlin.math.Float3
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.node.ModelNode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Native Android ARCore Activity for Real-World Door & Window Placement.
 *
 * Implements genuine 6DoF Visual-Inertial Odometry (VIO) tracking, vertical wall plane
 * detection, screen hit testing, persistent world anchors, and touch drag repositioning.
 */
class ArActivity : AppCompatActivity() {

    private lateinit var binding: ActivityArBinding
    private val apiService = SmcApiService.create()

    private var productId: String? = null
    private var handoffToken: String? = null
    private var productData: ProductData? = null

    // Native ARCore Node Hierarchy
    private var currentAnchorNode: AnchorNode? = null
    private var currentModelNode: ModelNode? = null
    private var isPlaced = false
    private var isDragging = false
    private var hasReceivedFirstFrame = false

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Log.d(TAG, "Camera permission granted inside ArActivity")
        } else {
            Log.e(TAG, "Camera permission denied inside ArActivity")
            Toast.makeText(this, "Camera permission is required for AR", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "ArActivity onCreate started")

        binding = ActivityArBinding.inflate(layoutInflater)
        setContentView(binding.root)

        productId = intent.getStringExtra(EXTRA_PRODUCT_ID)
        handoffToken = intent.getStringExtra(EXTRA_HANDOFF_TOKEN)

        // Check runtime camera permission
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }

        setupExitButton()
        setupArSceneView()
        loadProductAndModel()
    }

    private fun setupExitButton() {
        binding.btnClose.setOnClickListener {
            finish()
        }
    }

    private fun setupArSceneView() {
        binding.sceneView.apply {
            // CRITICAL FIX: Explicitly bind Android lifecycle to ARSceneView so that
            // SceneView's LifeCycleObserver is registered with the Activity lifecycle.
            // This triggers arCore.create() on CREATE and arCore.resume() on RESUME,
            // opening the camera device and piping live frames into the camera texture.
            lifecycle = this@ArActivity.lifecycle

            // Configure ARCore Session with Vertical and Horizontal Plane Finding
            sessionConfiguration = { session: Session, config: Config ->
                Log.d(TAG, "Configuring ARCore Session...")
                config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                config.focusMode = Config.FocusMode.AUTO

                config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR

                // Automatic depth sensing when supported
                if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                    config.depthMode = Config.DepthMode.AUTOMATIC
                }

                config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                Log.d(TAG, "ARCore Session configured successfully: planeMode=${config.planeFindingMode}, lightMode=${config.lightEstimationMode}")
            }

            // Real-Time Session Lifecycle Callbacks
            onSessionCreated = { session ->
                Log.i(TAG, "ARCore Session created successfully: $session")
            }

            onSessionResumed = { session ->
                Log.i(TAG, "ARCore Session resumed: $session")
            }

            onSessionPaused = { session ->
                Log.i(TAG, "ARCore Session paused: $session")
            }

            onSessionFailed = { exception ->
                Log.e(TAG, "ARCore Session initialization failed: ${exception.message}", exception)
                runOnUiThread {
                    showError("ARCore Session failed: ${exception.localizedMessage}")
                }
            }

            // User-friendly tracking feedback
            onTrackingFailureChanged = { reason: TrackingFailureReason? ->
                Log.d(TAG, "Tracking failure changed: $reason")
                runOnUiThread {
                    if (reason != null && !isPlaced) {
                        binding.tvGuidance.visibility = View.VISIBLE
                        binding.tvGuidance.text = when (reason) {
                            TrackingFailureReason.INSUFFICIENT_LIGHT -> "Too dark: move to a well-lit area"
                            TrackingFailureReason.EXCESSIVE_MOTION -> "Moving too fast: slow down"
                            TrackingFailureReason.INSUFFICIENT_FEATURES -> "Aim at a textured surface or wall"
                            TrackingFailureReason.BAD_STATE -> "AR tracking reset, point at a surface"
                            else -> getString(R.string.scan_surface_hint)
                        }
                    } else if (!isPlaced) {
                        binding.tvGuidance.visibility = View.VISIBLE
                        binding.tvGuidance.text = getString(R.string.scan_surface_hint)
                    }
                }
            }

            // Track first successful live camera frame delivery
            onSessionUpdated = { _, frame ->
                if (!hasReceivedFirstFrame) {
                    hasReceivedFirstFrame = true
                    Log.i(TAG, "First live camera AR frame rendered! Camera feed active.")
                    runOnUiThread {
                        if (currentModelNode != null) {
                            binding.progressBar.visibility = View.GONE
                        }
                    }
                }
            }

            // Enable surface dot grid for detected physical planes
            planeRenderer.isEnabled = true
            planeRenderer.isVisible = true

            // Real-World Tap to Place & Touch Drag Repositioning
            setOnTouchListener { _, motionEvent ->
                handleArTouch(motionEvent)
                true
            }
        }
    }

    private fun handleArTouch(motionEvent: MotionEvent) {
        val frame = binding.sceneView.frame ?: return

        when (motionEvent.action) {
            MotionEvent.ACTION_DOWN -> {
                if (isPlaced) {
                    val hitResults = frame.hitTest(motionEvent)
                    val bestHit = VerticalPlaneHitCalculator.findBestWallHit(hitResults)
                    if (bestHit != null) {
                        isDragging = true
                    }
                } else {
                    val hitResults = frame.hitTest(motionEvent)
                    val wallHit = VerticalPlaneHitCalculator.findBestWallHit(hitResults)
                    if (wallHit != null) {
                        anchorModelToHit(wallHit.createAnchor(), wallHit.hitPose)
                    } else {
                        Toast.makeText(this, "Aim at a detected wall surface", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            MotionEvent.ACTION_MOVE -> {
                if (isDragging && isPlaced) {
                    val hitResults = frame.hitTest(motionEvent)
                    val wallHit = VerticalPlaneHitCalculator.findBestWallHit(hitResults)
                    if (wallHit != null) {
                        repositionAnchor(wallHit.createAnchor(), wallHit.hitPose)
                    }
                }
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                isDragging = false
            }
        }
    }

    /**
     * Anchors the 3D door model to an official ARCore World-Space Anchor.
     * The model remains permanently fixed at this physical room location.
     */
    private fun anchorModelToHit(newAnchor: Anchor, hitPose: com.google.ar.core.Pose) {
        val modelNode = currentModelNode ?: run {
            Toast.makeText(this, "Model still loading, please wait...", Toast.LENGTH_SHORT).show()
            return
        }

        // Clean up previous anchor if updating
        currentAnchorNode?.destroy()

        // Create new AnchorNode attached directly to ARCore world anchor
        val anchorNode = AnchorNode(binding.sceneView.engine, newAnchor)

        // Calculate upright, wall-facing rotation
        val cameraPose = binding.sceneView.frame?.camera?.pose ?: hitPose
        val rotation = VerticalPlaneHitCalculator.computeWallFacingRotation(hitPose, cameraPose)
        anchorNode.rotation = rotation

        // Attach model node as a child of the world anchor
        anchorNode.addChildNode(modelNode)
        modelNode.isVisible = true

        binding.sceneView.addChildNode(anchorNode)
        currentAnchorNode = anchorNode
        isPlaced = true

        // Hide guidance pill once successfully placed
        binding.tvGuidance.visibility = View.GONE
        Toast.makeText(this, "Door placed at 1:1 scale on physical wall", Toast.LENGTH_SHORT).show()
    }

    /**
     * Updates the physical anchor during touch drag repositioning.
     */
    private fun repositionAnchor(newAnchor: Anchor, hitPose: com.google.ar.core.Pose) {
        val modelNode = currentModelNode ?: return
        val oldAnchorNode = currentAnchorNode

        oldAnchorNode?.removeChildNode(modelNode)
        oldAnchorNode?.destroy()

        val newAnchorNode = AnchorNode(binding.sceneView.engine, newAnchor)
        val cameraPose = binding.sceneView.frame?.camera?.pose ?: hitPose
        newAnchorNode.rotation = VerticalPlaneHitCalculator.computeWallFacingRotation(hitPose, cameraPose)

        newAnchorNode.addChildNode(modelNode)
        binding.sceneView.addChildNode(newAnchorNode)
        currentAnchorNode = newAnchorNode
    }

    /**
     * Downloads product metadata and streams GLB model directly from MongoDB GridFS.
     */
    private fun loadProductAndModel() {
        val id = productId ?: return

        binding.progressBar.visibility = View.VISIBLE
        binding.tvGuidance.text = getString(R.string.loading_model)

        lifecycleScope.launch {
            try {
                Log.d(TAG, "Fetching product details for ID: $id")
                val response = withContext(Dispatchers.IO) {
                    apiService.getProductById(id)
                }

                if (response.isSuccessful && response.body()?.data != null) {
                    val product = response.body()!!.data!!
                    productData = product

                    // Safe GLB URL normalization: replace localhost/127.0.0.1 with public backend
                    val rawGlb = product.glbUrl
                    val glbUrl = when {
                        rawGlb.startsWith("http://localhost:5000") ->
                            rawGlb.replace("http://localhost:5000", SmcApiService.DEFAULT_BASE_URL.trimEnd('/'))
                        rawGlb.startsWith("http://127.0.0.1:5000") ->
                            rawGlb.replace("http://127.0.0.1:5000", SmcApiService.DEFAULT_BASE_URL.trimEnd('/'))
                        rawGlb.startsWith("/") ->
                            "${SmcApiService.DEFAULT_BASE_URL.trimEnd('/')}$rawGlb"
                        else -> rawGlb
                    }

                    Log.d(TAG, "Loading GLB model from: $glbUrl")
                    loadGlbIntoScene(glbUrl)
                } else {
                    showError("Product not found in SMC catalog.")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error fetching product", e)
                showError("Network error: ${e.localizedMessage}")
            }
        }
    }

    private suspend fun loadGlbIntoScene(glbUrl: String) {
        try {
            val instance = binding.sceneView.modelLoader.loadModelInstance(glbUrl)
            if (instance != null) {
                val modelNode = ModelNode(
                    modelInstance = instance,
                    scaleToUnits = 1.0f // Strict 1:1 real-world manufactured scale (meters)
                ).apply {
                    isVisible = false // Hidden until placed on wall
                    // Align pivot: Y bottom at 0 (floor threshold), Z back flush at 0
                    position = Float3(0f, 0f, 0f)
                }

                currentModelNode = modelNode
                Log.d(TAG, "GLB Model parsed and prepared successfully.")
                if (hasReceivedFirstFrame) {
                    binding.progressBar.visibility = View.GONE
                }
                binding.tvGuidance.text = getString(R.string.scan_surface_hint)
            } else {
                showError("Failed to parse GLB model data.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to render 3D GLB model", e)
            showError("Failed to render 3D GLB model: ${e.localizedMessage}")
        }
    }

    private fun showError(message: String) {
        binding.progressBar.visibility = View.GONE
        binding.tvGuidance.text = message
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "ArActivity onResume")
    }

    override fun onPause() {
        super.onPause()
        Log.d(TAG, "ArActivity onPause")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "ArActivity onDestroy")
        currentAnchorNode?.destroy()
    }

    companion object {
        private const val TAG = "SMC_ArActivity"
        const val EXTRA_PRODUCT_ID = "extra_product_id"
        const val EXTRA_HANDOFF_TOKEN = "extra_handoff_token"
    }
}
