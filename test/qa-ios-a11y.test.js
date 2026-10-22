// QA: iPhone accessibility rules that can be checked from the Swift source (there is no Swift
// toolchain in CI). Each was a real finding in ios/App/UI:
//  - system orange is 2.2:1 and system red 3.6:1 on white, under the 4.5:1 small text needs;
//  - icon-only buttons were read by VoiceOver as "More" or "Search", with no item named;
//  - a flat-size price did not grow with the user's text size.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UI = new URL('../ios/App/UI/', import.meta.url).pathname;
const files = fs.readdirSync(UI, { recursive: true }).filter((f) => f.endsWith('.swift')).map((f) => path.join(UI, f));
const lines = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((text, i) => ({ where: `${path.relative(UI, f)}:${i + 1}`, text, f, i })));

test('DEFECT: no text is drawn in system orange, yellow or red (use Color.warnInk / Color.badInk)', () => {
  const bad = lines.filter((l) => /\bText\(/.test(l.text) && /foreground(?:Style|Color)\(\.(?:orange|yellow|red)\)/.test(l.text));
  // A modifier on its own line under a Text: look back to the line that opened it.
  const split = lines.filter((l, k) => /^\s*\.foreground(?:Style|Color)\(\.(?:orange|yellow|red)\)/.test(l.text) && /\bText\(/.test(lines[k - 1]?.text || '') && lines[k - 1].f === l.f);
  assert.deepEqual([...bad, ...split].map((l) => l.where), []);
});

test('DEFECT: every icon-only button or menu has a spoken name', () => {
  const missing = [];
  for (const [k, l] of lines.entries()) {
    if (!/label: \{\s*Image\(systemName: "[^"]+"\)[^}]*\}\s*$/.test(l.text) && !/label: \{\s*$/.test(l.text)) continue;
    // A multi-line label must be only an image to count as icon-only.
    if (/label: \{\s*$/.test(l.text) && !(/^\s*(?:\/\/.*)?$/.test(lines[k + 1]?.text) && /^\s*Image\(systemName:/.test(lines[k + 2]?.text) && /^\s*\}/.test(lines[k + 3]?.text))) continue;
    const near = lines.slice(k, k + 8).filter((x) => x.f === l.f).map((x) => x.text).join('\n');
    if (!/accessibilityLabel\(/.test(near)) missing.push(l.where);
  }
  assert.deepEqual(missing, []);
});

test('DEFECT: no text uses a flat point size (scale it with @ScaledMetric or use a text style)', () => {
  // Flat sizes are allowed only on SF Symbols (icons): the line, or the one above, is an Image.
  const offenders = lines.filter((l, k) => /\.font\(\.system\(size: \d/.test(l.text) && !/Image\(systemName:/.test(l.text) && !/Image\(systemName:/.test(lines[k - 1]?.text || ''));
  assert.deepEqual(offenders.map((l) => l.where), []);
});
