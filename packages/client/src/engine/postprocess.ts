// Sets up DefaultRenderingPipeline with bloom, chromatic aberration, vignette
import { Scene, Camera, DefaultRenderingPipeline } from "@babylonjs/core";

export function setupPostProcessing(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);

  // Bloom
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = 0.4;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.5;

  // Chromatic aberration
  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 20;
  pipeline.chromaticAberration.radialIntensity = 1;

  // Image processing (vignette + contrast)
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.5;
  pipeline.imageProcessing.contrast = 1.3;
  pipeline.imageProcessing.exposure = 1.1;

  return pipeline;
}
