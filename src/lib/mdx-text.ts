import { createProcessor } from '@mdx-js/mdx';

type Node = { type: string; name?: string | null; value?: string; alt?: string | null; children?: Node[]; attributes?: { type: string; name?: string; value?: unknown }[] };
type Expression = { type: string; value?: unknown; properties?: { type: string; computed?: boolean; key: { name?: string; value?: unknown }; value: Expression }[] };

function attributeExpression(value: unknown): Expression | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return (value as { data?: { estree?: { body?: { expression?: Expression }[] } } }).data?.estree?.body?.[0]?.expression;
}

function hiddenAttribute({ name, value }: { name?: string; value?: unknown }): boolean {
  const expression = attributeExpression(value);
  // Inspect literal syntax only. Never run an authored JavaScript expression.
  if (name === 'hidden') return !(expression?.type === 'Literal' && expression.value === false);
  if (name === 'aria-hidden') return value === 'true' || (expression?.type === 'Literal' && expression.value === true);
  if (name !== 'style') return false;
  if (typeof value === 'string') return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important)?\s*(?:;|$)/i.test(value);
  return expression?.type === 'ObjectExpression' && Boolean(expression.properties?.some((property) => {
    if (property.type !== 'Property' || property.computed || property.value?.type !== 'Literal') return false;
    const key = property.key.name ?? property.key.value;
    const literal = String(property.value.value).toLowerCase();
    return (key === 'display' && literal === 'none') || (key === 'visibility' && ['hidden', 'collapse'].includes(literal));
  }));
}

// Extract prose without evaluating JavaScript or indexing imports and component attributes.
export function mdxSearchText(body: string): string {
  const tree = createProcessor().parse(body);
  function text(node: Node): string {
    if (['mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'].includes(node.type) || ['script', 'style', 'template', 'head'].includes(node.name ?? '')) return '';
    const attributes = Array.isArray(node.attributes) ? node.attributes : [];
    if (attributes.some(hiddenAttribute)) return '';
    if (['text', 'code', 'inlineCode'].includes(node.type)) return node.value ?? '';
    if (node.type === 'image') return node.alt ?? '';
    return (node.children ?? []).map(text).filter(Boolean).join(' ');
  }
  return text(tree as unknown as Node).replace(/\s+/g, ' ').trim();
}
