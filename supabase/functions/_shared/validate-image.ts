const MAX_BYTES = 4 * 1024 * 1024;

const MAGIC = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (must also check WEBP at offset 8)
];

export type ImageValidationResult =
  | { valid: true; mime: string; bytes: Uint8Array }
  | { valid: false; reason: "empty" | "too_large" | "bad_magic" | "decode_error" };

export function validateImageBase64(input: string): ImageValidationResult {
  if (!input) return { valid: false, reason: "empty" };

  const stripped = input.startsWith("data:") ? input.split(",")[1] ?? "" : input;
  if (stripped.length * 0.75 > MAX_BYTES) {
    return { valid: false, reason: "too_large" };
  }

  let bytes: Uint8Array;
  try {
    const bin = atob(stripped);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { valid: false, reason: "decode_error" };
  }

  if (bytes.byteLength > MAX_BYTES) return { valid: false, reason: "too_large" };
  if (bytes.byteLength < 8) return { valid: false, reason: "bad_magic" };

  for (const m of MAGIC) {
    if (m.bytes.every((b, i) => bytes[i] === b)) {
      if (m.mime === "image/webp") {
        const webp = [0x57, 0x45, 0x42, 0x50];
        if (!webp.every((b, i) => bytes[8 + i] === b)) continue;
      }
      return { valid: true, mime: m.mime, bytes };
    }
  }
  return { valid: false, reason: "bad_magic" };
}
