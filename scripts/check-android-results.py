#!/usr/bin/env python3
"""Fail closed on crash/error/dead processes, incomplete route evidence or empty artifacts.
This is a safety gate, not proof of interaction correctness. Inspect screenshots too.
"""
import argparse,pathlib,re,sys
p=argparse.ArgumentParser();p.add_argument('directory',type=pathlib.Path);p.add_argument('--routes',default='');p.add_argument('--coldstart',action='store_true');p.add_argument('--require-summary',action='append',default=[]);a=p.parse_args()
root=a.directory; failures=[]
summaries=list(root.rglob('summary.txt'))
if not summaries:failures.append('No summary.txt evidence found')
combined='\n'.join(x.read_text(errors='replace') for x in summaries)
if not combined.strip():failures.append('Empty summary evidence')
for path in summaries:
 for line in path.read_text(errors='replace').splitlines():
  if re.search(r'\bcrashes=[1-9]\d*\b|\bcrash=yes\b|\bjserr=[1-9]\d*\b|\balive=(?:no)?(?:\s|$)|\b(?:failed|failure)=yes\b',line,re.I):failures.append(f'{path}: {line}')
for path in root.rglob('*logcat*.txt'):
 text=path.read_text(errors='replace')
 if re.search(r'FATAL EXCEPTION|Fatal signal \d+|JavascriptException|ANR in com\.[\w.]*nativelet|Process: com\.[\w.]*nativelet',text,re.I):failures.append(f'{path}: fatal native/JS/ANR evidence')
for relative in a.require_summary:
 path=root/relative/'summary.txt'
 if not path.is_file() or not path.read_text().strip():failures.append(f'Missing required suite summary: {relative}')
if a.coldstart:
 config=re.search(r'rounds=(\d+) screens=(.+)',combined)
 if not config:failures.append('Missing cold-start configuration')
 else:
  rounds=int(config[1])
  for route in config[2].split():
   if not re.search(rf'^{re.escape(route)} launches={rounds} crashes=0$',combined,re.M):failures.append(f'Incomplete or failed cold-start route: {route}')
for route in filter(None,a.routes.split(',')):
 match=re.search(rf'^{re.escape(route)} crash=no jserr=0 alive=yes\b',combined,re.M)
 if not match:failures.append(f'Missing clean route summary: {route}')
 for suffix in ['-1.png','-2.png','.logcat.txt','.start.txt']:
  path=root/f'{route}{suffix}'
  if not path.is_file() or not path.stat().st_size:failures.append(f'Missing or empty artifact: {path}')

# Native Glass Shatter gate is additional, never a substitute for original suite.
if (root / 'native-pacing' / 'timing.json').exists():
    import json as _json
    if not _json.loads((root / 'native-pacing' / 'timing.json').read_text()).get('pass'):
        failures.append('Native Glass Shatter unrecorded pacing gate failed')

if failures:
 print('\n'.join(failures),file=sys.stderr);sys.exit(1)
print(f'Fail-closed gate passed: {len(summaries)} summaries, {len(list(root.rglob("*.png")))} screenshots. Visual/gesture inspection still required.')
