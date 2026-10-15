/**
 * Audio PCM16 Converter and Frame Packager for CSE Voice Hub (Phase 4)
 */

export const SAMPLE_RATE = 16000;
export const FRAME_DURATION_MS = 20;
export const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 320 samples
export const BYTES_PER_SAMPLE = 2; // Int16
export const PCM16_FRAME_BYTE_SIZE = SAMPLES_PER_FRAME * BYTES_PER_SAMPLE; // 640 bytes

/**
 * Converts Float32 audio samples (-1.0 to +1.0) into 16-bit PCM signed integer ArrayBuffer (Little-Endian).
 */
export function float32ToPcm16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Converts 16-bit signed PCM integer samples into Float32 audio samples (-1.0 to +1.0).
 */
export function pcm16ToFloat32(pcm16Array: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16Array.length);
  for (let i = 0; i < pcm16Array.length; i++) {
    const sample = pcm16Array[i];
    float32[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return float32;
}

/**
 * Encodes an Int16Array or Buffer into a Base64 string safely.
 */
export function pcm16ToBase64(pcm16: Int16Array | Buffer): string {
  const buffer = pcm16 instanceof Buffer ? pcm16 : Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  return buffer.toString('base64');
}

/**
 * Decodes a Base64 string into an Int16Array (PCM16).
 */
export function base64ToPcm16(base64Str: string): Int16Array {
  const buf = Buffer.from(base64Str, 'base64');
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}
