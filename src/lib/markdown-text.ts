import { markdownToHast } from 'satteri';

type SearchNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: SearchNode[];
};

// Use the same Markdown parser as Astro. Raw HTML is parsed into nodes so
// comments and hidden subtrees cannot accidentally become search snippets.
export function markdownSearchText(body: string): string {
  const tree = markdownToHast(body, { features: { rawHtml: true } }) as SearchNode;
  function text(node: SearchNode): string {
    if (node.type === 'comment' || ['script', 'style', 'template', 'head'].includes(node.tagName ?? '')) return '';
    const properties = node.properties ?? {};
    const hidden = properties.hidden;
    const style = typeof properties.style === 'string' ? properties.style : '';
    if ((hidden !== undefined && hidden !== false)
      || String(properties.ariaHidden ?? properties['aria-hidden']).toLowerCase() === 'true'
      || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important)?\s*(?:;|$)/i.test(style)) return '';
    if (node.type === 'text') return node.value ?? '';
    if (node.tagName === 'img') return typeof properties.alt === 'string' ? properties.alt : '';
    return (node.children ?? []).map(text).filter(Boolean).join(' ');
  }
  return text(tree).replace(/\s+/g, ' ').trim();
}
