import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';

// Page-owned text uses the same Markdown engine as Astro's content pipeline.
const processor = createSatteriMarkdownProcessor({ syntaxHighlight: false });

export async function pageMarkdown(source: string | undefined): Promise<string> {
  if (!source?.trim()) return '';
  return (await (await processor).render(source)).code;
}
