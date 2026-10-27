#pragma once
#include "kernel.hpp"
#include <vector>
#include <functional>
#include <algorithm>
#include <array>
namespace full {
struct Vec {double x,y;};
struct Body {
double x=0;double y=0;double a=0;double vx=0;double vy=0;double w=0;double invM=0;double invI=0;double si=0;double minX=0;double minY=0;double maxX=0;double maxY=0;double homeX=0;double homeY=0;double radius=0;double sleep=0;double releaseAt=0;double kx=0;double ky=0;double kw=0;std::vector<double> wx;std::vector<double> wy;std::vector<double> lnx;std::vector<double> lny;std::vector<double> enx;std::vector<double> eny;std::vector<Vec> local,hull; bool asleep=false,held=false,gone=false;
};
struct World {std::vector<Body> bodies;std::vector<Body*> order;double time=0,width=0,height=0,gravity=0,maxPen=0;size_t contacts=0;};
struct Contact {Body *a,*b; double nx,ny,px,py,pen,rax,ray,rbx,rby,jn,jt,mn,mt,bias,am,ai,bm,bi,rnA,rnB,rtA,rtB;};
constexpr double FRICTION=.5,RESTITUTION=.25,SLOP=.3,BAUMGARTE=.2,MAX_PUSH=140,FIXED=1.0/180,SLEEP_V=6,SLEEP_W=.25,SLEEP_T=.5;
using Trig=std::function<void(const std::vector<double>&,std::vector<double>&)>;
void hull(Body& b,double c,double sn) {
 double minX=INFINITY,minY=INFINITY,maxX=-INFINITY,maxY=-INFINITY;
 for(size_t i=0;i<b.hull.size();i++){const auto p=b.hull[i];b.wx[i]=b.x+p.x*c-p.y*sn;b.wy[i]=b.y+p.x*sn+p.y*c;const double x=b.wx[i],y=b.wy[i];if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;b.enx[i]=b.lnx[i]*c-b.lny[i]*sn;b.eny[i]=b.lnx[i]*sn+b.lny[i]*c;}b.minX=minX;b.minY=minY;b.maxX=maxX;b.maxY=maxY;
}
double maxSeparation(Body& A, Body& B) {

  double best = -INFINITY;
  const auto& ax = A.wx, &ay = A.wy, &bx = B.wx, &by = B.wy;
  const auto& enx = A.enx, &eny = A.eny;
  size_t n = ax.size();
  size_t m = bx.size();
  for (size_t i = 0; i < n; i++) {
    const double nx = enx[i];
    const double ny = eny[i];
    const double ox = ax[i];
    const double oy = ay[i];
    double min = INFINITY;
    for (size_t k = 0; k < m; k++) {
      const double d = (bx[k] - ox) * nx + (by[k] - oy) * ny;
      if (d < min) min = d;
      // Later vertices can only lower this axis minimum. Once it cannot beat
      // the best earlier face, stop this axis without changing the SAT result.
      if (min <= best) break;
    }
    if (min > best) {
      best = min;
      A.si = i;
      if (best > 0) return best;
    }
  }
  return best;
}


void collide(Body& A, Body& B, std::vector<Contact>& out) {

  const double sepA = maxSeparation(A, B);
  if (sepA > 0) return;
  const double sepB = maxSeparation(B, A);
  if (sepB > 0) return;
  // Reference body owns the face with the shallowest penetration.
  bool flip = false;
  Body* R = &A;
  Body* I = &B;
  size_t ri = A.si;
  if (sepB > sepA + 1e-4) {
    flip = true;
    R = &B;
    I = &A;
    ri = B.si;
  }
  size_t rn = R->wx.size();
  size_t rj = ri + 1 == rn ? 0 : ri + 1;
  const double r1x = R->wx[ri], r1y = R->wy[ri];
  const double r2x = R->wx[rj], r2y = R->wy[rj];
  const double nx = R->enx[ri], ny = R->eny[ri]; // outward normal of the reference face
  const double tx = -ny, ty = nx;
  // Incident edge: the edge of I most anti-parallel to the reference normal.
  size_t inn = I->wx.size();
  size_t ii = 0;
  double minDot = INFINITY;
  for (size_t i = 0; i < inn; i++) {
    const double d = I->enx[i] * nx + I->eny[i] * ny;
    if (d < minDot) { minDot = d; ii = i; }
  }
  size_t ij = ii + 1 == inn ? 0 : ii + 1;
  double ax = I->wx[ii], ay = I->wy[ii];
  double bx = I->wx[ij], by = I->wy[ij];
  // Clip the incident edge to the two side planes of the reference edge.
  for (size_t pass = 0; pass < 2; pass++) {
    const double dx = pass == 0 ? -tx : tx;
    const double dy = pass == 0 ? -ty : ty;
    const double off = pass == 0 ? -(r1x * tx + r1y * ty) : r2x * tx + r2y * ty;
    const double da = ax * dx + ay * dy - off;
    const double db = bx * dx + by * dy - off;
    double q1x = 0, q1y = 0, q2x = 0, q2y = 0;
    double cnt = 0;
    if (da <= 0) { q1x = ax; q1y = ay; cnt = 1; }
    if (db <= 0) {
      if (cnt == 0) { q1x = bx; q1y = by; } else { q2x = bx; q2y = by; }
      cnt++;
    }
    if (da * db < 0) {
      const double t = da / (da - db);
      q2x = ax + (bx - ax) * t;
      q2y = ay + (by - ay) * t;
      cnt = 2;
    }
    if (cnt < 2) return;
    ax = q1x; ay = q1y; bx = q2x; by = q2y;
  }
  const double faceOff = r1x * nx + r1y * ny;
  // Contact normal points from A toward B.
  const double cnx = flip ? -nx : nx;
  const double cny = flip ? -ny : ny;
  for (size_t k = 0; k < 2; k++) {
    const double px = k == 0 ? ax : bx;
    const double py = k == 0 ? ay : by;
    const double sep = px * nx + py * ny - faceOff;
    if (sep > 0) continue;
    if(out.size()>=131072)throw std::length_error("contact capacity");
    out.push_back(Contact{ &A,&B,cnx,cny,px,py,-sep,px-A.x,py-A.y,px-B.x,py-B.y,0,0,0,0,0,0,0,0,0,0,0,0,0 });
  }
}

void prep(Contact& ct, double dt) {

  Body* a = ct.a; Body* b = ct.b;
  const double nx = ct.nx, ny = ct.ny;
  const double tx = -ny, ty = nx;
  const double rnA = ct.rax * ny - ct.ray * nx;
  const double rtA = ct.rax * ty - ct.ray * tx;
  const double rnB = ct.rbx * ny - ct.rby * nx;
  const double rtB = ct.rbx * ty - ct.rby * tx;
  ct.rnA = rnA; ct.rnB = rnB; ct.rtA = rtA; ct.rtB = rtB;
  const double k = a->invM + a->invI * rnA * rnA + b->invM + b->invI * rnB * rnB;
  const double kt = a->invM + a->invI * rtA * rtA + b->invM + b->invI * rtB * rtB;
  ct.mn = k > 0 ? 1 / k : 0;
  ct.mt = kt > 0 ? 1 / kt : 0;
  const double rx = (b->vx - b->w * ct.rby) - (a->vx - a->w * ct.ray);
  const double ry = (b->vy + b->w * ct.rbx) - (a->vy + a->w * ct.rax);
  const double vn = rx * nx + ry * ny; // negative = closing
  const double bounce = vn < -120 ? -RESTITUTION * vn : 0;
  const double push = shatter::jsmin(MAX_PUSH, (BAUMGARTE * shatter::jsmax(ct.pen - SLOP, 0)) / dt);
  ct.bias = shatter::jsmax(bounce, push);
}



void stepFixed(World& w,double dt,const Trig& trig){
 auto& bodies=w.bodies;w.time+=dt;
 for(auto& b:bodies){if(b.gone)continue;if(b.held&&w.time>=b.releaseAt){b.held=false;b.vx=b.kx;b.vy=b.ky;b.w=b.kw;}if(b.held||b.asleep)continue;b.vy+=w.gravity*dt;b.vx*=1-.05*dt;b.vy*=1-.05*dt;b.w*=1-.35*dt;}
 std::vector<Contact> contacts;auto& order=w.order;
 for(size_t i=1;i<order.size();i++){auto v=order[i];const double key=v->x-v->radius;int j=i-1;while(j>=0&&order[j]->x-order[j]->radius>key){order[j+1]=order[j];j--;}order[j+1]=v;}
 for(size_t i=0;i<order.size();i++){auto a=order[i];if(a->gone)continue;const bool aMoving=!(a->asleep||a->held);const double aRight=a->x+a->radius;
 for(size_t j=i+1;j<order.size();j++){auto b=order[j];if(b->x-b->radius>aRight)break;if(b->gone)continue;if(a->maxX<b->minX||b->maxX<a->minX||a->maxY<b->minY||b->maxY<a->minY)continue;if(!aMoving&&(b->asleep||b->held))continue;const double dx=b->x-a->x,dy=b->y-a->y,rr=a->radius+b->radius;if(dx*dx+dy*dy>rr*rr)continue;collide(*a,*b,contacts);}}
 w.contacts=contacts.size();
 for(auto& ct:contacts){if(!ct.a->held&&!ct.b->held&&(ct.a->asleep!=ct.b->asleep)){auto m=ct.a->asleep?ct.b:ct.a;if(m->vx*m->vx+m->vy*m->vy>40*40){ct.a->asleep=false;ct.b->asleep=false;ct.a->sleep=ct.b->sleep=0;}}prep(ct,dt);if(ct.pen>w.maxPen)w.maxPen=ct.pen;}
 std::vector<Body*> anchored;std::vector<double> am,ai;
 for(auto& b:bodies)if(!b.gone&&(b.asleep||b.held)){anchored.push_back(&b);am.push_back(b.invM);ai.push_back(b.invI);b.invM=b.invI=0;}
 for(auto& ct:contacts){ct.am=ct.a->invM;ct.ai=ct.a->invI;ct.bm=ct.b->invM;ct.bi=ct.b->invI;}
  // Inline the scalar solve to avoid a cross-worklet invocation for every contact.
  for (size_t it = 0; it < 14; it++) for (size_t ci = 0; ci < contacts.size(); ci++) {
    auto& ct = contacts[ci];
  auto a = ct.a;auto b=ct.b;
  const double nx = ct.nx, ny = ct.ny, tx = -ny, ty = nx;
  const double rax = ct.rax, ray = ct.ray, rbx = ct.rbx, rby = ct.rby;
  const double am = ct.am, ai = ct.ai, bm = ct.bm, bi = ct.bi;
  double avx = a->vx, avy = a->vy, aw = a->w;
  double bvx = b->vx, bvy = b->vy, bw = b->w;
  double rx = (bvx - bw * rby) - (avx - aw * ray);
  double ry = (bvy + bw * rbx) - (avy + aw * rax);
  const double old = ct.jn;
  const double next = shatter::jsmax(old + ct.mn * (ct.bias - (rx * nx + ry * ny)), 0);
  ct.jn = next;
  const double dj = next - old;
  double jx = nx * dj, jy = ny * dj;
  avx -= am * jx; avy -= am * jy; aw -= ai * ct.rnA * dj;
  bvx += bm * jx; bvy += bm * jy; bw += bi * ct.rnB * dj;
  rx = (bvx - bw * rby) - (avx - aw * ray);
  ry = (bvy + bw * rbx) - (avy + aw * rax);
  const double maxF = FRICTION * next;
  const double oldT = ct.jt;
  const double nextT = shatter::jsmax(-maxF, shatter::jsmin(maxF, oldT - ct.mt * (rx * tx + ry * ty)));
  ct.jt = nextT;
  const double djt = nextT - oldT;
  jx = tx * djt; jy = ty * djt;
  a->vx = avx - am * jx; a->vy = avy - am * jy; a->w = aw - ai * ct.rtA * djt;
  b->vx = bvx + bm * jx; b->vy = bvy + bm * jy; b->w = bw + bi * ct.rtB * djt;

  }

 for(size_t q=0;q<anchored.size();q++){anchored[q]->invM=am[q];anchored[q]->invI=ai[q];}
 std::vector<size_t> moved;std::vector<double> angles;
 for(size_t bi=0;bi<bodies.size();bi++){auto& b=bodies[bi];if(b.gone||b.held||b.asleep)continue;b.x+=b.vx*dt;b.y+=b.vy*dt;b.a+=b.w*dt;const double sp2=b.vx*b.vx+b.vy*b.vy;if(sp2<SLEEP_V*SLEEP_V&&std::abs(b.w)<SLEEP_W){b.sleep+=dt;if(b.sleep>SLEEP_T){b.asleep=true;b.vx=b.vy=b.w=0;}}else b.sleep=0;moved.push_back(bi);angles.push_back(b.a);}
 std::vector<double> cs;trig(angles,cs);if(cs.size()!=angles.size()*2)throw std::invalid_argument("trig result shape");
 for(size_t k=0;k<moved.size();k++){auto& b=bodies[moved[k]];hull(b,cs[k*2],cs[k*2+1]);if(b.y-b.radius>w.height+60||b.x+b.radius<-w.width*.6||b.x-b.radius>w.width*1.6)b.gone=true;}
}
void step(World& w,double dtFrame,const Trig& trig){double remaining=shatter::jsmin(dtFrame,1.0/20);while(remaining>1e-6){const double dt=shatter::jsmin(FIXED,remaining);remaining-=dt;stepFixed(w,dt,trig);}}
}
