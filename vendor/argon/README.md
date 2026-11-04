# Argon — 3D Vibe Companion

A single-file, fully offline web app: a furry 3D creature called **Argon** who is
the central orchestrator of the whole system. He has a local brain with **39 real
tools**, a **generative music engine**, **four languages** (English, हिन्दी, தமிழ்,
العربية) with full RTL support, **voice input and output**, **seven moods**, and a
window that resizes from a **180 px pocket orb** all the way to the **full screen**.

Everything — chat, skills, music, voice, scene, language, system — lives behind
**one gear icon**. Nothing else is ever on screen.

---

## Run it

Open `output/argon.html` in any modern browser. That's it.

* No server, no install, no network. three.js r128, the Inter/Noto webfonts and
  every module are inlined into the single file (~1.5 MB).
* Microphone input needs `https://` or `localhost` (browser security), and works
  in Chrome, Edge and Safari. Firefox has no Speech Recognition — the text chat
  still works there.
* Add `?lite=1` to force the light WebGL coat (26k strands instead of 60k). Argon
  detects software rasterisers (SwiftShader, llvmpipe) and switches to lite on
  its own.

---

## What's inside

### 1. A window, not a page

`#argon-frame` is a floating, resizable window inside the browser viewport.

| Action | Result |
| --- | --- |
| Drag the chrome bar | Move the window anywhere |
| Drag any edge or corner | Resize freely (min 200×160) |
| Double-click the chrome bar | Toggle **pocket** ⇄ full size |
| Gear → System → Window | Presets: Pocket, Compact, Half, Wide, Full |
| Gear → System → Fullscreen | Real browser fullscreen |

Geometry is saved to `localStorage`, so Argon comes back the way you left him.
In **pocket** mode the chrome and the deck disappear and Argon becomes a small
circular companion with his current mood showing underneath.

### 2. One gear, every feature

The gear opens the **Control Deck** — a frosted-glass overlay with seven panes
that floats over the live 3D scene:

| Pane | What lives there |
| --- | --- |
| **Chat** | Transcript, command input, mic, hands-free toggle, quick chips, mood strip, vibe slider |
| **Skills** | All 39 tools as cards with localised descriptions, a **Run** button on each, and a live orchestration trace |
| **Music** | Player, spectrum visualiser, volume/tempo/space, 8 generative stations, local-file playback, Auto-DJ |
| **Voice** | Mic meter, listen-once, hands-free, test voice, TTS on/off, speech speed & pitch, haptics, language picker |
| **Scene** | 6 fur coats, coat physics sliders, root/tip/rim colours, 5 backdrops, GPU-fur toggle, camera reset, boop, dance |
| **Language** | English · हिन्दी · தமிழ் · العربية — switching flips the whole UI to RTL for Arabic |
| **System** | Window presets, reduce-motion, Auto-DJ, live telemetry, export/reset settings |

### 3. Argon is the heart — 39 real tools

The brain in `build/60-brain.js` is a local orchestrator: utterance → scored
intent → plan → execution → spoken reply. There is no model and no network.

Every tool is **mechanically wired**. A skill that only appears in a list would
be decoration; every one of these changes the running system:

*Fur* — `fur.coat` `fur.tint` `fur.style` `fur.params`
*Vibing* — `vibe.level` `vibe.dance` `vibe.boop` `vibe.pet` `mood.set`
*Music* — `music.play` `music.pause` `music.next` `music.prev` `music.volume` `music.tempo` `music.dj`
*Voice* — `voice.language` `voice.tts` `voice.rate` `voice.pitch` `voice.listen` `voice.live` `voice.say`
*Window* — `window.size` `window.fullscreen` `display.backdrop` `display.gpufur`
*Utility* — `util.time` `util.date` `util.math` `util.convert` `util.status` `util.rename` `util.help` `util.export`
*Social* — `social.greet` `social.thanks` `social.joke` `social.who`

