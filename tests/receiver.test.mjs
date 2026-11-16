import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as validation from '../supabase/functions/collect-voice/validate.mjs';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/collect-voice/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/,'');
const origin='https://manumartin3112.github.io';
function handler(fetch){let fn;const Deno={env:{get:k=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',ALLOWED_ORIGINS:origin})[k]},serve:f=>fn=f};new Function('Deno','fetch',...Object.keys(validation),source)(Deno,fetch,...Object.values(validation));return fn;}
function sample(){const b=new ArrayBuffer(44+16000*2*3),v=new DataView(b);for(const [o,s]of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));v.setUint32(4,b.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,b.byteLength-44,true);return b;}
const meta={id:'12345678-1234-1234-1234-123456789012',session:'12345678-1234-1234-1234-123456789013',first_name:'Ana',last_name:'García',age:30,sex:'M',nationality:'Espanola',accent:'Madrileno',device:'móvil',conditions:'sala',phrase_id:'a',take:1,consent:true,recorded_at:'2026-11-16T12:00:00Z',session_date:'2026-11-16'};
function request(values=meta){const f=new FormData();f.append('metadata',JSON.stringify(values));f.append('audio',new Blob([sample()],{type:'audio/wav'}),'upload.wav');return new Request('https://test/function',{method:'POST',headers:{origin},body:f});}
test('público: no pide invitación y confirma solo después de guardar',async()=>{
 const calls=[];const fn=handler(async(url,options)=>{calls.push([url,options]);if(url.includes('/rpc/')){const body=JSON.parse(options.body);assert.equal(body.p_meta.first_name,'Ana');assert.equal(body.p_meta.protocol_version,'2-public-original-phrases');assert.equal(body.p_bytes,sample().byteLength);assert.equal(body.p_hash,undefined);return Response.json({status:'pending',object_path:body.p_filename});}return new Response(null,{status:200});});
 const response=await fn(request());assert.equal(response.status,201);assert.equal((await response.json()).saved,true);assert.equal(calls.length,3);assert.match(calls[1][0],/Ana_Garcia_30/);assert.equal(calls[1][1].headers['x-upsert'],'false');assert.equal(calls[2][1].method,'PATCH');
});
test('consentimiento falso no llega a base de datos',async()=>{let called=false;const response=await handler(async()=>{called=true;})(request({...meta,consent:false}));assert.equal(response.status,400);assert.equal(called,false);});
test('toma ya completada no vuelve a subir',async()=>{let calls=0;const response=await handler(async()=>{calls++;return Response.json({status:'complete'});})(request());assert.equal(response.status,200);assert.equal(calls,1);});
test('subida fallida sin objeto recuperable no confirma',async()=>{let patched=false;const response=await handler(async(url,opts)=>{if(url.includes('/rpc/'))return Response.json({status:'pending',object_path:'test.wav'});if(opts.method==='PATCH')patched=true;return new Response(null,{status:500});})(request());assert.equal(response.status,503);assert.equal(patched,false);});
test('capacidad agotada explica pausa sin subir audio',async()=>{const response=await handler(async()=>Response.json({message:'Collection unavailable'},{status:400}))(request());assert.equal(response.status,429);});
test('origen ajeno rechazado y preflight público válido',async()=>{const fn=handler(()=>{throw Error('No debe consultar');});assert.equal((await fn(new Request('https://test',{method:'OPTIONS',headers:{origin:'https://other.test'}}))).status,403);assert.equal((await fn(new Request('https://test',{method:'OPTIONS',headers:{origin}}))).status,204);});
