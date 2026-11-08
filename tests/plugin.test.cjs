'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const store=new Map(),secure=new Map(),requests=[];
let action,config;
const localStorage={
  getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};
const Pebble={
  secureStorage:{
    getItem:async k=>secure.get(k)||null,
    setItem:async(k,v)=>secure.set(k,v),
    removeItem:async k=>secure.delete(k)
  },
  registerActionHandler:fn=>action=fn,
  registerConfigHandler:fn=>config=fn
};
const wav=Buffer.alloc(44+16000);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(Math.round(8000*Math.sin(i/100)),i);
const raw16=wav.subarray(44);
function binary(data){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}
const fetch=async(url,options={})=>{
  const u=String(url);requests.push({url:u,headers:options.headers||{},body:options.body});
  if(u.includes('texttospeech.googleapis.com'))return {ok:true,json:async()=>({audioContent:wav.toString('base64')})};
  if(u.includes('generativelanguage.googleapis.com'))return {ok:true,json:async()=>({
    candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=8000',data:raw16.toString('base64')}}]}}]
  })};
  if(u.includes('elevenlabs.io'))return {ok:true,arrayBuffer:async()=>binary(raw16)};
  if(u.includes('speech.microsoft.com'))return {ok:true,arrayBuffer:async()=>binary(wav)};
  if(u.endsWith('/api/tts_get_url'))return {ok:true,json:async()=>({
    path:'/api/tts_proxy/test.wav',url:'https://malicious.example/steal'
  })};
  if(u.includes('/api/tts_proxy/'))return {ok:true,arrayBuffer:async()=>binary(wav)};
  if(u.includes('api.openai.com'))return {ok:true,arrayBuffer:async()=>binary(raw16)};
  throw Error('Unexpected endpoint '+u);
};
vm.runInNewContext(fs.readFileSync(__dirname+'/../src/plugin/index.js','utf8'),{
  Pebble,localStorage,fetch,Date,Math,JSON,Promise,console,Uint8Array,Int16Array,
  ArrayBuffer,DataView,setTimeout,Number,Error,RegExp,encodeURIComponent
});
function req(name,args){return new Promise(resolve=>action({action:name,args:args||{}},{
  ok:x=>resolve({ok:true,data:JSON.parse(x.text)}),
  error:(code,message)=>resolve({ok:false,code,message})
}));}
function cfg(args){return new Promise(resolve=>config(args,resolve));}
async function verifySession(provider,actionName='universal_prepare'){
  const r=await req(actionName,{text:'Hello from '+provider});
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.data.sample_rate,8000);assert.equal(r.data.channels,1);
  assert.equal(r.data.chunk_bytes,6000);
  assert.ok(r.data.first_chunk);assert.equal(r.data.audio_diagnostics.source,provider);
  assert.equal(r.data.provider,provider);
  const id=r.data.session_id,total=r.data.length;let bytes=0;
  for(let p=0;p<total;p+=6000){
    const z=await req('universal_chunk',{session_id:id,offset:p});
    assert.equal(z.ok,true,JSON.stringify(z));bytes+=Buffer.from(z.data.audio,'base64').length;
  }
  assert.equal(bytes,total);
  const gone=await req('universal_release',{session_id:id});
  assert.equal(gone.ok,true);
  assert.equal((await req('universal_chunk',{session_id:id,offset:0})).ok,false);
}
(async()=>{
  let r=await req('tts_prepare',{text:'Hello'});
  assert.equal(r.code,'AUTH_REQUIRED');
  r=await req('universal_prepare',{test_tone:true});
  assert.equal(r.ok,true);
  r=await cfg({type:'save',api_key:'google_secret',voice:'en-US-Wavenet-F'});
  assert.equal(r.ok,true);assert.equal(r.default_provider,'google');
  await verifySession('google','tts_prepare');

  r=await cfg({type:'save',provider:'gemini',api_key:'gemini_secret',voice:'Kore',
    model:'gemini-2.5-flash-preview-tts'});
  assert.equal(r.ok,true);
  await verifySession('gemini');
  assert.ok(requests.some(x=>x.url.includes('generateContent')));

  r=await cfg({type:'save',provider:'elevenlabs',api_key:'eleven_secret',
    voice:'JBFqnCBsd6RMkjVDRZzb',model:'eleven_flash_v2_5'});
  assert.equal(r.ok,true);await verifySession('elevenlabs');

  r=await cfg({type:'save',provider:'azure',api_key:'azure_secret',
    voice:'en-US-JennyNeural',region:'eastus'});
  assert.equal(r.ok,true);await verifySession('azure');

  r=await cfg({type:'save',provider:'homeassistant',api_key:'ha_secret',
    voice:'tts.piper',endpoint:'http://192.168.1.2:8123'});
  assert.equal(r.ok,true);await verifySession('homeassistant');
  assert.ok(requests.some(x=>x.url==='http://192.168.1.2:8123/api/tts_proxy/test.wav'));
  assert.ok(!requests.some(x=>x.url.includes('malicious.example')));

  r=await cfg({type:'save',provider:'openai',api_key:'openai_secret',
    voice:'alloy',model:'gpt-4o-mini-tts'});
  assert.equal(r.ok,true);await verifySession('openai');
  const c=await req('universal_config');
  assert.equal(c.ok,true);assert.equal(c.data.provider,'openai');
  assert.equal(c.data.openai_speech_shutdown,'2027-01-06');
  assert.equal(c.data.providers.length,6);
  assert.ok(!JSON.stringify(c.data).includes('_secret'));
  assert.ok(!JSON.stringify(c.data).includes('ha_secret'));
  assert.equal((await req('tts_prepare',{text:'',provider:'google'})).code,'INVALID_ARGS');
  assert.equal((await req('universal_prepare',{text:'x',provider:'bad'})).code,'INVALID_ARGS');
  assert.equal((await req('universal_prepare',{text:'x',provider:'gemini',voice:''})).code,'INVALID_ARGS');
  assert.equal((await cfg({type:'save',provider:'homeassistant',api_key:'',voice:'tts.piper',endpoint:'http://example.com'})).ok,false);
  r=await cfg({type:'test',provider:'google'});assert.equal(r.ok,true);
  r=await cfg({type:'forget',provider:'openai'});assert.equal(r.ok,true);
  assert.equal((await req('universal_prepare',{text:'hi'})).code,'AUTH_REQUIRED');
  assert.ok(requests.length>=8);
  console.log('PASS: Universal TTS six-provider regression, legacy API, security and transport');
})().catch(e=>{console.error(e);process.exitCode=1;});
