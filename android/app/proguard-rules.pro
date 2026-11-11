# Keep ARCore public interfaces
-keep class com.google.ar.core.** { *; }
-dontwarn com.google.ar.core.**

# Keep SceneView & Filament
-keep class io.github.sceneview.** { *; }
-keep class com.google.android.filament.** { *; }

# Keep Models for Gson serialization
-keep class com.smc.doorwindowar.data.model.** { *; }

