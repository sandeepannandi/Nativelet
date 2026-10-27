"""Host-only postcapture gates. Failure never triggers retry."""
import csv,io,json,pathlib,subprocess,sys
TP,folder,pid=sys.argv[1:];out=pathlib.Path(folder);pid=int(pid)
def query(sql):
 r=subprocess.run([TP,'query','--format','csv',str(out/'shatter.pftrace'),sql],capture_output=True,text=True,check=True,timeout=60)
 return list(csv.DictReader(io.StringIO(r.stdout)))
a=float((out/'fracture-before-uptime.txt').read_text().split()[0])*1e9
b=float((out/'fracture-after-uptime.txt').read_text().split()[0])*1e9
# Android Perfetto default clock is BOOTTIME, same basis as /proc/uptime.
# Any inconsistent timing or lack of bracketing data fails closed.
samples=query(f'''SELECT COUNT(*) AS n,COUNT(ps.callsite_id) AS stacks,MIN(ps.ts) AS first,MAX(ps.ts) AS last,
 MAX(c.depth) AS maxdepth,SUM(CASE WHEN ps.unwind_error IS NOT NULL THEN 1 ELSE 0 END) AS unwind_errors
 FROM perf_sample ps JOIN thread t USING(utid) JOIN process p USING(upid)
 LEFT JOIN stack_profile_callsite c ON ps.callsite_id=c.id WHERE p.pid={pid}''')[0]
sched=query(f'''SELECT COUNT(*) AS n,MIN(s.ts) AS first,MAX(s.ts+s.dur) AS last FROM sched s
 JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid={pid} AND s.dur>0''')[0]
# UNION deduplicates callsite nodes. Coverage is not CPU sample weighting.
frames=query(f'''WITH RECURSIVE chain(id,parent_id,frame_id,depth) AS (
 SELECT c.id,c.parent_id,c.frame_id,c.depth FROM perf_sample ps JOIN thread t USING(utid)
 JOIN process p USING(upid) JOIN stack_profile_callsite c ON ps.callsite_id=c.id WHERE p.pid={pid}
 UNION SELECT c.id,c.parent_id,c.frame_id,c.depth FROM chain ch JOIN stack_profile_callsite c ON ch.parent_id=c.id)
 SELECT f.name AS frame_name,f.rel_pc,m.name AS mapping,m.build_id,COUNT(*) AS unique_callsite_node_coverage
 FROM chain JOIN stack_profile_frame f ON chain.frame_id=f.id JOIN stack_profile_mapping m ON f.mapping=m.id
 GROUP BY f.id ORDER BY unique_callsite_node_coverage DESC''')
stats=query('SELECT name,severity,source,value FROM stats WHERE value!=0 ORDER BY name')
result={'pid':pid,'fracture_boottime_ns':[a,b],'samples':samples,'scheduler':sched,'frames':frames,'nonzero_stats':stats}
(out/'parsed-evidence.json').write_text(json.dumps(result,indent=2))
def num(row,k):return float(row[k]) if row[k]!='[NULL]' else 0
assert num(samples,'n')>0 and num(samples,'stacks')>0,'BLOCKER no target native callstacks'
assert num(samples,'unwind_errors')==0,'BLOCKER unwind errors require review'
assert num(samples,'maxdepth')>=2,'BLOCKER insufficient unwind depth'
assert frames and any('/' in f['mapping'] for f in frames),'BLOCKER no native mapping evidence'
assert num(samples,'first')<=a<=b<=num(samples,'last'),'BLOCKER samples do not bracket fracture'
assert num(sched,'n')>0 and num(sched,'first')<=a<=b<=num(sched,'last'),'BLOCKER scheduler does not bracket fracture'
bad=[r for r in stats if r['severity'] in ['error','data_loss'] or any(k in r['name'] for k in ['lost','discard','skipped','unwind_error'])]
assert not bad,'BLOCKER parser/loss stats need review: '+str(bad)
print(json.dumps({'gate':'passed','samples':samples,'scheduler':sched,'frames':len(frames)}))
