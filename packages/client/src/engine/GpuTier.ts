/**
 * GPU tier detection for adaptive quality settings.
 * Detects GPU tier at startup via WebGL renderer string.
 * Returns 0 (low), 1 (mid), 2 (high).
 */

export type GpuTier = 0 | 1 | 2;

export interface QualitySettings {
  tier: GpuTier;
  enablePostProcessing: boolean;
  enableGlow: boolean;
  enableShadows: boolean;
  targetFps: number;
  textureScale: number;
  particleLimit: number;
  drawDistanceMultiplier: number;
}

// Keywords that indicate low-tier integrated / mobile GPUs
const LOW_TIER_PATTERNS = [
  /mali/i,
  /adreno\s*[1-4]\d{2}/i,
  /powervr/i,
  /sgx/i,
  /intel.*hd\s*graphics\s*[2-4]\d{3}/i,
  /intel.*uhd\s*graphics\s*[5-6]\d{2}/i,
  /llvmpipe/i,
  /swiftshader/i,
  /vivante/i,
];

// Keywords that indicate high-tier dedicated GPUs
const HIGH_TIER_PATTERNS = [
  /geforce\s*(rtx|gtx\s*[89]\d{2}|gtx\s*1\d{3}|gtx\s*[2-9]\d{3})/i,
  /radeon\s*(rx|pro\s*[5-9]\d{2}|vega)/i,
  /adreno\s*[6-9]\d{2}/i,
  /apple\s*(m[1-9]|a1[4-9])/i,
];

/** Detect GPU tier from WebGL renderer string */
export function detectGpuTier(): GpuTier {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return 1; // fallback: mid

    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return 1;

    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;

    if (LOW_TIER_PATTERNS.some((re) => re.test(renderer))) return 0;
    if (HIGH_TIER_PATTERNS.some((re) => re.test(renderer))) return 2;
    return 1;
  } catch {
    return 1; // safe default
  }
}

/** Map tier to quality settings */
export function qualitySettingsForTier(tier: GpuTier): QualitySettings {
  switch (tier) {
    case 0:
      return {
        tier,
        enablePostProcessing: false,
        enableGlow: false,
        enableShadows: false,
        targetFps: 30,
        textureScale: 0.5,
        particleLimit: 20,
        drawDistanceMultiplier: 0.6,
      };
    case 1:
      return {
        tier,
        enablePostProcessing: true,
        enableGlow: true,
        enableShadows: false,
        targetFps: 60,
        textureScale: 1.0,
        particleLimit: 80,
        drawDistanceMultiplier: 1.0,
      };
    case 2:
      return {
        tier,
        enablePostProcessing: true,
        enableGlow: true,
        enableShadows: true,
        targetFps: 60,
        textureScale: 1.0,
        particleLimit: 200,
        drawDistanceMultiplier: 1.5,
      };
  }
}
