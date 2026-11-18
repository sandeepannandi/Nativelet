/** Original single-pass optics renderer shared by Skia SkSL and WebGL.
 * Shallow-water surface waves, Snell refraction and Schlick Fresnel. Caustic intensity is a
 * local focusing estimate; this is not path-traced light transport or splashing fluid.
 */
export const WATER_SHADER=`
uniform float2 resolution;
uniform float clock;
uniform float3 ball;
uniform shader heightmap;
float heightAt(float2 p){
 float2 uv=clamp((p+float2(1.25,.95))/float2(2.5,1.9),float2(0.0),float2(1.0));
 // Bilinear interpolation commutes with this linear two-byte decode.
 float2 encoded=heightmap.eval(uv*float2(127.0,95.0)+float2(.5)).rg;
 return (dot(encoded,float2(65280.0,255.0))/65535.0-.5)*.24;
}
float3 normalAt(float2 p){float e=0.008;return normalize(float3(heightAt(p-float2(e,0.0))-heightAt(p+float2(e,0.0)),2.0*e,heightAt(p-float2(0.0,e))-heightAt(p+float2(0.0,e))));}
float3 sky(float3 d){
 float3 c=mix(float3(0.64,0.77,0.84),float3(0.24,0.44,0.57),clamp(d.y,0.0,1.0));
 float3 sun=normalize(float3(-0.45,1.0,0.4));
 c+=float3(1.0,0.91,0.71)*pow(max(0.0,dot(d,sun)),420.0)*2.5;
 // Broad skylight reflections, rather than a moving painted highlight.
 c+=float3(0.5,0.57,0.58)*pow(max(0.0,dot(d,normalize(float3(-1.0,0.65,-0.6)))),18.0);
 return c;
}
float sphereHit(float3 o,float3 d){float3 oc=o-ball;float b=dot(oc,d);float c=dot(oc,oc)-0.255*0.255;float disc=b*b-c;if(disc<0.0)return 1000.0;float t=-b-sqrt(disc);return t>0.001?t:1000.0;}
float focusLight(float2 p){
 float3 n=normalAt(p-float2(-0.45,0.4)*0.32);
 float3 nx=normalAt(p+float2(0.018,0.0)-float2(-0.45,0.4)*0.32);
 float3 nz=normalAt(p+float2(0.0,0.018)-float2(-0.45,0.4)*0.32);
 float a=1.0+(nx.x-n.x)*15.0,b=(nz.x-n.x)*15.0;
 float c=(nx.z-n.z)*15.0,d=1.0+(nz.z-n.z)*15.0;
 return clamp(0.62/max(0.13,abs(a*d-b*c)),0.25,3.7);
}
float3 tile(float3 p,float3 n){
 float2 uv=abs(n.y)>0.5?p.xz:(abs(n.x)>0.5?p.zy:p.xy);
 float2 g=abs(fract(uv*8.0)-0.5);
 float line=smoothstep(0.452,0.482,max(g.x,g.y));
 float hash=fract(sin(dot(floor(uv*8.0),float2(127.1,311.7)))*43758.5453);
 float3 c=mix(float3(0.55,0.72,0.70),float3(0.43,0.65,0.64),hash*.6);
 c=mix(c,float3(0.37,0.52,0.50),line*.7);
 float light=0.45+0.55*max(0.0,dot(n,normalize(float3(-0.45,1.0,0.4))));
 float caustic=focusLight(p.xz)*(0.55+max(0.0,n.y)*.45);
 float shadow=1.0-0.65*exp(-dot((p.xz-ball.xz-float2(.12,-.1))*3.8,(p.xz-ball.xz-float2(.12,-.1))*3.8));
 float ao=clamp(min(1.25-abs(p.x),.95-abs(p.z))*4.0,.48,1.0);
 return c*(light*.65+caustic*.52)*shadow*ao;
}
float3 underWater(float3 o,float3 d){
 float t=(-.8-o.y)/d.y;float3 n=float3(0.0,1.0,0.0);
 float tx=((d.x>0.0?1.25:-1.25)-o.x)/d.x;
 if(tx>0.001&&tx<t){t=tx;n=float3(d.x>0.0?-1.0:1.0,0.0,0.0);}
 float tz=((d.z>0.0?.95:-.95)-o.z)/d.z;
 if(tz>0.001&&tz<t){t=tz;n=float3(0.0,0.0,d.z>0.0?-1.0:1.0);}
 float ts=sphereHit(o,d);float3 c;
 if(ts<t){t=ts;float3 p=o+d*t;float3 sn=normalize(p-ball);
 float diffuse=max(0.0,dot(sn,normalize(float3(-.45,1.0,.4))));
 c=float3(.77,.89,.84)*(.25+.65*diffuse+focusLight(p.xz)*.28);
 c+=float3(.8,.9,.9)*pow(max(0.0,dot(reflect(-normalize(float3(-.45,1.0,.4)),sn),-d)),65.0)*.6;
 }else{c=tile(o+d*t,n);}
 float3 transmission=exp(-float3(.48,.10,.045)*max(t,0.0));
 return c*transmission+float3(.035,.30,.37)*(1.0-transmission);
}
half4 main(float2 frag){
 float2 uv=(frag/resolution*2.0-1.0);uv.y=-uv.y;uv.x*=resolution.x/resolution.y;
 float3 eye=float3(2.7,2.5,3.6),f=normalize(float3(0.0,-.22,0.0)-eye);
 float3 r=normalize(cross(f,float3(0.0,1.0,0.0))),u=cross(r,f);
 float3 ray=normalize(f*2.8+r*uv.x+u*uv.y);
 float t=-eye.y/ray.y;float3 p=eye+ray*t;
 float3 c=float3(.91,.925,.90);
 if(abs(p.x)<1.25&&abs(p.z)<.95){
  // Refine water intersection without high-step raymarching.
  t=(heightAt(p.xz)-eye.y)/ray.y;p=eye+ray*t;
  t+=(heightAt(p.xz)-p.y)/ray.y;p=eye+ray*t;
  float3 n=normalAt(p.xz);
  float3 rd=refract(ray,n,1.0/1.333);
  float fresnel=.02037+.97963*pow(1.0-max(0.0,dot(-ray,n)),5.0);
  c=mix(underWater(p+rd*.002,rd),sky(reflect(ray,n)),fresnel);
  c+=float3(1.0,.95,.78)*pow(max(0.0,dot(reflect(ray,n),normalize(float3(-.45,1.0,.4)))),230.0)*1.4;
 }else{
  float tr=(.045-eye.y)/ray.y;float3 pr=eye+ray*tr;
  if(abs(pr.x)<1.36&&abs(pr.z)<1.06){
   float edge=min(1.36-abs(pr.x),1.06-abs(pr.z));
   float grout=step(.485,abs(fract((abs(pr.x)>1.25?pr.z:pr.x)*4.0)-.5));
   c=float3(.78,.80,.74)*(0.9+.10*smoothstep(0.0,.03,edge))*(1.0-grout*.16);
  }else{
   float tg=(-.83-eye.y)/ray.y;float3 pg=eye+ray*tg;
   float2 q=max(abs(pg.xz)-float2(1.34,1.04),float2(0.0));
   c*=1.0-.17*exp(-dot(q,q)*13.0);
  }
 }
 c=pow(max(c,float3(0.0)),float3(.92));
 return half4(half3(c),1.0);
}
`;
export function webFragment(){return 'precision highp float;\n'+WATER_SHADER.replace('uniform shader heightmap;','uniform sampler2D heightmap;').replace('heightmap.eval(uv*float2(127.0,95.0)+float2(.5))','texture2D(heightmap,(uv*float2(127.0,95.0)+float2(.5))/float2(128.0,96.0))').replace(/half4 main\(float2 frag\)/,'vec4 render(vec2 frag)').replace(/\bfloat2\b/g,'vec2').replace(/\bfloat3\b/g,'vec3').replace(/\bfloat4\b/g,'vec4').replace(/\bhalf3\b/g,'vec3').replace(/\bhalf4\b/g,'vec4')+'\nvoid main(){gl_FragColor=render(vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y));}';}
