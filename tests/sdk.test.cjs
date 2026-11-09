'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const lib=require('../sdk/universal_tts.js');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8'));
assert.equal(lib.PLUGIN_UUID,manifest.pebble.uuid);
assert.equal(lib.PERMISSION,'UniversalTtsSpeak');
const wav=Buffer.alloc(44+8000);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(8000,40);
for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(Math.round(6000*Math.sin(i/75)),i);
function fnv(buf){let h=2166136261>>>0;for(const b of buf)h=Math.imul((h^b)>>>0,16777619)>>>0;return h>>>0;}
const seen=[],messages=[];
let finished,rejected;
const complete=new Promise((resolve,reject)=>{finished=resolve;rejected=reject;});
const Pebble={
 invokeAction:async function(req){
   seen.push(req);
   assert.equal(req.plugin,manifest.pebble.uuid);
   if(req.action==='tts_prepare')return {ok:true,text:JSON.stringify({
     session_id:'tts1234',length:wav.length,chunk_bytes:6000,
     format:'pcm_s16le_wav',sample_rate:8000,channels:1,bits_per_sample:16,
     sample_count:4000,wav_checksum:fnv(wav),
     first_chunk:wav.subarray(0,6000).toString('base64'),first_chunk_checksum:fnv(wav.subarray(0,6000))
   })};
   if(req.action==='tts_chunk'){
     const offset=req.args.offset;
     assert.equal(offset,6000);
     return {ok:true,text:JSON.stringify({offset,length:wav.length,
       audio:wav.subarray(offset).toString('base64'),checksum:fnv(wav.subarray(offset)),done:true})};
   }
   if(req.action==='tts_release')return {ok:true,text:JSON.stringify({released:true})};
   throw Error('Unknown plugin action '+req.action);
 },
 sendAppMessage:function(payload,success,error){
   messages.push(payload);
   if(success)success();
 }
};
(async()=>{
 const tts=lib.create({Pebble,onComplete:finished,onError:rejected});
 await assert.rejects(tts.speak(''),/must not be empty/i);
 await tts.speak('Hello from Pebble!');
 await Promise.race([complete,new Promise((_,reject)=>setTimeout(()=>reject(Error('TTS transport did not finish')),5000))]);
 assert.ok(seen.some(x=>x.action==='tts_prepare'&&x.args.text==='Hello from Pebble!'));
 assert.ok(seen.some(x=>x.action==='tts_chunk'));
 assert.ok(seen.some(x=>x.action==='tts_release'));
 assert.ok(!seen.some(x=>x.action.includes('universal_')));
 assert.ok(messages.some(x=>x.COMMAND==='AUDIO_RESET'));
 assert.ok(messages.some(x=>x.COMMAND==='AUDIO_CHUNK'&&Array.isArray(x.CHUNK)&&x.CHUNK.length));
 assert.ok(messages.some(x=>x.COMMAND==='AUDIO_SENTENCE_END'));
 assert.equal(tts.handleMessage({COMMAND:'AUDIO_STATS',TEXT:'frames=3'}),true);
 assert.equal(tts.handleMessage({COMMAND:'OTHER'}),false);
 assert.ok(tts.diagnostics());
 tts.stop();
 assert.ok(messages.some(x=>x.COMMAND==='AUDIO_STOP'));
 const c=fs.readFileSync(path.join(__dirname,'../sdk/universal_tts.c'),'utf8');
 const h=fs.readFileSync(path.join(__dirname,'../sdk/universal_tts.h'),'utf8');
 assert.ok(c.includes('#include "universal_tts.h"'));
 assert.ok(h.includes('universal_tts_handle_message'));
 assert.ok(h.includes('universal_tts_supported'));
 console.log('PASS: drop-in JavaScript SDK streams, verifies, releases and controls playback');
})().catch(e=>{console.error(e);process.exitCode=1;});
