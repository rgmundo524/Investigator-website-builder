import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { packageSite } from '../scripts/package-site';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'site-package-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'builder');
  const data = path.join(parent, 'person');
  await mkdir(root);
  await mkdir(path.join(data, 'content'), { recursive: true });
  await writeFile(path.join(data, 'site.json'), JSON.stringify({ version: 1, url: 'https://person.example' }));
  await writeFile(path.join(data, 'private-review.txt'), 'Private source, never copied');
  await mkdir(path.join(data, 'content', 'profile'), { recursive: true });
  await mkdir(path.join(data, 'content', 'pages'), { recursive: true });
  await writeFile(path.join(data, 'content/profile/person.md'), '---\nslug: person\npublication_status: published\nname: Person\nheadline: Investigator\ndescription_short: Public profile.\n---\nProfile source.\n');
  await writeFile(path.join(data, 'content/pages/home.md'), '---\nslug: home\npublication_status: published\ntitle: Home\nprofile: person\ndescription_short: Public homepage.\n---\nHomepage introduction.\n');
  return { parent, root, data, env: { SITE_DATA_DIR: data } };
}

test('packages a fresh published build and only its static files', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, 'dist-drafts'));
  await writeFile(path.join(f.root, 'dist-drafts', 'secret.html'), 'Draft');
  const target = path.join(f.parent, 'release');
  const result = await packageSite(target, {
    ...f,
    env: { ...f.env, SITE_URL: 'https://published.example' },
    runBuild: async (env) => {
      assert.equal(env.CONTENT_PREVIEW, undefined);
      assert.equal(env.SITE_DATA_DIR, f.data);
      await mkdir(path.join(f.root, 'dist', 'assets'), { recursive: true });
      await writeFile(path.join(f.root, 'dist', 'index.html'), 'Published home');
      await writeFile(path.join(f.root, 'dist', 'assets', 'photo.webp'), 'Public photo');
    },
  });
  assert.equal(result.files, 2);
  assert.equal(result.url, 'https://published.example');
  assert.deepEqual((await readdir(target)).sort(), ['assets', 'index.html']);
  assert.equal(await readFile(path.join(target, 'index.html'), 'utf8'), 'Published home');
  assert.equal(await readFile(path.join(f.root, 'dist-drafts', 'secret.html'), 'utf8'), 'Draft');
});

test('refuses draft mode before building or creating an output', async (t) => {
  const f = await fixture(t);
  let ran = false;
  await assert.rejects(packageSite(path.join(f.parent, 'release'), {
    ...f, env: { ...f.env, CONTENT_PREVIEW: 'drafts' }, runBuild: () => { ran = true; },
  }), /published content/);
  assert.equal(ran, false);
  assert.deepEqual((await readdir(f.parent)).sort(), ['builder', 'person']);
});

test('requires deliberate selection of the person being packaged', async (t) => {
  const f = await fixture(t);
  let ran = false;
  await assert.rejects(packageSite(path.join(f.parent, 'release'), {
    root: f.root, env: {}, runBuild: () => { ran = true; },
  }), /Set SITE_DATA_DIR/);
  assert.equal(ran, false);
});

test('does not package stale dist files if the fresh build creates no output', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, 'dist'));
  await writeFile(path.join(f.root, 'dist', 'index.html'), 'Previous person');
  await assert.rejects(packageSite(path.join(f.parent, 'release'), { ...f, runBuild: () => {} }), /ENOENT|index\.html/);
  assert.deepEqual((await readdir(f.parent)).sort(), ['builder', 'person']);
});

test('refuses an unpublished or missing homepage before clearing existing output or creating a release', async (t) => {
  for (const mode of ['draft', 'missing'] as const) {
    const f = await fixture(t);
    const home = path.join(f.data, 'content/pages/home.md');
    if (mode === 'draft') await writeFile(home, (await readFile(home, 'utf8')).replace('publication_status: published', 'publication_status: draft'));
    else await rm(home);
    await mkdir(path.join(f.root, 'dist'));
    await writeFile(path.join(f.root, 'dist', 'index.html'), 'Existing output stays intact.');
    let ran = false;
    const target = path.join(f.parent, 'release');
    await assert.rejects(packageSite(target, { ...f, runBuild: () => { ran = true; } }), /Home page is not published/);
    assert.equal(ran, false);
    assert.equal(await readFile(path.join(f.root, 'dist/index.html'), 'utf8'), 'Existing output stays intact.');
    assert.deepEqual((await readdir(f.parent)).sort(), ['builder', 'person']);
  }
});

