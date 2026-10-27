#include "fixture.hpp"
#include <iostream>
#include <cassert>
using nativelet::Store;
template<class F>void rejects(F f){bool fail=false;try{f();}catch(const std::exception&){fail=true;}assert(fail);}
int main(){assert(nativelet::checkedHandle(1000000001.)==1000000001ULL);assert(nativelet::checkedHandle(4503599627370495.)==4503599627370495ULL);for(double x:{double(NAN),double(INFINITY),-1.,0.,1.5,4503599627370496.})rejects([&]{nativelet::checkedHandle(x);});auto valid=fixture();nativelet::validate(valid);
for(int type=0;type<9;type++){auto w=fixture();auto&b=w.bodies[0];switch(type){case 0:w.width=INFINITY;break;case 1:b.wx.pop_back();break;case 2:b.hull.resize(2);break;case 3:b.si=-1;break;case 4:b.invM=-1;break;case 5:b.local[0].x=NAN;break;case 6:std::reverse(b.hull.begin(),b.hull.end());break;case 7:b.hull[1]=b.hull[0];break;case 8:w.bodies.resize(1025);break;}rejects([&]{nativelet::validate(w);});}
Store s;auto id=s.create(fixture());for(double dt:{double(NAN),double(INFINITY),-1.,.051})rejects([&]{s.advance(id,dt,{});});
auto good=[](const std::vector<double>&a,std::vector<double>&cs){cs.resize(a.size()*2);for(size_t i=0;i<a.size();i++){cs[2*i]=std::cos(a[i]);cs[2*i+1]=std::sin(a[i]);}};
for(int test=0;test<7;test++){auto id=s.create(fixture());rejects([&]{s.advance(id,1./60,[&](const auto&a,auto&cs){if(test==0)throw std::runtime_error("callback throws");if(test==1)return;good(a,cs);if(test==2)cs[0]=NAN;if(test==3)cs[0]=2.;if(test==4)s.dispose(id);if(test==5)s.advance(id,1./60,good);if(test==6)s.create(fixture());});});rejects([&]{s.get(id);});s.dispose(id);s.dispose(id);rejects([&]{s.advance(id,1./60,good);});}
auto renderId=s.create(fixture());rejects([&]{s.render(renderId,[&](auto&){s.dispose(renderId);});});rejects([&]{s.get(renderId);});s.dispose(renderId);
auto swallowed=s.create(fixture());rejects([&]{s.render(swallowed,[&](auto&){try{s.dispose(swallowed);}catch(...){};});});rejects([&]{s.get(swallowed);});s.dispose(swallowed);
s.dispose(id);rejects([&]{s.get(id);});auto reset=s.create(fixture());s.advance(reset,1./60,good);s.dispose(reset);auto fresh=s.create(fixture());s.advance(fresh,1./60,good);s.invalidate();rejects([&]{s.get(fresh);});rejects([&]{s.create(fixture());});Store reloaded;auto anew=reloaded.create(fixture());assert(anew!=fresh);rejects([&]{reloaded.get(fresh);});reloaded.advance(anew,1./60,good);std::cout<<"PASS bounded malformed inputs, callback throw/shape/nonfinite/range/reentrancy poison, stale/double-dispose/reset/reload\n";}
