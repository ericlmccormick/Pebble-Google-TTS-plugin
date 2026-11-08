/* Universal TTS Bridge reusable watch audio SDK v1. MIT License.
 * Copy universal_tts_audio.h and universal_tts_audio.c to src/c.
 * The app owns AppMessage registration; pass received dictionaries to
 * universal_tts_audio_handle_message(). No Home Assistant credentials on the watch.
 */
#ifndef UNIVERSAL_TTS_BRIDGE_AUDIO_H
#define UNIVERSAL_TTS_BRIDGE_AUDIO_H
#include <pebble.h>
void universal_tts_audio_init(void);
void universal_tts_audio_deinit(void);
void universal_tts_audio_stop(void);
bool universal_tts_audio_handle_message(DictionaryIterator *iterator);
void universal_tts_audio_set_volume(float volume);
bool universal_tts_audio_is_playing(void);
#endif
