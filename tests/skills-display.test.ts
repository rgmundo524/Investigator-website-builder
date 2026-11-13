import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stringify } from 'yaml';
import { schemas } from '../src/content/schemas';

const root = fileURLToPath(new URL('..', import.meta.url));
const skill = { slug: 'analysis', title: 'Analysis', description_short: 'How this skill is used.' };

test('reviewed skills can publish with or without a rating while supplied ratings retain their validation', () => {
  assert.equal(schemas.skills.parse(skill).proficiency, null);
  assert.equal(schemas.skills.safeParse({ ...skill, publication_status: 'draft', proficiency: null }).success, true);
  for (const value of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
    assert.equal(schemas.skills.safeParse({ ...skill, publication_status: 'published', proficiency: value }).success, true);
  }
  for (const value of [null, undefined]) {
    const result = schemas.skills.safeParse({ ...skill, publication_status: 'published', proficiency: value });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.proficiency, null);
  }
  for (const value of [0, 0.5, 5.5, 2.25, '3']) {
    assert.equal(schemas.skills.safeParse({ ...skill, publication_status: 'published', proficiency: value }).success, false);
  }
});

test('skills previews retain names and details without exposing unrated states, and preserve fractional dots and stars', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'skills-display-render-'));
  try {
    for (const directory of ['src/pages', 'src/components', 'src/lib', 'src/content/skills']) {
      await mkdir(path.join(temporary, directory), { recursive: true });
    }
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const name of ['SkillRow', 'SkillsSection']) {
      await cp(path.join(root, `src/components/${name}.astro`), path.join(temporary, `src/components/${name}.astro`));
    }
    for (const name of ['about', 'content', 'dates', 'experience']) {
      await cp(path.join(root, `src/lib/${name}.ts`), path.join(temporary, `src/lib/${name}.ts`));
    }
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module","dependencies":{"@iconify-json/lucide":"1.2.129"}}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
export default defineConfig({ output: 'static', cacheDir: './.astro-cache', integrations: [icon()] });
`);
    await writeFile(path.join(temporary, 'src/content.config.ts'), `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
