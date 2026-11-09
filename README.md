# Universal TTS for Pebble

**One speech API for Pebble watch apps and watchfaces.** Apps send text, and Universal TTS chooses the user's configured provider. Watch apps never store provider keys, talk directly to vendor APIs, or implement resampling/audio transfer.

Plugin UUID: **2c5edc42-b096-4f76-b284-1f27907e6502**. Version: **1.1.0**.

## Quick start — 3 reusable SDK files

Copy these files from this repository into your Pebble app:

| SDK file | Copy to |
| --- | --- |
| sdk/universal_tts.js | src/pkjs/universal_tts.js |
| sdk/universal_tts.c | src/c/universal_tts.c |
| sdk/universal_tts.h | src/c/universal_tts.h |

Both watchapps and watchfaces use the same SDK. A hardware speaker is required: on unsupported watches, universal_tts_supported() returns false.

### 1. Declare permission and AppMessage keys

Merge these fields into the existing pebble object of your package.json (retain its other fields, permissions and keys):

~~~json
{
  "manifestVersion": 2,
  "enableMultiJS": true,
  "messageKeys": ["COMMAND", "TEXT", "CHUNK"],
  "usesPermissions": [
    {"name":"InvokeAction","plugin":"2c5edc42-b096-4f76-b284-1f27907e6502"},
    {"name":"UniversalTtsSpeak","plugin":"2c5edc42-b096-4f76-b284-1f27907e6502"}
  ]
}
~~~

The first permission invokes actions; the second authorizes sending text to the speech plugin. User approval may be required. To check configuration separately, add UniversalTtsRead for the same plugin.

### 2. One JS speech call

In src/pkjs/index.js:

~~~javascript
const tts = require('./universal_tts').create({
  Pebble,
  onError: err => console.log('TTS: ' + err.message),
  onComplete: () => console.log('Audio transfer finished')
});

tts.speak('Hello from Pebble!');
// tts.stop(); // optional cancellation
~~~

No provider names or credentials are passed into speak(). The returned Promise indicates that the transfer **started**, not that the speaker playback completed. The onComplete callback means the encoded transfer finished; watch-side playback may continue briefly.

To receive a request from the watch:

~~~javascript
Pebble.addEventListener('appmessage', event => {
  const msg = event.payload || {};
  if (tts.handleMessage(msg)) return;
  if (msg.COMMAND === 'SPEAK_REQUEST') tts.speak(String(msg.TEXT || ''));
});
~~~

### 3. Watch-side native receiver

~~~c
#include "universal_tts.h"

// Initialization:
universal_tts_init();
app_message_register_inbox_received(inbox_received);
app_message_open(4096, 256); // audio AppMessages can exceed 700 bytes

// In inbox_received:
if (universal_tts_handle_message(iterator)) return;

// On shutdown:
universal_tts_deinit();
~~~

Check universal_tts_supported() before offering a voice UI. To trigger speech from C, send COMMAND="SPEAK_REQUEST" and TEXT="the phrase" to PKJS using normal AppMessage; your app's PKJS then calls tts.speak(). The phone-side plugin cannot directly drive the watch speaker, so the native C module is required.

**Complete example:** [Hello Speech watchapp](examples/hello-speech/) includes a SELECT-button watch and PKJS code. Copy in the three reusable SDK files before building. A watchface can use identical code with its own event trigger; do not announce continuously every minute.

Pebble's plugin API is a phone-side preview; see [Pebble plugin development](https://developer.repebble.com/guides/plugins/preview/). Enable the preview, install Universal TTS and configure a provider on the phone.

## TTS providers (chosen by user, not app)

| Provider | User configuration |
| --- | --- |
| Google Cloud Text-to-Speech | API key, WaveNet / Neural2 / Chirp voice |
| Gemini TTS | Google AI Studio key, TTS model, voice |
| ElevenLabs | API key, model and voice ID (PCM permission may depend on account) |
| Microsoft Azure Speech | Speech key, region, voice |
| Home Assistant / Piper | Private-LAN HA URL, long-lived token, WAV-capable TTS entity |

The provider's credentials are stored in Pebble secureStorage and are never returned to the consuming app. The speech text may be transmitted to the selected provider and incur charges. There is no automatic failover to another service.

**OpenAI deprecation:** OpenAI is retiring the old tts-1, tts-1-hd and gpt-4o-mini-tts Speech models on **January 6, 2027** and recommends gpt-realtime-2.1-mini via the Realtime API. The obsolete Speech endpoint is **not present in Universal TTS**. A future Realtime adapter would be a new implementation. [Official retirement notice](https://developers.openai.com/api/docs/deprecations). Amazon Polly is not implemented.

## Public plugin API v1

The JS SDK hides the four low-level actions:

| Action | Arguments | Result |
| --- | --- | --- |
| tts_prepare | {text} or {test_tone:true} | Verified 8kHz mono PCM16 WAV session, first chunk and checksums |
| tts_chunk | {session_id, offset} | Verified base64 chunk; offset aligned to 6000 bytes |
| tts_release | {session_id} | Frees the session |
| tts_status | {} | Configured flag, provider, voice, format, sample rate and API version |

All responses are JSON encoded in result.text. Only two permissions are declared: UniversalTtsSpeak (exfiltrating) and UniversalTtsRead (read). Callers cannot override the user's provider or voice. Speech text is limited to 500 characters **per prepared segment**; the SDK automatically segments longer text and queues/prefetches it. Sessions have a three-minute TTL and are bounded to three concurrent sessions.

**SDK public JS API:** create({Pebble, storage?, onError?, onComplete?, onStats?}) returns {speak(text), stop(), handleMessage(payload), diagnostics()}. Optional local storage contains diagnostic data, not credentials.

**SDK native API:** universal_tts_init, universal_tts_deinit, universal_tts_stop, universal_tts_supported, universal_tts_handle_message, universal_tts_set_volume, universal_tts_is_playing.

Audio uses a verified canonical WAV format followed by phone-side IMA-ADPCM encoding for Bluetooth; the watch decodes and plays the audio. Watch hardware without a speaker cannot output speech. Home Assistant currently requires a TTS engine that returns WAV; MP3/Opus is rejected instead of producing audio noise.

## Builds and tests

GitHub Actions tests the five provider adapters using synthetic responses, the general SDK audio transfer, session integrity, permissions and settings UI, and packages the .pbw. Successful main builds produce a single [direct install PBW](https://raw.githubusercontent.com/ericlmccormick/Pebble-Universal-TTS/builds/previews/Universal_TTS_plugin.pbw) in builds/previews, with no ZIP extraction.

Automated tests do not guarantee live provider authorization, sound quality, or playback on each Pebble model. SDK files are MIT licensed (sdk/LICENSE).
