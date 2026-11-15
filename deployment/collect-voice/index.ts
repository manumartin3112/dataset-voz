// GENERADO por scripts/build_dashboard.py. No editar directamente.
export function validateMetadata(value) {
 if(!value || typeof value!=="object" || Array.isArray(value)) throw Error("Metadatos inválidos");
 const keys=['id','participant','session','device','conditions','phrase_id','recorded_at','session_date'];
 for(const k of keys) if(typeof value[k]!=="string" || !value[k].trim() || value[k].length>200) throw Error("Completa los datos de sesión");
 for(const k of ['id','session']) if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value[k])) throw Error('Identificador inválido');
 if(!/^[A-Za-z0-9_-]{3,80}$/.test(value.participant)||!['a','b'].includes(value.phrase_id)||![1,2].includes(value.take)||value.consent!==true) throw Error('Datos inválidos');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value.session_date)||!Number.isFinite(Date.parse(value.session_date))||!Number.isFinite(Date.parse(value.recorded_at))) throw Error('Fecha inválida');
 return Object.fromEntries([...keys,'take','consent'].map(k=>[k,value[k]]));
}
export function validateWav(buffer) {
 const b=new Uint8Array(buffer),v=new DataView(buffer),text=(i,n)=>String.fromCharCode(...b.slice(i,i+n));
 if(b.length<44||b.length>8000000||text(0,4)!=='RIFF'||text(8,4)!=='WAVE'||v.getUint32(4,true)+8!==b.length) throw Error('WAV inválido');
 let format=null,bytes=null;
 for(let p=12;p+8<=b.length;){const n=v.getUint32(p+4,true),end=p+8+n;if(end>b.length)throw Error('WAV incompleto');
  if(text(p,4)==='fmt '){if(n<16||format)throw Error('Formato inválido');format={type:v.getUint16(p+8,true),channels:v.getUint16(p+10,true),rate:v.getUint32(p+12,true),align:v.getUint16(p+20,true),bits:v.getUint16(p+22,true)};}
  if(text(p,4)==='data'){if(bytes!==null)throw Error('Datos duplicados');bytes=n;}p=end+(n%2);
 }
 if(!format||bytes===null||format.type!==1||format.channels!==1||format.bits!==16||format.align!==2||bytes%2||![16000,22050,24000,32000,44100,48000,96000].includes(format.rate))throw Error('Usa WAV PCM mono de 16 bits');
 const seconds=bytes/2/format.rate;if(seconds<8||seconds>30)throw Error('Graba entre 8 y 30 segundos');
 return {seconds,sample_rate:format.rate};
}
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}

const base=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin={apikey:key,Authorization:`Bearer ${key}`};
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const allowed=(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim());
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,x-upload-token','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const reply=(status:number,body:object)=>Response.json(body,{status,headers});
 if(!origin||!allowed.includes(origin))return new Response('Origen no permitido',{status:403});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Método no admitido'});
 try{
  const token=req.headers.get('x-upload-token')||'';
  if(!/^[A-Za-z0-9_-]{32,100}$/.test(token))return reply(403,{error:'Invitación inválida'});
  const hash=await sha256(new TextEncoder().encode(token));
  const auth=await fetch(`${base}/rest/v1/voice_invites?token_hash=eq.${hash}&select=participant,expires_at,revoked`,{headers:admin});
  if(!auth.ok)return reply(503,{error:'No se pudo comprobar la invitación'});
  const invites=await auth.json();const inv=invites[0];
  if(!inv||inv.revoked||Date.parse(inv.expires_at)<=Date.now())return reply(403,{error:'Invitación inválida o caducada'});
  // Limitar también las peticiones sin Content-Length antes de parsear multipart.
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Falta el audio'});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8100000){await reader.cancel();return reply(413,{error:'Archivo demasiado grande'});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();
  let meta,audio,measured;
  try{meta=validateMetadata(JSON.parse(String(form.get('metadata'))));const file=form.get('audio');if(!(file instanceof File))throw Error('Falta el audio');audio=await file.arrayBuffer();measured=validateWav(audio);}catch{return reply(400,{error:'Audio o metadatos inválidos: WAV mono, entre 8 y 30 segundos'});}
  if(meta.participant!==inv.participant)return reply(403,{error:'El código de participante no corresponde a esta invitación'});
  const digest=await sha256(audio);
  const reservation=await fetch(`${base}/rest/v1/rpc/reserve_voice_take`,{method:'POST',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({p_hash:hash,p_meta:{...meta,...measured,protocol_version:'1',consent_version:'1'},p_sha:digest})});
  if(!reservation.ok)return reply(409,{error:'Toma en conflicto, invitación agotada o sesión incompatible. Contacta con el organizador.'});
  const row=await reservation.json();if(row.status==='complete')return reply(200,{saved:true,id:meta.id,repeated:true});
  const objectURL=`${base}/storage/v1/object/voice-recordings/${row.object_path}`;
  const upload=await fetch(objectURL,{method:'POST',headers:{...admin,'Content-Type':'audio/wav','x-upsert':'false'},body:audio});
  if(!upload.ok){
   // Una respuesta perdida tras subir se recupera comprobando el objeto existente.
   const existing=await fetch(objectURL,{headers:admin});
   if(!existing.ok||await sha256(await existing.arrayBuffer())!==digest)return reply(503,{error:'No se confirmó la subida. Reintenta la misma toma.'});
  }
  const complete=await fetch(`${base}/rest/v1/voice_takes?id=eq.${meta.id}`,{method:'PATCH',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({status:'complete'})});
  if(!complete.ok)return reply(503,{error:'Audio recibido, confirmación pendiente. Reintenta.'});
  return reply(201,{saved:true,id:meta.id});
 }catch{return reply(503,{error:'No se confirmó el envío. Puedes reintentarlo.'});}
});
