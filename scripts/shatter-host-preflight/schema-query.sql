SELECT COUNT(*) AS samples,COUNT(callsite_id) AS stacks,COUNT(DISTINCT utid) AS threads FROM perf_sample;
SELECT ps.ts,ps.cpu,ps.cpu_mode,ps.unwind_error,t.tid,p.pid,f.name,m.name,m.build_id,c.depth FROM perf_sample ps JOIN thread t USING(utid) LEFT JOIN process p USING(upid) JOIN stack_profile_callsite c ON ps.callsite_id=c.id JOIN stack_profile_frame f ON c.frame_id=f.id JOIN stack_profile_mapping m ON f.mapping=m.id ORDER BY ps.ts;
SELECT name,severity,source,value FROM stats WHERE value!=0 ORDER BY name;
SELECT ts,dur,utid,cpu FROM sched LIMIT 1;
SELECT ts,dur,utid,state,blocked_function FROM thread_state LIMIT 1;
PRAGMA table_info(stack_profile_frame);
PRAGMA table_info(stack_profile_mapping);
