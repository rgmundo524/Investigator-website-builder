import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const unquote = (value) => value.trim().replace(/^"(.*)"$/, '$1');

function environmentValue(env, name) {
  const key = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
  return key && typeof env[key] === 'string' ? env[key] : '';
}

function installedCandidates(directory) {
  return [
    // Official Windows installations keep npm beside node.exe.
    path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // Unix installations normally put node in <prefix>/bin.
    path.resolve(directory, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(directory, '../share/nodejs/npm/bin/npm-cli.js'),
  ];
}

async function javascriptCli(candidate) {
  try {
    const resolved = await realpath(candidate);
    if (!/\.[cm]?js$/i.test(resolved) || !(await stat(resolved)).isFile()) return undefined;
    return resolved;
  } catch { return undefined; }
}

/** Find npm's JavaScript entry point so Node can run it without npm.cmd or a shell. */
export async function resolveNpmCli({ env = process.env, nodePath = process.execPath } = {}) {
  const preferred = unquote(environmentValue(env, 'npm_execpath'));
  if (preferred) {
    const resolved = await javascriptCli(preferred);
    if (resolved) return resolved;
  }

  const candidates = installedCandidates(path.dirname(path.resolve(nodePath)));
  for (const entry of environmentValue(env, 'PATH').split(path.delimiter)) {
    const directory = unquote(entry);
    if (!directory) continue;
    candidates.push(...installedCandidates(directory), path.join(directory, 'npm-cli.js'), path.join(directory, 'npm'));
  }
  for (const candidate of new Set(candidates)) {
    const resolved = await javascriptCli(candidate);
    if (resolved) return resolved;
  }
  throw new Error('Could not find npm’s JavaScript CLI (npm-cli.js). Install Node.js 24 with npm and reopen the builder, or set npm_execpath to the installed npm-cli.js file.');
}
