import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNpmCli } from './npm-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function launcherOptions(args, env = process.env) {
  const options = { open: true, dataDir: env.SITE_DATA_DIR };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-open') options.open = false;
    else if (args[i] === '--data-dir' && args[i + 1]?.trim()) options.dataDir = args[++i];
    else throw new Error('Usage: node scripts/start-builder.mjs [--no-open] [--data-dir "content folder"]');
  }
  return options;
}

export function localBrowserCommand(url, platform = process.platform, env = process.env) {
  const address = new URL(url);
  if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || !/^\d+$/.test(address.port) || address.pathname !== '/' || address.search || address.hash || address.username || address.password) {
    throw new Error('Only the local builder address can be opened.');
  }
  const command = platform === 'win32' ? env.ComSpec || 'cmd.exe' : platform === 'darwin' ? 'open' : 'xdg-open';
  // cmd.exe has its own quoting rules; match Node's shell invocation rather
  // than applying CRT backslash escaping to the start command's quotes.
  const args = platform === 'win32' ? ['/d', '/s', '/c', `"start "" "${address.href}""`] : [address.href];
  return { command, args, windowsVerbatimArguments: platform === 'win32' };
}

export function openLocalBrowser(url) {
  const plan = localBrowserCommand(url);
  const child = spawn(plan.command, plan.args, { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: plan.windowsVerbatimArguments });
  const fallback = () => console.log(`Open ${url} in your browser.`);
  child.once('error', fallback);
  child.once('exit', code => { if (code) fallback(); });
  child.unref();
}

export async function startBuilder(args = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Install Node.js 24 for Windows, including npm, from https://nodejs.org/en/download/ and start the builder again.');
  const options = launcherOptions(args);
  const npmCli = await resolveNpmCli();
  // The editor uses this same npm for production packages; no npm.cmd shell is needed.
  process.env.npm_execpath = npmCli;
  const prepared = spawnSync(process.execPath, [path.join(root, 'scripts/ensure-dependencies.mjs')], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
  if (prepared.error) throw prepared.error;
  if (prepared.status !== 0) throw new Error('Dependency setup did not finish. Check the message above and start the builder again.');
  process.chdir(root);
  const { tsImport } = await import('tsx/esm/api');
  const { startEditorServer } = await tsImport('./editor-server.ts', import.meta.url);
  const port = Number(process.env.EDITOR_PORT ?? 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('EDITOR_PORT must be a valid local port.');
  const editor = await startEditorServer({ port, dataDir: options.dataDir });
  console.log(`Investigator Website Builder: ${editor.url}`);
  console.log('Keep this window open while you work. Press Ctrl+C here to stop the builder and its preview.');
  console.log('Open or create your content folder, then choose Preview & release > Start local preview.');
  let closing = false;
  const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const close = async () => {
    if (closing) return;
    closing = true;
    try { await editor.close(); process.exitCode = 0; }
    catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { for (const signal of signals) process.removeListener(signal, close); }
  };
  for (const signal of signals) process.once(signal, close);
  if (options.open) openLocalBrowser(editor.url);
  return { ...editor, shutdown: close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startBuilder(); }
  catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'The builder address is already in use. Use the existing builder window, or stop that copy before starting again.' : error.message);
    process.exitCode = 1;
  }
}
