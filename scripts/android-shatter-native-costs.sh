#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/native-costs;mkdir -p "$OUT"
adb shell am force-stop com.anonymous.nativeletshowcase;adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter-native-costs' com.anonymous.nativeletshowcase
for i in $(seq 1 120);do sleep 5;adb logcat -d > "$OUT/logcat.txt";grep -q 'SHATTER_COST_DONE\|SHATTER_COST_ERROR' "$OUT/logcat.txt" && break;done
python3 - "$OUT" <<'PY'
import sys,json,re,pathlib,statistics
p=pathlib.Path(sys.argv[1]);s=(p/'logcat.txt').read_text()
chunks=[json.loads(x)for x in re.findall(r'SHATTER_COST_CHUNK (\{[^\r\n]+\})',s)]
done=[json.loads(x)for x in re.findall(r'SHATTER_COST_DONE (\{[^\r\n]+\})',s)]
assert len(done)==1 and done[0]['jobs']==24,'missing/duplicate completion'
assert chunks and {x['run']for x in chunks}=={done[0]['run']},'mixed run records'
assert {x['job']for x in chunks}==set(range(24)),'unexpected/missing job'
r=[]
for job in range(24):
 a=sorted([x for x in chunks if x['job']==job],key=lambda x:x['index'])
 assert a and len({x['count']for x in a})==1 and len(a)==a[0]['count'] and [x['index']for x in a]==list(range(a[0]['count'])),f'incomplete chunks job={job}'
 r.append(json.loads(''.join(x['text']for x in a)))
assert len({x['job']for x in r})==24 and 'SHATTER_COST_ERROR'not in s
(p/'records.json').write_text(json.dumps(r))
out=[]
for native in [False,True]:
 for dt in [1/60,.048]:
  a=[x for x in r if x['job']>=8 and x['native']==native and x['dt']==dt];v=[y for x in a for y in x['total']];assert len(a)==4
  out.append(dict(native=native,dt=dt,cases=len(a),frames=len(v),mean=statistics.mean(v),p95=sorted(v)[int(.95*(len(v)-1))],max=max(v),setup=[x['setup']for x in a],shards=[x['shards']for x in a]))
(p/'costs.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
# Record whole-step costs even if slow; real component gate remains separate.
PY
