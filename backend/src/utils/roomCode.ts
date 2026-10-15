import crypto from 'crypto';

// Alphabet excluding ambiguous characters: 0, O, I, 1
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RANDOM_LENGTH = 6;
const PREFIX = 'CVH-';

/**
 * Generates a cryptographically secure random room code.
 * Example output: "CVH-7K4P2M"
 */
export const generateRoomCode = (): string => {
  let randomStr = '';
  const bytes = crypto.randomBytes(RANDOM_LENGTH);

  for (let i = 0; i < RANDOM_LENGTH; i++) {
    const index = bytes[i] % ROOM_CODE_ALPHABET.length;
    randomStr += ROOM_CODE_ALPHABET[index];
  }

  return `${PREFIX}${randomStr}`;
};

/**
 * Normalizes a raw user-input room code.
 * Trims whitespace, converts to uppercase.
 * Example: "  cvh-7k4p2m " -> "CVH-7K4P2M"
 */
export const normalizeRoomCode = (rawCode: string): string => {
  if (!rawCode || typeof rawCode !== 'string') {
    return '';
  }

  let code = rawCode.trim().toUpperCase();

  // If user entered without prefix (e.g. "7K4P2M"), prepend CVH- if length is 6
  if (code.length === 6 && !code.startsWith(PREFIX)) {
    code = `${PREFIX}${code}`;
  }

  return code;
};

/**
 * Validates whether a normalized string matches expected Room Code format.
 * Format: CVH-XXXXXX (6 alphanumeric chars from allowed set)
 */
export const isValidRoomCode = (code: string): boolean => {
  const normalized = normalizeRoomCode(code);
  const regex = /^CVH-[A-Z2-9]{6}$/;
  return regex.test(normalized);
};
