const ACENTOS = {
  Espanola:       [['Andaluz','Andaluz'],['Canario','Canario'],['Castellano','Castellano'],['Catalan','Catalán'],['Extremeno','Extremeño'],['Gallego','Gallego'],['Madrileno','Madrileño'],['Murciano','Murciano'],['Valenciano','Valenciano'],['Vasco','Vasco']],
  Alemana:        [['Acento_aleman','Acento alemán']],
  Argentina:      [['Acento_rioplatense','Acento rioplatense']],
  Boliviana:      [['Acento_boliviano','Acento boliviano']],
  Brasilena:      [['Acento_brasileno','Acento brasileño']],
  Chilena:        [['Acento_chileno','Acento chileno']],
  China:          [['Acento_chino','Acento chino']],
  Colombiana:     [['Acento_colombiano','Acento colombiano']],
  Cubana:         [['Acento_cubano','Acento cubano']],
  Dominicana:     [['Acento_dominicano','Acento dominicano']],
  Ecuatoriana:    [['Acento_ecuatoriano','Acento ecuatoriano']],
  Estadounidense: [['Acento_estadounidense','Acento estadounidense']],
  Filipina:       [['Acento_filipino','Acento filipino']],
  Francesa:       [['Acento_frances','Acento francés']],
  Guatemalteca:   [['Acento_guatemalteco','Acento guatemalteco']],
  Hondurena:      [['Acento_hondureno','Acento hondureño']],
  Italiana:       [['Acento_italiano','Acento italiano']],
  Japonesa:       [['Acento_japones','Acento japonés']],
  Marroqui:       [['Acento_marroqui','Acento marroquí']],
  Mexicana:       [['Acento_mexicano','Acento mexicano']],
  Nicaraguense:   [['Acento_nicaraguense','Acento nicaragüense']],
  Paraguaya:      [['Acento_paraguayo','Acento paraguayo']],
  Peruana:        [['Acento_peruano','Acento peruano']],
  Polaca:         [['Acento_polaco','Acento polaco']],
  Portuguesa:     [['Acento_portugues','Acento portugués']],
  Rumana:         [['Acento_rumano','Acento rumano']],
  Salvadorena:    [['Acento_salvadoreno','Acento salvadoreño']],
  Ucraniana:      [['Acento_ucraniano','Acento ucraniano']],
  Uruguaya:       [['Acento_uruguayo','Acento uruguayo']],
  Venezolana:     [['Acento_venezolano','Acento venezolano']],
  Otra:           [['Otro','Otro']]
};

function updateAcentos() {
  const nac = document.getElementById('f_nac').value;
  const sel = document.getElementById('f_acento');
  sel.innerHTML = '';
  if (!nac) {
    sel.innerHTML = '<option value="">— selecciona primero la nacionalidad —</option>';
    return;
  }
  const opts = ACENTOS[nac] || [['Otro','Otro']];
  sel.innerHTML = '<option value="">— seleccionar —</option>';
  opts.forEach(([val, label]) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = label;
    sel.appendChild(o);
  });
  if (opts.length === 1) sel.value = opts[0][0];
}


function updatePhrases() {
  const n = document.getElementById('f_nombre').value.trim();
  const a = document.getElementById('f_apellido').value.trim();
  const label = (n||a) ? [n,a].filter(Boolean).join(' ') : '(Nombre y Primer apellido)';
  document.getElementById('ph1').textContent = label;
  document.getElementById('ph2').textContent = label;
}


