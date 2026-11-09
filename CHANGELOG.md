# Release notes

## 0.1.0 — Initial release candidate (2026-11-08)

Universal TTS is a provider-independent speech plugin for compatible Pebble watches.

- Supports 12 TTS provider adapters: Google Cloud, Gemini, ElevenLabs, Azure Speech, Home Assistant, Deepgram Aura, Cartesia Sonic, Speechify, Smallest AI, Inworld AI, Rime Coda, and Fish Audio.
- Users configure credentials, models and voices centrally. Live catalog lookup is available where the service exposes it; unsupported catalogs retain manual ID entry.
- Standardized four-action plugin interface with a reusable three-file JavaScript/C playback SDK. Consumer apps call `tts.speak(text)`.
- Normalizes decoded speech to 8 kHz mono PCM16 WAV, validates chunk checksums, and streams IMA-ADPCM to supported watches.
- Keeps user credentials in Pebble secure storage and does not return them to calling apps.
- Includes example watchapp, developer documentation and automatic CI packaging of a directly installable PBW.
- Excludes retired OpenAI Speech endpoints; a future Realtime API adapter would require separate work.

**Testing:** Automated provider simulations, manifest verification, transport tests and settings-page syntax checks pass. Live authentication for all providers and playback on physical devices remain to be verified before store submission.

**Branding:** The first-release logo is still being selected. No logo asset is included in the v0.1.0 PBW yet.
