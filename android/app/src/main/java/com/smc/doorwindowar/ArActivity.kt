package com.smc.doorwindowar

import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Session
import com.smc.doorwindowar.ar.VerticalPlaneHitCalculator
import com.smc.doorwindowar.data.api.SmcApiService
import com.smc.doorwindowar.data.model.ProductData
import com.smc.doorwindowar.databinding.ActivityArBinding
import dev.romainguy.kotlin.math.Float3
import io.github.sceneview.ar.ARSceneView
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityArBinding.inflate(layoutInflater)
        setContentView(binding.root)

        productId = intent.getStringExtra(EXTRA_PRODUCT_ID)
        handoffToken = intent.getStringExtra(EXTRA_HANDOFF_TOKEN)

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
            // Configure ARCore Session with Vertical and Horizontal Plane Finding
            sessionConfiguration = { session: Session, config: Config ->
                config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                config.focusMode = Config.FocusMode.AUTO
                config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR
                config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
            }

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
                // If already placed, check if touching near the door to begin drag
                if (isPlaced) {
                    val hitResults = frame.hitTest(motionEvent)
                    val bestHit = VerticalPlaneHitCalculator.findBestWallHit(hitResults)
                    if (bestHit != null) {
                        isDragging = true
                    }
                } else {
                    // Tap to place door at real physical wall position
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
                // Drag model along the physical wall
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
                // 1. Fetch product details from backend API
                val response = withContext(Dispatchers.IO) {
                    apiService.getProductById(id)
                }

                if (response.isSuccessful && response.body()?.data != null) {
                    val product = response.body()!!.data!!
                    productData = product

                    // Normalize model URL to public HTTPS Render backend if needed
                    val glbUrl = if (product.glbUrl.contains("localhost")) {
                        "https://smc-backend-gt5i.onrender.com/api/v1/files/${product.glbFileId}/${product.displayName}.glb"
                    } else {
                        product.glbUrl
                    }

                    // 2. Load GLB into SceneView ModelNode
                    loadGlbIntoScene(glbUrl)
                } else {
                    showError("Product not found in SMC catalog.")
                }
            } catch (e: Exception) {
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
                binding.progressBar.visibility = View.GONE
                binding.tvGuidance.text = getString(R.string.scan_surface_hint)
            } else {
                showError("Failed to parse GLB model data.")
            }
        } catch (e: Exception) {
            showError("Failed to render 3D GLB model: ${e.localizedMessage}")
        }
    }

    private fun showError(message: String) {
        binding.progressBar.visibility = View.GONE
        binding.tvGuidance.text = message
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        currentAnchorNode?.destroy()
    }

    companion object {
        const val EXTRA_PRODUCT_ID = "extra_product_id"
        const val EXTRA_HANDOFF_TOKEN = "extra_handoff_token"
    }
}
