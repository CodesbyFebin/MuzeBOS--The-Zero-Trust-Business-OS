/* ==========================================================================
   ARGON — core state, persistence and mood model
   ========================================================================== */

const bus = (() => {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt).delete(fn);
    },
    emit(evt, payload) {
      const set = map.get(evt);
      if (!set) return;
      set.forEach((fn) => {
        try { fn(payload); } catch (err) { console.warn('[argon] handler failed for', evt, err); }
      });
    }
  };
})();

const STORAGE_KEY = 'argon.state.v2';

const DEFAULT_STATE = {
  lang: 'en',
  mood: 'playful',
  vibe: 60,
  name: 'Argon',
  tts: true,
  ttsRate: 1.0,
  ttsPitch: 1.15,
  haptics: true,
  liveMode: false,
  autoDJ: false,
  reduceMotion: false,
  gpuFur: true,
  musicVolume: 55,
  musicBpm: 82,
  musicReverb: 40,
  musicStation: 'lofi',
  musicTrack: 0,
  window: { x: 0, y: 0, w: 0, h: 0, mode: 'free' },
  coat: 'nebula'
};

const state = { ...DEFAULT_STATE };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.keys(DEFAULT_STATE).forEach((k) => {
      if (saved[k] !== undefined && saved[k] !== null) state[k] = saved[k];
    });
    if (saved.window && typeof saved.window === 'object') {
      state.window = { ...DEFAULT_STATE.window, ...saved.window };
    }
  } catch (e) { /* ignore corrupt storage */ }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota / privacy mode */ }
  }, 220);
}

function resetState() {
  Object.keys(DEFAULT_STATE).forEach((k) => {
    state[k] = Array.isArray(DEFAULT_STATE[k]) ? DEFAULT_STATE[k].slice() : DEFAULT_STATE[k];
  });
  state.window = { ...DEFAULT_STATE.window };
  saveState();
}

/* ==========================================================================
   MOODS — a mood retunes the whole system at once:
   fur coat, vibe energy, voice timbre, music station and Argon's tone.
   ========================================================================== */

const MOODS = {
  playful: {
    emoji: '✨',
    vibe: 68,
    coat: 'nebula',
    station: 'bollywood',
    rate: 1.08, pitch: 1.22,
    tone: ['cheerful', 'bouncy', 'silly'],
    desc: {
      en: 'Bouncy, bright and a little ridiculous.',
      hi: 'उछलता, चमकीला और थोड़ा मज़ाकिया।',
      ta: 'துடிக்கிறது, ஒளி பாட்டி சிறிய நகைச்சுவாகம்.',
      ar: 'مرح ومشرق ومضحك قليلًا.'
    }
  },
  calm: {
    emoji: '🌙',
    vibe: 26,
    coat: 'starlight',
    station: 'ambient',
    rate: 0.92, pitch: 1.0,
    tone: ['soft', 'slow', 'reassuring'],
    desc: {
      en: 'Slow breathing, soft light, no rush.',
      hi: 'धीमी साँस, नरम रोशनी, कोई जल्दबाज़ी नहीं।',
      ta: 'மெதுவான மூச்சு, மென்மையான ஒளி, எந்த அவசரமும் இல்லை.',
      ar: 'نَفَسٌ هادئ ونورٌ ناعم بلا استعجال.'
    }
  },
  focused: {
    emoji: '🎯',
    vibe: 48,
    coat: 'midnight',
    station: 'lofi',
    rate: 1.0, pitch: 1.05,
    tone: ['precise', 'brief', 'focused'],
    desc: {
      en: 'Short answers, clear thinking, no nonsense.',
      hi: 'संक्षिप्त उत्तर, स्पष्ट सोच, कोई बकवास नहीं।',
      ta: 'சுருக்கமான பதில், தெளிவான சிந்தனை, வீணை இல்லை.',
      ar: 'إجابات قصيرة وتفكير واضح بلا فوضى.'
    }
  },
  cosmic: {
    emoji: '🌌',
    vibe: 55,
    coat: 'nebula',
    station: 'synth',
    rate: 0.96, pitch: 1.1,
    tone: ['wondering', 'vast', 'slow'],
    desc: {
      en: 'Weird, vast and slightly astral.',
      hi: 'अजीब, विशाल और थोड़ा आकाशीय।',
      ta: 'விசித்தது, மிகப் பெரியது, சற்று வானியல்.',
      ar: 'غريب وواسع بعض الشيء سماوي.'
    }
  },
  mischief: {
    emoji: '😼',
    vibe: 72,
    coat: 'cyber',
    station: 'drone',
    rate: 1.12, pitch: 1.3,
    tone: ['teasing', 'mischievous', 'wry'],
    desc: {
      en: 'Teasing, testing, probably plotting.',
      hi: 'उपहास करता, परखता, शायद कुछ सोच रहा है।',
      ta: 'கேடிக்கிறது, சோதிக்கிறது, ஏதோ சதித்துகிறது.',
      ar: 'يستفزّ ويختبر، وقد يخطّط شيئًا ما.'
    }
  },
  sleepy: {
    emoji: '😴',
    vibe: 14,
    coat: 'starlight',
    station: 'zen',
    rate: 0.82, pitch: 0.9,
    tone: ['drowsy', 'soft', 'slow'],
    desc: {
      en: 'Half asleep, warm and very slow.',
      hi: 'आधा सोया, गर्म और बहुत धीमा।',
      ta: 'பாதியளவு தூக்கம், வெப்பமாகவும் மெதுவாகவும்.',
      ar: 'نصف نائم ودافئ وبطيء جدًا.'
    }
  },
  hyper: {
    emoji: '⚡',
    vibe: 96,
    coat: 'solar',
    station: 'house',
    rate: 1.25, pitch: 1.35,
    tone: ['hyper', 'excited', 'fast'],
    desc: {
      en: 'Full voltage, everything at once.',
      hi: 'पूरी शक्ति, सब कुछ एक साथ।',
      ta: 'முழு ஆற்றல், எல்லாம் ஒரே நேரத்தில்.',
      ar: 'طاقة كاملة وكل شيء دفعة واحدة.'
    }
  }
};
const MOOD_ORDER = ['playful', 'calm', 'focused', 'cosmic', 'mischief', 'sleepy', 'hyper'];

/* ==========================================================================
   Small UI helpers used by every module
   ========================================================================== */

function el(id) { return document.getElementById(id); }

/** Clamp a number into a range. */
function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toast(msg, ms) {
  const node = el('toast');
  if (!node) return;
  node.textContent = msg;
  node.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => node.classList.remove('show'), ms || 2600);
}

function haptic(pattern) {
  if (!state.haptics) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern || 12); } catch (e) { /* unsupported */ }
  }
}

/** Shared live signals read by the render loop every frame. */
const signals = {
  speechEnergy: 0,
  beatEnergy: 0,
  listening: false,
  speaking: false,
  musicPlaying: false
};

/** Update the little status chip in the chrome bar. */
function setStatus(mode, label) {
  const chip = el('status-chip');
  const text = el('status-text');
  if (chip) chip.setAttribute('data-state', mode);
  if (text && label) text.textContent = label;
}
