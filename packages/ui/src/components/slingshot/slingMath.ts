// Shared 2D elastic/projectile model and layered material renderer.
export const SL_W = 360;
export const SL_H = 440;
export const FLOOR = 412;
export const BALL_R = 10;
export const ANCHOR = { x: 180, y: 263 };
export const TIP_L = { x: 119, y: 225 };
export const TIP_R = { x: 239, y: 217 };
export const MAX_PULL = 104;
export const MIN_PULL = 10;
export const G = 1400;
// Each tip applies tension along its own strip. The cubic term models strain
// stiffening qualitatively; coefficients are tuned, not measured latex data.
export function bandMetrics(tip: Pt, p: Pt) {
  const rest = Math.hypot(tip.x - ANCHOR.x, tip.y - ANCHOR.y);
  const length = Math.hypot(tip.x - p.x, tip.y - p.y);
  const extension = Math.max(0, length - rest);
  return { rest, length, extension, width: 12 / Math.sqrt(Math.max(1, length / rest)) };
}
export function elasticAcceleration(p: Pt, v: Pt = { x: 0, y: 0 }): Pt {
  let x = 0, y = G;
  for (const tip of [TIP_L, TIP_R]) {
    const b = bandMetrics(tip, p);
    if (!b.extension || b.length < 1e-6) continue;
    const ux = (tip.x - p.x) / b.length, uy = (tip.y - p.y) / b.length;
    const tension = Math.max(0, 65 * b.extension + 0.0035 * b.extension ** 3 - 0.5 * (v.x * ux + v.y * uy));
    x += tension * ux; y += tension * uy;
  }
  return { x, y };
}
const REST_FLOOR = 0.52, REST_FRAME = 0.4;
const FIXED_STEP = 1 / 480;
export type RibbonNode = Pt & { px: number; py: number };
export function makeRibbon(tip: Pt): RibbonNode[] {
  return Array.from({length: 15}, (_, i) => { const t=i/14; const x=tip.x+(ANCHOR.x-tip.x)*t, y=tip.y+(ANCHOR.y-tip.y)*t+Math.sin(t*Math.PI)*3; return {x,y,px:x,py:y}; });
}
/** Distributed ribbon mass, fixed endpoints, inextensible local constraints.
 * The total rest length follows elastic strain, so a slack band can ripple.
 * This is a 2D position-based approximation, not a calibrated latex model. */
export function stepRibbon(nodes: RibbonNode[], tip: Pt, end: Pt, dt: number, reduce=false) {
  const rest=bandMetrics(tip,end).rest;
  const total=Math.max(rest,Math.hypot(end.x-tip.x,end.y-tip.y));
  const link=total/(nodes.length-1);
  const damping=Math.exp(-(reduce?24:5)*dt);
  for(let i=1;i<nodes.length-1;i++) {const n=nodes[i],x=n.x,y=n.y;n.x+=(n.x-n.px)*damping;n.y+=(n.y-n.py)*damping+G*dt*dt;n.px=x;n.py=y;}
  for(let pass=0;pass<12;pass++) {
    Object.assign(nodes[0],tip);Object.assign(nodes[nodes.length-1],end);
    for(let i=0;i<nodes.length-1;i++) {const a=nodes[i],b=nodes[i+1],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;const wa=i===0?0:1,wb=i===nodes.length-2?0:1;const c=(d-link)/d/(wa+wb);a.x+=dx*c*wa;a.y+=dy*c*wa;b.x-=dx*c*wb;b.y-=dy*c*wb;}
  }
  Object.assign(nodes[0],tip);Object.assign(nodes[nodes.length-1],end);
}

export type Pt = { x: number; y: number };
export type SlMark = {
  path: string;
  color?: string;
  stroke?: number;
  cap?: 'round';
  alpha?: number;
  grad?: { radial?: boolean; radius?: number; x0: number; y0: number; x1: number; y1: number; stops: [number, string][] };
};
export type SlSim = {
  p: Pt; v: Pt;
  mode: 'ready' | 'held' | 'pull' | 'flight' | 'rest';
  dir: Pt;            // unit vector from release point toward the fork
  q: Pt; qv: Pt;      // slack band midpoint and its velocity
  trail: Pt[];
  restT: number;      // seconds the ball has been resting
  fade: number;       // 0..1 ball opacity for reload
  shots: number;
  t: number;
  accumulator: number;
  ribbons: RibbonNode[][];
};

