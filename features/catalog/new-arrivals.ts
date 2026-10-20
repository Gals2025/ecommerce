type ArrivalCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
};

// Resolve subcategories through their parents, without guessing from product names.
export function getNewArrivalCategoryGroups(categories: ArrivalCategory[]): string[][] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const groups: string[][] = [[], [], [], []];

  for (const category of categories) {
    let current: ArrivalCategory | undefined = category;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const label = `${current.slug} ${current.name}`
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]+/g, " ");
      if (/\b(accessories|accessory|bags|balls|grips)\b/.test(label)) break;
      const rank = /\bpaddles?\b/.test(label) ? 0
        : /\b(shoes?|footwear)\b/.test(label) ? 1
        : /\b(women|womens|ladies)\b/.test(label) ? 3
        : /\b(men|mens)\b/.test(label) ? 2
        : -1;
      if (rank >= 0) {
        groups[rank].push(category.id);
        break;
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return groups;
}
