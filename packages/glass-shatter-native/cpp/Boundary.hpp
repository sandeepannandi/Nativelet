#pragma once
#include "full.hpp"
#include <unordered_map>
#include <memory>
#include <atomic>
#include <cstdint>
#include <limits>
namespace nativelet {
constexpr size_t MAX_BODIES=1024, MAX_VERTICES=32, MAX_CONTACTS=131072;
inline void require(bool ok,const char* message){if(!ok)throw std::invalid_argument(message);}
inline uint64_t checkedHandle(double x){require(std::isfinite(x)&&x>=1&&x<4503599627370496.&&std::floor(x)==x,"invalid handle");return static_cast<uint64_t>(x);}
inline void finite(double x){require(std::isfinite(x)&&std::abs(x)<=1e9,"nonfinite or out-of-range number");}
inline void validate(const full::World&w){
 require(w.bodies.size()>0&&w.bodies.size()<=MAX_BODIES,"body capacity");finite(w.width);finite(w.height);finite(w.gravity);finite(w.time);finite(w.maxPen);require(w.width>0&&w.height>0,"world size");
 for(const auto&b:w.bodies){
 finite(b.x); finite(b.y); finite(b.a); finite(b.vx); finite(b.vy); finite(b.w); finite(b.invM); finite(b.invI); finite(b.si); finite(b.minX); finite(b.minY); finite(b.maxX); finite(b.maxY); finite(b.homeX); finite(b.homeY); finite(b.radius); finite(b.sleep); finite(b.releaseAt); finite(b.kx); finite(b.ky); finite(b.kw);
 const size_t n=b.hull.size();require(n>=3&&n<=MAX_VERTICES,"hull capacity");require(b.local.size()>=3&&b.local.size()<=MAX_VERTICES,"local capacity");
 require(b.wx.size()==n&&b.wy.size()==n&&b.lnx.size()==n&&b.lny.size()==n&&b.enx.size()==n&&b.eny.size()==n,"hull buffer lengths");require(b.si>=0&&b.si<n&&std::floor(b.si)==b.si,"face index");require(b.radius>0&&b.invM>=0&&b.invI>=0,"mass/radius");
 for(const auto*v:{&b.wx,&b.wy,&b.lnx,&b.lny,&b.enx,&b.eny})for(double x:*v)finite(x);
 for(const auto*poly:{&b.local,&b.hull}){double area=0;for(size_t i=0;i<poly->size();i++){auto a=(*poly)[i],c=(*poly)[(i+1)%poly->size()],d=(*poly)[(i+2)%poly->size()];finite(a.x);finite(a.y);require(a.x!=c.x||a.y!=c.y,"zero edge");const double cross=(c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x);require(cross>=0,"nonconvex or wrong winding");for(const auto&p:*poly)require((c.x-a.x)*(p.y-a.y)-(c.y-a.y)*(p.x-a.x)>=0,"nonconvex polygon");area+=a.x*c.y-c.x*a.y;}require(area>0,"degenerate polygon");}
 }
}
// Owns only C++ state. Failures poison a world before it can be used again.
// No per-frame full-world clone: partial step is discarded on callback failure.
class Store {
 struct Entry {std::unique_ptr<full::World>w;bool busy=false,failed=false;};
 std::unordered_map<uint64_t,Entry> entries;inline static std::atomic<uint64_t> nextEpoch{1};
 const uint64_t epoch=nextEpoch.fetch_add(1);uint64_t next=1;bool alive=true,stepping=false,violated=false;
 void idle(){if(stepping){violated=true;throw std::invalid_argument("store busy");}}
 public:
 uint64_t create(full::World w){idle();require(alive,"runtime disposed");validate(w);require(entries.size()<8,"world capacity");auto ptr=std::make_unique<full::World>(std::move(w));ptr->order.clear();for(auto&b:ptr->bodies)ptr->order.push_back(&b);require(epoch<67108864ULL&&next<67108864ULL,"handle exhausted");auto id=epoch*67108864ULL+next++;entries.emplace(id,Entry{std::move(ptr)});return id;}
 full::World& get(uint64_t id){idle();require(alive,"runtime disposed");auto it=entries.find(id);require(it!=entries.end(),"stale world");require(!it->second.busy&&!it->second.failed,"busy or failed world");return *it->second.w;}
 void advance(uint64_t id,double dt,const full::Trig&cb){idle();finite(dt);require(dt>=0&&dt<=.05,"dt range");get(id);auto&e=entries.at(id);e.busy=true;stepping=true;violated=false;try{full::step(*e.w,dt,[&](const auto&a,auto&cs){cb(a,cs);require(!violated,"reentrant callback");require(cs.size()==a.size()*2,"trig length");for(double x:cs){finite(x);require(std::abs(x)<=1,"trig range");}});e.busy=false;stepping=false;}catch(...){e.busy=false;stepping=false;e.failed=true;throw;}}
 template<class F>void render(uint64_t id,F fn){get(id);auto&e=entries.at(id);e.busy=true;stepping=true;violated=false;try{fn(*e.w);require(!violated,"reentrant render");e.busy=false;stepping=false;}catch(...){e.busy=false;stepping=false;e.failed=true;throw;}}
 void dispose(uint64_t id){require(alive,"runtime disposed");idle();auto it=entries.find(id);if(it==entries.end())return;require(!it->second.busy,"world busy");entries.erase(it);}
 void invalidate(){for(auto&[id,e]:entries)require(!e.busy,"world busy");entries.clear();alive=false;}
};
}
