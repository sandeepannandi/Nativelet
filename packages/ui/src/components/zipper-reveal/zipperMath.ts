// Original constrained edge model. This is a tactile cloth approximation,
// not a full woven-fabric or interlocking-tooth contact solver.
export const ZIP_W = 360, ZIP_H = 440, ZIP_TOP = 32, ZIP_BOTTOM = 386;
export const ZIP_ROWS = 56;
export type ZipState = { y: number; target: number; vy: number; pull: number; pv: number; drag: boolean; edge: number[]; velocity: number[]; accumulator: number };
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export function createZip(opening = 0.18): ZipState {
  const y = ZIP_TOP + clamp(opening, 0, 1) * (ZIP_BOTTOM - ZIP_TOP);
  const s: ZipState = { y, target: y, vy: 0, pull: 0, pv: 0, drag: false, edge: [], velocity: [], accumulator: 0 };
  for (let i = 0; i <= ZIP_ROWS; i++) { s.edge.push(zipRest(i, y)); s.velocity.push(0); }
  return s;
}
export function zipRest(row: number, y: number) {
  const py = 18 + row * 404 / ZIP_ROWS;
  const d = Math.max(0, y - py - 14);
  return 145 * Math.tanh(d / 245) * Math.pow(Math.max(0, 1 - py / 470), 0.24);
}
export function zipTo(s: ZipState, y: number, lateral = 0, dragging = false) {
  s.target = clamp(y, ZIP_TOP, ZIP_BOTTOM); s.drag = dragging;
  s.pv += clamp(lateral, -60, 60) * 0.09;
}
export function stepZip(s: ZipState, dt: number, reduced = false) {
  if (reduced) { s.y = s.target; s.vy = s.pull = s.pv = 0; for (let i = 0; i <= ZIP_ROWS; i++) { s.edge[i] = zipRest(i, s.y); s.velocity[i] = 0; } return; }
  s.accumulator += clamp(dt, 0, 0.05);
  const h = 1 / 240;
  while (s.accumulator >= h) {
    s.accumulator -= h;
    const k = s.drag ? 1600 : 280, damping = s.drag ? 80 : 32;
    s.vy += ((s.target - s.y) * k - damping * s.vy) * h;
    s.y = clamp(s.y + s.vy * h, ZIP_TOP, ZIP_BOTTOM);
    s.pv += (-s.pull * 100 - s.pv * 9 + s.vy * 0.025) * h;
    s.pull = clamp(s.pull + s.pv * h, -0.35, 0.35);
    const forces = s.edge.map((e, i) => {
      const rest = zipRest(i, s.y);
      if (rest === 0) return 0;
      const left = i > 0 ? s.edge[i - 1] - zipRest(i - 1, s.y) : e - rest;
      const right = i < ZIP_ROWS ? s.edge[i + 1] - zipRest(i + 1, s.y) : e - rest;
      return 240 * (rest - e) + 160 * (left + right - 2 * (e - rest)) - 20 * s.velocity[i];
    });
    for (let i = 0; i <= ZIP_ROWS; i++) {
      if (zipRest(i, s.y) === 0) { s.edge[i] = 0; s.velocity[i] = 0; }
      else { s.velocity[i] += forces[i] * h; s.edge[i] = clamp(s.edge[i] + s.velocity[i] * h, 0, 145); }
    }
  }
}
export type Mark = { path: string; color: string; stroke?: number };
const n = (v: number) => v.toFixed(2);
const poly = (p: number[]) => 'M' + p.reduce((a,v,i)=>a+(i%2?' '+n(v): (i?' L':'')+n(v)), '')+' Z';
export function zipScene(s: ZipState): Mark[] {
  const marks: Mark[] = [];
  const add = (p: number[], color: string, stroke?: number) => marks.push({ path: poly(p), color, stroke });
  // A quiet original landscape underneath, shared exactly by native and web.
  add([0,0,360,0,360,440,0,440], '#e9dac1');
  marks.push({path:'M 240 96 A 38 38 0 1 0 240 172 A 38 38 0 1 0 240 96 Z',color:'#c76d44'});
  marks.push({path:'M0 280 Q90 190 190 275 Q290 330 360 235 L360 440 L0 440 Z',color:'#b9aa8c'});
  marks.push({path:'M0 330 Q110 238 235 332 Q305 365 360 302 L360 440 L0 440 Z',color:'#857f67'});
  marks.push({path:'M0 385 Q95 310 210 385 Q300 420 360 365 L360 440 L0 440 Z',color:'#4d6157'});
  // Horizontal ruled strips approximate a softly curled fabric surface.
  for (const side of [-1, 1]) {
    for (let i = 0; i < ZIP_ROWS; i++) {
      const y0 = 18 + i * 404 / ZIP_ROWS, y1 = 18 + (i+1)*404/ZIP_ROWS;
      const e0 = s.edge[i], e1 = s.edge[i+1];
      const outer = side < 0 ? 14 : 346;
      const x0 = 180 + side * (e0 + 2), x1 = 180 + side * (e1 + 2);
      const dy = Math.abs(e1-e0);
      const shade = Math.round(clamp(37 + dy * 0.9 + e0 * 0.014, 35, 49));
      add([outer,y0,x0,y0,x1,y1+0.5,outer,y1+0.5], `rgb(${shade},${shade+6},${shade+8})`);
      // Fine woven threads stop at the deformed seam, never across the reveal.
      for (let j=0;j<3;j++) { const f=j/3, y=y0+(y1-y0)*f, x=x0+(x1-x0)*f; marks.push({path:`M${outer} ${n(y)} L${n(x)} ${n(y)}`,color:j===0?'#343c3e':'#2a3335',stroke:0.45}); }
      const fold = 7 + Math.min(11, e0 * 0.09);
      for(let band=0;band<4;band++) {
        const a=band/4,b=(band+1)/4;
        const colors=['#101a1d','#29363a','#414e50','#566265'];
        add([x0-side*fold*a,y0,x0-side*fold*b,y0,x1-side*fold*b,y1+0.5,x1-side*fold*a,y1+0.5],colors[band]);
      }
      marks.push({path:`M${n(x0-side*fold)} ${n(y0)} L${n(x1-side*fold)} ${n(y1)}`,color:'#647074',stroke:0.7});
      marks.push({path:`M${n(x0)} ${n(y0)} L${n(x1)} ${n(y1)}`,color:'#10191c',stroke:2.5});
    }
    // Sparse stitches track the curled tape edge.
    for(let i=0;i<ZIP_ROWS;i+=2) {
      const y=18+i*404/ZIP_ROWS, x=180+side*(s.edge[i]+16);
      marks.push({path:`M${n(x)} ${n(y+1)} l0 3`,color:'#83908f',stroke:0.7});
    }
    // Individually separated, shaded metal teeth.
    for (let y=24;y<417;y+=6.5) {
      const row=clamp((y-18)/404*ZIP_ROWS,0,ZIP_ROWS), a=Math.floor(row), f=row-a;
      const e=s.edge[a]*(1-f)+(s.edge[Math.min(ZIP_ROWS,a+1)]||0)*f;
      const x=180+side*(e+3), offset=side<0?0:3.25;
      add([x,y+offset,x+side*7,y+offset+0.5,x+side*7,y+offset+4,x,y+offset+3.5], '#b6b8b2');
      marks.push({path:`M${n(x)} ${n(y+offset)} l${side*7} 0.5`,color:'#f0ede1',stroke:0.8});
      marks.push({path:`M${n(x)} ${n(y+offset+3.6)} l${side*7} 0`,color:'#626c6d',stroke:1});
    }
  }
  // Slider and articulated pull. Drawn last so no tooth covers the hardware.
  const y=s.y, sway=Math.sin(s.pull)*40;
  add([166,y-14,194,y-14,196,y-1,190,y+15,170,y+15,164,y-1], '#101a1d');
  add([169,y-15,191,y-15,193,y-2,187,y+12,173,y+12,167,y-2], '#b8bfbd');
  add([171,y-13,180,y-13,180,y+10,175,y+10,169,y-2], '#e0e3da');
  add([183,y-12,190,y-12,191,y-1,186,y+9,183,y+9], '#6f7d80');
  add([177,y-8,183,y-8,184,y+9,176,y+9], '#566365');
  marks.push({path:`M176 ${n(y+4)} Q173 ${n(y+14)} ${n(174+sway)} ${n(y+43)} Q${n(180+sway)} ${n(y+49)} ${n(186+sway)} ${n(y+43)} L184 ${n(y+5)} Z M178 ${n(y+15)} L182 ${n(y+15)} L${n(182+sway)} ${n(y+35)} L${n(178+sway)} ${n(y+35)} Z`,color:'#c9cfca'});
  marks.push({path:`M176 ${n(y+7)} L${n(176+sway)} ${n(y+39)}`,color:'#f6f5e8',stroke:1});
  return marks;
}
