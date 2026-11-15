"""Administración local. Las claves se leen del entorno y nunca se publican."""
import argparse,hashlib,json,os,re,secrets,urllib.request,urllib.parse
from datetime import datetime,timedelta,timezone
from pathlib import Path

def main():
 parser=argparse.ArgumentParser(); sub=parser.add_subparsers(dest='command',required=True)
 invite=sub.add_parser('invite');invite.add_argument('participant');invite.add_argument('--days',type=int,default=30);invite.add_argument('--takes',type=int,default=24);invite.add_argument('--output',type=Path,required=True)
 export=sub.add_parser('download');export.add_argument('output',type=Path)
 args=parser.parse_args()
 base=os.environ['SUPABASE_URL'].rstrip('/');key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
 if not re.fullmatch(r'https://[a-z0-9]+[.]supabase[.]co',base):raise SystemExit('URL de Supabase inválida')
 def call(path,method='GET',body=None):
  data=None if body is None else json.dumps(body).encode()
  req=urllib.request.Request(base+path,data=data,method=method,headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=120) as response:return response.read()
 if args.command=='invite':
  if not re.fullmatch(r'[A-Za-z0-9_-]{3,80}',args.participant) or not 1<=args.takes<=200 or not 1<=args.days<=365:raise SystemExit('Parámetros inválidos')
  if args.output.exists():raise SystemExit('El archivo de invitación ya existe')
  token=secrets.token_urlsafe(32);expires=(datetime.now(timezone.utc)+timedelta(days=args.days)).isoformat()
  call('/rest/v1/voice_invites','POST',dict(token_hash=hashlib.sha256(token.encode()).hexdigest(),participant=args.participant,expires_at=expires,max_takes=args.takes))
  args.output.parent.mkdir(parents=True,exist_ok=True)
  with args.output.open('x',encoding='utf-8') as out:json.dump(dict(participant=args.participant,invitation=token,expires_at=expires),out,indent=2)
  print('Invitación privada guardada en',args.output)
 else:
  args.output.mkdir(parents=True,exist_ok=True);audio_dir=args.output/'audio';audio_dir.mkdir(exist_ok=True)
  rows=[];offset=0
  while True:
   page=json.loads(call('/rest/v1/voice_takes?status=eq.complete&select=id,metadata,sha256,object_path,received_at&order=id&limit=500&offset='+str(offset)))
   rows.extend(page)
   if len(page)<500:break
   offset+=len(page)
  manifest=[]
  for row in rows:
   ident=row['id']
   if not re.fullmatch(r'[0-9a-f-]{36}',ident) or row['object_path']!=ident+'.wav':raise SystemExit('Ruta inesperada en manifiesto')
   target=audio_dir/(ident+'.wav')
   if target.exists():
    if hashlib.sha256(target.read_bytes()).hexdigest()!=row['sha256']:raise SystemExit('Archivo local distinto: '+str(target))
   else:
    raw=call('/storage/v1/object/voice-recordings/'+row['object_path'])
    if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise SystemExit('Hash incorrecto: '+ident)
    temp=target.with_suffix('.part');temp.write_bytes(raw);temp.replace(target)
   manifest.append({**row['metadata'],'sha256':row['sha256'],'received_at':row['received_at'],'file':'audio/'+ident+'.wav'})
  temp=args.output/'manifest.tmp';temp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(args.output/'manifest.json')
  print('Descarga verificada:',len(manifest),'tomas. Los archivos ya presentes no se descargan otra vez.')
if __name__=='__main__':main()
