// Sets up DefaultRenderingPipeline with bloom, chromatic aberration, vignette
import { Scene, Camera, DefaultRenderingPipeline } from "@babylonjs/core";

export function setupPostProcessing(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  // hdr:false — avoids the overexposure white-out that occurs in HDR mode when
  // emissive materials (neon strips, car body) feed into an unbounded bloom with
  // no luminance threshold.  LDR mode keeps colours in [0,1] and bloom stays subtle.
  const pipeline = new DefaultRenderingPipeline("default", false, scene, [camera]);

  // Bloom — threshold ensures only genuinely bright neon pixels bloom;
  // lower weight prevents runaway white-out with multiple emissive meshes.
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.3;
  pipeline.bloomWeight = 0.15;
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
  pipeline.imageProcessing.exposure = 1.0;

  return pipeline;
}
