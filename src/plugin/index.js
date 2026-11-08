/* Universal TTS plugin. Compatible with Home Assistant Bridge audio SDK v1.
 * Key saved in Pebble.secureStorage; persistent bounded WAV chunks survive
 * plugin script restart between tts_prepare and tts_chunk actions.
 * WAV format: canonical mono 8000 Hz signed PCM16, chunk size 6000 bytes.
 */
'use strict';
var KEY='google_tts_cloud_api_key_v1';
var VOICE_KEY='google_tts_voice_v1';
var DEFAULT_VOICE='en-US-Wavenet-F';
function failure(code,message){return {ok:false,code:code,message:message};}
function configuredVoice(){return localStorage.getItem(VOICE_KEY)||DEFAULT_VOICE;}
function validVoice(name){return typeof name==='string'&&/^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9-]{2,80}$/.test(name);}
function base64Decode(input){
  if(typeof input!=='string'||!input||input.length>3000000)throw Error('Invalid base64 audio size');
  if(input.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(input))throw Error('Invalid base64 audio');
  return new Uint8Array(pluginDecodeBase64(input));
}
var pluginB64Alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function pluginDecodeBase64(input){
  var output=[],buffer=0,bits=0;
  for(var i=0;i<input.length;i++){
    var ch=input.charAt(i);
    if(ch==='=')break;
    var v=pluginB64Alphabet.indexOf(ch);
    if(v<0)throw Error('Invalid plugin audio encoding');
    buffer=(buffer<<6)|v;bits+=6;
    if(bits>=8){bits-=8;output.push((buffer>>bits)&255);}
  }
  return output;
}

