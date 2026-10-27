"""Rebuilt diagnostic identity, NOT byte equality or qualification."""
import sys,json,hashlib,zipfile,pathlib,ipaddress,subprocess,re,urllib.request,io,os
root=pathlib.Path(__file__).parent;p=pathlib.Path(sys.argv[1]);z=zipfile.ZipFile(p)
expected=json.loads((root/'native-apk-entry-hashes.json').read_text());assert len(z.namelist())==1198 and set(z.namelist())==set(expected)|{'resources.arsc'}
for n,h in expected.items():assert hashlib.sha256(z.read(n)).hexdigest()==h,'changed executable/asset: '+n
# Official Android resource parser, pinned archive and executable. No warnings
# accepted, no androguard compatibility warnings or unhandled complex values.
u='https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/9.5.0-rc02-16666295/aapt2-9.5.0-rc02-16666295-linux.jar'
b=urllib.request.urlopen(u,timeout=60).read();assert hashlib.sha256(b).hexdigest()=='fa1014cb1431622d292ef55ba870e75882ea19987bec541698b912f446a2d08f'
b=zipfile.ZipFile(io.BytesIO(b)).read('aapt2');assert hashlib.sha256(b).hexdigest()=='d0c30c343c61bfdc837abd02e195741dba7407bcb61ca34e037bcc1dc26ea06c'
aapt=pathlib.Path(os.environ.get('RUNNER_TEMP','/tmp'))/'nativelet-aapt2-bin';aapt.write_bytes(b);aapt.chmod(0o700)
r=subprocess.run([str(aapt),'dump','resources',str(p)],capture_output=True,text=True,check=True);assert not r.stderr.strip(),r.stderr
s=r.stdout;assert len(re.findall(r'^    resource ',s,re.M))==6217
m=re.search(r'(resource 0x7f10012a string/react_native_dev_server_ip\n      \(\) )"([0-9.]+)"',s);assert m;ipaddress.IPv4Address(m[2]);ip=m[2]
s,n=re.subn(r'(resource 0x7f10012a string/react_native_dev_server_ip\n      \(\) )"[0-9.]+"',r'\1"DEV_SERVER_IP_DIAGNOSTIC_ONLY"',s);assert n==1
assert hashlib.sha256(s.encode()).hexdigest()==(root/'native-apk-resources.sha256').read_text().strip(),'other resource value/config changed'
print(json.dumps({'scope':'rebuilt diagnostic, not retained byte equivalence','apk_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'entries':1198,'resource_ids':6217,'only_allowed_difference':{'react_native_dev_server_ip':ip}}))
