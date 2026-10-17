# SoundCraft — guía profesional (equivale a Pro Tools)

Estación de audio (DAW): pistas, edición, mezcla con plugins, buses, automatización, MIDI e instrumentos, bounce a WAV/AIFF/FLAC con medida de LUFS. Apache-2.0 (github.com/storytold/soundcraft).

## Reglas de la app (verificadas)
- `new_session {name, sample_rate}` (48 kHz para vídeo). **La sesión nueva no tiene pistas**: crea la pista antes de importar: `execute track.new {name:"Voz", format:"mono"|"stereo", kind?}` → luego `import_audio {path, track:"Voz"}`.
- **No hay bus maestro por defecto**. `track.new {kind:"master", format:"stereo"}` lo crea con el nombre `"Master 1"` (ignora `name`): usa el id que devuelve.
- Plugins: `execute mix.insert {track, slot:0..9, plugin, params:{…}}`; parámetros después con `mix.insert_param`. Ids de plugin: `execute engine.plugins {}`.
- Posiciones en muestras, `{"seconds": x}` o `"bars_beats:5|1|000"`. Pistas por nombre o id.
- Comprueba con `inspect_session`. `bounce_mix {path}` devuelve `lufs`, `peak_db` y `true_peak_db`: úsalos para ajustar.
- No hay grabación sin ventana; sí importar, editar, mezclar y exportar.
- El `maximizer` limita picos de MUESTRA: para un pico real ≤ −1 dBTP pon `ceiling: -1.5` (con −1 sale ≈ −0,8 dBTP).
- Los parámetros del plugin van dentro de `params`: `execute mix.insert {track, slot, plugin, params: {…}}`; cambiar uno después: `mix.insert_param {track, slot, param, value}`.
- Ducking: `automation.set_point {track, param: "volume", at: {seconds}, value: dB}` — la automatización manda sobre el fader.
- Para voz/clip/podcast usa la receta fija `masterizar_audio` (cadena + ajuste a −14 LUFS en ≤ 4 vueltas, probada).

## Plugins incluidos (ids)
`eq_7band` (hpf_on/hpf_freq, bandas low/mid/high), `eq_1band`, `compressor` (threshold, ratio, attack, release, knee, makeup, limiter), `expander_gate`, `de_esser`, `maximizer` (threshold, ceiling), `channel_strip` (gate+comp+eq en uno), `room_reverb`, `plate_reverb`, `mod_delay`, `chorus`, `flanger`, `phaser`, `saturator`, `lofi`, `pitch_shifter`, `gain`, `trim`, `dither`; instrumentos `subtractive_synth`, `drum_synth`, `sampler`.

## Receta probada: voz de podcast / clip
```
new_session {"name":"podcast","sample_rate":48000}
execute track.new {"name":"Voz","format":"mono"}
import_audio {"path":"C:/…/voz.wav","track":"Voz"}
execute mix.insert {"track":"Voz","slot":0,"plugin":"eq_7band","params":{"hpf_on":1,"hpf_freq":80}}
execute mix.insert {"track":"Voz","slot":1,"plugin":"compressor","params":{"threshold":-20,"ratio":3,"makeup":4}}
execute track.new {"kind":"master","format":"stereo"}          → id del master
execute mix.insert {"track":<id master>,"slot":0,"plugin":"maximizer","params":{"threshold":-6,"ceiling":-1}}
bounce_mix {"path":"C:/…/mezcla.wav"}   → lee lufs
```
**Llegar a −14 LUFS**: haz un bounce, calcula `dif = −14 − lufs`, sube la voz `execute mix.volume {tracks:["Voz"], db:<dif>}` (o el threshold del maximizer), y repite el bounce hasta ±0,5 LU con `true_peak_db ≤ −1`.

## Estándares profesionales
- Objetivos de sonoridad: TikTok/YouTube/Instagram −14 LUFS, pico real ≤ −1 dBTP; podcast −16 LUFS (estéreo); emisión −23 LUFS.
- Cadena de voz: HPF 80 Hz → (de-esser) → EQ (−2/−4 dB a 200–400 Hz si suena "a caja", +2 dB a 3–5 kHz para presencia) → compresor 3:1, 3–6 dB de reducción → limitador/maximizer en el master.
- Música bajo la voz: −18 a −24 dB respecto a la voz (o ducking por automatización).
- Exporta WAV 48 kHz 24 bits para montar en vídeo; MP3 320 kbps solo para entregar audio final.
- Reverb casi nunca en voz hablada; si se usa, `mix` bajo (10–15 %).

## Checklist
- [ ] `inspect_session` con pistas/plugins esperados; bounce con LUFS y pico dentro del objetivo.
- [ ] Sesión guardada (`save_session`) + WAV; rutas dichas.
