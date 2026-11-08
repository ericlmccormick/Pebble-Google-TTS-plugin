'use strict';
// Place a copy of sdk/universal_tts.js at ./universal_tts.js.
var tts=require('./universal_tts').create({
  Pebble:Pebble,
  onError:function(error){console.log('Universal TTS error: '+String(error.message||error));},
  onComplete:function(){console.log('Speech transfer finished');}
});
Pebble.addEventListener('ready',function(){console.log('Hello Speech ready');});
Pebble.addEventListener('appmessage',function(event){
  var payload=event.payload||{};
  if(tts.handleMessage(payload))return;
  if(payload.COMMAND!=='SPEAK_REQUEST')return;
  // The speaker output and provider API are entirely handled by the SDK/plugin.
  tts.speak(String(payload.TEXT||'Hello from Pebble!')).catch(function(error){
    console.log('Speech could not start: '+String(error.message||error));
  });
});
