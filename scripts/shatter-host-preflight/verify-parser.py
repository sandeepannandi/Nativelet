import subprocess,csv,io,sys,pathlib
p=pathlib.Path(sys.argv[1]);tp=p/'perfetto/linux-amd64/trace_processor_shell'
def rows(q):
 r=subprocess.run([str(tp),'query','--format','csv',str(p/'perf_sample.pb'),q],text=True,capture_output=True,check=True)
 return list(csv.DictReader(io.StringIO(r.stdout)))
r=rows('SELECT COUNT(*) AS samples, COUNT(callsite_id) AS stacks, MIN(c.depth) AS mindepth, MAX(c.depth) AS maxdepth FROM perf_sample JOIN stack_profile_callsite c ON callsite_id=c.id')[0]
assert r=={'samples':'3','stacks':'3','mindepth':'4','maxdepth':'8'},r
assert rows('SELECT COUNT(*) AS n FROM perf_sample WHERE unwind_error IS NOT NULL')[0]['n']=='0'
assert rows('SELECT COUNT(*) AS n FROM stack_profile_mapping WHERE build_id IS NOT NULL')[0]['n']!='0'
print('fixture assertions passed:3 samples,3 callstacks,leaf depths4-8,zero unwind errors,nonempty build IDs')
