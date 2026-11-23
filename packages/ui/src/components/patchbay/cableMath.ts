/** Original 2D position-based cable model, shared by RN Skia and web Canvas. */
export type SlMark={path:string;color?:string;stroke?:number;cap?:'round';alpha?:number;grad?:{x0:number;y0:number;x1:number;y1:number;stops:[number,string][]}};
export const CW=360,CH=390,N=25;
export type Point={x:number;y:number;px:number;py:number};
export const sockets=Array.from({length:8},(_,i)=>({x:60+(i%4)*80,y:i<4?85:165}));
export type Cable={points:Point[];ends:[number|null,number|null];length:number;color:string;light:string};
export type Bay={cables:Cable[];held:{c:number;e:0|1;x:number;y:number}|null;t:number;acc:number;connections:number;flash:number[]};
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
export function createBay():Bay {
 const cables=([[0,6,'#b6873f','#f2cc78'],[3,4,'#397f70','#9bd3bb'],[1,7,'#79567d','#d8b0dc']] as const).map(([a,b,color,light])=>{
 const A=sockets[a],B=sockets[b],points=Array.from({length:N},(_,i)=>{const t=i/(N-1),x=A.x+(B.x-A.x)*t,y=A.y+(B.y-A.y)*t+Math.sin(t*Math.PI)*110;return{x,y,px:x,py:y}});
 return{points,ends:[a,b] as [number|null,number|null],length:Math.max(240,dist(A,B)*1.45),color,light};});
 const s:Bay={cables,held:null,t:0,acc:0,connections:3,flash:Array(8).fill(0)};for(let i=0;i<300;i++)stepBay(s,1/120);s.t=0;return s;
}
function pin(s:Bay,c:number,e:0|1){if(s.held?.c===c&&s.held.e===e)return s.held;const id=s.cables[c].ends[e];return id===null?null:sockets[id];}
export function grabCable(s:Bay,x:number,y:number){let best=30,hit:null|{c:number;e:0|1}=null;s.cables.forEach((c,ci)=>{for(const e of [0,1] as const){const d=dist({x,y},c.points[e?N-1:0]);if(d<best){best=d;hit={c:ci,e}}}});if(!hit)return false;const h=hit as {c:number;e:0|1};s.cables[h.c].ends[h.e]=null;s.held={...h,x,y};return true;}
export function moveCable(s:Bay,x:number,y:number){if(s.held){s.held.x=Math.max(16,Math.min(CW-16,x));s.held.y=Math.max(35,Math.min(CH-25,y));}}
export function compatible(s:Bay,c:number,e:0|1,id:number){if(s.cables.some((b)=>b.ends.includes(id)))return false;const other=pin(s,c,e===0?1:0);return !other||dist(other,sockets[id])<s.cables[c].length*.97;}
export function releaseCable(s:Bay,cancel=false){if(!s.held)return;const h=s.held;let best=25,id:null|number=null;if(!cancel)sockets.forEach((p,i)=>{const d=dist(h,p);if(d<best&&compatible(s,h.c,h.e,i)){best=d;id=i}});s.cables[h.c].ends[h.e]=id;if(id!==null){s.flash[id]=1;const p=s.cables[h.c].points[h.e?N-1:0],a=sockets[id];Object.assign(p,{x:a.x,y:a.y,px:a.x,py:a.y});}s.held=null;s.connections=s.cables.filter(c=>c.ends.every(x=>x!==null)).length;}
/** Accessible reroute: move the selected end to the next reachable empty socket. */
export function cycleConnection(s:Bay,c=0,e:0|1=1){const b=s.cables[c],old=b.ends[e];b.ends[e]=null;for(let offset=1;offset<=8;offset++){const id=((old??-1)+offset)%8;if(compatible(s,c,e,id)){b.ends[e]=id;const A=pin(s,c,0),B=pin(s,c,1);if(A&&B){b.points=Array.from({length:N},(_,i)=>{const t=i/(N-1),x=A.x+(B.x-A.x)*t+Math.sin(t*Math.PI)*(Math.abs(B.x-A.x)<40?65:0),y=A.y+(B.y-A.y)*t+Math.sin(t*Math.PI)*b.length*.4;return{x,y,px:x,py:y}});}break}}s.connections=s.cables.filter(c=>c.ends.every(x=>x!==null)).length;}
export function stepBay(s:Bay,dt:number){s.acc+=Math.min(.05,Math.max(0,dt));const h=1/120;while(s.acc+1e-10>=h){s.acc-=h;s.t+=h;s.cables.forEach((c,ci)=>{const last=N-1,pins=[pin(s,ci,0),pin(s,ci,1)];
 for(let i=0;i<N;i++){const p=c.points[i];if((i===0&&pins[0])||(i===last&&pins[1]))continue;const x=p.x,y=p.y;p.x+=(p.x-p.px)*Math.exp(-2.5*h);p.y+=(p.y-p.py)*Math.exp(-2.5*h)+950*h*h;p.px=x;p.py=y;}
 for(let pass=0;pass<18;pass++){
  pins.forEach((a,e)=>{if(a){const p=c.points[e?last:0];p.x=a.x;p.y=a.y;p.px=a.x;p.py=a.y;}});
  for(let i=0;i<last;i++){const a=c.points[i],b=c.points[i+1],d=dist(a,b)||.001,wa=i===0&&pins[0]?0:1,wb=i===last-1&&pins[1]?0:1;if(!wa&&!wb)continue;const z=(d-c.length/last)/d/(wa+wb),dx=b.x-a.x,dy=b.y-a.y;a.x+=dx*z*wa;a.y+=dy*z*wa;b.x-=dx*z*wb;b.y-=dy*z*wb;}
  // Strain relief: the sheath is stiff next to a held or seated plug and floppy in the middle.
  for(let i=1;i<last;i++){const p=c.points[i],a=c.points[i-1],b=c.points[i+1],near=(i<=3&&pins[0])||(i>=last-3&&pins[1]),k=near?.1:.014;p.x+=((a.x+b.x)/2-p.x)*k;p.y+=((a.y+b.y)/2-p.y)*k;}
  for(let i=0;i<N;i++){const p=c.points[i];const floor=CH-20-(i===0||i===last?8:0);if(p.y>floor){p.y=floor;p.px=p.x-(p.x-p.px)*.65;}p.x=Math.max(10,Math.min(CW-10,p.x));}
 }
 pins.forEach((a,e)=>{if(a){const p=c.points[e?last:0];p.x=a.x;p.y=a.y;}});
 });
 // Cables are round tubes: they push each other apart instead of passing through.
 for(let a=0;a<s.cables.length;a++)for(let b=a+1;b<s.cables.length;b++)for(let i=2;i<N-2;i++)for(let j=2;j<N-2;j++){const p=s.cables[a].points[i],q=s.cables[b].points[j],dx=q.x-p.x,dy=q.y-p.y;if(Math.abs(dx)>9||Math.abs(dy)>9)continue;const d=Math.hypot(dx,dy);if(d>=8)continue;const m=d||.001,push=(8-m)/2/m*.5;p.x-=dx*push;p.y-=dy*push;q.x+=dx*push;q.y+=dy*push;}
 for(let i=0;i<8;i++)s.flash[i]*=Math.exp(-3.5*h);
 }}
