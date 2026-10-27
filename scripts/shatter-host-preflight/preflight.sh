#!/usr/bin/env bash
# Offline proposal only. Run from repository root BEFORE emulator startup.
set -euo pipefail
for tool in bash python3 timeout grep tr seq sleep mkdir cat tee sha256sum adb sed realpath java; do
 command -v "$tool" >/dev/null || { echo "BLOCKER missing host tool: $tool"; exit 1; }
done
bash -n scripts/android-system-ready.sh scripts/android-shatter-perfetto.sh
python3 -c "import ast,pathlib; [ast.parse(p.read_text()) for p in [pathlib.Path('scripts/shatter-trace-match.py'), *pathlib.Path('scripts/shatter-host-preflight').glob('*.py')]]"
python3 - <<'PY'
import sys,json,re,xml.etree.ElementTree,pathlib,collections,hashlib,zipfile,subprocess
from PIL import Image,ImageChops,ImageStat
print('python',sys.version.split()[0]);print('Pillow',Image.__version__)
paths=[pathlib.Path('scripts/shatter-trace-templates')/n for n in ['intact.png','clear.png','reset.png']]
for p in paths:
 with Image.open(p) as im:im.verify()
apks=list(pathlib.Path('apk').glob('*.apk'));assert len(apks)==1,'BLOCKER expected exactly one APK'
p=apks[0];assert hashlib.sha256(p.read_bytes()).hexdigest()=='f83e3a72be328a79be186cd7ce6e6ca79d6f9ea3bf46877ec1988471ff83ea5b','BLOCKER APK mismatch'
with zipfile.ZipFile(p) as z:
 assert 'lib/x86_64/librnskia.so' in z.namelist(),'BLOCKER wrong native ABI'
PY
python3 scripts/shatter-trace-match.py target scripts/shatter-trace-templates/intact.png
python3 scripts/shatter-trace-match.py intact scripts/shatter-trace-templates/intact.png
python3 scripts/shatter-trace-match.py clear scripts/shatter-trace-templates/clear.png scripts/shatter-trace-templates/intact.png
# Explicit negative fixture must fail.
if python3 scripts/shatter-trace-match.py reset scripts/shatter-trace-templates/clear.png scripts/shatter-trace-templates/intact.png; then
 echo 'BLOCKER reset gate accepts cleared state'; exit 1
fi
[ "$(realpath "$(command -v adb)")" = "$(realpath "${ANDROID_HOME:?}/platform-tools/adb")" ]
adb version
[ -r /dev/kvm ] && [ -w /dev/kvm ] || { echo 'BLOCKER KVM access'; exit 1; }
python3 - <<'PYCHECK'
import tempfile,subprocess,pathlib
from PIL import Image
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d);im=Image.open('scripts/shatter-trace-templates/intact.png')
 im.resize((540,1200)).save(p/'scale.png')
 im.paste((255,255,255),(60,1690,320,1810));im.save(p/'button.png')
 for f in ['scale.png','button.png']:
  r=subprocess.run(['python3','scripts/shatter-trace-match.py','target',str(p/f)])
  assert r.returncode!=0,'BLOCKER negative fixture accepted'
PYCHECK
