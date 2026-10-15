/**
 * Audio PCM16 Utilities for Frontend Web Audio Capture & Playback
 */

export const SAMPLE_RATE = 16000;
export const FRAME_DURATION_MS = 20;
export const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 320 samples

export function float32ToPcm16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

export function pcm16ToFloat32(pcm16Array: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16Array.length);
  for (let i = 0; i < pcm16Array.length; i++) {
    const sample = pcm16Array[i];
    float32[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return float32;
}

export function pcm16ToBase64(pcm16: Int16Array): string {
  const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToPcm16(base64Str: string): Int16Array {
  const binaryStr = atob(base64Str);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

/**
 * Calculates the exact sample count for a given frame duration in milliseconds
 */
export function getSamplesForDuration(durationMs: number, sampleRate: number = SAMPLE_RATE): number {
  return Math.round((sampleRate * durationMs) / 1000);
}

/**
 * Compands 16-bit PCM samples to 8-bit representation (1 byte/sample) for bandwidth-constrained profiles
 */
export function compandPcm16To8(pcm16: Int16Array): Uint8Array {
  const pcm8 = new Uint8Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    const val = Math.max(-128, Math.min(127, Math.round(pcm16[i] / 256)));
    pcm8[i] = val < 0 ? val + 256 : val;
  }
  return pcm8;
}

/**
 * Expands 8-bit companded samples back to 16-bit PCM for audio playback
 */
export function expandPcm8To16(pcm8: Uint8Array): Int16Array {
  const pcm16 = new Int16Array(pcm8.length);
  for (let i = 0; i < pcm8.length; i++) {
    const rawVal = pcm8[i];
    const val = rawVal > 127 ? rawVal - 256 : rawVal;
    pcm16[i] = Math.max(-32768, Math.min(32767, val * 256));
  }
  return pcm16;
}

