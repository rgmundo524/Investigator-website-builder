import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { pruneUnusedBuildImages, sanitizePublishedImages } from '../src/lib/image-privacy';

export default function imagePrivacy(): AstroIntegration {
  let imageConfig: Parameters<typeof sanitizePublishedImages>[1];
  let publicDirectory: string;
  return {
    name: 'image-privacy',
    hooks: {
      'astro:config:done': ({ config }) => {
        imageConfig = config.image;
        publicDirectory = fileURLToPath(config.publicDir);
      },
      'astro:build:done': async ({ dir, logger }) => {
        const directory = fileURLToPath(dir);
        const removed = await pruneUnusedBuildImages(directory, publicDirectory);
        if (removed) logger.info(`Removed ${removed} unused generated image${removed === 1 ? '' : 's'}.`);
        const count = await sanitizePublishedImages(directory, imageConfig);
        if (count) logger.info(`Removed embedded metadata from ${count} published image${count === 1 ? '' : 's'}.`);
      },
    },
  };
}
