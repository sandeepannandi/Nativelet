SELECT ps.ts, ps.cpu, ps.cpu_mode, ps.unwind_error, ps.perf_session_id,
       pct.name AS cntr_name, pct.is_timebase, thread.tid, spf.name
FROM perf_sample ps
JOIN experimental_annotated_callstack(ps.callsite_id) eac
JOIN perf_counter_track pct USING(perf_session_id, cpu)
JOIN thread USING(utid)
JOIN stack_profile_frame spf ON (eac.frame_id = spf.id)
ORDER BY ps.ts ASC, eac.depth ASC;