export const collections = { skills: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/skills' }) }) };
`);
    for (const [slug, title, proficiency] of [['whole', 'Whole rated skill', 3], ['fraction', 'Fractional skill', 2.5], ['unranked', 'Unranked skill', null], ['drafting', 'Draft skill', null]] as const) {
      const data = schemas.skills.parse({ ...skill, slug, title, proficiency, display_order: slug === 'whole' ? 0 : 100, publication_status: slug === 'drafting' ? 'draft' : 'published' });
      await writeFile(path.join(temporary, `src/content/skills/${slug}.md`), `---\n${stringify(data)}---\nSpecific experience with ${title}.\n`);
    }
    for (const [name, symbols, selected] of [
      ['index', 'dots', ['whole', 'fraction', 'unranked', 'drafting']],
      ['stars', 'stars', ['whole', 'fraction', 'unranked', 'drafting']],
      ['drafts', 'dots', ['drafting']],
    ] as const) {
      await writeFile(path.join(temporary, `src/pages/${name}.astro`), `---
import SkillsSection from '../components/SkillsSection.astro';
const page = { data: { skill_groups: [{ name: 'Investigation', skills: ${JSON.stringify(selected)} }], blocks: {}, skill_symbols: ${JSON.stringify(symbols)} } };
---
<SkillsSection page={page} />
`);
    }
    for (const [name, skill_groups] of [
      ['grouped', [{ name: 'Zeta group', skills: ['fraction', 'whole'] }, { name: 'Empty group', skills: [] }, { name: 'Unranked group', skills: ['unranked'] }, { name: 'Alpha group', skills: ['drafting'] }]],
      ['reassigned', [{ name: 'Different page group', skills: ['whole'] }]],
      ['empty', [{ name: 'No displayed content', skills: [] }]],
    ] as const) {
      await writeFile(path.join(temporary, `src/pages/${name}.astro`), `---
import SkillsSection from '../components/SkillsSection.astro';
const page = { data: { skill_groups: ${JSON.stringify(skill_groups)}, blocks: {}, skill_symbols: 'dots' } };
---
<SkillsSection page={page} />
`);
    }
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CONTENT_PREVIEW: 'drafts' },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    for (const filename of ['index.html', 'stars/index.html']) {
      const html = await readFile(path.join(temporary, 'dist', filename), 'utf8');
      assert.doesNotMatch(html, /Unrated skills have no assigned level|Not yet rated/);
      assert.doesNotMatch(html, /Self-assessment scale:|Foundational|Developing|Proficient|Advanced|Expert/);
      const drafting = html.match(/<li[^>]*id="skill-drafting"[^>]*>[\s\S]*?<\/li>/)?.[0];
      assert.ok(drafting);
      assert.match(drafting, /Draft skill/);
      assert.match(drafting, /Specific experience with Draft skill/);
      assert.match(drafting, /How this skill is used/);
      assert.match(drafting, /<details>/);
      assert.doesNotMatch(drafting, /skill-rating|skill-symbol|<meter|Not yet rated|0\/5/);
      const whole = html.match(/<li[^>]*id="skill-whole"[^>]*>[\s\S]*?<\/li>/)?.[0];
      const fraction = html.match(/<li[^>]*id="skill-fraction"[^>]*>[\s\S]*?<\/li>/)?.[0];
      assert.ok(whole && fraction);
      assert.match(whole, /class="skill-rating-label"[^>]*>3\/5<\/span>/);
      assert.match(whole, /<meter[^>]*value="3"[^>]*aria-valuetext="3 of 5, self-assessed"/);
      assert.match(fraction, /class="skill-rating-label"[^>]*>2\.5\/5<\/span>/);
      assert.match(fraction, /<meter[^>]*value="2\.5"[^>]*aria-valuetext="2\.5 of 5, self-assessed"/);
      assert.match(fraction, /clip-path: inset\(0 50% 0 0\)/);
      assert.equal((fraction.match(/class="skill-symbol-slot"/g) ?? []).length, 5);
      assert.equal((fraction.match(/skill-symbol-fill is-filled/g) ?? []).length, 3);
      assert.match(fraction, filename === 'index.html' ? /data-icon="lucide:circle"/ : /data-icon="lucide:star"/);
    }
    const draftOnly = await readFile(path.join(temporary, 'dist/drafts/index.html'), 'utf8');
    assert.match(draftOnly, /Draft skill/);
    assert.doesNotMatch(draftOnly, /skill-scale|Self-assessment scale|skill-rating|skill-symbol|<meter|Not yet rated|Unrated/);
    const grouped = await readFile(path.join(temporary, 'dist/grouped/index.html'), 'utf8');
    assert.ok(grouped.indexOf('Zeta group') < grouped.indexOf('Alpha group'), 'Group order comes from this page, not alphabetical order');
    assert.ok(grouped.indexOf('id="skill-fraction"') < grouped.indexOf('id="skill-whole"'), 'Nested skill order overrides library display_order');
    assert.doesNotMatch(grouped, /Empty group/);
    const reassigned = await readFile(path.join(temporary, 'dist/reassigned/index.html'), 'utf8');
    assert.match(reassigned, /Different page group/);
    assert.match(reassigned, /Whole rated skill/);
    assert.doesNotMatch(reassigned, /Investigation|Fractional skill|Draft skill/);
    assert.doesNotMatch(await readFile(path.join(temporary, 'dist/empty/index.html'), 'utf8'), /id="section-skills"|No displayed content|Self-assessment scale/);
    const publishedBuild = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build', '--outDir', 'dist-published'], {
      cwd: temporary, encoding: 'utf8', timeout: 25_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CONTENT_PREVIEW: '' },
    });
    assert.equal(publishedBuild.status, 0, `${publishedBuild.stdout}\n${publishedBuild.stderr}`);
    const publishedGroups = await readFile(path.join(temporary, 'dist-published/grouped/index.html'), 'utf8');
    assert.match(publishedGroups, /Zeta group/);
    assert.match(publishedGroups, /id="skill-fraction"/);
    assert.match(publishedGroups, /id="skill-whole"/);
    const unranked = publishedGroups.match(/<li[^>]*id="skill-unranked"[^>]*>[\s\S]*?<\/li>/)?.[0];
    assert.ok(unranked);
    assert.match(unranked, /Unranked skill/);
    assert.match(unranked, /<details>/);
    assert.doesNotMatch(unranked, /skill-rating|skill-symbol|<meter|Not yet rated|0\/5/);
    assert.doesNotMatch(publishedGroups, /Alpha group|Draft skill|Empty group/);
    assert.doesNotMatch(await readFile(path.join(temporary, 'dist-published/drafts/index.html'), 'utf8'), /id="section-skills"|Draft skill|Investigation/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
