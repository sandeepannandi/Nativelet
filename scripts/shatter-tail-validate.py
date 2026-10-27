"""Separate behavior, marker and quality evidence. Never retry or reorder expectation."""
import csv,io,json,pathlib,subprocess,sys
TP,folder,pid=sys.argv[1:];out=pathlib.Path(folder);pid=int(pid)
def query(sql):
 r=subprocess.run([TP,'query','--format','csv',str(out/'shatter.pftrace'),sql],capture_output=True,text=True,check=True,timeout=60)
 return list(csv.DictReader(io.StringIO(r.stdout)))
behavior=[]
for mode,im,ref in [('clear','first-clear.png','initial.png'),('reset','reset.png','initial.png'),('clear','second-clear.png','initial.png'),('fracture','first-mid.png','initial.png'),('fracture','second-mid.png','reset.png')]:
 r=subprocess.run(['python3','scripts/shatter-trace-match.py',mode,str(out/im),str(out/ref)],capture_output=True,text=True)
 ok=r.returncode==0
 if mode=='fracture' and ok:ok=float(r.stdout)>0.03
 behavior.append({'mode':mode,'image':im,'pass':ok,'stdout':r.stdout,'stderr':r.stderr})
(out/'behavior.json').write_text(json.dumps(behavior,indent=2))
rows=query(f"""SELECT s.id,s.ts,s.dur,s.name,t.tid,t.name thread FROM slice s JOIN thread_track tr ON s.track_id=tr.id JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid={pid} AND s.name GLOB 'SHATTER/*' ORDER BY s.ts,s.id""")
(out/'markers.json').write_text(json.dumps(rows,indent=2))
errors=[]
required=['createWorld','stepWorld','fillMesh','path','copies','allGone','finalMeshParked','reset']
for name in required:
 if not any(r['name']=='SHATTER/'+name for r in rows):errors.append('missing '+name)
if any(int(r['tid'])!=pid for r in rows):errors.append('marker not on target main/UI tid')
if any(int(r['dur'])<0 for r in rows):errors.append('unclosed section')
starts=[int(r['ts']) for r in rows if r['name']=='SHATTER/createWorld']
resets=[int(r['ts']) for r in rows if r['name']=='SHATTER/reset']
if len(starts)!=2 or len(resets)!=1:errors.append('expected2createWorld1reset')
if len(starts)==2:
 if not(len(resets)==1 and starts[0]<resets[0]<starts[1]):errors.append('reset not between cycles')
 for i,start in enumerate(starts):
  end=starts[i+1] if i+1<len(starts) else 2**63-1
  cycle=[r for r in rows if start<=int(r['ts'])<end]
  for n in ['allGone','finalMeshParked']:
   if sum(r['name']=='SHATTER/'+n for r in cycle)!=1:errors.append(f'cycle{i+1} expected1{n}')
  gone=[int(r['ts']) for r in cycle if r['name']=='SHATTER/allGone']
  mesh=[int(r['ts']) for r in cycle if r['name']=='SHATTER/finalMeshParked']
  if gone and mesh and mesh[0]<gone[0]:errors.append(f'cycle{i+1} finalMeshParked before allGone: scheduling mismatch')
result={'behavior_pass':all(r['pass']for r in behavior),'marker_pass':not errors,'marker_errors':errors,'marker_count':len(rows),'native_pixels_manual_review':'required','performance_attribution':'not assessed; independent strict gate'}
(out/'validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));sys.exit(0 if result['behavior_pass']and result['marker_pass']else 1)
