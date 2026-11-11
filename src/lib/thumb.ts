import { auth } from './firebase';

const WIDTH = 480;
const HEIGHT = 270;
/** Limite da miniatura em texto base64 (o documento do Firestore aceita até 1 MB) */
export const MAX_THUMB_CHARS = 200_000;

/** Aceita só JPEG/WebP em base64, o formato que a extensão envia */
export function isValidThumb(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_THUMB_CHARS && /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/** Reduz a imagem para 480×270, cortando pelo centro, e devolve como JPEG em base64 */
async function shrink(blob: Blob): Promise<string | null> {
  const image = await createImageBitmap(blob);
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff'; // PNG transparente não fica preto no JPEG
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(image, (WIDTH - image.width * scale) / 2, (HEIGHT - image.height * scale) / 2, image.width * scale, image.height * scale);
  image.close();
  const data = canvas.toDataURL('image/jpeg', 0.72);
  return isValidThumb(data) ? data : null;
}

/** Busca a imagem de preview da página. Roda uma vez só, ao salvar o link. */
export async function fetchThumb(url: string): Promise<string | null> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;
    const r = await fetch('/api/thumb?url=' + encodeURIComponent(url), { headers: { authorization: `Bearer ${token}` } });
    if (r.status !== 200) return null;
    return await shrink(await r.blob());
  } catch {
    return null;
  }
}
