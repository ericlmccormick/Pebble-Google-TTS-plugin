# Universal TTS for Pebble

**One speech API for Pebble watch apps and watchfaces.** Apps send text, and Universal TTS chooses the user's configured provider. Watch apps never store provider keys, talk directly to vendor APIs, or implement resampling/audio transfer.

Plugin UUID: **2c5edc42-b096-4f76-b284-1f27907e6502**. Version: **0.1.0** (initial release candidate).

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

## TTS providers and live voice/model discovery

The first release supports **twelve** REST-based synthesis providers. All of them feed the same verified 8 kHz WAV/ADPCM watch transport; consumers still call only `tts.speak(text)`.

| Provider | Live voice lookup | Live model lookup | Notes |
| --- | --- | --- | --- |
| Google Cloud TTS | GET /v1/voices | Not applicable | API key, voice; Google's voice name identifies family |
| Gemini TTS | Not published | GET /v1beta/models (filtered for TTS) | API key, prebuilt voice entered manually |
| ElevenLabs | GET /v1/voices | GET /v1/models | API key; voice IDs; PCM access may depend on plan |
| Microsoft Azure Speech | GET /cognitiveservices/voices/list | Not applicable | Region-specific Azure Speech key |
| Home Assistant / Piper | GET /api/states filtered to tts entities | Not applicable | HA token and LAN URL; requires WAV-capable engine |
| Deepgram Aura | GET /v1/models filtered to Aura REST TTS | Not applicable | Voice name is the Aura model ID; Flux WebSocket not included |
| Cartesia Sonic | GET /voices (paged) | GET /models | Authenticated API-key requests with Cartesia-Version header |
| Speechify | GET /v1/voices (paged) | GET /v1/audio/models | Workspace-specific available voices/models |
| Smallest AI | Model-specific GET /get_voices | No separate model registry | Use Lightning v3.1 Pro and a matching voice |
| Inworld AI | GET /voices/v1/voices (paged) | Not published | Basic API credential copied from Inworld Portal |
| Rime Coda | Public Rime voice catalog (updated by Rime) | Coda REST only | Set voice and its language; Mist v3 needs another adapter |
| Fish Audio | GET /model (paged voice library) | No synthesis-engine list endpoint | API key, optional voice-model ID, synthesis engine ID |

**Live lookups are settings-only**, not exposed to consuming apps. Select a provider, save its API key/token, then choose **Browse live choices**. Configured providers also try to load their catalogs automatically on selection. Choose from the dropdown or enter IDs manually. The plugin normalizes returned IDs/names, pages voice lists, and indicates clearly when a service does not publish a model or voice listing API. Catalogs are not billed as synthesis calls (provider API quotas may apply).

### Provider API notes

- **Credentials stay in Pebble.secureStorage**. The voice/model discovery response only contains IDs and labels; it never contains credentials.
- **Provider choice remains user-controlled**. A consuming app cannot request a specific provider/voice via the public action; no cross-provider silent failover occurs.
- **Model retirement:** Smallest AI's Standard Lightning v3.1 retires November 30, 2026; Pro is the recommended default. Rime's retired Arcana and Mist v1/v2 models are not supported. Speechify's older Simba 1.6 models are also being retired. Model availability is always confirmed by the provider, not guaranteed by placeholder defaults.
- **Format limits:** Deepgram Aura REST is supported, but Flux requires WebSockets. Home Assistant TTS output must be WAV. Other added adapters request native WAV or PCM and resample to 8 kHz.
- **OpenAI:** Older tts-1, tts-1-hd and gpt-4o-mini-tts Speech models are scheduled for shutdown on January 6, 2027. They are deliberately not included. OpenAI's replacement gpt-realtime-2.1-mini requires a separate Realtime adapter. [Official retirement notice](https://developers.openai.com/api/docs/deprecations).
- **Not implemented:** OpenAI Realtime requires a separate session/streaming adapter, and Amazon Polly requires AWS request signing. Resemble AI's former hosted generative voice products have moved to a research archive and are no longer offered as commercial paid products; its historical hosted TTS API is deliberately excluded. These should not be presented as working provider choices.

Discovery and synthesis use fixed, documented provider hosts. The only configurable host is Home Assistant, validated as a LAN address or HTTPS URL. Keys are never included in normal plugin status responses.

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

GitHub Actions tests all twelve provider adapters and their discovery endpoints using synthetic responses, the general SDK audio transfer, session integrity, permissions and settings UI, and packages the .pbw. Successful main builds produce a single [direct install PBW](https://raw.githubusercontent.com/ericlmccormick/Pebble-Universal-TTS/builds/previews/Universal_TTS_plugin.pbw) in builds/previews, with no ZIP extraction.

Automated tests do not guarantee live provider authorization, sound quality, or playback on each Pebble model. SDK files are MIT licensed (sdk/LICENSE).
