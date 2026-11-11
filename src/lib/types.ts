export type Category = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  order: number;
  createdAt: number;
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
