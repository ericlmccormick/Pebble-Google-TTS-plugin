# Universal TTS logo assets

The source artwork is [../src/icon.svg](../src/icon.svg), converted from the approved transparent speaker, blue sound waves and **TTS** design.

The build generates the following transparent PNGs:

| Name | Size | Usage |
| --- | --- | --- |
| `universal_tts_logo_144.png` | 144×144 | Large Pebble store/site icon |
| `universal_tts_logo_80.png` | 80×80 | Small store/site icon |
| `universal_tts_logo_25.png` | 25×25 | Tiny color icon |
| `universal_tts_logo_25_bw.png` | 25×25 | Monochrome version for watch menu |
 
Use `python3 scripts/render_logos.py` after installing `cairosvg` and `Pillow`. This renders the PNGs and places the 25px monochrome menu resource into the sample watch app `examples/hello-speech/resources/menu_icon.png`.

**Plugin-only note:** Universal TTS itself runs on the phone and does not have a watch launcher entry. Consequently, `menuIcon: true` is set on the **Hello Speech example watchapp**, not on the plugin-only `package.json`. Developers may copy the 25×25 resource into watch apps that use the Universal TTS SDK.

The CI build commits the generated PNGs into this folder and also publishes direct-download PNG files at `builds/previews/logos/`. No changes to the TTS API or SDK are necessary.
