#!/usr/bin/env bash
set -euo pipefail
OUT=water-out; rm -rf "$OUT"; mkdir -p "$OUT"
trap 'adb logcat -d > "$OUT/exit-logcat.txt" 2>&1 || true' EXIT
PKG=com.anonymous.nativeletshowcase
adb install -r "$1"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///water-tank' "$PKG"
sleep 15
adb shell rm -f /sdcard/water.xml
adb shell uiautomator dump /sdcard/water.xml
adb pull /sdcard/water.xml "$OUT/ui.xml"
adb exec-out screencap -p > "$OUT/initial.png"
python3 -m pip install -q pillow numpy
python3 - <<'PY'
import xml.etree.ElementTree as E,re,json
nodes=list(E.parse('water-out/ui.xml').iter('node'))
n=next((n for n in nodes if n.get('content-desc','').startswith('Interactive water tank')),None)
assert n is not None,'Water tank view missing, renderer may have failed'
a=list(map(int,re.findall(r'\d+',n.get('bounds'))));assert len(a)==4
json.dump(a,open('water-out/geometry.json','w'))
PY
read -r X Y TX TY < <(python3 - <<'PY'
import json
x,y,r,b=json.load(open('water-out/geometry.json'));w=r-x;h=b-y
print(int(x+w*.54),int(y+h*.53),int(x+w*.72),int(y+h*.58))
PY
)
adb shell input swipe "$X" "$Y" "$TX" "$TY" 1400
sleep 1
adb exec-out screencap -p > "$OUT/moved.png"
sleep 1
adb exec-out screencap -p > "$OUT/waves-later.png"
adb shell input swipe "$TX" "$TY" "$X" "$Y" 1400
sleep 1
adb exec-out screencap -p > "$OUT/returned.png"
adb logcat -d > "$OUT/logcat.txt"
python3 - <<'PY'
from PIL import Image
import numpy as np,json,re
x,y,r,b=json.load(open('water-out/geometry.json'));w=r-x;h=b-y
def load(n):return np.array(Image.open('water-out/'+n+'.png').convert('RGB'))[y:b,x:r].astype(float)
a,c,d=map(load,['initial','moved','returned'])
for n,im in [('initial',a),('moved',c),('returned',d)]:
 turquoise=(im[:,:,1]>im[:,:,0]*1.12)&(im[:,:,2]>im[:,:,0]*1.10)&(im[:,:,1]>60)&(im[:,:,0]<195)
 assert turquoise.mean()>.025,n+' did not render tiled water'
def sphere(im):
 # Opaque pale ceramic sphere inside the pool, excluding pale background/rim.
 m=(im[:,:,0]>125)&(im[:,:,1]>145)&(im[:,:,2]>140)&(im[:,:,1]>im[:,:,0]*1.03)&(im[:,:,0]>im[:,:,1]*.76)
 m[:int(h*.35)]=False;m[int(h*.68):]=False;m[:,:int(w*.2)]=False;m[:,int(w*.85):]=False
 # Brightest compact connected component, not a single caustic.
 from collections import deque
 seen=np.zeros(m.shape,bool);parts=[]
 for yy,xx in zip(*np.where(m)):
  if seen[yy,xx]:continue
  q=deque([(yy,xx)]);seen[yy,xx]=True;pts=[]
  while q:
   j,i=q.popleft();pts.append((j,i))
   for jj,ii in [(j-1,i),(j+1,i),(j,i-1),(j,i+1)]:
    if 0<=jj<h and 0<=ii<w and m[jj,ii] and not seen[jj,ii]:seen[jj,ii]=True;q.append((jj,ii))
  parts.append(pts)
 assert parts,'Sphere not visible'
 p=max(parts,key=len);assert len(p)>w*h*.002,'Sphere too small/missing'
 return np.mean(p,axis=0)
pa,pc,pd=map(sphere,[a,c,d]);travel=np.linalg.norm(pc-pa);print('Sphere centroids',pa,pc,pd,'travel',travel)
assert travel>w*.035,'Native gesture did not move rendered sphere'
assert np.linalg.norm(pd-pa)<np.linalg.norm(pc-pa)*.65,'Return gesture did not move sphere toward its starting position'
assert np.abs(a-c).mean()>.8,'No rendered scene change'
e=load('waves-later');region=np.abs(c-e)[int(h*.35):int(h*.70),int(w*.15):int(w*.86)];print('Moving water difference',region.mean());assert region.mean()>.12,'Native waves are frozen after release'
import subprocess
subprocess.run(['adb','logcat','-d','-b','all'],stdout=open('water-out/logcat.txt','w'),check=True)
log=open('water-out/logcat.txt').read();assert log.strip(),'Missing native logs'
assert not re.search(r'Process: com\.anonymous\.nativeletshowcase[^\n]*|ANR in com\.anonymous\.nativeletshowcase|Cmdline: com\.anonymous\.nativeletshowcase|>>> com\.anonymous\.nativeletshowcase <<<|Shader compilation failed|Water renderer unavailable',log),'Native crash or shader failure'
open('water-out/summary.txt','w').write('PASS native water render, sphere drag and return, continuing wave animation, no detected crash on tested path\n')
PY
