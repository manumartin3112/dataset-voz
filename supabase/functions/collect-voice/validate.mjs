export function validateMetadata(value) {
 if(!value || typeof value!=="object" || Array.isArray(value)) throw Error('Metadatos inválidos');
 const keys=['id','session','first_name','last_name','sex','nationality','accent','device','conditions','phrase_id','recorded_at','session_date'];
 for(const k of keys) if(typeof value[k]!=="string" || !value[k].trim() || value[k].length>120 || /[\x00-\x1f]/.test(value[k])) throw Error('Datos incompletos');
 if(value.first_name.length>60||value.last_name.length>80)throw Error('Nombre demasiado largo');
 for(const k of ['id','session'])if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value[k]))throw Error('Identificador inválido');
 if(!Number.isInteger(value.age)||value.age<1||value.age>120||!['H','M','NB','NS'].includes(value.sex)||!['a','b'].includes(value.phrase_id)||![1,2].includes(value.take)||value.consent!==true)throw Error('Datos inválidos');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value.session_date)||!Number.isFinite(Date.parse(value.session_date))||new Date(value.session_date).toISOString().slice(0,10)!==value.session_date||!Number.isFinite(Date.parse(value.recorded_at)))throw Error('Fecha inválida');
 return Object.fromEntries([...keys,'age','take','consent'].map(k=>[k,value[k]]));
}
export function recordingFilename(meta){
 const slug=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24)||'dato';
 return [meta.first_name,meta.last_name,meta.age,meta.sex,meta.nationality,meta.accent,meta.session_date,'frase'+(meta.phrase_id==='a'?1:2),'toma'+meta.take].map(slug).join('_')+'_'+meta.id.toLowerCase()+'.wav';
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
 const seconds=bytes/2/format.rate;if(seconds<3||seconds>30)throw Error('Graba entre 3 y 30 segundos');
 return {seconds,sample_rate:format.rate};
}
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
