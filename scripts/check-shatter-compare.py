import json,sys,pathlib,statistics
p=pathlib.Path(sys.argv[1]);s=p.read_text();rows=[]
for line in s.splitlines():
 if 'SHATTER_COMPARE {' in line:rows.append(json.loads(line.split('SHATTER_COMPARE ',1)[1]))
def percentile(xs,q):return sorted(xs)[min(len(xs)-1,int(len(xs)*q))]
result={'jobs':len(rows),'all_exact':all(r['exact'] for r in rows),'acceptance':'both dt: >=20% total mean gain, total p95<=12ms,max<=16.67ms, setupmax<=50ms; no inferred component/fullsuite pass','candidates':{}}
for name in ['reference','pool','bitset','packed']:
 bydt={}
 for dt in [1/60,.048]:
  rs=[r for r in rows if not r['warmup'] and r['variant']==name and r['dt']==dt];vs=[x for r in rs for x in r['total']];base=[x for r in rows if not r['warmup'] and r['variant']=='reference' and r['dt']==dt for x in r['total']]
  if vs:bydt[str(dt)]={'frames':len(vs),'mean':statistics.mean(vs),'p95':percentile(vs,.95),'max':max(vs),'setupmax':max(r['setup']for r in rs),'gain':1-statistics.mean(vs)/statistics.mean(base)}
 result['candidates'][name]=bydt
result['adequate']=[n for n,d in result['candidates'].items() if n!='reference' and len(d)==2 and all(v['gain']>=.2 and v['p95']<=12 and v['max']<=16.67 and v['setupmax']<=50 for v in d.values())]
(p.parent/'comparison.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));sys.exit(0 if len(rows)==48 and result['all_exact'] and result['adequate'] else 1)
