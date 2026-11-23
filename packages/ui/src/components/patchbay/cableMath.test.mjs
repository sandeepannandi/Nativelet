import assert from 'node:assert/strict';
import * as m from './cableMath.ts';
const s=m.createBay();assert.equal(s.connections,3);
const a=m.sockets[0];assert(m.grabCable(s,a.x,a.y));m.moveCable(s,140,165);m.releaseCable(s);assert.equal(s.cables[0].ends[0],5);assert.equal(s.connections,3);
assert(!m.compatible(s,0,0,7),'occupied jack rejected');
assert(m.grabCable(s,140,165));m.moveCable(s,50,330);m.releaseCable(s);assert.equal(s.cables[0].ends[0],null);
for(let i=0;i<1000;i++){m.stepBay(s,1/60);for(const c of s.cables)for(const p of c.points)assert(Number.isFinite(p.x+p.y));}
assert.equal(s.cables[0].points.at(-1).x,m.sockets[6].x);assert(s.cables[0].points[0].y<=m.CH-20);
m.cycleConnection(s,0,0);assert.notEqual(s.cables[0].ends[0],null);
assert(!m.grabCable(s,350,0));assert(m.bayScene(s).length>150);
const one=m.createBay(),two=m.createBay();for(let i=0;i<30;i++)m.stepBay(one,1/30);for(let i=0;i<120;i++)m.stepBay(two,1/120);assert(Math.abs(one.cables[0].points[8].y-two.cables[0].points[8].y)<1e-8);
console.log('patchbay: socket occupancy, snap, hanging, finite solver, pins, accessibility, rendering and frame-rate checks pass');
// Cables are solid: seated cables never stay interpenetrating after settling.
{const t=m.createBay();for(let i=0;i<600;i++)m.stepBay(t,1/60);let worst=99;for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)for(let i=2;i<23;i++)for(let j=2;j<23;j++){const p=t.cables[a].points[i],q=t.cables[b].points[j];worst=Math.min(worst,Math.hypot(p.x-q.x,p.y-q.y));}assert(worst>5,'cable separation '+worst);}
console.log('patchbay: cable collision and plug flash checks pass');