const circle=(x:number,y:number,r:number)=>`M${x-r} ${y}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`;
const rgb=(c:string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const mix=(a:string,b:string,t:number)=>{const x=rgb(a),y=rgb(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');};
function path(points:Point[]){let p=`M${points[0].x} ${points[0].y}`;for(let i=0;i<points.length-1;i++){const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];p+=`C${b.x+(c.x-a.x)/6} ${b.y+(c.y-a.y)/6} ${c.x-(d.x-b.x)/6} ${c.y-(d.y-b.y)/6} ${c.x} ${c.y}`;}return p;}
/** Short ticks across the sheath at even arc-length steps give the cable a braided look that follows every bend. */
function braid(points:Point[],step=4.2){let d='',carry=step/2;for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],len=Math.hypot(b.x-a.x,b.y-a.y)||.001,tx=(b.x-a.x)/len,ty=(b.y-a.y)/len;while(carry<len){const x=a.x+tx*carry,y=a.y+ty*carry,nx=-ty*3.3,ny=tx*3.3;d+=`M${x+nx-tx} ${y+ny-ty}L${x-nx+tx} ${y-ny+ty}`;carry+=step;}carry-=len;}return d;}

export function bayScene(s:Bay,reduce=false):SlMark[]{const m:SlMark[]=[];const fill=(path:string,color:string,alpha=1)=>m.push({path,color,alpha});const stroke=(path:string,color:string,width:number,alpha=1)=>m.push({path,color,stroke:width,alpha,cap:'round'});
 // Desk surface and panel.
 m.push({path:'M0 0H360V390H0Z',grad:{x0:0,y0:0,x1:360,y1:390,stops:[[0,'#f6f4ef'],[.6,'#e4e6de'],[1,'#d3d8cf']]}});
 fill('M18 52H342V218H18Z','#10201a',.1);fill('M22 50H338V212H22Z','#10201a',.14);
 m.push({path:'M22 40H338V200H22Z',grad:{x0:22,y0:40,x1:338,y1:200,stops:[[0,'#3d5249'],[.4,'#22392f'],[1,'#13241d']]}});
 for(let y=44;y<200;y+=5)stroke(`M24 ${y}H336`,'#ffffff',.5,.035);
 stroke('M23 40.5H337',  '#9cb3a6',1,.55);stroke('M23 199.5H337','#050b08',1,.5);
 for(const x of [32,328])for(const y of [50,190]){fill(circle(x,y,3.4),'#0b140f',.6);fill(circle(x,y,2.8),'#8b9a91');fill(circle(x-.5,y-.6,1.4),'#d4dcd5');stroke(`M${x-1.7} ${y+1.2}l3.4 -2.4`,'#1b2721',.9);}
 // Sockets: recessed, beveled jacks with a seat light that flashes when a plug clicks in.
 sockets.forEach((p,id)=>{fill(circle(p.x,p.y+1.5,19.5),'#050a07',.55);fill(circle(p.x,p.y,18),'#0d1a13');stroke(circle(p.x,p.y,16.5),'#75887c',1.4);stroke(circle(p.x,p.y,14.4),'#1e2f26',1.6);
  fill(circle(p.x,p.y,12.5),'#9aa08d');fill(circle(p.x,p.y,11),'#c7ccb6');fill(circle(p.x,p.y,9.2),'#5c634f');fill(circle(p.x,p.y,8),'#050806');stroke(`M${p.x-9.6} ${p.y-1}a9.6 9.6 0 0 1 14 -6.8`,'#f4f6e6',1.3,.65);fill(circle(p.x+1.8,p.y+2,3),'#0a120d',.8);
  const active=s.cables.some(c=>c.ends.includes(id)),f=s.flash[id]??0;fill(circle(p.x,p.y-26,3.6+f*3),'#b9df83',.14+f*.5);fill(circle(p.x,p.y-26,2),active?'#c6ee8f':'#44594a');
  if(f>.02){stroke(circle(p.x,p.y,18+(1-f)*10),'#c6ee8f',1.6,f*.7);}
  if(s.held&&compatible(s,s.held.c,s.held.e,id)){stroke(circle(p.x,p.y,21.5),'#9fcaa4',1.4,.75);}});
 s.cables.forEach((c,ci)=>{const d=path(c.points),dark=mix(c.color,'#000000',.45),mid=mix(c.color,c.light,.45);
  // Soft contact shadow cast on the panel and desk.
  for(const [w,a] of [[15,.04],[12,.05],[9.5,.07]] as const)stroke(path(c.points.map(p=>({...p,x:p.x+3.5,y:p.y+7}))),'#0a1410',w,a);
  stroke(d,'#0f1812',10.8);stroke(d,dark,8.9);stroke(d,c.color,7.1);
  stroke(path(c.points.map(p=>({...p,x:p.x-.9,y:p.y-.9}))),mid,3.7,.9);
  m.push({path:braid(c.points),color:dark,stroke:.9,alpha:.32,cap:'round'});
  stroke(path(c.points.map(p=>({...p,x:p.x-1.5,y:p.y-1.6}))),c.light,1.3,.75);
  if(c.ends.every(x=>x!==null)){const phase=((reduce?0:s.t)*.32+ci*.25)%1,index=Math.min(N-2,Math.floor(phase*(N-1))),t=phase*(N-1)-index,a=c.points[index],b=c.points[index+1],x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;fill(circle(x,y,6),'#f4efbc',.18);fill(circle(x,y,2.6),'#fbf6c8',.9);}
  for(const e of [0,1] as const){const p=c.points[e?N-1:0],next=c.points[e?N-2:1],angle=Math.atan2(p.y-next.y,p.x-next.x),seated=c.ends[e]!==null;
   const ux=Math.cos(angle),uy=Math.sin(angle),nx=-uy,ny=ux,at=(a:number,w:number)=>`${p.x+ux*a+nx*w} ${p.y+uy*a+ny*w}`;
   const box=(a:number,b:number,w:number,w2=w)=>`M${at(a,w)}L${at(b,w2)}L${at(b,-w2)}L${at(a,-w)}Z`;
   const tip=seated?4:13;
   fill(`M${p.x+3+ux*-30+nx*6} ${p.y+7+uy*-30+ny*6}L${p.x+3+ux*tip+nx*3} ${p.y+7+uy*tip+ny*3}L${p.x+3+ux*tip-nx*3} ${p.y+7+uy*tip-ny*3}L${p.x+3+ux*-30-nx*6} ${p.y+7+uy*-30-ny*6}Z`,'#0a1410',.2);
   // Boot (strain relief), sleeve and TRS tip, shaded as nested cylinders.
   fill(box(-32,-14,5.2,7.6),dark);fill(box(-32,-14,3.6,5.8),c.color);fill(box(-32,-14,1.4,2.4),c.light,.7);
   for(let r=-28;r<-15;r+=3.6)stroke(`M${p.x+ux*r+nx*6.6} ${p.y+uy*r+ny*6.6}L${p.x+ux*r-nx*6.6} ${p.y+uy*r-ny*6.6}`,dark,.8,.4);
   fill(box(-15,-12,8.2),'#2b332d');
   fill(box(-12,0,7.4),'#6e776d');fill(box(-12,0,6.2),'#aeb6a7');fill(box(-12,0,3.6),'#e6eadc');fill(box(-12,0,1.2),'#ffffff',.85);
   for(let r=-10;r<-1;r+=2)stroke(`M${p.x+ux*r+nx*6.1} ${p.y+uy*r+ny*6.1}L${p.x+ux*r-nx*6.1} ${p.y+uy*r-ny*6.1}`,'#5e675d',.7,.45);
   fill(box(0,tip,3.6),'#808a80');fill(box(0,tip,2.6),'#d7dccd');fill(box(0,tip,1),'#ffffff',.8);
   if(!seated){fill(box(4,5.6,3.6),'#1a211c');fill(box(8.6,10.2,3.6),'#1a211c');fill(circle(p.x+ux*tip,p.y+uy*tip,3.1),'#c8cfbf');fill(circle(p.x+ux*(tip+.3)-nx*.5,p.y+uy*(tip+.3)-ny*.5,1.2),'#ffffff',.8);}
   stroke(`M${at(-12,-5.8)}L${at(-1,-5.8)}`,'#ffffff',.9,.4);
  }});return m;}
