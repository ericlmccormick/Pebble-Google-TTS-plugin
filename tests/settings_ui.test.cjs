'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../src/config.html','utf8');
assert.match(html,/Universal TTS/);
assert.match(html,/class="panel"/);
assert.match(html,/prefers-color-scheme:dark/);
assert.match(html,/<label id="keyLabel" for="key">/);
assert.match(html,/aria-live="polite"/);
assert.match(html,/<select id="provider"/);
for(const p of ['google','gemini','elevenlabs','azure','homeassistant']){
 assert.ok(html.includes('value="'+p+'"'),p);
}
assert.ok(!html.includes('value="openai"'));
assert.ok(!html.includes('id="deprecation"'));
assert.ok(html.includes('January 6, 2027'));
assert.ok(html.includes('Save &amp; set as default'));
assert.ok(html.includes('Test configured provider'));
assert.ok(html.includes("Pebble.addEventListener('ready'"));
console.log('PASS: five-provider settings and deprecation note');
