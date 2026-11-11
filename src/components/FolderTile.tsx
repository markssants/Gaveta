import { useState, type DragEvent } from 'react';
import { DRAG_FOLDER, DRAG_LINK, dragState, type Category } from '../lib/types';
import { Favicon } from './Favicon';

type Props = {
  category: Category;
  count: number;
  onOpen: () => void;
  onMoveLink: (linkId: string, categoryId: string) => void;
  onMoveFolder: (folderId: string, parentId: string) => void;
  canNest: (folderId: string | null, parentId: string) => boolean;
};

/**
 * Bloco de gaveta: abre ao clicar, pode ser arrastado para dentro de outra gaveta
 * e recebe links e gavetas soltos em cima dele.
 * É uma div (e não um button) porque o Firefox não deixa arrastar botões.
 */
export function FolderTile({ category: c, count, onOpen, onMoveLink, onMoveFolder, canNest }: Props) {
  const [over, setOver] = useState(false);

  const accepts = (e: DragEvent) =>
    e.dataTransfer.types.includes(DRAG_LINK) || (e.dataTransfer.types.includes(DRAG_FOLDER) && canNest(dragState.folderId, c.id));

  return (
    <div
      role="button"
      tabIndex={0}
      className={'subfolder' + (over ? ' drop-over' : '')}
      title="Clique para abrir · arraste para dentro de outra gaveta"
      draggable
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_FOLDER, c.id);
        e.dataTransfer.effectAllowed = 'move';
        dragState.folderId = c.id;
        document.body.classList.add('dragging-folder');
      }}
      onDragEnd={() => {
        dragState.folderId = null;
        document.body.classList.remove('dragging-folder');
      }}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const folderId = e.dataTransfer.getData(DRAG_FOLDER);
        const linkId = e.dataTransfer.getData(DRAG_LINK);
        if (!folderId && !linkId) return;
        e.preventDefault();
        e.stopPropagation();
        if (folderId) onMoveFolder(folderId, c.id);
        else onMoveLink(linkId, c.id);
      }}
    >
      {c.domain ? (
        <span className="cat-emoji">
          <Favicon url={`https://${c.domain}`} size={18} />
        </span>
      ) : (
        <span className="cat-emoji" style={{ background: c.color + '26' }}>
          {c.emoji}
        </span>
      )}
      <span className="subfolder-name">{c.name}</span>
      <span className="nav-count">{count}</span>
    </div>
  );
}
