#!/usr/bin/env python3
"""Stamps a content hash onto every local stylesheet, image and font URL in site/**/*.html.

_headers caches /styles.css, /img/* and /fonts/* for a week (and Cloudflare's edge honours it), so a
file changed in place kept its old copy for up to seven days: the Sprout restyle was deployed and the
live site still served the old green stylesheet. With ?v=<hash> a changed file gets a new URL and
an unchanged one keeps its cache. Idempotent; run it after any change to a CSS or image file:

    python3 site/tools/version-assets.py
"""
import hashlib
import re
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
REF = re.compile(r'''((?:href|src|content)=")(/?(?:styles\.css|img/[^"?#]+|fonts/[^"?#]+))(?:\?v=[0-9a-f]+)?(")''')


def stamp(m, page):
    rel = m.group(2)
    target = (SITE / rel.lstrip('/')) if rel.startswith('/') else (page.parent / rel)
    if not target.is_file():
        return m.group(0)
    h = hashlib.sha256(target.read_bytes()).hexdigest()[:10]
    return f'{m.group(1)}{rel}?v={h}{m.group(3)}'


changed = 0
for page in sorted(SITE.rglob('*.html')):
    if 'tools' in page.parts:
        continue
    src = page.read_text()
    out = REF.sub(lambda m: stamp(m, page), src)
    if out != src:
        page.write_text(out)
        changed += 1
print(f'versioned asset URLs in {changed} page(s)')