var MAX_TTS_BYTES=1500000,TTS_CHUNK_BYTES=6000;
var TTS_INDEX_KEY='google_tts_sessions_v1',TTS_TTL_MS=180000;
function base64Bytes(bytes) {
  var abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out='';
  for(var i=0;i<bytes.length;i+=3){
    var a=bytes[i],b=i+1<bytes.length?bytes[i+1]:0,c=i+2<bytes.length?bytes[i+2]:0;
    out+=abc[a>>2]+abc[((a&3)<<4)|(b>>4)]+(i+1<bytes.length?abc[((b&15)<<2)|(c>>6)]:'=')+
      (i+2<bytes.length?abc[c&63]:'=');
  }
  return out;
}
function sessionKey(id){return 'google_tts_v1_'+id;}
function sessionList(){
  try{var value=JSON.parse(localStorage.getItem(TTS_INDEX_KEY)||'[]');
    return Array.isArray(value)?value:[];}catch(e){return [];}
}
function deleteTtsSession(id){
  var key=sessionKey(id),raw=localStorage.getItem(key),count=0;
  try{count=JSON.parse(raw||'{}').count||0;}catch(e){}
  // Reject tampered metadata that would otherwise trigger unbounded deletion.
  count=Math.min(251,Math.max(0,count));
  for(var i=0;i<count;i++)localStorage.removeItem(key+'_'+i);
  localStorage.removeItem(key);
}
function cleanTtsSessions(){
  var now=Date.now(),keep=[];
  sessionList().forEach(function(id){
    if(!/^tts[a-z0-9]+$/.test(id))return;
    var meta=null;
    try{meta=JSON.parse(localStorage.getItem(sessionKey(id))||'null');}catch(e){}
    if(!meta||meta.expires<now){deleteTtsSession(id);return;}
    keep.push(id);
  });
  localStorage.setItem(TTS_INDEX_KEY,JSON.stringify(keep));
  return keep;
}
function storeTtsSession(bytes){
  var keep=cleanTtsSessions();
  // Keep up to three concurrent speech sessions: the active sentence, one
  // prepared-ahead sentence, and a spare for overlapping release actions.
  // An older active transfer must never be deleted by the next prepare.
  while(keep.length>=3){
    deleteTtsSession(keep.shift());
  }
  localStorage.setItem(TTS_INDEX_KEY,JSON.stringify(keep));
  var id='tts'+Date.now().toString(36)+Math.floor(Math.random()*0x100000000).toString(36);
  var key=sessionKey(id),count=Math.ceil(bytes.length/TTS_CHUNK_BYTES);
  var hashes=[];
  for(var n=0;n<count;n++){
    var pos=n*TTS_CHUNK_BYTES;
    hashes.push(wavChecksum(bytes.subarray(pos,Math.min(bytes.length,pos+TTS_CHUNK_BYTES))));
  }
  var meta={length:bytes.length,count:count,hashes:hashes,expires:Date.now()+TTS_TTL_MS};
  try{
    localStorage.setItem(key,JSON.stringify(meta));
    for(var i=0;i<count;i++){
      var start=i*TTS_CHUNK_BYTES;
      localStorage.setItem(key+'_'+i,base64Bytes(bytes.subarray(start,start+TTS_CHUNK_BYTES)));
    }
    localStorage.setItem(TTS_INDEX_KEY,JSON.stringify(keep.concat([id])));
    return {session_id:id,length:bytes.length,chunk_bytes:TTS_CHUNK_BYTES};
  }catch(e){
    deleteTtsSession(id);
    return null;
  }
}
// Decode a complete mono PCM16 WAV. HA may ignore the preferred sample rate;
// inspect the returned header rather than treating bytes as a different codec.
function wavPcm16(bytes) {
  if(bytes.length<44)return {ok:false,error:'WAV too short'};
  var view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  function tag(p){return String.fromCharCode(bytes[p],bytes[p+1],bytes[p+2],bytes[p+3]);}
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE')return {ok:false,error:'TTS did not return RIFF WAV'};
  var pos=12,fmt=null,start=-1,dataLength=0,declaredSize=0;
  while(pos+8<=bytes.length) {
    var size=view.getUint32(pos+4,true),data=pos+8,name=tag(pos);
    if(name==='fmt ') {
      if(size<16||data+size>bytes.length)return {ok:false,error:'Invalid WAV format'};
      fmt={encoding:view.getUint16(data,true),channels:view.getUint16(data+2,true),
        rate:view.getUint32(data+4,true),bits:view.getUint16(data+14,true)};
    }
    if(name==='data'){start=data;declaredSize=size;break;}
    if(size>bytes.length-data)return {ok:false,error:'Truncated WAV '+name};
    pos=data+size+(size&1);
  }
  if(!fmt||start<0)return {ok:false,error:'Missing WAV audio format or data'};
  if(fmt.encoding!==1||fmt.channels!==1||fmt.bits!==16||
     fmt.rate<8000||fmt.rate>48000)
    return {ok:false,error:'TTS requires mono PCM16 WAV (8-48 kHz)'};
  // Respect a valid finite 'data' chunk length; a WAV can contain trailing
  // LIST, INFO or metadata chunks. Do not decode those non-audio bytes as PCM.
  // Home Assistant streamed WAV may use unknown (0xFFFFFFFF/0x7FFFFFFF)
  // or overstated sizes, so in those cases use available complete frames.
  var available=bytes.length-start;
  var streamed=declaredSize===0||declaredSize===0xFFFFFFFF||declaredSize===0x7FFFFFFF||declaredSize===0xFDFDFDFD;
  var usable=(streamed||declaredSize>available)?
    available:Math.min(available,declaredSize);
  usable-=usable%2;
  var length=usable/2;
  if(!length)return {ok:false,error:'Empty WAV audio'};
  var samples=new Int16Array(length);
  for(var i=0;i<length;i++)samples[i]=view.getInt16(start+i*2,true);
  return {ok:true,samples:samples,rate:fmt.rate,
    byte_order_analysis:inspectPcmByteOrder(bytes,start,length),
    declared_data_bytes:declaredSize,available_data_bytes:available,
    used_data_bytes:usable,streamed_data:streamed};
}
// Convert source PCM16 to the native Gemini-compatible 8 kHz playback rate.
// If HA supplies 16 kHz, use a 31-tap windowed-sinc low-pass FIR *before*
// dropping every other sample to avoid audible aliasing. Other supported
// sample rates are converted with a band-limited interpolation kernel.
function resample8k(samples,rate) {
  if(rate===8000)return samples;
  var outLength=Math.max(1,Math.round(samples.length*8000/rate));
  var out=new Int16Array(outLength);
  var cutoff=Math.min(0.45,3600/rate);
  var radius=16;
  for(var i=0;i<outLength;i++) {
    var center=i*rate/8000,sum=0,weight=0;
    var midpoint=Math.floor(center);
    for(var j=midpoint-radius+1;j<=midpoint+radius;j++) {
      var distance=j-center;
      if(Math.abs(distance)>radius)continue;
      var x=2*cutoff*distance;
      var sinc=Math.abs(x)<1e-9?1:Math.sin(Math.PI*x)/(Math.PI*x);
      var window=0.5+0.5*Math.cos(Math.PI*distance/radius);
      var coefficient=2*cutoff*sinc*window;
      var sample=samples[Math.max(0,Math.min(samples.length-1,j))];
      sum+=sample*coefficient;weight+=coefficient;
    }
    out[i]=Math.max(-32768,Math.min(32767,Math.round(sum/weight)));
  }
  return out;
}
// Gemini consumes a canonical 44-byte WAV header followed by signed,
// little-endian 8kHz mono PCM16 samples. Keep ADPCM encoding in the phone app.
function geminiWav8k(samples) {
  var out=new Uint8Array(44+samples.length*2),v=new DataView(out.buffer);
  function tag(p,t){for(var i=0;i<t.length;i++)out[p+i]=t.charCodeAt(i);}
  tag(0,'RIFF');v.setUint32(4,out.length-8,true);tag(8,'WAVE');
  tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
  v.setUint16(22,1,true);v.setUint32(24,8000,true);
  v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
  tag(36,'data');v.setUint32(40,samples.length*2,true);
  for(var i=0;i<samples.length;i++)v.setInt16(44+i*2,samples[i],true);
  return out;
}
// Match the phone-side checksum before ADPCM encoding; a corrupt or missing
// base64 chunk must fail instead of being decoded as audible static.
function wavChecksum(bytes) {
  var hash=2166136261>>>0;
  for(var i=0;i<bytes.length;i++) {
    hash=Math.imul((hash^bytes[i])>>>0,16777619)>>>0;
  }
  return hash>>>0;
}
function pcmStats(samples,rate) {
  var peak=0,power=0,zeroCrossings=0,clipped=0,prev=0;
  for(var i=0;i<samples.length;i++){
    var value=samples[i];
    peak=Math.max(peak,Math.abs(value));
    power+=value*value;
    if(i&&((value<0)!==(prev<0)))zeroCrossings++;
    if(Math.abs(value)>=32760)clipped++;
    prev=value;
  }
  return {peak:peak,rms:Math.round(Math.sqrt(power/Math.max(1,samples.length))),
    zero_crossings:zeroCrossings,clipped:clipped,
    duration_ms:Math.round(samples.length*1000/(rate||8000))};
}
// The bridge already knows the real WAV bytes. Compare both PCM16 byte
// interpretations without changing the actual playback signal. Misread
// endianness has dramatically different adjacent-sample roughness.
function inspectPcmByteOrder(bytes,offset,count) {
  var view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  var leDiff=0,beDiff=0,lePower=0,bePower=0,leCross=0,beCross=0;
  var lastLE=0,lastBE=0,n=Math.min(count,24000);
  for(var i=0;i<n;i++) {
    var le=view.getInt16(offset+2*i,true),be=view.getInt16(offset+2*i,false);
    lePower+=le*le;bePower+=be*be;
    if(i) {
      leDiff+=Math.abs(le-lastLE);beDiff+=Math.abs(be-lastBE);
      if((le<0)!==(lastLE<0))leCross++;
      if((be<0)!==(lastBE<0))beCross++;
    }
    lastLE=le;lastBE=be;
  }
  return {examined_samples:n,
    little_endian:{mean_step:Math.round(leDiff/Math.max(1,n-1)),
      rms:Math.round(Math.sqrt(lePower/Math.max(1,n))),crossings:leCross},
    big_endian:{mean_step:Math.round(beDiff/Math.max(1,n-1)),
      rms:Math.round(Math.sqrt(bePower/Math.max(1,n))),crossings:beCross}};
}
function bridgeTestTone() {
  var samples=new Int16Array(8000*7);
  for(var i=0;i<samples.length;i++)
    samples[i]=Math.round(9000*Math.sin(2*Math.PI*440*i/8000));
  return samples;
}
function packageWavSession(pcm,source) {
  var wav=geminiWav8k(pcm);
  if(wav.length>MAX_TTS_BYTES)
    return failure('PLUGIN_UNAVAILABLE','TTS PCM audio exceeds size limit');
  var session=storeTtsSession(wav);
  if(!session)return failure('PLUGIN_UNAVAILABLE','Insufficient plugin storage for TTS audio');
  session.format='pcm_s16le_wav';
  session.sample_rate=8000;
  session.channels=1;
  session.bits_per_sample=16;
  session.sample_count=pcm.length;
  session.wav_checksum=wavChecksum(wav);
  // Return the first already-stored chunk with prepare. This avoids another
  // plugin startup / interprocess round trip before the phone can assemble
  // the first sentence. Older clients simply ignore the optional field.
  session.first_chunk=localStorage.getItem(sessionKey(session.session_id)+'_0');
  session.first_chunk_checksum=wavChecksum(wav.subarray(0,Math.min(wav.length,TTS_CHUNK_BYTES)));
  session.audio_diagnostics={source:source,output:pcmStats(pcm)};
  return {ok:true,data:session};
}

