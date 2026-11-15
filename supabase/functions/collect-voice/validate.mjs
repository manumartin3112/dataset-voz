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
