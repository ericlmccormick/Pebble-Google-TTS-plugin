# Hello Speech — minimal Pebble example

This is a reference watchapp demonstrating speech. It is not the Universal TTS plugin itself.

Copy the three files from the root project's `sdk/` directory:

- `sdk/universal_tts.js` → `examples/hello-speech/src/pkjs/universal_tts.js`
- `sdk/universal_tts.c` → `examples/hello-speech/src/c/universal_tts.c`
- `sdk/universal_tts.h` → `examples/hello-speech/src/c/universal_tts.h`

Then build with a plugin-compatible Pebble SDK and install the Universal TTS plugin plus this example. On a watch with a speaker, pressing SELECT speaks **Hello from Pebble!**.

The example shows:

1. The app declares `InvokeAction` and `UniversalTtsSpeak` permissions for Universal TTS's UUID, and AppMessage keys `COMMAND`, `TEXT`, `CHUNK`.
2. The watch includes `universal_tts.h`, calls `universal_tts_init()`, passes received dictionaries to `universal_tts_handle_message()`, and calls `universal_tts_deinit()`.
3. The phone JS creates a speech client, listens for a speech request, and calls `tts.speak(text)`. No provider-specific code or credential appears in the app.

For watchfaces, the exact same three SDK files and AppMessage keys work. Trigger speech via a user action or an event (avoid speaking on every minute tick). A watchface cannot produce sound on hardware without a built-in speaker.
