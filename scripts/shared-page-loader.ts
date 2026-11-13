import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Loader, LoaderContext } from 'astro/loaders';
import { loadContent } from './content';
import { resolveSharedPage } from '../src/lib/shared-values';

/** Page-only Markdown rendering with explicit, validated shared text values. */
export function sharedPageLoader(contentDir: string): Loader {
  return {
    name: 'shared-page-text',
    async load(context: LoaderContext) {
      const { store, watcher, logger, config } = context;
      const sync = async () => {
        // Read the selected pack on every sync, not a snapshot captured when
        // content.config was imported. Profile/contact edits must update pages.
        const records = await loadContent(contentDir);
        const remaining = new Set(store.keys());
        for (const record of records) {
          if (record.collection !== 'pages') continue;
          const page = resolveSharedPage(record, records);
          const id = page.data.slug;
          remaining.delete(id);
          const filePath = path.relative(fileURLToPath(config.root), page.file).split(path.sep).join('/');
          const data = await context.parseData({ id, data: page.data, filePath: page.file });
          // Includes resolved text: a source value changing invalidates this
          // page even when the page's Markdown file itself did not change.
          const digest = context.generateDigest({ sharedValuesVersion: 1, filePath, data, body: page.body });
          const deferredRender = page.file.endsWith('.mdx');
          if (deferredRender) store.addModuleImport(filePath);
          const existing = store.get(id);
          if (existing?.digest === digest) {
            // Asset imports are registered per content sync. Re-store cached
            // entries with images using the public store API so subsequent
            // builds retain the Markdown image imports too.
            if (existing.assetImports?.length) {
              store.delete(id);
              store.set(existing);
            }
            continue;
          }
          if (deferredRender) {
            store.set({ id, data, body: page.body, filePath, digest, deferredRender: true });
          } else {
            const rendered = await context.renderMarkdown(page.body, { fileURL: pathToFileURL(page.file) });
            store.set({ id, data, body: page.body, filePath, digest, rendered, assetImports: rendered.metadata?.imagePaths });
          }
        }
        for (const id of remaining) store.delete(id);
      };
      await sync();
      if (!watcher) return;
      const sources = ['pages', 'profile', 'contacts'].map((name) => path.join(contentDir, name));
      watcher.add(sources);
      let pending = Promise.resolve();
      const update = (file: string) => {
        const relative = path.relative(contentDir, file).split(path.sep).join('/');
        if (!/^(pages|profile|contacts)\/.+\.mdx?$/.test(relative)) return;
        pending = pending.then(sync).catch((error: unknown) => {
          // A hidden/deleted source must never leave its old public value in
          // the page cache. The log identifies the exact field to correct.
          store.clear();
          logger.error(error instanceof Error ? error.message : String(error));
        });
      };
      watcher.on('add', update);
      watcher.on('change', update);
      watcher.on('unlink', update);
    },
  };
}
