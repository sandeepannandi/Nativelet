# Host-only visual gate for the exact retained APK/layout. Never guesses targets.
import sys,json
from collections import deque
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
ROOT=Path(__file__).parent/'shatter-trace-templates'
def mean(a,b):return sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3
def load(p):return Image.open(p).convert('RGB')
mode=sys.argv[1];im=load(sys.argv[2]);ref=load(ROOT/'intact.png');clear=load(ROOT/'clear.png')
if im.size!=ref.size:raise SystemExit('BLOCKER changed screenshot scale')
if mode=='target':
 # Locate exact navy connected components in fresh pixels over whole screenshot.
 w,h=im.size;p=im.load();seen=set();matches=[];tmpl=load(ROOT/'reset.png')
 for y in range(h):
  for x in range(w):
   if (x,y)in seen or max(abs(p[x,y][i]-[31,58,95][i])for i in range(3))>6:continue
   q=deque([(x,y)]);seen.add((x,y));xs=[];ys=[]
   while q:
    a,b=q.popleft();xs.append(a);ys.append(b)
    for c,d in [(a-1,b),(a+1,b),(a,b-1),(a,b+1)]:
     if 0<=c<w and 0<=d<h and (c,d)not in seen and max(abs(p[c,d][i]-[31,58,95][i])for i in range(3))<=6:seen.add((c,d));q.append((c,d))
   if len(xs)<500:continue
   box=(min(xs)-3,min(ys)-3,max(xs)+4,max(ys)+4)
   if (box[2]-box[0],box[3]-box[1])!=tmpl.size:continue
   err=mean(im.crop(box),tmpl)
   if err<3:matches.append((box,err))
 if len(matches)!=1:raise SystemExit('BLOCKER reset template ambiguous/missing '+str(matches))
 box,err=matches[0];cx=(box[0]+box[2])//2;cy=(box[1]+box[3])//2
 # Match same-layout pane relative to observed button, derived from retained pixels.
 dx=cx-187;dy=cy-1746;pane=(94+dx,464+dy,986+dx,1670+dy)
 if dx!=0 or dy!=0:raise SystemExit('BLOCKER changed layout relative to retained template')
 interior=(120,490,960,1640)
 if mean(im.crop(interior),ref.crop(interior))>3:raise SystemExit('BLOCKER pane template does not match')
 print(json.dumps({'reset':[cx,cy],'pane':pane,'hit':[(pane[0]+pane[2])//2,(pane[1]+pane[3])//2],'button_error':err}))
elif mode in ['intact','clear','reset']:
 initial=load(sys.argv[3]) if len(sys.argv)>3 else ref
 boxes=[(94,530,101,1600),(979,530,986,1600),(150,464,930,471)]
 # Outer-rim templates discriminate states; interior alone is identical.
 di=sum(mean(im.crop(b),initial.crop(b))for b in boxes)/3
 dc=sum(mean(im.crop(b),clear.crop(b))for b in boxes)/3
 separation=sum(mean(initial.crop(b),clear.crop(b))for b in boxes)/3
 print(json.dumps({'intact_error':di,'clear_error':dc,'separation':separation}))
 if separation<10:raise SystemExit('BLOCKER no rim discriminant')
 if mode=='clear':
  if not(dc<3 and di>10):raise SystemExit('BLOCKER not clearly cleared')
 elif not(di<3 and dc>10):raise SystemExit('BLOCKER intact rim not restored')
elif mode=='fracture':
 initial=load(sys.argv[3]);box=(94,464,986,1670);a=im.crop(box);b=initial.crop(box)
 d=ImageChops.difference(a,b);pixels=list(d.getdata());share=sum(max(v)>22 for v in pixels)/len(pixels);print(share)
else:raise SystemExit('unknown mode')
