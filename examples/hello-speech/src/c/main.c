#include <pebble.h>
#include "universal_tts.h"

static Window *s_window;
static TextLayer *s_message;

static void inbox_received(DictionaryIterator *iter,void *context){
  // Feed all incoming audio packets to Universal TTS first.
  if(universal_tts_handle_message(iter))return;
  (void)context;
}

static void select_click_handler(ClickRecognizerRef recognizer,void *context){
  (void)recognizer;(void)context;
  if(!universal_tts_supported())return;
  DictionaryIterator *out=NULL;
  if(app_message_outbox_begin(&out)!=APP_MSG_OK || !out)return;
  dict_write_cstring(out,MESSAGE_KEY_COMMAND,"SPEAK_REQUEST");
  dict_write_cstring(out,MESSAGE_KEY_TEXT,"Hello from Pebble!");
  app_message_outbox_send();
}

static void click_config_provider(void *context){
  (void)context;
  window_single_click_subscribe(BUTTON_ID_SELECT,select_click_handler);
}

static void init(void){
  universal_tts_init();
  s_window=window_create();
  Layer *root=window_get_root_layer(s_window);
  s_message=text_layer_create(layer_get_bounds(root));
  text_layer_set_text_alignment(s_message,GTextAlignmentCenter);
  text_layer_set_overflow_mode(s_message,GTextOverflowModeWordWrap);
  text_layer_set_text(s_message,universal_tts_supported()?
    "Press SELECT to speak":"This watch has no speaker");
  layer_add_child(root,text_layer_get_layer(s_message));
  window_set_click_config_provider(s_window,click_config_provider);
  app_message_register_inbox_received(inbox_received);
  // >700-byte incoming ADPCM chunks plus dictionary overhead.
  app_message_open(4096,256);
  window_stack_push(s_window,true);
}

static void deinit(void){
  universal_tts_deinit();
  text_layer_destroy(s_message);
  window_destroy(s_window);
}

int main(void){
  init();
  app_event_loop();
  deinit();
}
