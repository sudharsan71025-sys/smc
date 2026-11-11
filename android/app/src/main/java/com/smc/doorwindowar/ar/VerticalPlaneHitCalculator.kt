package com.smc.doorwindowar.ar

import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import dev.romainguy.kotlin.math.Float3
import dev.romainguy.kotlin.math.Quaternion
import kotlin.math.atan2

/**
 * Calculates correct wall-facing orientations and vertical upright transformations
 * for architectural doors and windows.
 */
object VerticalPlaneHitCalculator {

    /**
     * Filters a list of ARCore HitResults specifically for vertical wall planes.
     * Falls back to any valid detected plane if no vertical plane is currently in polygon.
     */
    fun findBestWallHit(hitResults: List<HitResult>): HitResult? {
        // Priority 1: Direct vertical plane hit where pose is within plane polygon
        val verticalHit = hitResults.firstOrNull { hit ->
            val trackable = hit.trackable
            trackable is Plane &&
            trackable.type == Plane.Type.VERTICAL &&
            trackable.isPoseInPolygon(hit.hitPose)
        }
        if (verticalHit != null) return verticalHit

        // Priority 2: Any vertical plane hit
        val anyVertical = hitResults.firstOrNull { hit ->
            val trackable = hit.trackable
            trackable is Plane && trackable.type == Plane.Type.VERTICAL
        }
        if (anyVertical != null) return anyVertical

        // Priority 3: Fallback to general plane hit
        return hitResults.firstOrNull { hit ->
            hit.trackable is Plane && (hit.trackable as Plane).isPoseInPolygon(hit.hitPose)
        }
    }

    /**
     * Computes an upright, wall-facing rotation quaternion for the door model.
     * Keeps the door's Y-axis strictly vertical (pointing up in world space),
     * and aligns the door's front direction outward from the wall towards the camera.
     */
    fun computeWallFacingRotation(hitPose: Pose, cameraPose: Pose): Float3 {
        // Extract the camera direction in horizontal XZ plane
        val dx = cameraPose.tx() - hitPose.tx()
        val dz = cameraPose.tz() - hitPose.tz()
        val yawDegrees = Math.toDegrees(atan2(dx.toDouble(), dz.toDouble())).toFloat()

        // Return rotation in Euler degrees (Pitch = 0, Yaw, Roll = 0)
        // Locking pitch and roll ensures the door stands 100% upright against the wall!
        return Float3(0f, yawDegrees, 0f)
    }
}
