// Rewrites each page's FAQPage JSON-LD from the questions and answers actually visible on that
// page, so the two can never drift apart.
//
// Google requires the answer in FAQPage structured data to be present in the visible content.
// Hand-written markup that paraphrases the page is structured-data spam and is a manual-action
// risk, which is a bad trade for a product whose whole pitch is that it tells you the truth.
//
//   node scripts/sync-faq-jsonld.js            # rewrite site/
//   node scripts/sync-faq-jsonld.js --check    # fail if out of sync, for CI
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv.find((a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || 'site');
const CHECK = process.argv.includes('--check');

const stripTags = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Pull visible Q&A pairs out of <details><summary>Q</summary>A</details>. */
function visibleFaq(html) {
  const out = [];
  for (const m of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const inner = m[1];
    const sum = inner.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
    if (!sum) continue;
    const question = stripTags(sum[1]);
    const answer = stripTags(inner.replace(sum[0], ''));
    // Skip anything that isn't really a question and answer.
    if (!question || answer.length < 25) continue;
    out.push({ question, answer });
  }
  return out;
}

let changed = 0;
let drifted = [];

for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, f))) {
  let html = fs.readFileSync(file, 'utf8');
  const name = path.basename(file);

  const blockRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [...html.matchAll(blockRe)];
  if (!blocks.length) continue;

  const faq = visibleFaq(html);

  for (const b of blocks) {
    let data;
    try {
      data = JSON.parse(b[1]);
    } catch {
      console.error(`${name}: JSON-LD does not parse, skipping`);
      continue;
    }
    const top = Array.isArray(data) ? data : [data];
    let touched = false;

    for (const doc of top) {
      const nodes = Array.isArray(doc?.['@graph']) ? doc['@graph'] : [doc];
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i]?.['@type'] !== 'FAQPage') continue;
        if (!faq.length) {
          // Markup claiming an FAQ the page does not have must not ship. This has to register as
          // drift too: reporting it only on stderr let `--check` exit 0, so CI stayed green on
          // the single case this tool exists to prevent — FAQ structured data with nothing
          // visible behind it, which is exactly what earns a manual action.
          drifted.push(`${name}: FAQPage markup with no visible <details> Q&A behind it`);
          nodes.splice(i, 1);
          i--;
          touched = true;
          continue;
        }
        const rebuilt = {
          '@type': 'FAQPage',
          mainEntity: faq.map((q) => ({
            '@type': 'Question',
            name: q.question,
            acceptedAnswer: { '@type': 'Answer', text: q.answer },
          })),
        };
        if (JSON.stringify(nodes[i]) !== JSON.stringify(rebuilt)) {
          drifted.push(`${name}: ${faq.length} visible Q&A vs ${(nodes[i].mainEntity || []).length} in markup`);
          nodes[i] = rebuilt;
          touched = true;
        }
      }
      if (Array.isArray(doc?.['@graph'])) doc['@graph'] = nodes;
    }

    if (touched) {
      const replacement = b[0].replace(b[1], '\n' + JSON.stringify(Array.isArray(data) ? data : top[0], null, 2) + '\n  ');
      html = html.replace(b[0], replacement);
      changed++;
    }
  }

  if (!CHECK) fs.writeFileSync(file, html);
}

if (CHECK) {
  if (drifted.length) {
    console.error('FAQ structured data is out of sync with the visible page:');
    for (const d of drifted) console.error('  ' + d);
    process.exit(1);
  }
  console.log('FAQ structured data matches the visible pages.');
} else {
  console.log(drifted.length ? `Rewrote ${changed} JSON-LD block(s):\n  ${drifted.join('\n  ')}` : 'Already in sync.');
}
