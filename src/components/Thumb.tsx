import { useEffect, useRef, useState } from 'react';
import { loadThumb } from '../lib/data';
import type { LinkItem } from '../lib/types';
import { Favicon } from './Favicon';

/** Só baixa a miniatura quando o card chega perto da tela */
export function Thumb({ uid, link }: { uid: string; link: LinkItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!link.hasThumb || !el) return;
    let alive = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        void loadThumb(uid, link.id).then((data) => alive && setSrc(data));
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [uid, link.id, link.hasThumb]);

  return (
    <div className="card-thumb" ref={ref}>
      {src ? <img src={src} alt="" /> : <Favicon url={link.url} size={32} />}
    </div>
  );
}