test('preserves selected data located in dist or a nested dist directory', async (t) => {
  for (const relative of ['dist', path.join('dist', 'person')]) {
    const f = await fixture(t);
    const selected = path.join(f.root, relative);
    await mkdir(path.join(selected, 'content'), { recursive: true });
    await writeFile(path.join(selected, 'site.json'), JSON.stringify({ version: 1, url: 'https://person.example' }));
    const sentinel = path.join(selected, 'content', 'keep.md');
    await writeFile(sentinel, 'Original source must survive');
    let ran = false;
    await assert.rejects(packageSite(path.join(f.parent, 'release'), {
      ...f, env: { SITE_DATA_DIR: selected }, runBuild: () => { ran = true; },
    }), /input overlaps the build output/);
    assert.equal(ran, false);
    assert.equal(await readFile(sentinel, 'utf8'), 'Original source must survive');
  }
});

test('preserves content, assets and public inputs linked into dist', { skip: process.platform === 'win32' }, async (t) => {
  for (const name of ['content', 'assets', 'public']) {
    const f = await fixture(t);
    const actual = path.join(f.root, 'dist', name);
    await mkdir(actual, { recursive: true });
    const sentinel = path.join(actual, 'keep.txt');
    await writeFile(sentinel, 'Linked source must survive');
    await rm(path.join(f.data, name), { recursive: true, force: true });
    await symlink(actual, path.join(f.data, name));
    let ran = false;
    await assert.rejects(packageSite(path.join(f.parent, 'release'), {
      ...f, runBuild: () => { ran = true; },
    }), /input overlaps the build output/);
    assert.equal(ran, false);
    assert.equal(await readFile(sentinel, 'utf8'), 'Linked source must survive');
  }
});

test('rejects a selected path inside dist even when it links to external data', { skip: process.platform === 'win32' }, async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, 'dist'));
  const linked = path.join(f.root, 'dist', 'person');
  await symlink(f.data, linked);
  let ran = false;
  await assert.rejects(packageSite(path.join(f.parent, 'release'), {
    ...f, env: { SITE_DATA_DIR: linked }, runBuild: () => { ran = true; },
  }), /input overlaps the build output/);
  assert.equal(ran, false);
  assert.equal(await readFile(path.join(linked, 'private-review.txt'), 'utf8'), 'Private source, never copied');
});

test('refuses existing and source-contained destinations without overwriting', async (t) => {
  const f = await fixture(t);
  let ran = false;
  const runBuild = () => { ran = true; };
  await assert.rejects(packageSite(f.data, { ...f, runBuild }), /outside/);
  await assert.rejects(packageSite(path.join(f.root, 'release'), { ...f, runBuild }), /outside/);
  const target = path.join(f.parent, 'release');
  await mkdir(target);
  await writeFile(path.join(target, 'keep.txt'), 'keep');
  await assert.rejects(packageSite(target, { ...f, runBuild }), /already exists/);
  assert.equal(ran, false);
  assert.equal(await readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep');
});

test('does not follow build symlinks into private source files', { skip: process.platform === 'win32' }, async (t) => {
  const f = await fixture(t);
  await assert.rejects(packageSite(path.join(f.parent, 'release'), {
    ...f,
    runBuild: async () => {
      await mkdir(path.join(f.root, 'dist'));
      await writeFile(path.join(f.root, 'dist', 'index.html'), 'Published home');
      await symlink(path.join(f.data, 'private-review.txt'), path.join(f.root, 'dist', 'private.txt'));
    },
  }), /symbolic link/);
  assert.deepEqual((await readdir(f.parent)).sort(), ['builder', 'person']);
});
