import { validateMetadata, validateWav, sha256, recordingFilename } from './validate.mjs';
const base=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin={apikey:key,Authorization:`Bearer ${key}`};
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const allowed=(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim());
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const reply=(status:number,body:object)=>Response.json(body,{status,headers});
 if(!origin||!allowed.includes(origin))return new Response('Origen no permitido',{status:403});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Método no admitido'});
 try{
  // Limitar también las peticiones sin Content-Length antes de parsear multipart.
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Falta el audio'});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8100000){await reader.cancel();return reply(413,{error:'Archivo demasiado grande'});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let form;try{form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();}catch{return reply(400,{error:'Formulario inválido'});}
  let meta,audio,measured;
  try{meta=validateMetadata(JSON.parse(String(form.get('metadata'))));const file=form.get('audio');if(!(file instanceof File))throw Error('Falta el audio');audio=await file.arrayBuffer();measured=validateWav(audio);}catch{return reply(400,{error:'Audio o metadatos inválidos: WAV mono, entre 3 y 30 segundos'});}
  const digest=await sha256(audio);
  const reservation=await fetch(`${base}/rest/v1/rpc/reserve_public_voice_take`,{method:'POST',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({p_meta:{...meta,...measured,participant:meta.session,protocol_version:'2-public-original-phrases',consent_version:'2-public'},p_sha:digest,p_filename:recordingFilename(meta),p_bytes:audio.byteLength})});
  if(!reservation.ok){const error=await reservation.json().catch(()=>({}));if(error.message==='Collection unavailable')return reply(429,{error:'La recogida está pausada o ha alcanzado su capacidad. Inténtalo más tarde.'});if(reservation.status>=500)return reply(503,{error:'No se pudo reservar la toma. Reintenta más tarde.'});return reply(409,{error:'No se pudo reservar la toma. La sesión puede estar en conflicto; contacta con el organizador.'});}
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
