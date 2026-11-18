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
 float h=(dot(encoded,float2(65280.0,255.0))/65535.0-.5)*.24;
 // Low-amplitude travelling capillary detail. The heightfield still owns large
 // interactive waves; these optical ripples keep an idle surface from looking solid.
 float edge=smoothstep(0.0,.12,min(1.25-abs(p.x),.95-abs(p.y)));
 h+=edge*(.00125*sin(dot(p,float2(19.0,26.0))-clock*2.7)
          +.0009*sin(dot(p,float2(-31.0,17.0))+clock*3.1)
          +.0006*sin(dot(p,float2(43.0,9.0))-clock*3.8));
 return h;
}
float3 normalAt(float2 p){float e=0.008;return normalize(float3(heightAt(p-float2(e,0.0))-heightAt(p+float2(e,0.0)),2.0*e,heightAt(p-float2(0.0,e))-heightAt(p+float2(0.0,e))));}
float3 sky(float3 d){
 float3 c=mix(float3(.84,.90,.91),float3(.22,.45,.66),smoothstep(-.03,.8,d.y));
 // A soft bright window and dark foliage give moving normals something to reflect.
 float2 cloudUV=float2((d.x+.40)*3.0,(d.z+.4)*2.3);
 float cloud=exp(-dot(cloudUV,cloudUV));
 c=mix(c,float3(.97,.97,.92),cloud*.8);
 float foliage=(1.0-smoothstep(.02,.22,d.y))*(.5+.5*sin(d.x*18.0+d.z*14.0));
 c=mix(c,float3(.12,.22,.19),foliage*.55);
 c+=float3(1.0,.91,.71)*pow(max(0.0,dot(d,normalize(float3(-.45,1.0,.4)))),420.0)*3.0;
 return c;
}
float sphereHit(float3 o,float3 d){float3 oc=o-ball;float b=dot(oc,d);float c=dot(oc,oc)-0.255*0.255;float disc=b*b-c;if(disc<0.0)return 1000.0;float t=-b-sqrt(disc);return t>0.001?t:1000.0;}
float2 lightLanding(float2 p,float depth){
 float3 d=refract(normalize(float3(.45,-1.0,-.4)),normalAt(p),1.0/1.333);
 return p+d.xz*(depth/max(.2,-d.y));
}
float focusLight(float3 hit){
 // Invert the sun-ray landing map, then estimate its area Jacobian. Folds in
 // this map concentrate sunlight into narrow caustic ridges, not painted blobs.
 float depth=max(.03,-hit.y);
 float2 p=hit.xz-float2(.28,-.25)*depth;
 p+=clamp(hit.xz-lightLanding(p,depth),float2(-.08),float2(.08));
 float e=.009;
 float2 a=(lightLanding(p+float2(e,0.0),depth)-lightLanding(p-float2(e,0.0),depth))/(2.0*e);
 float2 b=(lightLanding(p+float2(0.0,e),depth)-lightLanding(p-float2(0.0,e),depth))/(2.0*e);
 float det=abs(a.x*b.y-a.y*b.x);
 return clamp(.65/max(.12,det),.30,3.2);
}
float3 tile(float3 p,float3 n){
 float2 uv=abs(n.y)>0.5?p.xz:(abs(n.x)>0.5?p.zy:p.xy);
 float2 g=abs(fract(uv*8.0)-0.5);
 float line=smoothstep(0.452,0.482,max(g.x,g.y));
 float hash=fract(sin(dot(floor(uv*8.0),float2(127.1,311.7)))*43758.5453);
 float3 c=mix(float3(.38,.69,.70),float3(.27,.58,.61),hash*.45);
 // Glazed ceramic faces, with recessed pale grout and a fine bevel.
 float bevel=smoothstep(.40,.455,max(g.x,g.y));
 c*=1.0-bevel*.12;
 c=mix(c,float3(.30,.44,.43),line*.85);
 float light=0.45+0.55*max(0.0,dot(n,normalize(float3(-0.45,1.0,0.4))));
 float caustic=focusLight(p)*(0.38+max(0.0,n.y)*.62);
 float3 sun=normalize(float3(-.45,1.0,.4));
 float3 toBall=ball-p;float along=max(0.0,dot(toBall,sun));
 float radial=length(toBall-sun*along);
 float shadow=mix(.25,1.0,smoothstep(.18,.30+along*.035,radial));
 float contact=1.0-.18*exp(-dot(p.xz-ball.xz,p.xz-ball.xz)*20.0);
 float ao=clamp(min(1.25-abs(p.x),.95-abs(p.z))*4.0,.48,1.0);
 return c*(light*.78+caustic*.36)*shadow*ao*contact;
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
 c=float3(.77,.89,.84)*(.25+.65*diffuse+focusLight(p)*.24);
 c+=float3(.8,.9,.9)*pow(max(0.0,dot(reflect(-normalize(float3(-.45,1.0,.4)),sn),-d)),65.0)*.6;
 }else{c=tile(o+d*t,n);}
 float3 transmission=exp(-float3(.36,.075,.035)*max(t,0.0));
 return c*transmission+float3(.035,.30,.37)*(1.0-transmission);
}
half4 main(float2 frag){
 float2 uv=(frag/resolution*2.0-1.0);uv.y=-uv.y;uv.x*=resolution.x/resolution.y;
 float3 eye=float3(2.7,2.5,3.6),f=normalize(float3(0.0,-.22,0.0)-eye);
 float3 r=normalize(cross(f,float3(0.0,1.0,0.0))),u=cross(r,f);
 float3 ray=normalize(f*2.8+r*uv.x+u*uv.y);
 float t=-eye.y/ray.y;float3 p=eye+ray*t;
 float3 c=float3(.91,.925,.90);
 if(abs(p.x)<1.25&&abs(p.z)<.95){t=(heightAt(p.xz)-eye.y)/ray.y;p=eye+ray*t;t+=(heightAt(p.xz)-p.y)/ray.y;p=eye+ray*t;}
 if(abs(p.x)<1.25&&abs(p.z)<.95){
  // Refine water intersection without high-step raymarching.

  float3 n=normalAt(p.xz);
  float3 rd=refract(ray,n,1.0/1.333);
  float fresnel=.02037+.97963*pow(1.0-max(0.0,dot(-ray,n)),5.0);
  c=mix(underWater(p+rd*.002,rd),sky(reflect(ray,n)),fresnel);
  // Wet meniscus darkens the perimeter and catches a thin reflected rim.
  float edge=min(1.25-abs(p.x),.95-abs(p.z));
  c*=mix(.62,1.0,smoothstep(0.0,.025,edge));
  c+=float3(.18,.24,.23)*exp(-edge*260.0);
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