const len = (x: number, y: number) => Math.hypot(x, y);

export function createSling(): SlSim {
  return { p: { ...ANCHOR }, v: { x: 0, y: 0 }, mode: 'ready', dir: { x: 0, y: -1 }, q: { ...ANCHOR }, qv: { x: 0, y: 0 }, trail: [], restT: 0, fade: 1, shots: 0, t: 0, accumulator: 0, ribbons: [makeRibbon(TIP_L),makeRibbon(TIP_R)] };
}

/** Clamp a finger position to the allowed pull region: a disc below the fork. */
export function clampPull(x: number, y: number): Pt {
  let dx = x - ANCHOR.x, dy = Math.max(0, y - ANCHOR.y);
  const d = len(dx, dy);
  if (d > MAX_PULL) { dx *= MAX_PULL / d; dy *= MAX_PULL / d; }
  return { x: ANCHOR.x + dx, y: ANCHOR.y + dy };
}

export function pullAmount(s: SlSim): number { return len(s.p.x - ANCHOR.x, s.p.y - ANCHOR.y); }

export function slTouch(s: SlSim, x: number, y: number): 'grab' | 'none' {
  if (s.mode !== 'ready' && s.mode !== 'held') return 'none';
  const near = len(x - s.p.x, y - s.p.y) < 52 || len(x - ANCHOR.x, y - ANCHOR.y) < 52;
  if (!near) return 'none';
  s.mode = 'held';
  s.p = clampPull(x, y); s.v = { x: 0, y: 0 };
  return 'grab';
}

export function slMove(s: SlSim, x: number, y: number) {
  if (s.mode !== 'held') return;
  s.p = clampPull(x, y);
}

export function slRelease(s: SlSim) {
  if (s.mode !== 'held') return;
  const d = pullAmount(s);
  if (d < MIN_PULL) { s.mode = 'ready'; s.q = { ...s.p }; s.p = { ...ANCHOR }; s.qv = { x: 0, y: 0 }; return; }
  s.dir = { x: (ANCHOR.x - s.p.x) / d, y: (ANCHOR.y - s.p.y) / d };
  s.v = { x: 0, y: 0 };
  s.mode = 'pull';
  s.restT = 0;
  s.trail = [];
  s.shots++;
}

/** Fire a straight-up shot at a given pull (accessibility and keyboard). */
export function fireDefault(s: SlSim, pull = 78): boolean {
  if (s.mode !== 'ready' && s.mode !== 'held') return false;
  s.mode = 'held';
  s.p = { x: ANCHOR.x - 24, y: ANCHOR.y + pull };
  slRelease(s);
  return true;
}

/** Put a fresh ball in the pouch. */
export function reload(s: SlSim) {
  s.mode = 'ready'; s.p = { ...ANCHOR }; s.v = { x: 0, y: 0 }; s.fade = 0; s.restT = 0; s.trail = []; s.qv = { x: 0, y: 0 }; s.q = { ...ANCHOR };
}

function frameCapsules(): [Pt, Pt, number][] {
  return [
    [{ x: 180, y: FLOOR }, { x: 180, y: 314 }, 9],
    [{ x: 180, y: 314 }, { x: TIP_L.x + 4, y: TIP_L.y + 12 }, 7],
    [{ x: 180, y: 314 }, { x: TIP_R.x - 4, y: TIP_R.y + 12 }, 7],
  ];
}

function collideFrame(p: Pt, v: Pt): boolean {
  let hit = false;
  for (const [a, b, r] of frameCapsules()) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby)));
    const cx = a.x + abx * t, cy = a.y + aby * t;
    const dx = p.x - cx, dy = p.y - cy, d = len(dx, dy), min = r + BALL_R;
    if (d < min && d > 1e-6) {
      const nx = dx / d, ny = dy / d;
      p.x = cx + nx * min; p.y = cy + ny * min;
      const vn = v.x * nx + v.y * ny;
      if (vn < 0) { v.x -= (1 + REST_FRAME) * vn * nx; v.y -= (1 + REST_FRAME) * vn * ny; hit = true; }

    }
  }
  return hit;
}

