#include "NativeletShatter.h"
#include "Boundary.hpp"
#include <worklets/Compat/StableApi.h>
#include <cstring>
namespace facebook::react {
namespace {
using namespace facebook;
using nativelet::require;
jsi::Object object(jsi::Runtime&rt,const jsi::Value&v){require(v.isObject(),"expected object");return v.asObject(rt);}
double num(const jsi::Value&v){require(v.isNumber(),"expected number");auto x=v.asNumber();nativelet::finite(x);return x;}
double field(jsi::Runtime&rt,const jsi::Object&o,const char*k){return num(o.getProperty(rt,k));}
bool flag(jsi::Runtime&rt,const jsi::Object&o,const char*k){auto v=o.getProperty(rt,k);require(v.isBool(),"expected boolean");return v.getBool();}
jsi::Array array(jsi::Runtime&rt,const jsi::Value&v,size_t max){auto o=object(rt,v);require(o.isArray(rt),"expected array");auto a=o.getArray(rt);require(a.size(rt)<=max,"array capacity");return a;}
std::vector<double> doubles(jsi::Runtime&rt,const jsi::Object&o,const char*k){auto a=array(rt,o.getProperty(rt,k),nativelet::MAX_VERTICES);std::vector<double> out;for(size_t i=0;i<a.size(rt);i++)out.push_back(num(a.getValueAtIndex(rt,i)));return out;}
std::vector<full::Vec> points(jsi::Runtime&rt,const jsi::Object&o,const char*k){auto a=array(rt,o.getProperty(rt,k),nativelet::MAX_VERTICES);std::vector<full::Vec> out;for(size_t i=0;i<a.size(rt);i++){auto p=object(rt,a.getValueAtIndex(rt,i));out.push_back({field(rt,p,"x"),field(rt,p,"y")});}return out;}
full::World importWorld(jsi::Runtime&rt,const jsi::Object&o){full::World w;
w.width=field(rt,o,"width");
w.height=field(rt,o,"height");
w.gravity=field(rt,o,"gravity");
w.time=field(rt,o,"time");
w.maxPen=field(rt,o,"maxPen");
auto a=array(rt,o.getProperty(rt,"bodies"),nativelet::MAX_BODIES);w.bodies.resize(a.size(rt));for(size_t i=0;i<w.bodies.size();i++){auto o=object(rt,a.getValueAtIndex(rt,i));auto&b=w.bodies[i];
b.x=field(rt,o,"x");
b.y=field(rt,o,"y");
b.a=field(rt,o,"a");
b.vx=field(rt,o,"vx");
b.vy=field(rt,o,"vy");
b.w=field(rt,o,"w");
b.invM=field(rt,o,"invM");
b.invI=field(rt,o,"invI");
b.si=field(rt,o,"si");
b.minX=field(rt,o,"minX");
b.minY=field(rt,o,"minY");
b.maxX=field(rt,o,"maxX");
b.maxY=field(rt,o,"maxY");
b.homeX=field(rt,o,"homeX");
b.homeY=field(rt,o,"homeY");
b.radius=field(rt,o,"radius");
b.sleep=field(rt,o,"sleep");
b.releaseAt=field(rt,o,"releaseAt");
b.kx=field(rt,o,"kx");
b.ky=field(rt,o,"ky");
b.kw=field(rt,o,"kw");
b.wx=doubles(rt,o,"wx");
b.wy=doubles(rt,o,"wy");
b.lnx=doubles(rt,o,"lnx");
b.lny=doubles(rt,o,"lny");
b.enx=doubles(rt,o,"enx");
b.eny=doubles(rt,o,"eny");
b.local=points(rt,o,"local");
b.hull=points(rt,o,"hull");
b.asleep=flag(rt,o,"asleep");
b.held=flag(rt,o,"held");
b.gone=flag(rt,o,"gone");
}nativelet::validate(w);return w;}
uint64_t handle(const jsi::Value&v){require(v.isNumber(),"expected handle");return nativelet::checkedHandle(v.asNumber());}
// Buffer object owns bytes. No borrowed JSI pointer or function escapes this call.
class Bytes final:public jsi::MutableBuffer {std::vector<uint8_t> bytes;public:explicit Bytes(const std::vector<double>&a):bytes(a.size()*sizeof(double)){if(!bytes.empty())std::memcpy(bytes.data(),a.data(),bytes.size());}size_t size()const override{return bytes.size();}uint8_t*data()override{return bytes.data();}};
void installUI(jsi::Runtime&rt,std::weak_ptr<worklets::WorkletRuntime> runtime){
 if(rt.global().getProperty(rt,"__nativeletShatterReady").isBool()&&rt.global().getProperty(rt,"__nativeletShatterReady").getBool())return;
 auto store=std::make_shared<nativelet::Store>();jsi::Object api(rt);
 auto add=[&](const char*name,unsigned argc,auto fn){api.setProperty(rt,name,jsi::Function::createFromHostFunction(rt,jsi::PropNameID::forAscii(rt,name),argc,[store,runtime,fn](jsi::Runtime&r,const jsi::Value&,const jsi::Value*a,size_t n)->jsi::Value{try{require(!runtime.expired(),"UI runtime expired");return fn(r,*store,a,n);}catch(const jsi::JSError&){throw;}catch(const std::exception&e){throw jsi::JSError(r,e.what());}}));};
 add("create",1,[](auto&r,auto&s,const auto*a,size_t n)->jsi::Value{require(n==1,"create arity");return jsi::Value(static_cast<double>(s.create(importWorld(r,object(r,a[0])))));});
 add("advance",3,[](auto&r,auto&s,const auto*a,size_t n)->jsi::Value{require(n==3,"advance arity");const auto id=handle(a[0]);double dt=num(a[1]);auto callback=object(r,a[2]);require(callback.isFunction(r),"expected trig function");auto fn=callback.getFunction(r);
 s.advance(id,dt,[&](const std::vector<double>&angles,std::vector<double>&cs){jsi::ArrayBuffer input(r,std::make_shared<Bytes>(angles));auto result=fn.call(r,std::move(input));auto out=object(r,result);require(out.isArrayBuffer(r),"trig must return ArrayBuffer");auto buffer=out.getArrayBuffer(r);require(!buffer.detached(r)&&buffer.size(r)==angles.size()*2*sizeof(double),"trig buffer size");cs.resize(angles.size()*2);if(!cs.empty())std::memcpy(cs.data(),buffer.data(r),buffer.size(r));});return jsi::Value::undefined();});
 add("render",2,[](auto&r,auto&s,const auto*a,size_t n)->jsi::Value{require(n==2,"render arity");const auto id=handle(a[0]);s.render(id,[&](const full::World&w){struct Render{double x,y,a;bool held,gone;};std::vector<Render> snapshot;for(const auto&b:w.bodies)snapshot.push_back({b.x,b.y,b.a,b.held,b.gone});auto o=object(r,a[1]);auto bs=array(r,o.getProperty(r,"bodies"),nativelet::MAX_BODIES);require(bs.size(r)==snapshot.size(),"render body count");for(size_t i=0;i<snapshot.size();i++){auto o=object(r,bs.getValueAtIndex(r,i));const auto&b=snapshot[i];o.setProperty(r,"x",b.x);o.setProperty(r,"y",b.y);o.setProperty(r,"a",b.a);o.setProperty(r,"held",b.held);o.setProperty(r,"gone",b.gone);}});return jsi::Value::undefined();});
 add("dispose",1,[](auto&,auto&s,const auto*a,size_t n)->jsi::Value{require(n==1,"dispose arity");s.dispose(handle(a[0]));return jsi::Value::undefined();});
#ifdef NATIVELET_SHATTER_DIAGNOSTICS
 add("inspect",2,[](auto&r,auto&s,const auto*a,size_t n)->jsi::Value{require(n==2,"inspect arity");s.render(handle(a[0]),[&](const full::World&w){auto dst=object(r,a[1]);dst.setProperty(r,"time",w.time);dst.setProperty(r,"contacts",double(w.contacts));dst.setProperty(r,"maxPen",w.maxPen);auto bs=array(r,dst.getProperty(r,"bodies"),nativelet::MAX_BODIES);require(bs.size(r)==w.bodies.size(),"inspect length");for(size_t i=0;i<w.bodies.size();i++){auto o=object(r,bs.getValueAtIndex(r,i));auto&b=w.bodies[i];
o.setProperty(r,"x",b.x);o.setProperty(r,"y",b.y);o.setProperty(r,"a",b.a);o.setProperty(r,"vx",b.vx);o.setProperty(r,"vy",b.vy);o.setProperty(r,"w",b.w);o.setProperty(r,"invM",b.invM);o.setProperty(r,"invI",b.invI);o.setProperty(r,"si",b.si);o.setProperty(r,"minX",b.minX);o.setProperty(r,"minY",b.minY);o.setProperty(r,"maxX",b.maxX);o.setProperty(r,"maxY",b.maxY);o.setProperty(r,"homeX",b.homeX);o.setProperty(r,"homeY",b.homeY);o.setProperty(r,"radius",b.radius);o.setProperty(r,"sleep",b.sleep);o.setProperty(r,"releaseAt",b.releaseAt);o.setProperty(r,"kx",b.kx);o.setProperty(r,"ky",b.ky);o.setProperty(r,"kw",b.kw);o.setProperty(r,"asleep",b.asleep);o.setProperty(r,"held",b.held);o.setProperty(r,"gone",b.gone);auto put=[&](const char*k,const std::vector<double>&v){jsi::Array out(r,v.size());for(size_t q=0;q<v.size();q++)out.setValueAtIndex(r,q,v[q]);o.setProperty(r,k,std::move(out));};put("wx",b.wx);put("wy",b.wy);put("lnx",b.lnx);put("lny",b.lny);put("enx",b.enx);put("eny",b.eny);}jsi::Array order(r,w.order.size());for(size_t i=0;i<w.order.size();i++)order.setValueAtIndex(r,i,bs.getValueAtIndex(r,size_t(w.order[i]-w.bodies.data())));dst.setProperty(r,"order",std::move(order));});return jsi::Value::undefined();});
#endif
 rt.global().setProperty(rt,"__nativeletShatter",std::move(api));
 // Acknowledgement is written last, only on the UI runtime after installation.
 rt.global().setProperty(rt,"__nativeletShatterReady",true);
}
}
NativeletShatter::NativeletShatter(std::shared_ptr<CallInvoker> invoker):NativeletShatterCxxSpec(std::move(invoker)){}
bool NativeletShatter::install(jsi::Runtime&rt,jsi::Object holder,jsi::Object schedulerHolder){
 auto runtime=worklets::getWorkletRuntimeFromHolder(rt,holder);
 auto scheduler=worklets::getUISchedulerFromHolder(rt,schedulerHolder);
 std::weak_ptr<worklets::WorkletRuntime> weak=runtime;
 worklets::scheduleOnUI(scheduler,[weak]{if(auto runtime=weak.lock()){auto&ui=worklets::getJSIRuntimeFromWorkletRuntime(runtime);try{installUI(ui,weak);}catch(const std::exception&e){ui.global().setProperty(ui,"__nativeletShatterReady",false);ui.global().setProperty(ui,"__nativeletShatterInstallError",jsi::String::createFromUtf8(ui,e.what()));}}});
 return true; // queued, NOT ready: JS wrapper separately reads UI acknowledgement.
}
}
