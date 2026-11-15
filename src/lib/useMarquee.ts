import { useEffect, useRef, useState, type RefObject } from 'react';

export type MarqueeRect = { left: number; top: number; width: number; height: number };

type Options = {
  container: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Seleção atual, para somar quando Shift/Ctrl/Cmd está apertado */
  getBase: () => ReadonlySet<string>;
  onSelect: (ids: Set<string>) => void;
  /** Clique simples num espaço vazio */
  onClear: () => void;
};

/** Não começa a seleção em cima destes elementos */
const INTERACTIVE = '[data-link-id], a, button, input, textarea, select, label, .subfolder, .quick-add, .crumbs, .modal, .selection-bar';
const THRESHOLD = 5;
const EDGE = 64;

/**
 * Seleção por arrasto: clicar num espaço vazio e arrastar desenha um retângulo,
 * e todo elemento com data-link-id que ele toca fica selecionado.
 * Só funciona com mouse; em telas de toque a página continua rolando normalmente.
 */
export function useMarquee({ container, enabled, getBase, onSelect, onClear }: Options): MarqueeRect | null {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const latest = useRef({ getBase, onSelect, onClear });
  latest.current = { getBase, onSelect, onClear };

  useEffect(() => {
    const root = container.current;
    if (!enabled || !root) return;

    let start: { x: number; y: number } | null = null; // coordenadas da página (rolam junto)
    let pointer = { x: 0, y: 0, additive: false }; // coordenadas da tela
    let dragging = false;
    let frame = 0;

    const toPage = (x: number, y: number) => ({ x: x + window.scrollX, y: y + window.scrollY });

    function update() {
      if (!start) return;
      const now = toPage(pointer.x, pointer.y);
      const page = {
        left: Math.min(start.x, now.x),
        top: Math.min(start.y, now.y),
        right: Math.max(start.x, now.x),
        bottom: Math.max(start.y, now.y),
      };
      setRect({ left: page.left - window.scrollX, top: page.top - window.scrollY, width: page.right - page.left, height: page.bottom - page.top });

      const hits = new Set<string>(pointer.additive ? latest.current.getBase() : []);
      root!.querySelectorAll<HTMLElement>('[data-link-id]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const l = r.left + window.scrollX;
        const t = r.top + window.scrollY;
        if (l < page.right && l + r.width > page.left && t < page.bottom && t + r.height > page.top) hits.add(el.dataset.linkId!);
      });
      latest.current.onSelect(hits);
    }

    // Rola a página sozinha quando o mouse chega perto da borda
    function autoscroll() {
      if (!dragging) return;
      const speed = pointer.y < EDGE ? -(EDGE - pointer.y) / 3 : pointer.y > window.innerHeight - EDGE ? (pointer.y - (window.innerHeight - EDGE)) / 3 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        update();
      }
      frame = requestAnimationFrame(autoscroll);
    }

    function finish(cancelled = false) {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('marquee-active');
      setRect(null);
      if (!dragging && !cancelled && !pointer.additive) latest.current.onClear();
      dragging = false;
      start = null;
    }

    function onMove(e: PointerEvent) {
      pointer = { x: e.clientX, y: e.clientY, additive: e.shiftKey || e.metaKey || e.ctrlKey };
      if (!start) return;
      if (!dragging) {
        const from = { x: start.x - window.scrollX, y: start.y - window.scrollY };
        if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < THRESHOLD) return;
        dragging = true;
        frame = requestAnimationFrame(autoscroll);
      }
      update();
    }

    function onUp() {
      finish();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (dragging) latest.current.onSelect(new Set()); // desfaz o que o retângulo marcou
      finish(true);
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0 || e.pointerType !== 'mouse') return;
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
      start = toPage(e.clientX, e.clientY);
      pointer = { x: e.clientX, y: e.clientY, additive: e.shiftKey || e.metaKey || e.ctrlKey };
      dragging = false;
      // Evita que o arrasto vire seleção de texto
      document.body.classList.add('marquee-active');
      window.getSelection()?.removeAllRanges();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
    }

    root.addEventListener('pointerdown', onDown);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      finish(true);
    };
  }, [container, enabled]);

  return rect;
}