**Multi-step orchestration.** Argon chains tools. *"Play lo-fi and set mood to
calm"* runs `music.play` **and** `mood.set` in one breath, and the Skills pane
shows the trace of what fired.

**Four-language routing.** Each tool carries keywords in all four languages, so
*"लो-फाई चलाओ"*, *"லோஃபி வாசி"* and *"شغل لوفي"* all reach the same tool.
Matching is word-boundary aware (so "hi" doesn't fire inside "chip") and
Unicode-safe — combining marks are preserved, otherwise every Tamil and
Devanagari word gets shredded.

### 4. Seven moods

`playful · calm · focused · cosmic · mischief · sleepy · hyper`

Switching a mood retunes the **whole system at once**: fur coat, vibe energy,
voice pitch and rate, Auto-DJ station and Argon's tone of voice.

### 5. A music engine that writes its own songs

No audio files. `build/80-music.js` is a small deterministic sequencer that
synthesises every note in the browser: pad, bass, arpeggio, drums, convolution
reverb and a delay bus, driven by a 25 ms look-ahead scheduler.

Eight stations, each with its own scale, progression, drum pattern and patch:
Lo-Fi Nebula, Synthwave Pulse, Ambient Rain, Bollywood Groove, Tamil Cinema,
Celtic Drone, Deep Bass House, Zen Bells. Every station has three track
variations, so next/prev is meaningful. You can also drop in your own audio file.

**Argon feels the music.** The analyser feeds a beat-energy signal into the fur
uniforms and the body animation, so he bounces with the kick drum.

### 6. Voice

* **In** — Web Speech recognition, per-language (`en-US`, `hi-IN`, `ta-IN`,
  `ar-SA`), push-to-talk or hands-free with a *"hey argon"* wake phrase.
* **Out** — Web Speech synthesis with a per-language voice and mood-adjusted
  pitch/rate. A syllable envelope drives the mouth and fur even when no voice
  exists, so Argon always "talks".
* Microphone metering, haptics via `navigator.vibrate`, and a clear fallback
  notice when the browser lacks a capability.

### 7. Vibing

Argon's fur reacts to your cursor speed, to speech energy, to the music beat and
to the vibe slider (0–100 %). The vibe level also changes wind strength, bounce
amplitude, blink rate and brightness. Pet him by dragging across his fur, boop
him by clicking, and send him into a dance spin.

---

## Rebuilding

The HTML is **assembled**, not hand-edited. Source of truth is `build/`:

```
build/
  01-app.css       design system (glass, RTL-aware, logical properties)
  20-body.html     markup shell
  30-i18n.js       four language packs + t()/t4() helpers
  40-core.js       state, persistence, event bus, moods
  50-tools.js      the 39-tool registry + multilingual keyword tables
  60-brain.js      intent scoring, planning, execution, reply composition
  70-voice.js      recognition, synthesis, metering, wake word
  80-music.js      generative sequencer
  90-scene.js      3D creature, fur shaders, GPGPU physics, render loop
  95-shell.js      resizable frame, control deck, all UI wiring
  make.py          assembler
```

```bash
python3 build/make.py            # -> output/argon.html
python3 build/make.py --mock     # -> output/argon-mock.html  (no WebGL, fast UI iteration)
```

`make.py` inlines `vendor/three.min.js` and `build/fonts-inline.css` (Inter +
Noto Sans Devanagari / Tamil / Arabic, base64 woff2) so the result has **zero
runtime dependencies**.

Edit the modules, not `output/argon.html` — editing the output directly loses
the next rebuild.

---

## Browser support

| | |
| --- | --- |
| Chrome / Edge / Safari | Everything, including speech recognition |
| Firefox | Everything except speech recognition (text chat works) |
| Mobile | Works; hands-free and haptics behave best on Android |
| WebGL2 required | Argon shows a friendly message if the GPU is unavailable |

## Privacy

Argon is entirely local. No telemetry, no API keys, no network calls, no
analytics. The only storage is `localStorage` for your settings, and settings
can be exported or wiped from **System → Export / Reset**.
