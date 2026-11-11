import type { Category } from './types';

/** Monta a árvore de gavetas. Pai inexistente ou referência circular vira gaveta de topo. */
export function buildTree(categories: Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const inLoop = (start: Category) => {
    const seen = new Set([start.id]);
    let parent = start.parentId ? byId.get(start.parentId) : undefined;
    while (parent) {
      if (seen.has(parent.id)) return true;
      seen.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return false;
  };

  const roots: Category[] = [];
  const children = new Map<string, Category[]>();
  for (const c of categories) {
    if (c.parentId && byId.has(c.parentId) && !inLoop(c)) {
      children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
    } else {
      roots.push(c);
    }
  }
  return { roots, children };
}

/** Lista em ordem de árvore, com a profundidade de cada gaveta (para os menus) */
export function flattenTree(categories: Category[]) {
  const { roots, children } = buildTree(categories);
  const out: { category: Category; depth: number }[] = [];
  const visit = (c: Category, depth: number) => {
    out.push({ category: c, depth });
    for (const child of children.get(c.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return out;
}

/** A própria gaveta e tudo que está dentro dela */
export function withDescendants(categories: Category[], id: string): Set<string> {
  const { children } = buildTree(categories);
  const out = new Set<string>();
  const visit = (current: string) => {
    out.add(current);
    for (const child of children.get(current) ?? []) visit(child.id);
  };
  visit(id);
  return out;
}

/** Caminho até a gaveta, da mais externa para a mais interna, sem incluir ela mesma */
export function ancestorsOf(categories: Category[], id: string): Category[] {
  const { roots, children } = buildTree(categories);
  const find = (list: Category[], path: Category[]): Category[] | null => {
    for (const c of list) {
      if (c.id === id) return path;
      const found = find(children.get(c.id) ?? [], [...path, c]);
      if (found) return found;
    }
    return null;
  };
  return find(roots, []) ?? [];
}

/** Total de links de cada gaveta, somando as subpastas */
export function totalsOf(categories: Category[], own: Map<string, number>) {
  const { roots, children } = buildTree(categories);
  const totals = new Map<string, number>();
  const visit = (c: Category): number => {
    const total = (children.get(c.id) ?? []).reduce((sum, child) => sum + visit(child), own.get(c.id) ?? 0);
    totals.set(c.id, total);
    return total;
  };
  roots.forEach(visit);
  return totals;
}
