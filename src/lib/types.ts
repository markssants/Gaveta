export type Category = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  order: number;
  createdAt: number;
  /** Gaveta em que esta está dentro. Vazio = gaveta de topo */
  parentId?: string | null;
  /** Preenchido nas gavetas criadas pelo agrupamento automático */
  domain?: string;
};

export type LinkItem = {
  id: string;
  url: string;
  title: string;
  note: string;
  /** null = Caixa de entrada */
  categoryId: string | null;
  favorite: boolean;
  createdAt: number;
  /** A miniatura fica em users/{uid}/thumbs/{id}, gravada uma vez só ao salvar */
  hasThumb?: boolean;
};

export type NewLink = Omit<LinkItem, 'id'>;

export const CATEGORY_COLORS = [
  '#e07a5f',
  '#f2a541',
  '#7fb069',
  '#3d8bd9',
  '#9b72cf',
  '#e05d8f',
  '#3fb0b5',
  '#8a8580',
];

/** Tipo de dado usado ao arrastar um card para outra gaveta */
export const DRAG_LINK = 'application/x-gaveta-link';