function flightStep(p: Pt, v: Pt, dt: number): 'floor' | 'frame' | null {
  v.y += G * dt;
  p.x += v.x * dt; p.y += v.y * dt;
  let ev: 'floor' | 'frame' | null = null;
  // The stage is not a box: no invisible ceiling or side-wall bounces.
  if (p.y > FLOOR - BALL_R) {
    p.y = FLOOR - BALL_R;
    if (v.y > 0) { v.y *= -REST_FLOOR; if (Math.abs(v.y) < 60) v.y = 0; ev = 'floor'; }
    // Coulomb floor friction is an impulse over elapsed physical time,
    // independent of the number of render frames or solver subdivisions.
    const friction = 0.24 * G * dt;
    v.x = Math.sign(v.x) * Math.max(0, Math.abs(v.x) - friction);
  }
  if (collideFrame(p, v)) ev = 'frame';
  return ev;
}

/** Dotted aim path for the current held pull: same spring, then ballistic. */
export function predict(s: SlSim): Pt[] {
  const d = pullAmount(s);
  if (s.mode !== 'held' || d < MIN_PULL) return [];
  const p = { ...s.p }, v = { x: 0, y: 0 };
  const ux = (ANCHOR.x - p.x) / d, uy = (ANCHOR.y - p.y) / d;
  const h = FIXED_STEP;
  let released = false;
  for (let i = 0; i < 168; i++) {
    const { x: ax, y: ay } = elasticAcceleration(p, v);
    v.x += ax * h; v.y += ay * h; p.x += v.x * h; p.y += v.y * h;
    if ((p.x - ANCHOR.x) * ux + (p.y - ANCHOR.y) * uy >= 0) { released = true; break; }
  }
  if (!released) return [];
  const out: Pt[] = [];
  let tNext = 0;
  for (let i = 0, t = 0; i < 360 && out.length < 16; i++, t += h) {
    v.y += G * h; p.x += v.x * h; p.y += v.y * h;
    if (p.y > FLOOR - BALL_R || p.x < 0 || p.x > SL_W) break;
    if (t >= tNext) { out.push({ x: p.x, y: p.y }); tNext += 0.055; }
  }
  return out;
}

