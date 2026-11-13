import { dev } from 'astro';

const port = Number(process.env.SITE_EDITOR_PREVIEW_PORT ?? 4323);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local preview port.');

const server = await dev({
  // Keep the per-site root from astro.config; overriding it shares generated
  // content with unrelated previews running from the same checkout.
  server: { host: '127.0.0.1', port, open: false, allowedHosts: ['127.0.0.1', 'localhost'] },
  vite: { server: { host: '127.0.0.1', port, strictPort: true } },
});
if (server.address.port !== port || server.address.address !== '127.0.0.1') {
  await server.stop();
  throw new Error('Preview did not bind to its requested loopback address.');
}
console.log(`SERVER_READY http://127.0.0.1:${port}/`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  try { await server.stop(); process.exitCode = 0; }
  catch { process.exitCode = 1; }
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
process.once('SIGHUP', stop);
if (process.platform === 'win32') process.once('SIGBREAK', stop);