function ttsChunk(args){
  cleanTtsSessions();
  var id=String(args.session_id||''),offset=Number(args.offset);
  if(!/^tts[a-z0-9]+$/.test(id))return failure('INVALID_ARGS','Invalid TTS session');
  var meta=null;
  try{meta=JSON.parse(localStorage.getItem(sessionKey(id))||'null');}catch(e){}
  if(!meta)return failure('PLUGIN_UNAVAILABLE','TTS session expired; start a new request');
  if(!Number.isInteger(offset)||offset<0||offset>=meta.length||offset%TTS_CHUNK_BYTES!==0)
    return failure('INVALID_ARGS','Invalid TTS chunk offset');
  var index=offset/TTS_CHUNK_BYTES;
  var audio=localStorage.getItem(sessionKey(id)+'_'+index);
  if(!audio)return failure('PLUGIN_UNAVAILABLE','TTS audio chunk unavailable');
  meta.expires=Date.now()+TTS_TTL_MS;
  localStorage.setItem(sessionKey(id),JSON.stringify(meta));
  return {ok:true,data:{offset:offset,length:meta.length,audio:audio,
    checksum:meta.hashes&&meta.hashes[index],
    done:index===meta.count-1}};
}


/* Universal TTS provider adapters. The session, checksum and 8 kHz PCM
 * transport above remains byte-compatible with existing Google TTS clients.
 * Credentials are always kept in Pebble.secureStorage and never returned.
 */
