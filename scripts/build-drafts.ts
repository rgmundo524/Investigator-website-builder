import { spawnSync } from 'node:child_process';
import { resolveNpmCli } from './npm-runtime.mjs';

const npm = await resolveNpmCli();
const result = spawnSync(process.execPath, [npm, 'run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, CONTENT_PREVIEW: 'drafts' },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