export function stepSl(s: SlSim, dt: number, reduce = false) {
  const h = FIXED_STEP;
  s.accumulator += Math.min(Math.max(0,dt), 0.05);
  while (s.accumulator + 1e-10 >= h) {
    const k = h; s.accumulator -= h;
    s.t += k;
    // Empty pouch is still pulled by both tension-only bands. It has less
    // inertia than the loaded pouch; no artificial spring to the origin.
    if (s.mode !== 'held' && s.mode !== 'pull') {
      const a=elasticAcceleration(s.q,s.qv);
      const massRatio=3.2, drag=reduce?18:5.5;
      s.qv.x+=(a.x*massRatio-drag*s.qv.x)*k;
      s.qv.y+=((a.y-G)*massRatio+G-drag*s.qv.y)*k;
      s.q.x+=s.qv.x*k;s.q.y+=s.qv.y*k;
    }
    if (s.mode === 'pull') {
      const { x: ax, y: ay } = elasticAcceleration(s.p, s.v);
      s.v.x += ax * k; s.v.y += ay * k; s.p.x += s.v.x * k; s.p.y += s.v.y * k;
      s.restT += k;
      // Too weak to lift the ball past the fork: it just settles back into the pouch.
      if (s.restT > 0.7) { s.mode = 'ready'; s.q = { x: s.p.x, y: s.p.y }; s.qv = { x: s.v.x * 0.3, y: s.v.y * 0.3 }; s.p = { ...ANCHOR }; s.v = { x: 0, y: 0 }; s.restT = 0; continue; }
      if ((s.p.x - ANCHOR.x) * s.dir.x + (s.p.y - ANCHOR.y) * s.dir.y >= 0) {
        s.mode = 'flight';
        s.q = { x: s.p.x, y: s.p.y }; s.qv = { x: s.v.x * 0.20, y: s.v.y * 0.20 };
      }
    } else if (s.mode === 'flight') {
      const contact = flightStep(s.p, s.v, k);
      if (contact === 'frame' && len(s.v.x,s.v.y) < 22) s.restT += k; else s.restT = 0;
      if ((s.p.x < -BALL_R || s.p.x > SL_W+BALL_R) && s.p.y >= FLOOR-BALL_R-0.5) { s.mode = 'rest'; s.restT = 0; }
      if (s.restT > 0.45) { s.v = {x:0,y:0}; s.mode = 'rest'; s.restT = 0; }
      if (s.p.y >= FLOOR - BALL_R - 0.5 && Math.abs(s.v.y) < 1 && Math.abs(s.v.x) < 14) { s.v.x = 0; s.v.y = 0; s.mode = 'rest'; s.restT = 0; }
    } else if (s.mode === 'rest') {
      s.restT += k;
    }
    const end=bandPoint(s);
    stepRibbon(s.ribbons[0],TIP_L,end,k,reduce);
    stepRibbon(s.ribbons[1],TIP_R,end,k,reduce);
  }
  if ((s.mode === 'flight') && !reduce) {
    const last = s.trail[s.trail.length - 1];
    if (!last || len(last.x - s.p.x, last.y - s.p.y) > 9) { s.trail.push({ x: s.p.x, y: s.p.y }); if (s.trail.length > 34) s.trail.shift(); }
  }
  if (s.mode === 'rest' && s.restT > 1.6) reload(s);
  if (s.mode === 'ready' || s.mode === 'held' || s.mode === 'pull') s.fade = Math.min(1, s.fade + dt * 4);
}

