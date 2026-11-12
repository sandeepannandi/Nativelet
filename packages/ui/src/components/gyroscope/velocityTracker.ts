/* Recent-sample flick velocity from raw native touch timestamps.
 * PanResponder's gestureState.vx only updates inside move callbacks, so when
 * a saturated UI thread coalesces delivery down to down+up it reads exactly 0
 * (observed as j=0 in device runs 282/283). This tracker keeps a short horizon
 * of raw (pageX, timestamp) samples and derives velocity from the most recent
 * real samples only. No velocity is invented for absent evidence: with fewer
 * than two samples inside the horizon, or a non-positive dt, the result is
 * null and the caller applies no impulse. A drag followed by a hold therefore
 * yields no flick, because the stale samples fall outside the horizon. */
export type TouchPoint={x:number;t:number};
export const FLICK_HORIZON_MS=100;
export const MAX_SAMPLES=8;
export function pushPoint(points:TouchPoint[],p:TouchPoint):TouchPoint[]{points.push(p);if(points.length>MAX_SAMPLES)points.shift();return points;}
export function recentVelocity(points:TouchPoint[],now:number,horizonMs:number=FLICK_HORIZON_MS):number|null{
 const recent=points.filter(p=>now-p.t<=horizonMs);
 if(recent.length<2)return null;
 const first=recent[0],last=recent[recent.length-1],dt=last.t-first.t;
 if(!(dt>0))return null;
 return (last.x-first.x)/dt; // px per ms over the recent window
}
