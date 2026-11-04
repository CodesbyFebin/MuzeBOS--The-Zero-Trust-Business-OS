/* ==========================================================================
   ARGON — GENERATIVE MUSIC ENGINE
   A small deterministic sequencer that synthesises every note in the browser.
   No audio files, no network: each station is a set of musical rules that
   produce an endless, never-repeating arrangement.
   ========================================================================== */

const SCALES = {
  minor:     [0, 2, 3, 5, 7, 8, 10],
  minor9:    [0, 2, 3, 5, 7, 8, 10, 14],
  dorian:    [0, 2, 3, 5, 7, 9, 10],
  mixolydian:[0, 2, 4, 5, 7, 9, 10],
  pentaMin:  [0, 3, 5, 7, 10],
  harmMinor: [0, 2, 3, 5, 7, 8, 11],
  lydian:    [0, 2, 4, 6, 7, 9, 11],
  major:     [0, 2, 4, 5, 7, 9, 11]
};

/** Station definitions — each one is a tiny world with its own rules. */
const STATION_DEFS = {
  lofi: {
    bpm: 82, root: 45, scale: 'minor9', drums: 'soft',
    progression: [[0, 'min'], [5, 'maj'], [3, 'maj'], [4, 'min']],
    patch: { pad: 'triangle', bass: 'sine', arp: 'sine', cutoff: 900, arpRate: 4, padGain: 0.16, arpGain: 0.10, swing: 0.14 }
  },
  synth: {
    bpm: 104, root: 45, scale: 'minor', drums: 'four',
    progression: [[0, 'min'], [0, 'min'], [5, 'maj'], [6, 'maj']],
    patch: { pad: 'sawtooth', bass: 'sawtooth', arp: 'square', cutoff: 2200, arpRate: 2, padGain: 0.13, arpGain: 0.09, swing: 0 }
  },
  ambient: {
    bpm: 62, root: 41, scale: 'lydian', drums: 'none',
    progression: [[0, 'maj'], [4, 'maj'], [2, 'min'], [5, 'maj']],
    patch: { pad: 'sine', bass: 'sine', arp: 'sine', cutoff: 700, arpRate: 8, padGain: 0.24, arpGain: 0.05, swing: 0 }
  },
  bollywood: {
    bpm: 100, root: 46, scale: 'pentaMin', drums: 'tribal',
    progression: [[0, 'min'], [4, 'maj'], [0, 'min'], [3, 'maj']],
    patch: { pad: 'triangle', bass: 'triangle', arp: 'square', cutoff: 2600, arpRate: 2, padGain: 0.15, arpGain: 0.11, swing: 0.08 }
  },
  tamil: {
    bpm: 108, root: 45, scale: 'mixolydian', drums: 'tribal',
    progression: [[0, 'min'], [3, 'maj'], [4, 'maj'], [0, 'min']],
    patch: { pad: 'sawtooth', bass: 'triangle', arp: 'triangle', cutoff: 2400, arpRate: 2, padGain: 0.14, arpGain: 0.11, swing: 0.06 }
  },
  drone: {
    bpm: 76, root: 38, scale: 'dorian', drums: 'none',
    progression: [[0, 'min'], [0, 'min'], [5, 'maj'], [0, 'min']],
    patch: { pad: 'sawtooth', bass: 'sine', arp: 'triangle', cutoff: 620, arpRate: 4, padGain: 0.22, arpGain: 0.07, swing: 0 }
  },
  house: {
    bpm: 126, root: 43, scale: 'minor', drums: 'four',
    progression: [[0, 'min'], [5, 'maj'], [3, 'maj'], [4, 'min']],
    patch: { pad: 'sawtooth', bass: 'square', arp: 'sawtooth', cutoff: 1800, arpRate: 1, padGain: 0.12, arpGain: 0.10, swing: 0 }
  },
  zen: {
    bpm: 58, root: 48, scale: 'major', drums: 'none',
    progression: [[0, 'maj'], [3, 'maj'], [4, 'maj'], [0, 'maj']],
    patch: { pad: 'sine', bass: 'sine', arp: 'triangle', cutoff: 1600, arpRate: 8, padGain: 0.22, arpGain: 0.09, swing: 0 }
  }
};