var PROVIDERS=['google','gemini','elevenlabs','azure','homeassistant','openai'];
var DEFAULTS={
  google:{voice:'en-US-Wavenet-F',model:''},
  gemini:{voice:'Kore',model:'gemini-2.5-flash-preview-tts'},
  elevenlabs:{voice:'JBFqnCBsd6RMkjVDRZzb',model:'eleven_flash_v2_5'},
  azure:{voice:'en-US-JennyNeural',model:''},
  homeassistant:{voice:'tts.piper',model:''},
  openai:{voice:'alloy',model:'gpt-4o-mini-tts'}
};
var DEFAULT_PROVIDER_KEY='universal_tts_default_provider_v1';
var OPENAI_SHUTDOWN='2027-01-06';
function selectedProvider(){var p=localStorage.getItem(DEFAULT_PROVIDER_KEY)||'google';return PROVIDERS.indexOf(p)>=0?p:'google';}
function keyFor(p){return p==='google'?KEY:'universal_tts_'+p+'_key_v1';}
function propFor(p,name){return 'universal_tts_'+p+'_'+name+'_v1';}
function optionFor(p,name){return localStorage.getItem(propFor(p,name))||(name==='voice'&&p==='google'?configuredVoice():'')||(DEFAULTS[p]&&DEFAULTS[p][name])||'';}
function validatedProvider(p){return typeof p==='string'&&PROVIDERS.indexOf(p)>=0;}
function providerName(p){return {google:'Google Cloud',gemini:'Gemini TTS',elevenlabs:'ElevenLabs',azure:'Microsoft Azure',homeassistant:'Home Assistant',openai:'OpenAI Speech (deprecated)'}[p]||p;}
function validSetting(s){return typeof s==='string'&&s.length>0&&s.length<=160&&/^[\w.-]+$/.test(s);}
function validEndpoint(url){
  if(typeof url!=='string'||url.length>240)return false;
  // HTTPS is recommended; insecure HTTP is explicitly allowed only for
  // private LAN addresses as permitted by Pebble's LocalNetwork permission.
  return /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/)?$/.test(url)||
    /^http:\/\/(?:(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|localhost)(?::[0-9]{1,5})?(?:\/)?$/.test(url);
}
async function hasProviderCredentials(p){
  var k=await Pebble.secureStorage.getItem(keyFor(p));
  if(!k)return false;
  if(p==='azure'&&!/^[a-z0-9-]{2,50}$/.test(optionFor(p,'region')))return false;
  if(p==='homeassistant'&&!validEndpoint(optionFor(p,'endpoint')))return false;
  return true;
}
async function providerSummary(){
  var arr=[];
  for(var i=0;i<PROVIDERS.length;i++){
    var p=PROVIDERS[i];arr.push({id:p,name:providerName(p),configured:await hasProviderCredentials(p),
      voice:optionFor(p,'voice'),model:optionFor(p,'model'),
      region:p==='azure'?optionFor(p,'region'):undefined,
      endpoint:p==='homeassistant'?optionFor(p,'endpoint'):undefined,
      deprecated:p==='openai',shutdown:p==='openai'?OPENAI_SHUTDOWN:undefined});
  }
  return arr;
}
function rawPcm16(bytes,rate){
  if(!bytes||bytes.length<2||bytes.length%2)return failure('PLUGIN_UNAVAILABLE','Invalid raw PCM16 audio.');
  if(!rate||rate<8000||rate>48000)return failure('PLUGIN_UNAVAILABLE','Unsupported PCM rate.');
  var view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  var pcm=new Int16Array(bytes.length/2);
  for(var i=0;i<pcm.length;i++)pcm[i]=view.getInt16(i*2,true);
  return {ok:true,samples:pcm,rate:rate};
}
function bytesToPcm(bytes,rate){
  if(bytes.length>MAX_TTS_BYTES||bytes.length<2)return failure('PLUGIN_UNAVAILABLE','TTS audio exceeds limit or is empty.');
  if(bytes.length>=44&&String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3])==='RIFF')return wavPcm16(bytes);
  return rawPcm16(bytes,rate);
}
async function binaryResponse(response,p){
  if(!response.ok)return remoteFailure(response.status,p);
  if(typeof response.arrayBuffer!=='function')return failure('PLUGIN_UNAVAILABLE','Binary audio fetch not supported on this phone runtime.');
  return {ok:true,bytes:new Uint8Array(await response.arrayBuffer())};
}
function remoteFailure(status,p){
  if(status===401||status===403)return failure('AUTH_REQUIRED',providerName(p)+' rejected credentials or access to this voice/format.');
  if(status===429)return failure('RATE_LIMITED',providerName(p)+' quota or rate limit exceeded.');
  if(status===400||status===422)return failure('INVALID_ARGS',providerName(p)+' rejected the voice, model or speech request.');
  return failure('PLUGIN_UNAVAILABLE',providerName(p)+' HTTP '+status);
}
function xmlText(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
async function synthProvider(p,text,voice,token){
  var response,body,result,bytes,parsed,region,model;
  if(p==='google'){
    if(!validVoice(voice))return failure('INVALID_ARGS','Invalid Google voice.');
    var audioConfig={audioEncoding:'LINEAR16',sampleRateHertz:16000};
    if(voice.indexOf('-Chirp3-HD-')<0)audioConfig.speakingRate=0.92;
    response=await fetch('https://texttospeech.googleapis.com/v1/text:synthesize',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':token},
      body:JSON.stringify({input:{text:text},voice:{languageCode:voice.split('-').slice(0,2).join('-'),name:voice},audioConfig:audioConfig})
    });
    if(!response.ok)return remoteFailure(response.status,p);
    result=await response.json();
    if(!result||!result.audioContent)return failure('PLUGIN_UNAVAILABLE','Google returned no audio.');
    bytes=base64Decode(result.audioContent);
    parsed=bytesToPcm(bytes,16000);
  }else if(p==='gemini'){
    if(!validSetting(voice))return failure('INVALID_ARGS','Invalid Gemini voice.');
    model=optionFor(p,'model');
    if(!/^gemini-[a-zA-Z0-9_.-]+$/.test(model))return failure('INVALID_ARGS','Invalid Gemini TTS model.');
    body={contents:[{parts:[{text:text}]}],generationConfig:{responseModalities:['AUDIO'],
      speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}}};
    response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':token},body:JSON.stringify(body)
    });
    if(!response.ok)return remoteFailure(response.status,p);
    result=await response.json();
    var parts=result&&result.candidates&&result.candidates[0]&&result.candidates[0].content&&result.candidates[0].content.parts;
    var audioPart=parts&&parts.find(function(x){return x.inlineData&&x.inlineData.data;});
    if(!audioPart)return failure('PLUGIN_UNAVAILABLE','Gemini returned no audio (check TTS model).');
    bytes=base64Decode(audioPart.inlineData.data);
    var mime=String(audioPart.inlineData.mimeType||''),found=/rate=(\d+)/.exec(mime);
    parsed=bytesToPcm(bytes,found?Number(found[1]):24000);
  }else if(p==='elevenlabs'){
    if(!validSetting(voice))return failure('INVALID_ARGS','Invalid ElevenLabs voice ID.');
    model=optionFor(p,'model');
    if(!validSetting(model))return failure('INVALID_ARGS','Invalid ElevenLabs model.');
    response=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice)+'?output_format=pcm_16000',{
      method:'POST',headers:{'Content-Type':'application/json','xi-api-key':token},
      body:JSON.stringify({text:text,model_id:model})
    });
    result=await binaryResponse(response,p);if(!result.ok)return result;
    parsed=bytesToPcm(result.bytes,16000);
  }else if(p==='azure'){
    region=optionFor(p,'region').toLowerCase();
    if(!/^[a-z0-9-]{2,50}$/.test(region)||!validSetting(voice))
      return failure('INVALID_ARGS','Configure an Azure region and voice.');
    var lang=voice.slice(0,5);
    body='<speak version="1.0" xml:lang="'+xmlText(lang)+'"><voice name="'+xmlText(voice)+'">'+xmlText(text)+'</voice></speak>';
    response=await fetch('https://'+region+'.tts.speech.microsoft.com/cognitiveservices/v1',{
      method:'POST',headers:{'Content-Type':'application/ssml+xml','Ocp-Apim-Subscription-Key':token,
        'X-Microsoft-OutputFormat':'riff-8khz-16bit-mono-pcm','User-Agent':'PebbleUniversalTTS'},
      body:body
    });
    result=await binaryResponse(response,p);if(!result.ok)return result;
    parsed=bytesToPcm(result.bytes,8000);
  }else if(p==='homeassistant'){
    var endpoint=optionFor(p,'endpoint').replace(/\/$/,'');
    if(!validEndpoint(endpoint)||!/^tts\.[a-z0-9_]+$/.test(voice))
      return failure('INVALID_ARGS','Configure a valid Home Assistant URL and TTS entity.');
    response=await fetch(endpoint+'/api/tts_get_url',{
      method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({engine_id:voice,message:text,options:{
        preferred_format:'wav',preferred_sample_rate:16000,preferred_sample_channels:1,preferred_sample_bytes:2}})
    });
    if(!response.ok)return remoteFailure(response.status,p);
    result=await response.json();
    // Ignore external absolute URLs. Resolve the server-provided path against
    // the configured origin so the HA credential cannot leak to another host.
    var path=result&&result.path;
    if(typeof path!=='string'||!/^\/api\/tts_proxy\/[A-Za-z0-9_./%-]+$/.test(path))
      return failure('PLUGIN_UNAVAILABLE','Home Assistant returned an unexpected audio path.');
    response=await fetch(endpoint+path,{headers:{Authorization:'Bearer '+token}});
    result=await binaryResponse(response,p);if(!result.ok)return result;
    if(result.bytes.length<44||String.fromCharCode.apply(null,Array.prototype.slice.call(result.bytes,0,4))!=='RIFF')
      return failure('PLUGIN_UNAVAILABLE','Home Assistant did not return WAV; select a TTS engine supporting preferred_format=wav.');
    parsed=bytesToPcm(result.bytes,16000);
  }else if(p==='openai'){
    // OpenAI's Speech endpoint is retired January 6, 2027.
    // The replacement gpt-realtime-2.1-mini uses WebSockets/WebRTC, not /audio/speech.
    if(Date.now()>=Date.parse('2027-01-06T00:00:00Z'))
      return failure('PLUGIN_UNAVAILABLE','OpenAI Speech API was scheduled to retire Jan 6, 2027. Select another provider.');
    if(!validSetting(voice))return failure('INVALID_ARGS','Invalid OpenAI voice.');
    model=optionFor(p,'model');
    if(['tts-1','tts-1-hd','gpt-4o-mini-tts','gpt-4o-mini-tts-2025-12-15'].indexOf(model)<0)
      return failure('INVALID_ARGS','Select a supported legacy OpenAI Speech model.');
    response=await fetch('https://api.openai.com/v1/audio/speech',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({model:model,voice:voice,input:text,response_format:'pcm'})
    });
    result=await binaryResponse(response,p);if(!result.ok)return result;
    parsed=bytesToPcm(result.bytes,24000);
  }else{return failure('INVALID_ARGS','Unknown TTS provider.');}
  if(!parsed.ok)return failure('PLUGIN_UNAVAILABLE',parsed.error||parsed.message||'Invalid speech audio.');
  var pcm=resample8k(parsed.samples,parsed.rate);
  var session=packageWavSession(pcm,p);
  if(session.ok){
    session.data.audio_diagnostics.input_rate=parsed.rate;
    session.data.audio_diagnostics.voice=voice;
    session.data.audio_diagnostics.input=pcmStats(parsed.samples,parsed.rate);
    session.data.provider=p;
    if(p==='openai')session.data.deprecation_warning='OpenAI Speech models shut down January 6, 2027; replacement uses Realtime API.';
  }
  return session;
}
async function prepareTts(args){
  if(args.test_tone===true)return packageWavSession(bridgeTestTone(),'universal_tts_test_tone');
  if(typeof args.text!=='string'||!args.text.trim()||args.text.length>500)
    return failure('INVALID_ARGS','Speech text must contain 1–500 characters.');
  var p=args.provider===undefined?selectedProvider():args.provider;
  if(!validatedProvider(p))return failure('INVALID_ARGS','Unknown TTS provider.');
  var voice=args.voice===undefined?optionFor(p,'voice'):args.voice;
  if(typeof voice!=='string'||voice.length>160||!voice.trim())
    return failure('INVALID_ARGS','Invalid voice.');
  var token=await Pebble.secureStorage.getItem(keyFor(p));
  if(!token)return failure('AUTH_REQUIRED','Configure '+providerName(p)+' in Universal TTS settings.');
  try{return await synthProvider(p,args.text,voice,token);}
  catch(e){return failure('PLUGIN_UNAVAILABLE',providerName(p)+' synthesis/decoding failed.');}
}
Pebble.registerActionHandler(async function(request,respond){
  var args=request.args||{},r;
  switch(request.action){
    case 'get_config':{
      var p=selectedProvider();
      r={ok:true,data:{configured:await hasProviderCredentials(p),voice:optionFor(p,'voice'),
        provider:p,providers:await providerSummary(),audio_format:'pcm_s16le_wav',sample_rate:8000,
        openai_speech_shutdown:OPENAI_SHUTDOWN,openai_replacement:'gpt-realtime-2.1-mini (Realtime API)'}};
      break;
    }
    case 'tts_prepare':r=await prepareTts(args);break;
    case 'tts_chunk':r=ttsChunk(args);break;
    case 'tts_release':{
      var id=String(args.session_id||'');
      if(!/^tts[a-z0-9]+$/.test(id)){r=failure('INVALID_ARGS','Invalid session_id');break;}
      deleteTtsSession(id);
      localStorage.setItem(TTS_INDEX_KEY,JSON.stringify(sessionList().filter(function(x){return x!==id;})));
      r={ok:true,data:{released:true}};break;
    }
    default:respond.error('INVALID_REQUEST','Unknown action');return;
  }
  if(!r.ok){respond.error(r.code,r.message);return;}
  respond.ok({text:JSON.stringify(r.data).slice(0,20000)});
});
Pebble.registerConfigHandler(async function(message,respond){
  var m=message||{},p=m.provider===undefined?selectedProvider():m.provider;
  if(!validatedProvider(p)){respond({ok:false,error:'Unknown provider'});return;}
  if(m.type==='status'){
    respond({ok:true,provider:selectedProvider(),providers:await providerSummary()});return;
  }
  if(m.type==='save'){
    if(typeof m.voice!=='string'||!m.voice.trim()||m.voice.length>160){
      respond({ok:false,error:'Enter a voice name or ID.'});return;
    }
    if(p==='google'&&!validVoice(m.voice)){respond({ok:false,error:'Invalid Google Cloud voice.'});return;}
    if(p==='homeassistant'&&!/^tts\.[a-z0-9_]+$/.test(m.voice)){respond({ok:false,error:'Enter a TTS entity such as tts.piper.'});return;}
    if(m.region!==undefined&&p==='azure'&&!/^[a-z0-9-]{2,50}$/.test(m.region)){respond({ok:false,error:'Enter a valid Azure region.'});return;}
    if(m.endpoint!==undefined&&p==='homeassistant'&&!validEndpoint(m.endpoint)){respond({ok:false,error:'Enter a valid HA URL (HTTPS, or private LAN HTTP).'});return;}
    if(typeof m.api_key==='string'&&m.api_key.trim())await Pebble.secureStorage.setItem(keyFor(p),m.api_key.trim());
    if(!(await Pebble.secureStorage.getItem(keyFor(p)))){respond({ok:false,error:'Enter credentials for '+providerName(p)+'.'});return;}
    if(p==='google')localStorage.setItem(VOICE_KEY,m.voice);
    localStorage.setItem(propFor(p,'voice'),m.voice);
    if(p==='azure'&&typeof m.region==='string')localStorage.setItem(propFor(p,'region'),m.region);
    if(p==='homeassistant'&&typeof m.endpoint==='string')localStorage.setItem(propFor(p,'endpoint'),m.endpoint);
    if((p==='gemini'||p==='elevenlabs'||p==='openai')&&typeof m.model==='string'&&m.model)
      localStorage.setItem(propFor(p,'model'),m.model);
    if(m.make_default!==false)localStorage.setItem(DEFAULT_PROVIDER_KEY,p);
    respond({ok:true,provider:p,default_provider:selectedProvider(),voice:m.voice,configured:await hasProviderCredentials(p)});
    return;
  }
  if(m.type==='forget'){
    await Pebble.secureStorage.removeItem(keyFor(p));
    localStorage.removeItem(propFor(p,'voice'));
    localStorage.removeItem(propFor(p,'model'));
    localStorage.removeItem(propFor(p,'region'));
    localStorage.removeItem(propFor(p,'endpoint'));
    if(p==='google')localStorage.removeItem(VOICE_KEY);
    cleanTtsSessions().forEach(deleteTtsSession);
    localStorage.removeItem(TTS_INDEX_KEY);
    respond({ok:true,provider:p});return;
  }
  if(m.type==='test'){
    var r=await prepareTts({provider:p,text:'Testing Universal T T S on Pebble.'});
    if(r.ok){deleteTtsSession(r.data.session_id);localStorage.setItem(TTS_INDEX_KEY,JSON.stringify(sessionList().filter(function(x){return x!==r.data.session_id;})));respond({ok:true,duration_ms:r.data.audio_diagnostics.output.duration_ms,provider:p});}
    else respond({ok:false,error:r.message,code:r.code});
    return;
  }
  respond({ok:false,error:'Unknown configuration request.'});
});
