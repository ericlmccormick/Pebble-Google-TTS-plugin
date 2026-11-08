# Universal TTS — Pebble phone plugin

**Version 1.0.0**. Universal TTS provides one text-to-speech interface for multiple TTS engines, with reusable audio playback SDKs for Pebble watch applications.

**Plugin UUID (unchanged):** 2c5edc42-b096-4f76-b284-1f27907e6502

This expands the existing Google TTS plugin while **preserving the same UUID, original Google credentials, original actions and original SDK files**, so apps already using Google TTS can continue unchanged.

## Supported providers

| Provider | Audio conversion | Configuration | Notes |
| --- | --- | --- | --- |
| Google Cloud TTS | LINEAR16 WAV to 8kHz | Cloud API key, voice | WaveNet, Neural2, Chirp3 HD |
| Gemini TTS | base64 PCM to 8kHz | Google AI Studio key, voice/model | Preview; defaults to gemini-2.5-flash-preview-tts |
| ElevenLabs | binary PCM16 to 8kHz | API key, voice ID/model | PCM entitlement may vary by subscription |
| Microsoft Azure Speech | WAV 8kHz | Azure Speech key, region, voice | Native 8kHz WAV |
| Home Assistant / Piper | REST and WAV | LAN URL, long-lived token, TTS entity | Requires engine to output WAV |
| OpenAI Speech (temporary) | binary PCM 24kHz to 8kHz | OpenAI API key, model/voice | **Legacy API shuts down Jan 6, 2027** |

Not yet implemented: AWS Polly (requires AWS SigV4 signing), OpenAI Realtime adapter (requires session/WebSocket or WebRTC integration), automatic provider fallback, and arbitrary external HA hostnames.

## OpenAI speech deprecation — January 6, 2027

On October 1, 2026, OpenAI announced its tts-1, tts-1-hd, gpt-4o-mini-tts and specified snapshots will shut down on **January 6, 2027**. Its replacement is **gpt-realtime-2.1-mini using the Realtime API**; that model **cannot** be called using the old /v1/audio/speech endpoint.

This plugin's OpenAI integration uses the **legacy Speech API only** as a temporary option, with a prominent notice in settings. It will not automatically become a Realtime integration. Please choose a different default for long-term use.

Official notice: https://developers.openai.com/api/docs/deprecations

## Compatible plugin action API

Plugin ID: 2c5edc42-b096-4f76-b284-1f27907e6502

Original action names, still supported:
- tts_prepare
- tts_chunk
- tts_release
- get_config

New generic aliases:
- universal_prepare
- universal_chunk
- universal_release
- universal_config

The new generic aliases use UniversalTtsSpeak / UniversalTtsRead Pebble permissions. The original action names retain GoogleTtsSpeak / GoogleTtsRead.

**Prepare** accepts text, optional provider and voice, or test_tone; text is limited to 500 characters. Example:
~~~json
{"text":"Hello from Pebble!","provider":"gemini","voice":"Kore"}
~~~
Omit provider and voice to use the user's configured defaults. The result is JSON under result.text with session_id, length, chunk_bytes=6000, format=pcm_s16le_wav, sample_rate=8000, channels=1, bits_per_sample=16, sample_count, wav_checksum, first_chunk, first_chunk_checksum and audio_diagnostics.

**Chunk** accepts session_id and aligned offset (0, 6000, 12000...), returns base64 audio and a checksum. **Release** deletes a session. **Config** returns the default provider, voice, a list of configured provider flags, and OpenAI sunset metadata; it does **not** expose credentials.

Test tone runs without cloud credentials or billing.

## SDK and migration

New apps should use the reusable sdk/universal_tts_audio.js, sdk/universal_tts_audio.c and sdk/universal_tts_audio.h files. These call generic action names while sharing the stable plugin UUID.

Existing apps may keep sdk/google_tts_audio.js, sdk/google_tts_audio.c and sdk/google_tts_audio.h unchanged. The native C module handles Pebble speaker output; the JS module assembles verified WAV chunks and encodes IMA-ADPCM over AUDIO_* AppMessages. Do not mix with the older Gemini-specific AUDIO_ACK/SEQ watch protocol without an adapter.

The underlying transport was adapted from the [Home Assistant Bridge SDK](https://github.com/ericlmccormick/Pebble-HA-plug-in/tree/main/sdk).

## Settings and privacy

Configure multiple providers, then choose a default. Each provider stores its own API credential in Pebble secureStorage; the credential is never returned to an app. Voice, model, endpoint and region are non-secret settings stored locally.

Provider calls send the text being synthesized to the selected cloud service. Fees and API quotas vary. A clear AI-generated speech disclosure is required by some providers. The audio session transport uses 8kHz mono PCM16 WAV, 6000-byte verified chunks, bounded storage, up to three concurrent sessions and a three-minute timeout.

**Home Assistant:** use a private LAN endpoint (prefer HTTPS) and a long-lived access token. The plugin requests WAV using /api/tts_get_url. If the configured TTS engine returns MP3/Opus, it fails clearly rather than playing damaged audio. The returned absolute media URL is ignored to avoid leaking tokens to another host. Pebble's Internet permission is host-scoped; arbitrary external HA hostnames may need new permissions.

## Build and direct download

GitHub Actions runs JavaScript syntax checks, multi-provider regression tests, settings checks and PBW packaging. Each successful push to main publishes a directly installable **Universal_TTS_plugin.pbw** to the builds/previews branch. No ZIP extraction is needed. The existing plugin UUID stays constant even though its name is now Universal TTS.

The bundled SDK is MIT licensed.