/** Per-station track variations — next/prev moves between these. */
const STATION_TRACKS = {
  lofi:      ['Dawn Drift', 'Midnight Tape', 'Slow Orbit'],
  synth:     ['Neon Toll', 'Chrome Rain', 'Vector Heart'],
  ambient:   ['First Rain', 'Long Hallway', 'Grey Sky'],
  bollywood: ['Spice Route', 'Night Bazaar', 'Nine Beats'],
  tamil:     ['Kovil Light', 'Colours of Madurai', 'Chandra Reply'],
  drone:     ['Stone Circle', 'Green Valley', 'High Fog'],
  house:     ['Sub Level', 'Basement Bloom', 'Four to the Floor'],
  zen:       ['Morning Bowl', 'Stone Garden', 'Slow Bell']
};

const Music = (() => {
  let ctx = null;
  let master = null;
  let analyser = null;
  let comp = null;
  let reverbSend = null;
  let convolver = null;
  let delayNode = null;
  let delaySend = null;
  let freqData = null;

  let stationId = 'lofi';
  let trackIndex = 0;
  let playing = false;
  let timer = null;
  let nextNoteTime = 0;
  let step = 0;
  let beatCounter = 0;
  let bpm = 82;
  let volume = 55;
  let reverbAmount = 40;
  let rngSeed = 20260101;

  function rnd() {
    rngSeed = (rngSeed * 1664525 + 1013904223) % 4294967296;
    return rngSeed / 4294967296;
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();

    master = ctx.createGain();
    master.gain.value = 0.0001;

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    freqData = new Uint8Array(analyser.frequencyBinCount);

    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2.6, 2.4);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = reverbAmount / 100 * 0.55;
    reverbSend.connect(convolver);
    convolver.connect(comp);

    delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = 0.34;
    delaySend = ctx.createGain();
    delaySend.gain.value = 0.22;
    delaySend.connect(delayNode);
    delayNode.connect(comp);
    delayNode.connect(reverbSend);

    comp.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);
    return ctx;
  }

  function makeImpulse(context, seconds, decay) {
    const rate = context.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = context.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scaleNote(def, degree, octave) {
    const scale = SCALES[def.scale];
    const idx = ((degree % scale.length) + scale.length) % scale.length;
    const oct = Math.floor(degree / scale.length) + (octave || 0);
    return def.root + scale[idx] + oct * 12;
  }

  function chordNotes(def, degree, quality) {
    const third = quality === 'maj' ? 2 : 3;
    const base = scaleNote(def, degree, 0);
    return [base, base + third, base + 7];
  }

  /* ---- Voices ------------------------------------------------------------ */

  function playPad(def, notes, time, dur) {
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(def.patch.cutoff * 0.5, time);
    filt.frequency.linearRampToValueAtTime(def.patch.cutoff, time + dur * 0.4);
    filt.frequency.linearRampToValueAtTime(def.patch.cutoff * 0.55, time + dur);
    filt.Q.value = 1.1;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(def.patch.padGain, time + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    g.connect(filt);
    filt.connect(master);
    filt.connect(reverbSend);

    notes.forEach((n, i) => {
      const o = ctx.createOscillator();
      o.type = def.patch.pad;
      o.frequency.value = midiToFreq(n);
      o.detune.value = (i - 1) * 7 + (rnd() * 5 - 2.5);
      o.connect(g);
      o.start(time);
      o.stop(time + dur + 0.05);
    });
  }

  function playBass(def, note, time, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = def.patch.bass;
    o.frequency.setValueAtTime(midiToFreq(note), time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.30, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(master);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  function playArp(def, note, time, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = midiToFreq(note) * 1.4;
    filt.Q.value = 1.6;
    o.type = def.patch.arp;
    o.frequency.value = midiToFreq(note);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(def.patch.arpGain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(filt);
    filt.connect(g);
    g.connect(master);
    g.connect(delaySend);
    g.connect(reverbSend);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  function noiseBuffer(dur) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playKick(time) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(132, time);
    o.frequency.exponentialRampToValueAtTime(44, time + 0.11);
    g.gain.setValueAtTime(0.55, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    o.connect(g);
    g.connect(master);
    o.start(time);
    o.stop(time + 0.34);
    signals.beatEnergy = 1;
  }

  function playSnare(time) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.22);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1900;
    filt.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.26, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    src.connect(filt); filt.connect(g); g.connect(master); g.connect(reverbSend);
    src.start(time);
    src.stop(time + 0.2);
    signals.beatEnergy = Math.max(signals.beatEnergy, 0.6);
  }

  function playHat(time, open) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(open ? 0.16 : 0.06);
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(open ? 0.11 : 0.07, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + (open ? 0.15 : 0.05));
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(time);
    src.stop(time + 0.17);
  }

  /* ---- Sequencer --------------------------------------------------------- */

  function scheduleStep(def, time, stepIndex, bar) {
    const stepInBar = stepIndex % 16;
    const swing = (stepInBar % 2 === 1) ? def.patch.swing * 0.5 : 0;
    const at = time + swing;

    // Chord pad on the downbeat of every bar
    if (stepInBar === 0) {
      const deg = def.progression[bar % def.progression.length];
      const notes = chordNotes(def, deg[0], deg[1]);
      playPad(def, notes, at, (60 / bpm) * 4 * 0.98);
    }

    // Bass — root on beats, occasional fifth
    if (stepInBar % 4 === 0) {
      const deg = def.progression[bar % def.progression.length];
      const rootNote = scaleNote(def, deg[0], 0);
      playBass(def, rootNote, at, (60 / bpm) * 0.9);
      if (stepInBar === 8 && rnd() > 0.6) {
        playBass(def, rootNote + 7, at, (60 / bpm) * 0.5);
      }
    }

    // Arpeggio
    const arpEvery = 16 / def.patch.arpRate;
    if (stepIndex % arpEvery === 0) {
      const deg = def.progression[bar % def.progression.length];
      const oct = rnd() > 0.72 ? 2 : 1;
      const note = scaleNote(def, deg[0], oct);
      playArp(def, note, at, (60 / bpm) * (arpEvery / 4) * 0.9);
    }

    // Drums
    if (def.drums === 'four') {
      if (stepInBar % 4 === 0) playKick(at);
      if (stepInBar === 4 || stepInBar === 12) playSnare(at);
      if (stepInBar % 2 === 0) playHat(at, false);
    } else if (def.drums === 'soft') {
      if (stepInBar === 0 || stepInBar === 10) playKick(at);
      if (stepInBar === 8) playSnare(at);
      if (stepInBar % 4 === 2) playHat(at, false);
    } else if (def.drums === 'tribal') {
      if (stepInBar === 0 || stepInBar === 6 || stepInBar === 10) playKick(at);
      if (stepInBar === 4 || stepInBar === 12) playSnare(at);
      if (stepInBar % 2 === 0) playHat(at, stepInBar % 4 === 2);
    }
  }

  function scheduler() {
    if (!ctx || !playing) return;
    const def = STATION_DEFS[stationId];
    const stepDur = 60 / bpm / 4;
    while (nextNoteTime < ctx.currentTime + 0.12) {
      scheduleStep(def, nextNoteTime, step, Math.floor(step / 16));
      nextNoteTime += stepDur;
      step = (step + 1) % 64;
      beatCounter++;
    }
  }

  function start() {
    const c = ensure();
    if (!c) return false;
    playing = true;
    signals.musicPlaying = true;
    state.musicPlaying = true;
    rngSeed = 20260101 + trackIndex * 7919;
    step = 0;
    nextNoteTime = c.currentTime + 0.06;
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setValueAtTime(0.0001, c.currentTime);
    master.gain.linearRampToValueAtTime(volume / 100 * 0.85, c.currentTime + 0.6);
    if (timer) clearInterval(timer);
    timer = setInterval(scheduler, 25);
    bus.emit('music:changed');
    return true;
  }

  function pause() {
    if (!ctx) return;
    playing = false;
    signals.musicPlaying = false;
    state.musicPlaying = false;
    if (timer) { clearInterval(timer); timer = null; }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    bus.emit('music:changed');
  }

  function stop() {
    pause();
    step = 0;
  }

  function play(id, track) {
    if (id && STATION_DEFS[id]) {
      stationId = id;
      state.musicStation = id;
    }
    if (typeof track === 'number') {
      trackIndex = ((track % 3) + 3) % 3;
      state.musicTrack = trackIndex;
    }
    const wasPlaying = playing;
    if (wasPlaying) pause();
    start();
    saveState();
    bus.emit('music:changed');
    bus.emit('music:track', trackTitle());
  }

  function setVolume(v) {
    volume = clamp(Number(v) || 0, 0, 100);
    state.musicVolume = volume;
    if (ctx && master) {
      const target = playing ? volume / 100 * 0.85 : 0.0001;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.12);
    }
    saveState();
    bus.emit('music:changed');
  }

  function setBpm(v) {
    bpm = clamp(Number(v) || 82, 50, 150);
    state.musicBpm = bpm;
    saveState();
    bus.emit('music:changed');
  }

  function setReverb(v) {
    reverbAmount = clamp(Number(v) || 0, 0, 100);
    state.musicReverb = reverbAmount;
    if (ctx && reverbSend) reverbSend.gain.value = reverbAmount / 100 * 0.55;
    saveState();
    bus.emit('music:changed');
  }

  function trackTitle() {
    const list = STATION_TRACKS[stationId] || STATION_TRACKS.lofi;
    return list[trackIndex] || list[0];
  }

  function next() {
    trackIndex = (trackIndex + 1) % 3;
    state.musicTrack = trackIndex;
    if (playing) play(stationId, trackIndex);
    bus.emit('music:track', trackTitle());
    return { title: trackTitle(), station: stationId };
  }

  function prev() {
    trackIndex = (trackIndex + 2) % 3;
    state.musicTrack = trackIndex;
    if (playing) play(stationId, trackIndex);
    bus.emit('music:track', trackTitle());
    return { title: trackTitle(), station: stationId };
  }

  /** 16-band spectrum for the visualiser. */
  function spectrum() {
    if (!analyser) return null;
    analyser.getByteFrequencyData(freqData);
    return freqData;
  }

  /** Local file playback — real decoding, routed through the same analyser. */
  let localAudio = null;
  let localURL = null;
  function playLocal(file) {
    const c = ensure();
    if (!c || !file) return false;
    if (localURL) URL.revokeObjectURL(localURL);
    localURL = URL.createObjectURL(file);
    if (!localAudio) {
      localAudio = new Audio();
      localAudio.crossOrigin = 'anonymous';
    }
    localAudio.src = localURL;
    localAudio.volume = volume / 100;
    localAudio.loop = true;
    const src = c.createMediaElementSource(localAudio);
    src.connect(master);
    localAudio.play().then(() => {
      playing = true;
      signals.musicPlaying = true;
      state.musicPlaying = true;
      bus.emit('music:changed');
      bus.emit('music:track', file.name);
    }).catch(() => { /* autoplay blocked until a gesture */ });
    return true;
  }

  return {
    get ctx() { return ctx; },
    get playing() { return playing; },
    get stationId() { return stationId; },
    get trackIndex() { return trackIndex; },
    get bpm() { return bpm; },
    get volume() { return volume; },
    get reverb() { return reverbAmount; },
    get isLocal() { return !!localAudio && !localAudio.paused; },
    ensure, start, pause, stop, play, next, prev, setVolume, setBpm, setReverb,
    spectrum, trackTitle, playLocal,
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
})();

/* ---- Thin façade used by the tools and the UI --------------------------- */

function musicPlay(stationId) {
  Music.play(stationId || state.musicStation);
  const st = MUSIC_STATIONS.find((s) => s.id === (stationId || state.musicStation));
  if (st) Music.setBpm(st.bpm);
  return true;
}
function musicPause() { Music.pause(); return true; }
function musicStop() { Music.stop(); return true; }
function musicNext() { return Music.next(); }
function musicPrev() { return Music.prev(); }
function musicSetVolume(v) { Music.setVolume(v); return true; }
function musicSetBpm(v) { Music.setBpm(v); return true; }