const $ = id => document.getElementById(id);
const recordings = [[null,null],[null,null]];
let active = null, busy = false, sending = false, common = null, playback = null;
const fields = ['f_nombre','f_apellido','f_edad','f_sexo','f_nac','f_acento'];
function setMsg(text,type='') { $('msg').textContent=text; $('msg').className='msg '+type; }
function metadata() {
  const values=Object.fromEntries(fields.map(id=>[id,$(id).value.trim()]));
  if(fields.slice(0,6).some(id=>!values[id])) throw Error('Rellena los datos del participante antes de grabar.');
  const age=Number(values.f_edad);
  if(!Number.isInteger(age)||age<1||age>120) throw Error('Indica una edad válida entre 1 y 120.');
  return {session:crypto.randomUUID(),first_name:values.f_nombre,last_name:values.f_apellido,age,
    sex:values.f_sexo,nationality:values.f_nac,accent:values.f_acento,device:'No recogido',
    conditions:'No recogidas',session_date:new Date().toLocaleDateString('sv-SE')};
}
function refresh() {
 let count=0;
 for(let p=0;p<2;p++)for(let t=0;t<2;t++){
  const take=recordings[p][t],current=active?.p===p&&active?.t===t;
  if(take)count++;
  $('recbtn_'+p+'_'+t).disabled=busy||sending||Boolean(take?.attempted)||Boolean(active&&!current);
  $('lbl_'+p+'_'+t).textContent=current?'Detener':take?'Repetir':'Grabar';
  $('recbtn_'+p+'_'+t).className='btn'+(current?' recording':'');
  $('dot_'+p+'_'+t).className='rec-dot'+(current?' active':'');
  $('play_'+p+'_'+t).className='btn btn-play'+(take?' visible':'');
  $('play_'+p+'_'+t).disabled=busy||sending||Boolean(active);
  $('st_'+p+'_'+t).textContent=current?'Grabando…':take?.saved?'Enviado':take?'Grabado':'Pendiente';
 }
 for(let i=0;i<4;i++)$('pip'+i).className=i<count?'done':'';
 $('btn_submit').disabled=busy||sending||Boolean(active)||recordings.flat().every(x=>x?.saved);
}
function wav(chunks,rate) {
 const n=chunks.reduce((s,c)=>s+c.length,0),buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer);
 for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<text.length;i++)v.setUint8(offset+i,text.charCodeAt(i));
 v.setUint32(4,36+n*2,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,n*2,true);
 let offset=44;for(const chunk of chunks)for(let x of chunk){x=Math.max(-1,Math.min(1,x));v.setInt16(offset,x<0?x*32768:x*32767,true);offset+=2;}
 return {blob:new Blob([buffer],{type:'audio/wav'}),seconds:n/rate};
}
async function toggleRec(p,t) {
 if(busy||sending||recordings[p][t]?.attempted)return;
 if(active){if(active.p===p&&active.t===t)await stopRec();return;}
 let stream,ctx;busy=true;refresh();
 try {
  if(!common)common=metadata();
  fields.forEach(id=>$(id).disabled=true);
  if(playback){playback.pause();playback=null;}
  stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  ctx=new AudioContext();await ctx.resume();await ctx.audioWorklet.addModule('./recorder.js');
  const source=ctx.createMediaStreamSource(stream),worklet=new AudioWorkletNode(ctx,'capture'),chunks=[];
  worklet.port.onmessage=e=>chunks.push(e.data);source.connect(worklet);worklet.connect(ctx.destination);
  active={p,t,stream,ctx,source,worklet,chunks,start:Date.now()};
  active.timer=setInterval(()=>{if(!active)return;const seconds=(Date.now()-active.start)/1000;$('tmr_'+p+'_'+t).textContent=seconds.toFixed(1)+' s';if(seconds>=29)stopRec();},200);
  $('tmr_'+p+'_'+t).className='timer active';setMsg('Lee la frase completa con tu voz natural.');
 }catch(e){stream?.getTracks().forEach(x=>x.stop());if(ctx)await ctx.close();if(!recordings.flat().some(Boolean)){common=null;fields.forEach(id=>$(id).disabled=false);}setMsg('No se pudo iniciar: '+e.message,'error');}
 finally{busy=false;refresh();}
}
async function stopRec() {
 if(!active||busy)return;busy=true;const r=active;active=null;clearInterval(r.timer);refresh();
 try {
  r.source.disconnect();r.worklet.disconnect();r.stream.getTracks().forEach(x=>x.stop());await r.ctx.close();
  const result=wav(r.chunks,r.ctx.sampleRate);
  if(result.seconds<3||result.seconds>30)throw Error('La toma debe durar entre 3 y 30 segundos. Repite leyendo la frase completa.');
  const previous=recordings[r.p][r.t];if(previous)URL.revokeObjectURL(previous.url);
  recordings[r.p][r.t]={...result,url:URL.createObjectURL(result.blob),id:crypto.randomUUID(),recorded_at:new Date().toISOString(),saved:false,attempted:false};
  setMsg('Toma grabada. Puedes escucharla y repetirla antes de enviar.');
 }catch(e){setMsg(e.message,'error');}
 finally{$('tmr_'+r.p+'_'+r.t).className='timer';busy=false;refresh();}
}
function playAudio(p,t){const take=recordings[p][t];if(!take||active||sending)return;if(playback)playback.pause();playback=new Audio(take.url);playback.play().catch(()=>setMsg('No se pudo reproducir el audio.','error'));}
async function submitAll(){
 if(sending||busy||active)return;
 if(!recordings.flat().every(Boolean)){setMsg('Graba las cuatro tomas antes de enviar.','error');return;}
 if(!$('consent').checked){setMsg('Lee y acepta el aviso antes de enviar.','error');$('consent').focus();return;}
 if(!window.COLLECTION_CONFIG?.endpoint){setMsg('Recogida pendiente de configuración.','error');return;}
 sending=true;if(playback)playback.pause();refresh();$('consent').disabled=true;$('upload_progress').className='upload-progress visible';
 try{
  for(let p=0;p<2;p++)for(let t=0;t<2;t++){
   const take=recordings[p][t];if(take.saved)continue;
   take.attempted=true;
   const meta={...common,id:take.id,recorded_at:take.recorded_at,phrase_id:p?'b':'a',take:t+1,consent:true};
   const data=new FormData();data.append('metadata',JSON.stringify(meta));data.append('audio',take.blob,'toma.wav');
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
   try{
    setMsg(`Enviando frase ${p+1}, toma ${t+1}…`);
    const response=await fetch(COLLECTION_CONFIG.endpoint,{method:'POST',body:data,signal:controller.signal});
    const result=await response.json();if(!response.ok||result.saved!==true)throw Error(result.error||'No se confirmó el envío');
    take.saved=true;$('bar_'+p+'_'+t).className='upload-bar-fill done';refresh();
   }finally{clearTimeout(timeout);}
  }
  $('btn_submit').textContent='Enviado';setMsg('Grabaciones enviadas correctamente. Muchas gracias por tu participación. Referencia de sesión: '+common.session,'success');
 }catch(e){setMsg('Envío incompleto: '+e.message+'. Pulsa Reintentar envío; las tomas confirmadas no se volverán a enviar.','error');$('btn_submit').textContent='Reintentar envío';}
 finally{sending=false;$('consent').disabled=false;refresh();}
}
window.addEventListener('beforeunload',e=>{if(active||sending||recordings.flat().some(x=>x&&!x.saved)){e.preventDefault();e.returnValue='';}});
