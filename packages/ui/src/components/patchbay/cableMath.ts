/** Original 2D position-based cable model, shared by RN Skia and web Canvas. */
export type SlMark={path:string;color?:string;stroke?:number;cap?:'round';alpha?:number;grad?:{x0:number;y0:number;x1:number;y1:number;stops:[number,string][]}};
export const CW=360,CH=390,N=25;
export type Point={x:number;y:number;px:number;py:number};
export const sockets=Array.from({length:8},(_,i)=>({x:60+(i%4)*80,y:i<4?85:165}));
export type Cable={points:Point[];ends:[number|null,number|null];length:number;color:string;light:string};
export type Bay={cables:Cable[];held:{c:number;e:0|1;x:number;y:number}|null;t:number;acc:number;connections:number};
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
export function createBay():Bay {
 const cables=([[0,6,'#b6873f','#f2cc78'],[3,4,'#397f70','#9bd3bb'],[1,7,'#79567d','#d8b0dc']] as const).map(([a,b,color,light])=>{
 const A=sockets[a],B=sockets[b],points=Array.from({length:N},(_,i)=>{const t=i/(N-1),x=A.x+(B.x-A.x)*t,y=A.y+(B.y-A.y)*t+Math.sin(t*Math.PI)*110;return{x,y,px:x,py:y}});
 return{points,ends:[a,b] as [number|null,number|null],length:Math.max(240,dist(A,B)*1.45),color,light};});
 const s:Bay={cables,held:null,t:0,acc:0,connections:3};for(let i=0;i<300;i++)stepBay(s,1/120);s.t=0;return s;
}
function pin(s:Bay,c:number,e:0|1){if(s.held?.c===c&&s.held.e===e)return s.held;const id=s.cables[c].ends[e];return id===null?null:sockets[id];}
export function grabCable(s:Bay,x:number,y:number){let best=30,hit:null|{c:number;e:0|1}=null;s.cables.forEach((c,ci)=>{for(const e of [0,1] as const){const d=dist({x,y},c.points[e?N-1:0]);if(d<best){best=d;hit={c:ci,e}}}});if(!hit)return false;const h=hit as {c:number;e:0|1};s.cables[h.c].ends[h.e]=null;s.held={...h,x,y};return true;}
export function moveCable(s:Bay,x:number,y:number){if(s.held){s.held.x=Math.max(16,Math.min(CW-16,x));s.held.y=Math.max(35,Math.min(CH-25,y));}}
export function compatible(s:Bay,c:number,e:0|1,id:number){if(s.cables.some((b)=>b.ends.includes(id)))return false;const other=pin(s,c,e===0?1:0);return !other||dist(other,sockets[id])<s.cables[c].length*.97;}
export function releaseCable(s:Bay,cancel=false){if(!s.held)return;const h=s.held;let best=25,id:null|number=null;if(!cancel)sockets.forEach((p,i)=>{const d=dist(h,p);if(d<best&&compatible(s,h.c,h.e,i)){best=d;id=i}});s.cables[h.c].ends[h.e]=id;if(id!==null){const p=s.cables[h.c].points[h.e?N-1:0],a=sockets[id];Object.assign(p,{x:a.x,y:a.y,px:a.x,py:a.y});}s.held=null;s.connections=s.cables.filter(c=>c.ends.every(x=>x!==null)).length;}
/** Accessible reroute: move the selected end to the next reachable empty socket. */
export function cycleConnection(s:Bay,c=0,e:0|1=1){const b=s.cables[c],old=b.ends[e];b.ends[e]=null;for(let offset=1;offset<=8;offset++){const id=((old??-1)+offset)%8;if(compatible(s,c,e,id)){b.ends[e]=id;const A=pin(s,c,0),B=pin(s,c,1);if(A&&B){b.points=Array.from({length:N},(_,i)=>{const t=i/(N-1),x=A.x+(B.x-A.x)*t+Math.sin(t*Math.PI)*(Math.abs(B.x-A.x)<40?65:0),y=A.y+(B.y-A.y)*t+Math.sin(t*Math.PI)*b.length*.4;return{x,y,px:x,py:y}});}break}}s.connections=s.cables.filter(c=>c.ends.every(x=>x!==null)).length;}
export function stepBay(s:Bay,dt:number){s.acc+=Math.min(.05,Math.max(0,dt));const h=1/120;while(s.acc+1e-10>=h){s.acc-=h;s.t+=h;s.cables.forEach((c,ci)=>{const last=N-1,pins=[pin(s,ci,0),pin(s,ci,1)];
 for(let i=0;i<N;i++){const p=c.points[i];if((i===0&&pins[0])||(i===last&&pins[1]))continue;const x=p.x,y=p.y;p.x+=(p.x-p.px)*Math.exp(-2.5*h);p.y+=(p.y-p.py)*Math.exp(-2.5*h)+950*h*h;p.px=x;p.py=y;}
 for(let pass=0;pass<18;pass++){
  pins.forEach((a,e)=>{if(a){const p=c.points[e?last:0];p.x=a.x;p.y=a.y;p.px=a.x;p.py=a.y;}});
  for(let i=0;i<last;i++){const a=c.points[i],b=c.points[i+1],d=dist(a,b)||.001,wa=i===0&&pins[0]?0:1,wb=i===last-1&&pins[1]?0:1;if(!wa&&!wb)continue;const z=(d-c.length/last)/d/(wa+wb),dx=b.x-a.x,dy=b.y-a.y;a.x+=dx*z*wa;a.y+=dy*z*wa;b.x-=dx*z*wb;b.y-=dy*z*wb;}
  // Weak bending resistance reduces implausibly sharp kinks without forcing
  // cables into a decorative preset curve.
  for(let i=1;i<last;i++){const p=c.points[i],a=c.points[i-1],b=c.points[i+1];p.x+=((a.x+b.x)/2-p.x)*.012;p.y+=((a.y+b.y)/2-p.y)*.012;}
  for(let i=0;i<N;i++){const p=c.points[i];const floor=CH-20-(i===0||i===last?8:0);if(p.y>floor){p.y=floor;p.px=p.x-(p.x-p.px)*.65;}p.x=Math.max(10,Math.min(CW-10,p.x));}
 }
 pins.forEach((a,e)=>{if(a){const p=c.points[e?last:0];p.x=a.x;p.y=a.y;}});
 });}}
