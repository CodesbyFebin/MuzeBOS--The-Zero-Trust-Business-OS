/* ==========================================================================
   ARGON — VOICE LINK
   Speech recognition in, speech synthesis out, microphone metering, wake word.
   Everything degrades gracefully when the browser lacks a capability.
   ========================================================================== */

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const hasRecognition = !!SpeechRec;
const hasSynthesis = 'speechSynthesis' in window;

let recognition = null;
let recognitionWanted = false;     // user asked for a listening session
let recognitionContinuous = false;  // hands-free vs push-to-talk
let finalTranscript = '';
let micStream = null;
let micAnalyser = null;
let micData = null;
let wakeArmed = false;
let speechVoices = [];
let speechInterval = null;

function loadVoices() {
  if (!hasSynthesis) return;
  speechVoices = window.speechSynthesis.getVoices() || [];
}
if (hasSynthesis) {
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

/** Best available voice for the active language. */
function pickVoice() {
  if (!hasSynthesis || !speechVoices.length) loadVoices();
  const want = LOCALES[state.lang].speech.toLowerCase();
  const base = want.split('-')[0];
  const pool = speechVoices.filter((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith(base));
  if (!pool.length) return null;
  const preferred = pool.find((v) => /google|natural|premium|enhanced|siri|aria|samantha/i.test(v.name));
  return preferred || pool[0];
}

/* ---- Speech synthesis --------------------------------------------------- */

function setTts(on) {
  state.tts = Boolean(on);
  saveState();
  bus.emit('tts:changed', state.tts);
  if (!state.tts) stopSpeaking();
}

function setTtsRate(v) {
  state.ttsRate = clamp(Number(v) || 1, 0.5, 1.8);
  saveState();
  bus.emit('voice:changed');
}

function setTtsPitch(v) {
  state.ttsPitch = clamp(Number(v) || 1, 0.5, 1.8);
  saveState();
  bus.emit('voice:changed');
}

/** Speak a phrase without touching the bubble (used by voice.say). */
function speakText(text) {
  if (!text) return;
  if (!state.tts || !hasSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = LOCALES[state.lang].speech;
    u.rate = state.ttsRate * (MOODS[state.mood] ? MOODS[state.mood].rate / 1.0 : 1);
    u.pitch = state.ttsPitch * (MOODS[state.mood] ? MOODS[state.mood].pitch / 1.15 : 1);
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch (e) { /* synthesis unavailable */ }
}

/** Argon answers: bubble + voice + fur animation. */
function speakArgonReply(text) {
  const bubble = el('argon-bubble');
  const bubbleText = el('bubble-text');
  if (bubble && bubbleText) {
    bubbleText.textContent = text;
    bubble.classList.add('show');
    bubble.classList.add('speaking');
  }

  if (speechInterval) { clearInterval(speechInterval); speechInterval = null; }
  if (hasSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }

  signals.speaking = true;
  setStatus('speaking', t('status.speaking'));

  const durationMs = Math.min(11000, Math.max(1600, String(text).length * 52));
  const startTime = performance.now();
  let phase = 0;

  speechInterval = setInterval(() => {
    const elapsed = performance.now() - startTime;
    const synthDone = !hasSynthesis || !window.speechSynthesis.speaking;
    if (elapsed >= durationMs && synthDone) { stopSpeaking(); return; }
    phase += 0.45;
    signals.speechEnergy = 0.32 + 0.58 * Math.abs(Math.sin(phase)) * (0.7 + 0.3 * Math.cos(phase * 0.37));
    updateEqBars(signals.speechEnergy);
  }, 45);

  if (state.tts && hasSynthesis) {
    try {
      const u = new SpeechSynthesisUtterance(String(text));
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = LOCALES[state.lang].speech;
      const mood = MOODS[state.mood];
      u.rate = clamp(state.ttsRate * (mood ? mood.rate : 1), 0.4, 2);
      u.pitch = clamp(state.ttsPitch * (mood ? mood.pitch / 1.15 : 1), 0.5, 2);
      u.onboundary = () => { signals.speechEnergy = 0.95; };
      u.onend = () => { stopSpeaking(); };
      u.onerror = () => { /* keep the visual envelope going */ };
      window.speechSynthesis.speak(u);
    } catch (e) { /* visual envelope carries the answer */ }
  }
}

function stopSpeaking() {
  if (speechInterval) { clearInterval(speechInterval); speechInterval = null; }
  if (hasSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  signals.speaking = false;
  signals.speechEnergy = 0;
  updateEqBars(0);
  const bubble = el('argon-bubble');
  if (bubble) bubble.classList.remove('speaking');
  if (signals.listening) setStatus('listening', t('status.listening'));
  else setStatus('vibing', t('status.vibing'));
}

/* ---- Speech recognition -------------------------------------------------- */

function ensureRecognition() {
  if (!hasRecognition || recognition) return recognition;
  try {
    recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = LOCALES[state.lang].speech;

    recognition.onstart = () => {
      signals.listening = true;
      recognitionWanted = true;
      setStatus('listening', t('status.listening'));
      wakeArmed = recognitionContinuous;
      bus.emit('voice:listening', true);
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += chunk + ' ';
        else interim += chunk;
      }
      const preview = (finalTranscript + interim).trim();
      bus.emit('voice:interim', preview);

      if (finalTranscript.trim()) {
        const text = finalTranscript.trim();
        finalTranscript = '';
        handleVoiceText(text);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        recognitionWanted = false;
        setLiveMode(false);
        toast(t('voice.unsupported'));
        bus.emit('voice:listening', false);
      } else if (event.error === 'no-speech') {
        /* benign */
      }
    };

    recognition.onend = () => {
      signals.listening = false;
      bus.emit('voice:listening', false);
      if (recognitionWanted && recognitionContinuous) {
        // Hands-free: immediately restart so Argon keeps listening.
        try { recognition.start(); } catch (e) { /* already started */ }
      } else {
        recognitionWanted = false;
        setStatus('vibing', t('status.vibing'));
      }
    };
  } catch (e) {
    recognition = null;
  }
  return recognition;
}

function startListening(continuous) {
  if (!hasRecognition) {
    toast(t('voice.unsupported'));
    return false;
  }
  const rec = ensureRecognition();
  if (!rec) return false;
  recognitionContinuous = !!continuous;
  recognition.lang = LOCALES[state.lang].speech;
  finalTranscript = '';
  recognitionWanted = true;
  try {
    recognition.start();
    return true;
  } catch (e) {
    // Already running — restart cleanly.
    try { recognition.stop(); } catch (e2) {}
    setTimeout(() => { try { recognition.start(); } catch (e3) {} }, 180);
    return true;
  }
}

function stopListening() {
  recognitionWanted = false;
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
  signals.listening = false;
  setStatus('vibing', t('status.vibing'));
}

function setLiveMode(on) {
  state.liveMode = Boolean(on);
  saveState();
  bus.emit('live:changed', state.liveMode);
  const btn = el('live-btn');
  if (btn) btn.classList.toggle('active', state.liveMode);
  if (state.liveMode) {
    startListening(true);
  } else {
    stopListening();
  }
}

/** Strip a wake phrase so "hey argon play music" behaves like "play music". */
function stripWakePhrase(text) {
  const patterns = [
    /\b(hey|hi|hello|ok|okay)\s+argon\b/i,
    /\bhey\s+arjun\b/i,
    /हे\s*आर्गन|आर्गन\s*सुनो/i,
    /ஹே\s*ஆர்கன்|ஆர்கன்\s*கேள்/i,
    /يا\s*أرجون|أرجون\s*يا/i
  ];
  let out = text;
  for (const p of patterns) out = out.replace(p, '').trim();
  return out;
}

function handleVoiceText(text) {
  const cleaned = stripWakePhrase(text).trim();
  if (!cleaned) {
    if (recognitionContinuous) { wakeArmed = false; return; }
    return;
  }
  bus.emit('voice:utterance', cleaned);
  submitUtterance(cleaned, 'voice');
}

/* ---- Microphone metering ------------------------------------------------- */

async function startMicMeter() {
  if (micAnalyser) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(micStream);
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.75;
    src.connect(micAnalyser);
    micData = new Uint8Array(micAnalyser.frequencyBinCount);
    return true;
  } catch (e) {
    micAnalyser = null;
    return false;
  }
}

function stopMicMeter() {
  if (micStream) {
    micStream.getTracks().forEach((tk) => tk.stop());
    micStream = null;
  }
  micAnalyser = null;
  micData = null;
}

/** Called every frame by the render loop — updates the meter widget. */
function sampleMicLevel() {
  if (!micAnalyser || !micData) return 0;
  micAnalyser.getByteFrequencyData(micData);
  let sum = 0;
  for (let i = 0; i < micData.length; i++) sum += micData[i];
  const level = Math.min(1, sum / (micData.length * 160));
  const meter = el('mic-meter');
  if (meter) {
    const bar = meter.querySelector('i');
    if (bar) bar.style.width = (level * 100).toFixed(1) + '%';
    meter.classList.toggle('hot', level > 0.72);
  }
  return level;
}

/* ---- Equalizer bars ------------------------------------------------------ */

function updateEqBars(level) {
  const eq = el('voice-eq');
  if (!eq) return;
  const bars = eq.querySelectorAll('span');
  if (level > 0.03) {
    eq.classList.remove('off');
    for (let i = 0; i < bars.length; i++) {
      const h = Math.max(3, Math.min(13, 3 + level * 10 * (0.6 + 0.4 * Math.sin(performance.now() * 0.02 + i * 1.6))));
      bars[i].style.height = h + 'px';
    }
  } else {
    eq.classList.add('off');
    for (let i = 0; i < bars.length; i++) bars[i].style.height = '3px';
  }
}
