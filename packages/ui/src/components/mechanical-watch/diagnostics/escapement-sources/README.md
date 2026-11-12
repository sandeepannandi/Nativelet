# Escapement source archive (offline research provenance, 2026-11-12)

Purpose: durable preservation of the source citations and parameter
extractions behind the analytic escapement geometry route. Support for
CONSTRUCTION only - no validation claim.

Files:
- PLAYTNER-EXTRACT.md - all adopted parameters with line citations into
  playtner.txt (H. R. Playtner, "An Analysis of the Lever Escapement",
  1910, Project Gutenberg #21978).
- ABBEY-EXTRACT.md - abbeyclock.com drafting course ch12/13/14/22
  extraction (construction method, out-of-angle correction, roller design).
- abbey12.txt, abbey13.txt, abbey14.txt, abbey22.txt - plain-text renders
  of the cited chapters (verbatim, whitespace-normalized).

playtner.txt is NOT archived here (renderer limits). Regenerate it exactly:
1. curl -sL "https://www.gutenberg.org/files/21978/21978-h/21978-h.htm" -o playtner.html
2. python3 - <<'EOF'
import re, html
t = open('playtner.html', encoding='utf-8', errors='replace').read()
t = re.sub(r'<[^>]+>', ' ', t)
t = html.unescape(t)
t = re.sub(r'[ \t]+', ' ', t)
open('playtner.txt', 'w').write(t)
EOF
Line numbers in PLAYTNER-EXTRACT.md (L268, L436, ...) refer to the
resulting playtner.txt as of 2026-11-12.
