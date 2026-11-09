'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync(__dirname+'/../package.json','utf8'));
assert.equal(manifest.pebble.displayName,'Universal TTS');
assert.deepEqual(manifest.pebble.plugin.actions.map(a=>a.name),
 ['tts_prepare','tts_chunk','tts_release','tts_status']);
assert.deepEqual(manifest.pebble.plugin.definesPermissions.map(a=>a.name),
 ['UniversalTtsSpeak','UniversalTtsRead']);
for(const a of manifest.pebble.plugin.actions) assert.ok(a.callerPermissions.every(p=>p.startsWith('UniversalTts')));
const store=new Map(),secure=new Map(),requests=[];
let action,config;
const localStorage={
 getItem:k=>store.get(k)||null,
 setItem:(k,v)=>store.set(k,String(v)),
 removeItem:k=>store.delete(k)
};
const Pebble={
 secureStorage:{getItem:async k=>secure.get(k)||null,setItem:async(k,v)=>secure.set(k,v),removeItem:async k=>secure.delete(k)},
 registerActionHandler:fn=>action=fn,registerConfigHandler:fn=>config=fn
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
 const json=data=>({ok:true,json:async()=>data});
 const audio=data=>({ok:true,arrayBuffer:async()=>binary(data)});
 if(u.includes('texttospeech.googleapis.com/v1/voices'))return json({voices:[{name:'en-US-Wavenet-F',languageCodes:['en-US']} ]});
 if(u.includes('texttospeech.googleapis.com'))return json({audioContent:wav.toString('base64')});
 if(u.includes('generativelanguage.googleapis.com/v1beta/models?'))return json({models:[
  {name:'models/gemini-2.5-flash-preview-tts'},{name:'models/gemini-2.5-flash'}]});
 if(u.includes('generativelanguage.googleapis.com'))return json({
   candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=8000',data:raw16.toString('base64')}}]}}]
 });
 if(u.endsWith('api.elevenlabs.io/v1/voices'))return json({voices:[{voice_id:'JBFqnCBsd6RMkjVDRZzb',name:'George'}]});
 if(u.endsWith('api.elevenlabs.io/v1/models'))return json([{model_id:'eleven_flash_v2_5',name:'Flash v2.5',can_do_text_to_speech:true}]);
 if(u.includes('elevenlabs.io'))return audio(raw16);
 if(u.includes('speech.microsoft.com/cognitiveservices/voices/list'))return json([{ShortName:'en-US-JennyNeural',DisplayName:'Jenny',Locale:'en-US'}]);
 if(u.includes('speech.microsoft.com'))return audio(wav);
 if(u.endsWith('/api/states'))return json([{entity_id:'tts.piper',attributes:{friendly_name:'Piper'}},{entity_id:'light.kitchen'}]);
 if(u.endsWith('/api/tts_get_url'))return json({path:'/api/tts_proxy/test.wav',url:'https://malicious.example/steal'});
 if(u.includes('/api/tts_proxy/'))return audio(wav);
 if(u.endsWith('api.deepgram.com/v1/models'))return json({tts:[
  {canonical_name:'aura-2-thalia-en',name:'thalia'},
  {canonical_name:'flux-alexis-en',name:'alexis'}]});
 if(u.includes('api.deepgram.com/v1/speak'))return audio(wav);
 if(u.endsWith('api.cartesia.ai/models'))return json({data:[
  {id:'sonic-3.6',name:'Sonic 3.6',capability:'tts'},
  {id:'ink-2',name:'Ink STT',capability:'stt'}]});
 if(u.includes('api.cartesia.ai/voices'))return json({data:[{id:'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',name:'Skylar'}],
  has_more:u.includes('starting_after')?false:true,next_page:u.includes('starting_after')?'':'page+=/'});
 if(u.includes('api.cartesia.ai/tts/bytes'))return audio(wav);
 if(u.includes('api.speechify.ai/v1/audio/models'))return json({models:[{id:'simba-3.5',name:'Simba 3.5',recommended:true}]});
 if(u.includes('api.speechify.ai/v1/voices'))return json({voices:[{id:'geffen_32',display_name:'Geffen'}],has_more:false});
 if(u.includes('api.speechify.ai/v1/audio/speech'))return json({audio_data:raw16.toString('base64'),audio_format:'pcm',output_format:'pcm_16000'});
 if(u.includes('api.smallest.ai/waves/v1/')&&u.includes('/get_voices'))return json({voices:[{voiceId:'kaitlyn',displayName:'Kaitlyn'}]});
 if(u.includes('api.smallest.ai/waves/v1/tts'))return audio(wav);
 if(u.includes('api.inworld.ai/voices/v1/voices'))return json({voices:[{voiceId:'Dennis',displayName:'Dennis'}],nextPageToken:''});
 if(u.includes('api.inworld.ai/tts/v1/voice'))return json({audioContent:wav.toString('base64')});
 if(u.includes('docs.rime.ai/data/voices'))return json({coda:{en:['astra','luna'],es:['selena']}});
 if(u.includes('coda.api.rime.ai'))return audio(wav);
 if(u.includes('api.fish.audio/model'))return json({items:[{_id:'fishvoice123',title:'Fish Voice'}]});
 if(u.includes('api.fish.audio/v1/tts'))return audio(wav);
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
async function verifySession(provider){
 const r=await req('tts_prepare',{text:'Hello from '+provider});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.data.sample_rate,8000);assert.equal(r.data.channels,1);
 assert.equal(r.data.chunk_bytes,6000);
 assert.ok(r.data.first_chunk);
 assert.equal(r.data.audio_diagnostics.source,provider);
 assert.equal(r.data.provider,provider);
 const id=r.data.session_id,total=r.data.length;let bytes=0;
 for(let p=0;p<total;p+=6000){
   const z=await req('tts_chunk',{session_id:id,offset:p});
   assert.equal(z.ok,true,JSON.stringify(z));
   bytes+=Buffer.from(z.data.audio,'base64').length;
 }
 assert.equal(bytes,total);
 assert.equal((await req('tts_release',{session_id:id})).ok,true);
 assert.equal((await req('tts_chunk',{session_id:id,offset:0})).ok,false);
}
(async()=>{
 let r=await req('tts_prepare',{text:'Hello'});
 assert.equal(r.code,'AUTH_REQUIRED');
 r=await req('tts_prepare',{test_tone:true});
 assert.equal(r.ok,true);
 assert.equal(r.data.sample_rate,8000);
 r=await cfg({type:'save',api_key:'google_secret',voice:'en-US-Wavenet-F'});
 assert.equal(r.ok,true);assert.equal(r.default_provider,'google');
 await verifySession('google');

 r=await cfg({type:'save',provider:'gemini',api_key:'gemini_secret',voice:'Kore',
   model:'gemini-2.5-flash-preview-tts'});
 assert.equal(r.ok,true);await verifySession('gemini');
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


 const newProviders=[
  ['deepgram','deepgram_secret','aura-2-thalia-en',''],
  ['cartesia','cartesia_secret','db6b0ed5-d5d3-463d-ae85-518a07d3c2b4','sonic-3.6'],
  ['speechify','speechify_secret','geffen_32','simba-3.5'],
  ['smallest','smallest_secret','kaitlyn','lightning_v3.1_pro'],
  ['inworld','inworld_secret','Dennis','inworld-tts-2'],
  ['rime','rime_secret','astra',''],
  ['fish','fish_secret','default','s2.1-pro-free']
 ];
 for(const [provider,api_key,voice,model] of newProviders){
   const saved=await cfg({type:'save',provider,api_key,voice,model,language:'en'});
   assert.equal(saved.ok,true,'save '+provider+': '+JSON.stringify(saved));
   await verifySession(provider);
 }
 assert.equal((await cfg({type:'catalog',provider:'google',kind:'voices'})).items[0].id,'en-US-Wavenet-F');
 assert.equal((await cfg({type:'catalog',provider:'gemini',kind:'models'})).items.length,1);
 assert.equal((await cfg({type:'catalog',provider:'gemini',kind:'voices'})).supported,false);
 assert.equal((await cfg({type:'catalog',provider:'elevenlabs',kind:'models'})).items[0].id,'eleven_flash_v2_5');
 assert.equal((await cfg({type:'catalog',provider:'elevenlabs',kind:'voices'})).items[0].label,'George');
 assert.equal((await cfg({type:'catalog',provider:'azure',kind:'voices'})).items[0].id,'en-US-JennyNeural');
 assert.equal((await cfg({type:'catalog',provider:'homeassistant',kind:'voices'})).items[0].id,'tts.piper');
 const deepgramCatalog=await cfg({type:'catalog',provider:'deepgram',kind:'voices'});
 assert.equal(deepgramCatalog.items.length,1);assert.equal(deepgramCatalog.items[0].id,'aura-2-thalia-en');
 const cartesiaModels=await cfg({type:'catalog',provider:'cartesia',kind:'models'});
 assert.equal(cartesiaModels.items.length,1);assert.equal(cartesiaModels.items[0].id,'sonic-3.6');
 const cartesiaVoices=await cfg({type:'catalog',provider:'cartesia',kind:'voices'});
 assert.equal(cartesiaVoices.items[0].label,'Skylar');assert.equal(cartesiaVoices.next_cursor,'page+=/');
 assert.equal((await cfg({type:'catalog',provider:'cartesia',kind:'voices',cursor:'page+=/'})).ok,true);
 assert.equal((await cfg({type:'catalog',provider:'speechify',kind:'models'})).items[0].id,'simba-3.5');
 assert.equal((await cfg({type:'catalog',provider:'speechify',kind:'voices',model:'simba-3.5'})).items[0].label,'Geffen');
 assert.equal((await cfg({type:'catalog',provider:'smallest',kind:'voices',model:'lightning_v3.1_pro'})).items[0].id,'kaitlyn');
 assert.equal((await cfg({type:'catalog',provider:'inworld',kind:'voices'})).items[0].id,'Dennis');
 assert.equal((await cfg({type:'catalog',provider:'rime',kind:'voices'})).items.length,3);
 assert.equal((await cfg({type:'catalog',provider:'fish',kind:'voices'})).items[0].id,'fishvoice123');
 assert.equal((await cfg({type:'catalog',provider:'rime',kind:'models'})).supported,false);
 assert.equal((await cfg({type:'catalog',provider:'fish',kind:'voices',cursor:'\nunsafe'})).ok,false);
 assert.equal((await cfg({type:'catalog',provider:'fish',kind:'invalid'})).ok,false);
 assert.ok(!requests.some(x=>x.url.includes('malicious.example')));
 assert.ok(requests.some(x=>x.url.includes('api.cartesia.ai/tts/bytes')));
 assert.ok(requests.some(x=>x.url.includes('api.deepgram.com/v1/speak')));
 // Restore HA as default for the original status, forget and no-credential checks below.
 r=await cfg({type:'save',provider:'homeassistant',api_key:'',voice:'tts.piper',
   endpoint:'http://192.168.1.2:8123'});
 assert.equal(r.ok,true);

 const c=await req('tts_status');
 assert.equal(c.ok,true);assert.equal(c.data.provider,'homeassistant');
 assert.equal(c.data.configured,true);
 assert.equal(c.data.version,1);
 assert.ok(!JSON.stringify(c.data).includes('_secret'));
 assert.equal((await req('tts_prepare',{text:''})).code,'INVALID_ARGS');
 assert.equal((await req('tts_prepare',{text:'x'.repeat(501)})).code,'INVALID_ARGS');
 assert.equal((await req('universal_prepare',{text:'x'})).code,'INVALID_REQUEST');
 assert.equal((await cfg({type:'save',provider:'openai',api_key:'x',voice:'alloy'})).ok,false);
 assert.equal((await cfg({type:'save',provider:'homeassistant',api_key:'',voice:'tts.piper',
   endpoint:'http://example.com'})).ok,false);
 r=await cfg({type:'test',provider:'google'});assert.equal(r.ok,true);
 // UI test must not silently switch the chosen provider.
 assert.equal((await req('tts_status')).data.provider,'homeassistant');
 r=await cfg({type:'forget',provider:'homeassistant'});assert.equal(r.ok,true);
 assert.equal((await req('tts_prepare',{text:'hi'})).code,'AUTH_REQUIRED');
 assert.ok(!requests.some(x=>x.url.includes('api.openai.com')));
 assert.ok(requests.length>=6);
 console.log('PASS: 12 provider adapters, live model/voice catalogs, pagination and secure TTS');
})().catch(e=>{console.error(e);process.exitCode=1;});
