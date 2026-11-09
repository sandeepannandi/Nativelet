/* Shared analytic ray/cylinder renderer for Skia RuntimeEffect and WebGL.
 * All geometry intersects actual rays, no flat ellipse sorting or polygon painter.
 * Material/environment are a studio-light approximation, not spectral PBR.
 * World z is vertical; dimensions1 rendering unit=50mm. */
export const GYRO_SHADER=`
uniform float2 size;
uniform float3 angles;
uniform float exposure;
float3 rz(float3 p,float a){float c=cos(a),s=sin(a);return float3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
float3 rx(float3 p,float a){float c=cos(a),s=sin(a);return float3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
float3 inversePart(float3 p,float a,float b){return rx(rz(p,-a),-b);}
float3 forwardPart(float3 p,float a,float b){return rz(rx(p,b),a);}
// A finite annular cylinder. Return nearest positive surface and local normal.
void candidate(float v,float3 n,inout float best,inout float3 normal){if(v>.0001&&v<best){best=v;normal=n;}}
float cylinder(float3 o,float3 d,float ro,float ri,float hh,out float3 normal){
 float best=10000.;normal=float3(0.,0.,1.);
 float A=dot(d.xy,d.xy),B=dot(o.xy,d.xy);
 for(int shell=0;shell<2;shell++){
  float r=shell==0?ro:ri;
  if(r>.00001&&A>.000001){float C=dot(o.xy,o.xy)-r*r,dis=B*B-A*C;
   if(dis>=0.){float sq=sqrt(dis);for(int side=0;side<2;side++){
    float t=(-B+(side==0?-sq:sq))/A;float3 q=o+t*d;
    if(abs(q.z)<=hh)candidate(t,float3(q.xy/r,0.)*(shell==0?1.:-1.),best,normal);
   }}
  }
 }
 if(abs(d.z)>.000001)for(int cap=0;cap<2;cap++){
  float signZ=cap==0?-1.:1.,t=(signZ*hh-o.z)/d.z;float3 q=o+t*d;float r2=dot(q.xy,q.xy);
  if(r2<=ro*ro&&r2>=ri*ri)candidate(t,float3(0.,0.,signZ),best,normal);
 }
 return best;
}
void part(float3 o,float3 d,float3 center,float a,float b,float ro,float ri,float hh,float mat,
 inout float best,inout float3 normal,inout float3 local,inout float material){
 float3 rel=o-center;float proj=dot(rel,d);
 float bound=ro*ro+hh*hh;
 if(dot(rel,rel)-proj*proj>bound)return;
 float3 no;float3 oo=inversePart(o-center,a,b),dd=inversePart(d,a,b);
 float t=cylinder(oo,dd,ro,ri,hh,no);
 if(t<best){best=t;normal=forwardPart(no,a,b);local=oo+t*dd;material=mat;}
}
void scene(float3 o,float3 d,out float best,out float3 normal,out float3 local,out float material){
 best=10000.;normal=float3(0.,0.,1.);local=float3(0.);material=0.;
 float closest=dot(o,d);if(dot(o,o)-closest*closest>5.1)return;
 float a=angles.x,b=angles.y,g=angles.z;
 // stationary machined base, shoulder and yaw bearing
 part(o,d,float3(0.,0.,-1.96),0.,0.,.88,0.,.10,3.,best,normal,local,material);
 part(o,d,float3(0.,0.,-1.84),0.,0.,.55,0.,.035,1.,best,normal,local,material);
 part(o,d,float3(0.,0.,-1.6),0.,0.,.16,0.,.22,1.,best,normal,local,material);
 // Outer gimbal normal exA. rx(pi/2) maps normal z -> -y, extra yaw pi/2 maps ->x.
 part(o,d,float3(0.),a+1.5707963,1.5707963,1.38,1.28,.055,1.,best,normal,local,material);
 // Inner gimbal, normal follows the rotor axis; distinct radial clearance.
 part(o,d,float3(0.),a,b,1.18,1.08,.045,2.,best,normal,local,material);
 // Tilt bearings at +-outerX, shared by inner/outer frames.
 for(int i=0;i<2;i++){
  float signX=i==0?-1.:1.;float3 c=rz(float3(signX*1.23,0.,0.),a);
  part(o,d,c,a+1.5707963,1.5707963,.115,0.,.14,3.,best,normal,local,material);
 }
 // Axle is treated massless. Rotor disk center is1.5mm along +axis.
 part(o,d,float3(0.),a,b,.065,0.,.18,1.,best,normal,local,material);
 float3 axis=forwardPart(float3(0.,0.,1.),a,b);
 
 // Rotor bearings have actual bridges to the inner hoop, on both sides of the disk.
 for(int bridge=0;bridge<2;bridge++){
  float q=bridge==0?-.23:.23;float3 c=axis*q;
  part(o,d,c,a+1.5707963,1.5707963,.035,0.,1.12,1.,best,normal,local,material);
  part(o,d,c,a,b,.14,.065,.04,3.,best,normal,local,material);
  for(int side=0;side<2;side++){
   float x=side==0?-1.12:1.12;
   float3 post=forwardPart(float3(x,0.,q*.5),a,b);
   part(o,d,post,a,b,.045,0.,abs(q)*.5,1.,best,normal,local,material);
  }
 }
 // Disk:8mm thickness and45mm radius, bevel bands approximated by narrow cylinders.
 part(o,d,axis*.03,a,b,.885,.065,.08,4.,best,normal,local,material);
 part(o,d,axis*.03,a,b,.9,.865,.063,2.,best,normal,local,material);
 part(o,d,axis*.03,a,b,.28,.065,.095,1.,best,normal,local,material);
}
float3 studio(float3 r){
 float up=smoothstep(-.4,.8,r.z);float3 c=mix(float3(.035,.042,.05),float3(.35,.39,.44),up);
 float rectA=pow(max(0.,dot(r,normalize(float3(-.5,-.6,1.)))),36.);
 float rectB=pow(max(0.,dot(r,normalize(float3(.8,.3,.55)))),55.);
 return c+float3(1.6,1.5,1.28)*rectA+float3(.7,.84,1.)*rectB;
}
float4 gyroColor(float2 pixel){
 float2 uv=(pixel-size*.5)/size.y;uv.y=-uv.y;
 float3 eye=float3(3.7,-6.4,3.2),target=float3(0.,0.,-.25),f=normalize(target-eye),right=normalize(cross(f,float3(0.,0.,1.))),up=cross(right,f);
 float3 ray=normalize(f+right*uv.x*.65+up*uv.y*.65);
 float t,mat;float3 n,local;scene(eye,ray,t,n,local,mat);
 float3 color=mix(float3(.047,.057,.067),float3(.10,.115,.13),pixel.y/size.y);
 if(t<9000.){
  float3 hit=eye+ray*t;
  float3 base=mat<1.5?float3(.7,.76,.80):mat<2.5?float3(.62,.32,.085):mat<3.5?float3(.065,.075,.083):float3(.53,.57,.61);
  float rough=mat<1.5?.18:mat<2.5?.25:mat<3.5?.42:.30;
  // Rotor engraving moves with gamma, the actual rotor degree of freedom.
  if(mat>3.5&&abs(n.z)+abs(n.x)+abs(n.y)>0.){
   float ang=atan(local.y,local.x)-angles.z,r=length(local.xy);
   float mark=pow(max(0.,cos(ang*12.)),80.)*smoothstep(.63,.67,r)*(1.-smoothstep(.80,.83,r));
   float ringLine=exp(-pow((r-.57)/.004,2.));base*=1.-.6*mark-.25*ringLine;
  }
  float3 reflected=reflect(ray,n),env=studio(reflected),light=normalize(float3(-.5,-.6,1.));
  float diffuse=.18+.42*max(0.,dot(n,light)),fres=pow(1.-max(0.,dot(-ray,n)),5.);
  color=base*(env*(.7-.3*rough)+diffuse*.4)+studio(n)*base*.1+float3(.15)*fres;
  if(mat>3.5){
   float3 radial=forwardPart(normalize(float3(local.xy,.00001)),angles.x,angles.y);
   float3 tangent=normalize(cross(forwardPart(float3(0.,0.,1.),angles.x,angles.y),radial));
   float3 halfLight=normalize(light-ray);
   float brush=exp(-pow(dot(halfLight,tangent)/.13,2.)-pow(dot(halfLight,radial)/.48,2.));
   color+=float3(.28,.30,.32)*brush*max(0.,dot(n,light));
  }
  // Analytic hard occlusion toward the area-light center. One visibility sample, not full GI.
  float shadow,sm;float3 sn,sl;scene(hit+n*.0015,light,shadow,sn,sl,sm);
  if(shadow<8.)color*=.68;
  // Small radial machining variation, shading only.
  color*=.985+.015*cos(length(local.xy)*500.);
 }else if(abs(ray.z)>.00001){
  float floorT=(-2.08-eye.z)/ray.z;float3 hit=eye+floorT*ray;
  if(floorT>0.){float sh,sm;float3 nn,ll;scene(hit+float3(0.,0.,.002),normalize(float3(-.5,-.6,1.)),sh,nn,ll,sm);if(sh<10.)color*=.68;}
 }
 color=pow(max(color*exposure,float3(0.)),float3(.454545));
 float vignette=1.-.12*dot(uv,uv);return float4(color*vignette,1.);
}
`;