const circle=(x:number,y:number,r:number)=>`M${x-r} ${y}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`;
function path(points:Point[]){let p=`M${points[0].x} ${points[0].y}`;for(let i=0;i<points.length-1;i++){const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];p+=`C${b.x+(c.x-a.x)/6} ${b.y+(c.y-a.y)/6} ${c.x-(d.x-b.x)/6} ${c.y-(d.y-b.y)/6} ${c.x} ${c.y}`;}return p;}

export function bayScene(s:Bay,reduce=false):SlMark[]{const m:SlMark[]=[];const fill=(path:string,color:string,alpha=1)=>m.push({path,color,alpha});const stroke=(path:string,color:string,width:number,alpha=1)=>m.push({path,color,stroke:width,alpha,cap:'round'});
 m.push({path:'M0 0H360V390H0Z',grad:{x0:0,y0:0,x1:360,y1:390,stops:[[0,'#f4f2ed'],[1,'#dbdfd7']]}});
 fill('M26 48H334V210H26Z','#172a25',.12);m.push({path:'M22 40H338V200H22Z',grad:{x0:22,y0:40,x1:330,y1:210,stops:[[0,'#354941'],[.35,'#20372e'],[1,'#14251f']]}});
 for(const x of [32,328])for(const y of [50,190]){fill(circle(x,y,2.5),'#75847c');stroke(`M${x-1} ${y+1}l2 -2`,'#17221d',.8);}
 sockets.forEach((p,id)=>{fill(circle(p.x,p.y,18),'#112018');stroke(circle(p.x,p.y,15),'#64796b',1.2);fill(circle(p.x,p.y,11),'#090f0b');stroke(circle(p.x,p.y,10),'#a4aa91',2);fill(circle(p.x,p.y,7),'#060b08');const active=s.cables.some(c=>c.ends.includes(id));fill(circle(p.x,p.y-25,2),active?'#b9df83':'#4d6250');if(s.held&&compatible(s,s.held.c,s.held.e,id))stroke(circle(p.x,p.y,21),'#80a886',1.2,.75);});
 s.cables.forEach((c,ci)=>{const d=path(c.points);stroke(path(c.points.map(p=>({...p,x:p.x+2,y:p.y+5}))),'#1f3528',11,.12);stroke(d,'#17251d',10);stroke(d,c.color,7.5);stroke(path(c.points.map(p=>({...p,x:p.x-1.1,y:p.y-1.1}))),c.light,1.6,.65);
 if(c.ends.every(x=>x!==null)){const phase=((reduce?0:s.t)*.32+ci*.25)%1,index=Math.min(N-2,Math.floor(phase*(N-1))),t=phase*(N-1)-index,a=c.points[index],b=c.points[index+1];fill(circle(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,3),'#f4efbc',.9);}
 for(const e of [0,1] as const){const p=c.points[e?N-1:0],next=c.points[e?N-2:1],angle=Math.atan2(p.y-next.y,p.x-next.x);const ux=Math.cos(angle),uy=Math.sin(angle),nx=-uy,ny=ux;const box=(a:number,b:number,w:number)=>`M${p.x+ux*a+nx*w} ${p.y+uy*a+ny*w}L${p.x+ux*b+nx*w} ${p.y+uy*b+ny*w}L${p.x+ux*b-nx*w} ${p.y+uy*b-ny*w}L${p.x+ux*a-nx*w} ${p.y+uy*a-ny*w}Z`;
 fill(box(-12,6,7),'#17231e');fill(box(3,13,4.2),'#b3bba9');fill(box(5,9,4.3),'#e8e8cf');fill(box(-8,-4,7.2),c.color);stroke(`M${p.x-ux*10+nx*4} ${p.y-uy*10+ny*4}L${p.x+ux*2+nx*4} ${p.y+uy*2+ny*4}`,'#eef1d9',1,.3);
 }});return m;}
