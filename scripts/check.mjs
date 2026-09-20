import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const scripts = [];
for (const dir of ['assets', 'scripts', 'tests']) {
  for (const f of await readdir(dir)) {
    if (/\.(m?js)$/.test(f) && (dir !== 'assets' || f.startsWith('furikko-pair'))) scripts.push(`${dir}/${f}`);
  }
}
for (const path of scripts) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path}: ${result.stderr}`);
}
for (const path of ['furikko-pair.html', 'furikko-pair-guide.html']) {
  const source = await readFile(path, 'utf8');
  assert.match(source, /name="referrer" content="no-referrer"/);
  for (const [, asset] of source.matchAll(/(?:src|href)="(assets\/[^"#]+)"/g)) await readFile(asset.split('?')[0]);
}
console.log(`Syntax OK: ${scripts.length} new JS/MJS files; both page asset references OK.`);
