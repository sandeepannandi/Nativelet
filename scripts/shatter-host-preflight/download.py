import sys,pathlib,urllib.request,hashlib,zipfile,io
p=pathlib.Path(sys.argv[1])
assets=[
('linux-amd64.zip','https://github.com/google/perfetto/releases/download/v59.1/linux-amd64.zip','7deb8c2572c6ae7ec80cd719d388041079827b0c44a1659694d5d88faa4f501e'),
('perf_sample.pb','https://storage.googleapis.com/perfetto/test_data/perf_sample.pb-3e4e31dcbe5e4d924b4e391593f81d065ffac3fc9faa224154d8c9723d6b1b54','3e4e31dcbe5e4d924b4e391593f81d065ffac3fc9faa224154d8c9723d6b1b54')]
for name,url,sha in assets:
 b=urllib.request.urlopen(url,timeout=60).read();assert hashlib.sha256(b).hexdigest()==sha,name+' checksum mismatch';(p/name).write_bytes(b)
z=zipfile.ZipFile(p/'linux-amd64.zip')
# Downloaded release archive paths are restricted before extracting executable.
assert all(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts for n in z.namelist())
z.extract('linux-amd64/trace_processor_shell',p/'perfetto')
b=(p/'perfetto/linux-amd64/trace_processor_shell').read_bytes();assert hashlib.sha256(b).hexdigest()=='2434129a3af4dc9e2034a476f7b76447b490975213e301769310d3bd0d5d6458'
