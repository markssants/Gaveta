import { auth } from './firebase';

const WIDTH = 480;
const HEIGHT = 270;
export { isValidThumb, MAX_THUMB_CHARS } from './thumbFormat';
import { isValidThumb } from './thumbFormat';

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

/** Busca a imagem de preview da página. Roda ao salvar o link e quando a pessoa pede para recarregar. */
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
