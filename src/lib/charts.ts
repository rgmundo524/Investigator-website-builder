export type CaseCategory = { id: string; label: string; count: number | null };

// Unknown counts must not be interpreted as zero or normalized away.
export function summarizeCases(categories: CaseCategory[]) {
  const complete = categories.every(({ count }) => count !== null);
  const total = complete ? categories.reduce((sum, { count }) => sum + count!, 0) : null;
  let offset = 0;
  const slices = categories.map((category) => {
    const percentage = total !== null && total > 0 ? category.count! / total * 100 : null;
    const slice = { ...category, percentage, offset };
    offset += percentage ?? 0;
    return slice;
  });
  return { total, slices, canPlot: total !== null && total > 0 };
}

export function formatShare(percentage: number | null, locale = 'en-US'): string {
  if (percentage === null) return 'Pending';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(percentage / 100);
}

export function categoryUrl(chart: string, category: string): string {
  return `/investigations/${chart}/${category}/`;
}
