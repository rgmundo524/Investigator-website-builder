import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { astroWorkspace } from '../scripts/astro-workspace';
import { initializeSite } from '../scripts/init-site';
import { builderRoot, resolveSiteData } from '../scripts/site-data';

test('Astro generated roots are separate by site and preview mode', () => {
  const first = astroWorkspace('one', '/builder', {});
  const second = astroWorkspace('two', '/builder', {});
  const drafts = astroWorkspace('one', '/builder', { CONTENT_PREVIEW: 'drafts' });
  assert.notEqual(first.root, second.root);
  assert.notEqual(first.root, drafts.root);
  assert.notEqual(first.cacheDir, drafts.cacheDir);
  assert.equal(first.srcDir, second.srcDir);
  assert.equal(first.outDir, '/builder/dist');
  assert.equal(drafts.outDir, '/builder/dist-drafts');
});

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function preview(dataDir: string) {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(builderRoot, 'scripts/editor-preview.ts')], {
    cwd: builderRoot,
    env: { ...process.env, SITE_DATA_DIR: dataDir, CONTENT_PREVIEW: 'drafts', SITE_EDITOR_PREVIEW_PORT: String(port), ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const closed = once(child, 'close');
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Preview startup timed out: ${logs}`)), 45_000);
    timeout.unref();
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', () => { clearTimeout(timeout); reject(new Error(`Preview stopped: ${logs}`)); });
    const collect = (chunk: Buffer) => {
      logs = (logs + chunk.toString()).slice(-16_000);
      if (logs.includes(`SERVER_READY http://127.0.0.1:${port}/`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
    timeout.unref();
    try { await closed; } finally { clearTimeout(timeout); }
  };
  try { await ready; }
  catch (error) { await stop(); throw error; }
  return {
    stop,
    async html(route: string) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(15_000) });
      const html = await response.text();
      assert.equal(response.status, 200, logs);
      assert.ok(html.includes('<!DOCTYPE html>'), `Expected a complete page, not a render failure: ${logs}`);
      return html;
    },
  };
}

test('simultaneous previews retain their own profile and casebook from the same checkout', { timeout: 90_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'astro-content-isolation-'));
  const sites: string[] = [];
  const previews: Awaited<ReturnType<typeof preview>>[] = [];
  try {
    for (const [index, name] of ['Isolation Alpha Investigator', 'Isolation Beta Investigator'].entries()) {
      const site = await initializeSite(path.join(temporary, String(index)));
      sites.push(site);
      const profile = path.join(site, 'content/profile/investigator.md');
      await writeFile(profile, (await readFile(profile, 'utf8')).replace('[Your full name]', name));
      for (let number = 0; number <= index; number++) {
        await writeFile(path.join(site, `content/cases/isolation-${number}.md`), `---\nslug: isolation-${number}\npublication_status: draft\ncase_number: "ISOLATION-${index}-${number}"\ntitle: Isolation case ${index} ${number}\ndescription_short: Temporary regression case.\nchart: criminal-investigations\ncategory: hacks\ncontent_kind: case_study\n---\nTemporary regression data.\n`);
      }
    }
    previews.push(await preview(sites[0]));
    assert.match(await previews[0].html('/'), /Isolation Alpha Investigator/);
    previews.push(await preview(sites[1]));
    for (const index of [1, 0, 1]) {
      const home = await previews[index].html('/');
      assert.ok(home.includes(index === 0 ? 'Isolation Alpha Investigator' : 'Isolation Beta Investigator'));
      assert.ok(!home.includes(index === 0 ? 'Isolation Beta Investigator' : 'Isolation Alpha Investigator'));
      const casebook = await previews[index].html('/casework/');
      assert.match(casebook, new RegExp(`Recorded cases</dt>\\s*<dd>${index + 1}</dd>`));
      const workspace = astroWorkspace(resolveSiteData(sites[index]).cacheKey, builderRoot, { CONTENT_PREVIEW: 'drafts' });
      const store = await readFile(path.join(workspace.root, '.astro/data-store.json'), 'utf8');
      assert.ok(store.includes(index === 0 ? 'Isolation Alpha Investigator' : 'Isolation Beta Investigator'));
      assert.ok(!store.includes(index === 0 ? 'Isolation Beta Investigator' : 'Isolation Alpha Investigator'));
    }
  } finally {
    await Promise.all(previews.map((server) => server.stop()));
    for (const site of sites) {
      const workspace = astroWorkspace(resolveSiteData(site).cacheKey, builderRoot, { CONTENT_PREVIEW: 'drafts' });
      await rm(path.dirname(workspace.root), { recursive: true, force: true });
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
