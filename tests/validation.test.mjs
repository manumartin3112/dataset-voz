import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMetadata,validateWav,sha256,recordingFilename} from '../supabase/functions/collect-voice/validate.mjs';
function wav(seconds=8,rate=16000){const b=new ArrayBuffer(44+seconds*rate*2),v=new DataView(b);for(const [o,t] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i));v.setUint32(4,b.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,b.byteLength-44,true);return b;}
const meta={id:'12345678-1234-1234-1234-123456789012',session:'12345678-1234-1234-1234-123456789013',first_name:'María',last_name:'García',age:34,sex:'M',nationality:'Espanola',accent:'Madrileno',device:'micro',conditions:'sala',phrase_id:'a',take:1,consent:true,recorded_at:'2026-11-15T12:00:00Z',session_date:'2026-11-15'};
test('WAV válido y duración real',()=>assert.deepEqual(validateWav(wav()),{seconds:8,sample_rate:16000}));
test('duraciones fuera de rango',()=>{for(const s of [2,31])assert.throws(()=>validateWav(wav(s)));});
test('rechaza truncamiento y estéreo',()=>{assert.throws(()=>validateWav(wav().slice(0,50)));const b=wav();new DataView(b).setUint16(22,2,true);assert.throws(()=>validateWav(b));});
test('metadatos limitados y sin campos extra',()=>assert.deepEqual(validateMetadata({...meta,secret:'discard'}),meta));
test('rechaza consentimiento falso e identificadores no válidos',()=>{for(const m of [[],null,{...meta,consent:false},{...meta,id:'../escape'},{...meta,take:'1'}])assert.throws(()=>validateMetadata(m));});
test('SHA256 verificable',async()=>assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));

test('frases originales: admite una toma completa de 3 segundos',()=>assert.equal(validateWav(wav(3)).seconds,3));
test('rechaza edades, fechas y nombres inválidos',()=>{for(const m of [{...meta,age:0},{...meta,age:121},{...meta,age:'34'},{...meta,first_name:''},{...meta,sex:'x'},{...meta,session_date:'2026-02-31'}])assert.throws(()=>validateMetadata(m));});
test('nombre descriptivo, seguro y único por toma',()=>{
 const filename=recordingFilename(meta);
 assert.match(filename,/^Maria_Garcia_34_M_Espanola_Madrileno_2026_11_15_frase1_toma1_/);
 assert.ok(filename.endsWith(meta.id+'.wav'));
 assert.match(recordingFilename({...meta,first_name:'../../Ana',last_name:'李 / <script>'}),/^[A-Za-z0-9_-]+[.]wav$/);
 assert.notEqual(filename,recordingFilename({...meta,id:meta.session}));
});