const circle = (cx: number, cy: number, r: number) => `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const line = (a: Pt, b: Pt) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;

/** Where the band is attached right now (the pouch or the slack midpoint). */
function bandPoint(s: SlSim): Pt {
  if (s.mode === 'held' || s.mode === 'pull') return s.p;
  if (s.mode === 'ready') return s.q;
  return s.q;
}

export function slScene(s: SlSim): SlMark[] {
  const m: SlMark[] = [];
  const fill = (path: string, color: string, alpha = 1) => m.push({path, color, alpha});
  const stroke = (path: string, color: string, width: number, alpha = 1) => m.push({path, color, stroke: width, cap: 'round', alpha});
  const grad = (path: string, x0: number,y0: number,x1: number,y1: number, stops: [number,string][]) => m.push({path,grad:{x0,y0,x1,y1,stops}});
  const ellipse = (x:number,y:number,rx:number,ry:number) => `M${x-rx} ${y}a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 ${-rx*2} 0`;
  // Seamless studio floor, not the old illustrated horizon.
  grad('M0 0H360V440H0Z',0,0,330,440,[[0,'#f5f3ef'],[0.65,'#e8e5de'],[1,'#d4d0c7']]);
  for (let i=12;i>0;i--) fill(ellipse(191,416,25+i*3.8,2+i*0.5),'#3c3128',0.012);
  // Sculpted asymmetrical walnut fork. Offset side face gives real thickness.
  const shape = 'M167 404 C164 376 168 344 163 319 C158 293 137 282 126 260 C117 243 111 227 110 215 Q119 206 131 214 C137 232 141 248 155 263 C168 280 177 289 183 289 C196 278 207 253 217 230 L224 208 Q235 202 248 213 C245 246 231 276 212 299 C196 320 202 352 200 381 L198 407 Q182 418 167 404Z';
  fill('M176 410 C176 373 181 339 170 313 L124 225 L130 216 L179 292 L231 209 L250 214 C246 257 227 287 213 305 C203 324 209 363 206 405 Q193 422 176 410Z','#38261c');
  grad(shape,110,265,224,280,[[0,'#62422b'],[0.12,'#aa8050'],[0.27,'#715034'],[0.48,'#c49c69'],[0.63,'#8b633d'],[0.84,'#b18a59'],[1,'#513822']]);
  // Fine pores follow the carved fork and remain fixed in object space.
  for(let i=0;i<95;i++) {
    const y=324+(i*17.13)%76, x=173+(i*7.71)%20;
    stroke(`M${x} ${y}l${.5+(i%3)*.3} ${1+(i%4)*.6}`,i%2?'#21180f':'#e5c28a',.38,.15);
  }
  // Long grain follows the forks, with irregular growth lines and a knot.
  for(let i=0;i<12;i++) {
    const d=i*1.7;
    stroke(`M${171+d} 401 C${166+d} 367 ${184+d} 329 ${169+d} 303 C${145+d*.45} 277 ${132+d*.25} 251 ${119+d*.22} 220`,i%3?'#422b1b':'#ead0a0',0.45+(i%3)*0.2,i%3?0.28:0.24);
    stroke(`M${179+d*.9} 309 C${190+d*.8} 285 ${221+d*.5} 260 ${229+d*.7} 215`,i%3?'#4c301d':'#edcc93',0.65,0.24);
  }
  stroke('M172 298 C167 285 175 277 181 288 C187 300 179 310 176 301 C170 291 179 289 178 297','#432b1b',0.8,0.6);
  stroke('M113 217 C121 249 141 286 160 303 C173 319 168 351 170 369','#f2d5a0',1.1,0.48);
  stroke('M196 406 C199 374 194 335 204 311 C229 280 241 252 245 220','#342215',1.3,0.6);
  // Rounded end-grain surfaces.
  grad('M110 215 Q118 205 130 213 Q128 220 118 222Z',112,209,128,223,[[0,'#ccb486'],[0.6,'#947348'],[1,'#59402a']]);
  grad('M224 209 Q235 202 248 213 Q239 221 226 216Z',228,206,245,220,[[0,'#d5bd92'],[0.5,'#96734b'],[1,'#59402a']]);
  // Leather grip around the handle, cross-lit with overlapped diagonal seams.
  grad('M164 336 Q181 344 201 336 L199 394 Q185 407 166 395Z',164,365,201,365,[[0,'#211c18'],[0.2,'#534331'],[0.47,'#78634a'],[0.75,'#3b3025'],[1,'#1d1916']]);
  for(let i=0;i<7;i++) {
    const y=340+i*8;
    stroke(`M166 ${y} Q183 ${y+12} 200 ${y+5}`,'#191612',1.5,0.8);
    stroke(`M166 ${y-1} Q183 ${y+11} 200 ${y+4}`,'#b29a74',0.6,0.55);
  }
  // Small brass eyelet at the heel.
  fill(ellipse(183,402,4,2.5),'#32271c'); stroke(ellipse(183,401.5,4,2.5),'#c5a269',1);
  const bp=bandPoint(s);
  // Grounded projectile shadow spreads and fades with height.
  const height=Math.max(0,FLOOR-s.p.y), shadowA=Math.max(0.018,0.20-height/1800);
  for(let i=5;i>0;i--) fill(ellipse(s.p.x+height*.08,FLOOR+1,9+i*2+height*.025,1+i*.45),'#312d28',shadowA/6);
  if(s.mode==='held') predict(s).forEach((p,i)=>fill(circle(p.x,p.y,1.6), '#625b4d',0.5-i*.024));
  // Tapered latex ribbons, not outlined ropes. Width conserves cross-section
  // approximately; sag and a damped transverse wave return as tension falls.
  for(const [idx,tip] of [[0,TIP_L],[1,TIP_R]] as [number,Pt][]) {
    const dx=bp.x-tip.x,dy=bp.y-tip.y,l=Math.max(1,len(dx,dy));
    const nx=-dy/l,ny=dx/l,b=bandMetrics(tip,bp);
    const w=b.width, nodes=s.ribbons[idx];
    for(let j=0;j<nodes.length-1;j++) {
      const a=nodes[j],z=nodes[j+1],tx=z.x-a.x,ty=z.y-a.y,dist=Math.max(.01,len(tx,ty)),rx=-ty/dist,ry=tx/dist;
      const taper=1-.28*j/(nodes.length-1),half=w*taper/2;
      const path=`M${a.x+rx*half} ${a.y+ry*half}L${z.x+rx*half} ${z.y+ry*half}L${z.x-rx*half} ${z.y-ry*half}L${a.x-rx*half} ${a.y-ry*half}Z`;
      grad(path,a.x-rx*half,a.y-ry*half,a.x+rx*half,a.y+ry*half,[[0,'#704c22'],[.20,'#b88b46'],[.48,'#e4be70'],[.72,'#c4974c'],[1,'#89612c']]);
      stroke(line({x:a.x+rx*half*.45,y:a.y+ry*half*.45},{x:z.x+rx*half*.45,y:z.y+ry*half*.45}),'#f3d89d',.55,.55);
    }
  }
  // Wrapped latex ties sit over the strips at each fork.
  for(const tip of [TIP_L,TIP_R]) {
    grad(`M${tip.x-10} ${tip.y-4}L${tip.x+11} ${tip.y-6}L${tip.x+13} ${tip.y+10}Q${tip.x+1} ${tip.y+16} ${tip.x-7} ${tip.y+11}Z`,tip.x-10,tip.y,tip.x+13,tip.y,[[0,'#503b22'],[0.3,'#bc9556'],[0.6,'#dbc18b'],[1,'#71512d']]);
    for(let i=0;i<4;i++) stroke(`M${tip.x-8+i*.6} ${tip.y+i*3}Q${tip.x+2} ${tip.y+4+i*3} ${tip.x+11} ${tip.y-2+i*3}`,'#6b4e2c',0.7,0.8);
  }
  // Creased seams and fine pebbled leather, shaded below the pouch.
  // The empty leather pouch remains attached and snaps back after release.
  const loaded=s.mode==='ready'||s.mode==='held'||s.mode==='pull';
  const px=bp.x,py=bp.y;
  const cup=`M${px-19} ${py-5} Q${px-13} ${py-13} ${px} ${py-11} Q${px+13} ${py-12} ${px+19} ${py-4} L${px+16} ${py+10} Q${px} ${py+19} ${px-16} ${py+10}Z`;
  grad(cup,px-18,py-10,px+17,py+14,[[0,'#876047'],[0.25,'#513627'],[0.65,'#36241c'],[1,'#aa7c55']]);
  for(let i=0;i<27;i++) {const x=px-13+(i*7.13)%26,y=py-6+(i*3.17)%15;fill(ellipse(x,y,.55,.35),i%2?'#b38760':'#170f0b',.27);}
  stroke(`M${px-15} ${py-4}Q${px} ${py-15} ${px+15} ${py-4}`,'#d3ae85',.65,.7);
  for(const off of [-13,13]) fill(ellipse(px+off,py+3,1.3,2.5),'#1b1612');
  if(loaded) fill(ellipse(px,py+5,11,8),'#160f0b',0.55);
  // Brushed steel pellet with broad environment reflection and small key light.
  const bx=s.mode==='ready'?bp.x:s.p.x,by=s.mode==='ready'?bp.y:s.p.y,ba=s.mode==='ready'?s.fade:1;
  m.push({path:circle(bx,by,BALL_R),grad:{x0:bx-7,y0:by-9,x1:bx+6,y1:by+10,stops:[[0,'#f5f7f6'],[0.19,'#c4cbc8'],[0.40,'#707b78'],[0.49,'#424b48'],[0.55,'#b7b9af'],[0.74,'#81847a'],[1,'#303936']]},alpha:ba});
  fill(ellipse(bx-3,by-5,4.5,1.8),'#fff',0.6*ba);
  stroke(`M${bx-6} ${by+5}Q${bx} ${by+10} ${bx+5} ${by+6}`,'#e0dcc9',0.6,0.7*ba);
  if(loaded) {
    stroke(`M${px-17} ${py+4}Q${px} ${py+23} ${px+17} ${py+4}`,'#382217',4);
    stroke(`M${px-16} ${py+5}Q${px} ${py+21} ${px+16} ${py+5}`,'#b28a61',0.9,0.8);
    for(let i=-10;i<=10;i+=4) stroke(`M${px+i} ${py+12-Math.abs(i)*.28}l1 2`,'#d3b68a',0.6,0.7);
  }
  return m;
}
