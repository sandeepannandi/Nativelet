/* Recent-sample flick velocity from raw native touch timestamps.
 *
 * Behavior contract (no invented motion):
 * - A sample is usable only when its timestamp lies inside the lookback window:
 *   0 <= (now - t) <= horizonMs. Future-timestamped samples are excluded.
 * - Timestamps inside the window must be monotonically non-decreasing. Any
 *   internal step backwards makes delivery order ambiguous and yields null.
 *   Duplicate timestamps are tolerated: a zero-dt segment carries no rate
 *   information, and the window endpoints still define a real average rate.
 * - Velocity is the average px/ms between the OLDEST and NEWEST usable sample;
 *   a hold before release expires those samples, so a drag-then-hold yields
 *   null rather than a flick. A genuine quick down/up pair inside the horizon
 *   is real delivered evidence and yields that window's average velocity.
 * - Failure policy is fail-closed: ANY non-finite recorded sample (x or t), a
 *   non-finite or non-positive horizon/now, any window-internal step backwards
 *   in time, or a non-finite computed velocity (coordinate overflow) yields
 *   null. Invalid data never drops out of the average silently.
 * - PanResponder's gestureState.vx only updates inside move callbacks, so a
 *   zero vx at release does not by itself distinguish coalesced delivery from
 *   a stationary tail; this tracker computes velocity only from samples that
 *   were actually delivered, and returns null when evidence is absent. */
export type TouchPoint={x:number;t:number};
export const FLICK_HORIZON_MS=100;
export const MAX_SAMPLES=8;
export function pushPoint(points:TouchPoint[],p:TouchPoint):TouchPoint[]{points.push(p);if(points.length>MAX_SAMPLES)points.shift();return points;}
export function recentVelocity(points:TouchPoint[],now:number,horizonMs:number=FLICK_HORIZON_MS):number|null{
 if(!Number.isFinite(now)||!Number.isFinite(horizonMs)||horizonMs<=0)return null;
 if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.t)))return null; // corrupt stream: fail closed
 const recent=points.filter(p=>now-p.t>=0&&now-p.t<=horizonMs);
 if(recent.length<2)return null;
 for(let i=1;i<recent.length;i++)if(recent[i].t<recent[i-1].t)return null; // internal disorder: ambiguous
 const first=recent[0],last=recent[recent.length-1],dt=last.t-first.t;
 if(!(dt>0))return null;
 const vx=(last.x-first.x)/dt;
 return Number.isFinite(vx)?vx:null; // px per ms over the recent window
}
