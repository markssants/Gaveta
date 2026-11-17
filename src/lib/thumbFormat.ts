/** Limite da miniatura em texto base64 (o documento do Firestore aceita até 1 MB) */
export const MAX_THUMB_CHARS = 200_000;

/** Aceita só JPEG/WebP em base64, o formato que a extensão envia */
export function isValidThumb(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_THUMB_CHARS && /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}
