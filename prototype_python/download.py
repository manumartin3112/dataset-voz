"""Descarga privada: python download.py https://servidor salida.zip"""
import hashlib,json,os,sys,urllib.request,zipfile,tempfile,shutil
from pathlib import Path
from urllib.parse import urlparse
if len(sys.argv)!=3: raise SystemExit(__doc__)
url=sys.argv[1].rstrip('/')
parsed=urlparse(url)
if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('127.0.0.1','localhost')): raise SystemExit('Usa HTTPS o localhost')
target=Path(sys.argv[2])
if target.exists(): raise SystemExit('La salida ya existe; elige otro nombre')
request=urllib.request.Request(url+'/api/export',headers={'Authorization':'Bearer '+os.environ['VOICE_ADMIN_TOKEN']})
with tempfile.TemporaryFile() as temp:
 with urllib.request.urlopen(request,timeout=120) as response: shutil.copyfileobj(response,temp)
 temp.seek(0)
 with zipfile.ZipFile(temp) as archive:
  rows=json.loads(archive.read('manifest.json'))
  for item in rows:
   if hashlib.sha256(archive.read(item['file'])).hexdigest()!=item['sha256']: raise SystemExit('Hash de audio incorrecto')
 temp.seek(0)
 with target.open('xb') as output: shutil.copyfileobj(temp,output)
print('Descarga verificada:',len(rows),'tomas en',target)
