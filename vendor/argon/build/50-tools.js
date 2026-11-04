/* ==========================================================================
   ARGON — SKILL / TOOL REGISTRY
   Every entry here is a real callable tool. The brain (50-brain.js) scores
   user utterances against these definitions, builds a plan, executes it, and
   reports back. Nothing here is decorative.
   ========================================================================== */

const ARGON_TOOLS = [];

function defTool(spec) {
  const tool = Object.assign({
    id: 'tool',
    icon: '•',
    cat: 'utility',
    name: ['Tool'],
    desc: [''],
    kw: { en: [], hi: [], ta: [], ar: [] },
    enabled: true,
    score: 0,
    parse: null,
    run: null
  }, spec);
  ARGON_TOOLS.push(tool);
  return tool;
}

/* ==========================================================================
   Text utilities — normalisation, digit parsing, colour & entity extraction
   ========================================================================== */

const DIGIT_MAP = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

/** Lowercase, strip Arabic diacritics and tatweel, normalise digits. */
function norm(text) {
  let s = String(text || '').toLowerCase();
  s = s.replace(/[ً-ٰٟۖ-ۭ]/g, '');   // Arabic harakat
  s = s.replace(/[-‏]/g, '');     // bidi marks
  s = s.replace(/[०-९]/g, (d) => DIGIT_MAP[d] || d);
  s = s.replace(/[٠-٩]/g, (d) => DIGIT_MAP[d] || d);
  s = s.replace(/[۰-۹]/g, (d) => DIGIT_MAP[d] || d);
  // Keep combining marks (\p{M}) — stripping Tamil/Devanagari vowel signs
  // and viramas would shred every Indic word. Math operators stay too so
  // "25 * 4 + 6" survives normalisation.
  s = s.replace(/[^\p{L}\p{N}\p{M}\s.%+\-*/\u00d7\u00f7^]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Arabic definites: "الحجم" must match the keyword "حجم".
  s = s.replace(/(^|\s)ال(?=[\u0621-\u064A]{3,})/g, '$1');
  return s;
}

/** First number found in the string (supports decimals and % signs). */
function extractNumber(text) {
  const s = norm(text);
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Substring search that respects word boundaries.
 * Plain `includes()` produces false friends ("yo" inside "you", "hi" inside
 * "chip"), which is exactly how a router ends up playing music when the user
 * asked about the weather.
 */
function containsLoose(haystack, needle) {
  if (!needle) return false;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    const before = idx > 0 ? haystack[idx - 1] : '';
    const badBefore = before && /[\p{L}\p{N}\p{M}]/u.test(before);
    if (!badBefore) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

function containsWord(haystack, needle) {
  if (!needle) return false;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    const before = idx > 0 ? haystack[idx - 1] : '';
    const after = idx + needle.length < haystack.length ? haystack[idx + needle.length] : '';
    const badBefore = before && /[\p{L}\p{N}\p{M}]/u.test(before);
    const badAfter = after && /[\p{L}\p{N}\p{M}]/u.test(after);
    if (!badBefore && !badAfter) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

const COLOR_WORDS = {
  red:    { hex: '#ef4444', kw: ['red', 'crimson', 'scarlet', 'लाल', 'लाल रंग', 'सिंदूर', 'சிவப்பு', 'செந்நிறம்', 'أحمر', 'قرمزي', 'أحمر قاني'] },
  orange: { hex: '#fb923c', kw: ['orange', 'नारंगी', 'केसरिया', 'ஆரஞ்சு', 'செம்மஞ்சள்', 'برتقالي', 'برتقالي محمر'] },
  yellow: { hex: '#facc15', kw: ['yellow', 'पीला', 'हल्दी', 'மஞ்சள்', 'மஞ்சள் நிறம்', 'أصفر', 'أصفر ذهبي'] },
  green:  { hex: '#4ade80', kw: ['green', 'emerald', 'हरा', 'हरी', 'पेसा', 'பச்சை', 'முள்ளிப் பச்சை', 'أخضر', 'أخضر زمردي'] },
  cyan:   { hex: '#22d3ee', kw: ['cyan', 'teal', 'सियान', 'फ़िरोज़ा', 'வானூர்', 'புல நீலம்', 'سماوي', 'فيروزي'] },
  blue:   { hex: '#3b82f6', kw: ['blue', 'azure', 'नीला', 'नील', 'நீலம்', 'கடல் நீலம்', 'أزرق', 'أزرق سماوي'] },
  purple: { hex: '#a855f7', kw: ['purple', 'violet', 'बैंगनी', 'जामुनी', 'ஊதா', 'மூலப்பு', 'بنفسجي', 'بنفسجي فاتح'] },
  pink:   { hex: '#ff8fb1', kw: ['pink', 'rose', 'गुलाबी', 'गुलाब', 'இளஞ்சிவப்பு', 'செம்மஞ்சள் இளம்', 'وردي', 'وردي فاتح'] },
  white:  { hex: '#f8fafc', kw: ['white', 'snow', 'सफ़ेद', 'धुला', 'வெள்ளை', 'பனி வெள்ளை', 'أبيض', 'أبيض ثلجي'] },
  black:  { hex: '#1e1b4b', kw: ['black', 'dark', 'काला', 'काली', 'கருப்பு', 'இருள்', 'أسود', 'داكن'] },
  gold:   { hex: '#facc15', kw: ['gold', 'golden', 'solar', 'सुनहरा', 'सोना', 'தங்க நிறம்', 'பொன்னை', 'ذهبي', 'ذهبي لامع'] },
  silver: { hex: '#cbd5e1', kw: ['silver', 'चाँदी', 'चांदी', 'வெள்ளி நிறம்', 'வெள்ளி', 'فضي', 'فضي لامع'] }
};

function extractColor(text) {
  const s = norm(text);
  let best = null;
  let bestLen = 0;
  for (const name in COLOR_WORDS) {
    for (const k of COLOR_WORDS[name].kw) {
      const nk = norm(k);
      if (nk && s.includes(nk) && nk.length > bestLen) {
        best = { name, hex: COLOR_WORDS[name].hex };
        bestLen = nk.length;
      }
    }
  }
  return best;
}

/* ==========================================================================
   ENTITY vocabularies shared by several tools
   ========================================================================== */

const MOOD_WORDS = {
  playful:  ['playful', 'happy', 'cheerful', 'fun', 'excited', 'bouncy', 'खुश', 'मज़ाकिया', 'चटपटा', 'விளாமாறி', 'மகிழ்ச்சி', 'مرح', 'سعادة', 'ممتع'],
  calm:     ['calm', 'quiet', 'relax', 'peaceful', 'gentle', 'rest', 'शांत', 'शान्त', 'शांत हो', 'अमीत', 'அமைதி', 'அமைதியாக', 'هادئ', 'سكون', 'مريح'],
  focused:  ['focused', 'focus', 'concentrate', 'serious', 'work', 'study', 'एकाग्र', 'फोकस', 'केंद्रित', 'கவனம்', 'கவனமாக', 'تركيز', 'تركيزي'],
  cosmic:   ['cosmic', 'space', 'universe', 'galaxy', 'dreams', 'vast', 'ब्रह्मांड', 'ब्रह्माण्ड', 'अंतरिक्ष', 'அண்ணவெளி', 'வானம்', 'كوني', 'فضائي', 'كوني'],
  mischief: ['mischief', 'mischievous', 'naughty', 'prank', 'sassy', 'शरारती', 'शरारत', 'ठीठ', 'குறும்பு', 'வெடிக்கை', 'ماكرة', 'شقي', 'مستهزئ'],
  sleepy:   ['sleepy', 'sleep', 'tired', 'drowsy', 'resting', 'नींदा', 'सोना', 'ऊंगासा', 'தூக்கம்', 'தூக்கமாக', 'نعسان', 'نعسان', 'متعب'],
  hyper:    ['hyper', 'excited', 'wired', 'crazy', 'energy', 'insane', 'अति उत्साह', 'उन्माद', 'तेज़', 'மிகச் சூரப்பு', 'மின்னல்', 'محموم', 'فائق النشاط', 'طاقة عالية']
};

function extractMood(text) {
  const s = norm(text);
  let best = null, bestLen = 0;
  for (const m in MOOD_WORDS) {
    for (const k of MOOD_WORDS[m]) {
      const nk = norm(k);
      if (nk && containsLoose(s, nk) && nk.length > bestLen) { best = m; bestLen = nk.length; }
    }
  }
  return best;
}

const MUSIC_STATIONS = [
  { id: 'lofi',     icon: '🌌', name: 'Lo-Fi Nebula',     bpm: 82,  desc: 'Dusty chords and a soft tape hiss',      kw: ['lofi', 'lo-fi', 'lo fi', 'chillhop', 'study', 'relax', 'लोफाई', 'लो-फाई', 'சாட்டிங்', 'லோஃபி', 'لوفي', 'هادئ'] },
  { id: 'synth',    icon: '🌆', name: 'Synthwave Pulse',  bpm: 104, desc: 'Neon arps on a midnight highway',        kw: ['synthwave', 'synth', 'retro', '80s', 'सिंथवेव', 'सिंथ', 'சிந்த்வேவ்', 'சின்த்', 'سيث', 'سينث ويف'] },
  { id: 'ambient',  icon: '🌧️', name: 'Ambient Rain',     bpm: 62,  desc: 'Long pads and soft rainfall',            kw: ['ambient', 'rain', 'drone calm', 'वातावरण', 'बारिश', 'மழை', 'சூழல்', 'أمبيانت', 'مطر'] },
  { id: 'bollywood',icon: '🪔', name: 'Bollywood Groove', bpm: 100, desc: 'Bright pentatonic bounce with tabla',   kw: ['bollywood', 'hindi pop', 'filmi', 'पॉप', 'बॉलीवुड', 'தமிழ் பாடல்', 'பொல்லுடன்', 'بولlywood', 'بولوود'] },
  { id: 'tamil',    icon: '🎬', name: 'Tamil Cinema',     bpm: 108, desc: 'South Indian melodic swirl',             kw: ['tamil', 'kollywood', 'south', 'தமிழ்', 'சினிமா', 'தென்னிந்திய', 'تاميلي', 'تاميلي سينما'] },
  { id: 'drone',    icon: '🏔️', name: 'Celtic Drone',     bpm: 76,  desc: 'Hollow pipes over a low sea-drone',      kw: ['celtic', 'drone', 'pagan', ' Celtic', 'सेल्टिक', 'கெல்டிக்', 'செல்டிக்', 'سيلتيك'] },
  { id: 'house',    icon: '🕺', name: 'Deep Bass House',  bpm: 126, desc: 'Four-on-the-floor and heavy sub',         kw: ['house', 'bass', 'edm', 'techno', 'dance', 'हाउस', 'डांस', 'பாட்டு', 'هاوس', 'تقنيو'] },
  { id: 'zen',      icon: '🔔', name: 'Zen Bells',        bpm: 58,  desc: 'Singing bowls and slow wooden plucks',   kw: ['zen', 'bells', 'bowl', 'meditation', 'ज़ेन', 'घंटी', 'ஜென்', 'பல்', 'زين', 'أجراس'] }
];

function extractStation(text) {
  const s = norm(text);
  let best = null, bestLen = 0;
  for (const st of MUSIC_STATIONS) {
    for (const k of st.kw) {
      const nk = norm(k);
      if (nk && containsLoose(s, nk) && nk.length > bestLen) { best = st.id; bestLen = nk.length; }
    }
  }
  return best;
}

const COAT_WORDS = {
  nebula:   ['nebula', 'purple', 'violet', 'default', 'नेबुला', 'बैंगनी', 'நெபுலா', 'ஊதா', 'نيبولا', 'بنفسجي'],
  cyber:    ['cyber', 'cyan', 'tech', 'matrix', 'साइबर', 'सियान', 'சைபர்', 'சியான்', 'سايبير', 'سماوي'],
  solar:    ['solar', 'gold', 'golden', 'sun', 'सोलर', 'सुनहरा', 'சோலார்', 'தங்கம்', 'شمسي', 'ذهبي'],
  emerald:  ['emerald', 'green', 'jade', 'मैराइल्ड', 'हरा', 'பச்சை', 'எமரல்ட்', 'زمردي', 'أخضر'],
  midnight: ['midnight', 'night', 'velvet', 'dark', 'मध्यरात्रि', 'रात', 'கடுத்த இரவு', 'منتصف الليل', 'داكن'],
  starlight:['starlight', 'snow', 'white', 'silver', 'स्टारलाइट', 'सफ़ेद', 'வெள்ளை', 'நட்சத்திர', 'أبيض']
};

function extractCoat(text) {
  const s = norm(text);
  let best = null, bestLen = 0;
  for (const c in COAT_WORDS) {
    for (const k of COAT_WORDS[c]) {
      const nk = norm(k);
      if (nk && containsLoose(s, nk) && nk.length > bestLen) { best = c; bestLen = nk.length; }
    }
  }
  return best;
}

const STYLE_WORDS = {
  fluffy: ['fluffy', 'fuzzy', 'soft', 'plush', 'रेशमी', 'मुलायम', 'மென்மையான', ' fluffy', 'ناعم'],
  short:  ['short', 'trim', 'sleek', 'छोटा', 'छोटी', 'குறுகிய', 'قصير', 'مقصوص'],
  spiky:  ['spiky', 'sharp', 'spike', 'punk', 'नुकीला', 'पंक', 'முள்', 'مدبب', 'أشواك'],
  curly:  ['curly', 'curl', 'wavy', 'कुरली', 'तरंगदार', 'சுருள்', 'مجعد', 'ملفوف'],
  sleek:  ['sleek', 'smooth', 'silky', 'चिकना', 'रेशमी', 'மென்மையான', 'أملس', 'ناعم حريري']
};

function extractStyle(text) {
  const s = norm(text);
  let best = null, bestLen = 0;
  for (const c in STYLE_WORDS) {
    for (const k of STYLE_WORDS[c]) {
      const nk = norm(k);
      if (nk && containsLoose(s, nk) && nk.length > bestLen) { best = c; bestLen = nk.length; }
    }
  }
  return best;
}

const SIZE_WORDS = {
  tiny:    ['tiny', 'mini', 'pocket', 'small', 'बहुत छोटा', 'जेब', 'சிறிய', 'பாக்கெட்டு', 'صغير', 'جيب'],
  compact: ['compact', 'normal', 'small window', 'छोटा विंडो', 'சிறிய', 'مضغوط'],
  half:    ['half', 'half screen', 'आधा', 'பாதி', 'نصف'],
  wide:    ['wide', 'full width', 'landscape', 'चौड़ा', 'அகல்', 'عريض'],
  full:    ['full', 'fullscreen', 'maximize', 'पूरा', 'முழு', 'كامل', 'ملء']
};

function extractSize(text) {
  const s = norm(text);
  let best = null, bestLen = 0;
  for (const c in SIZE_WORDS) {
    for (const k of SIZE_WORDS[c]) {
      const nk = norm(k);
      if (nk && containsLoose(s, nk) && nk.length > bestLen) { best = c; bestLen = nk.length; }
    }
  }
  return best;
}

/* ==========================================================================
   TOOL DEFINITIONS
   ========================================================================== */

/* ---- Fur ---------------------------------------------------------------- */

defTool({
  id: 'fur.coat',
  icon: '🎨',
  cat: 'fur',
  name: ['Change fur coat', 'रोएँ का रंग बदलें', 'மயிர் நிறத்தை மாற்று', 'غيّر لون الفرو'],
  desc: [
    'Swap Argon\'s whole fur coat between six designed presets.',
    'आर्गन की पूरी रोएँ की परत को छह प्रीसेट में बदलता है।',
    'ஆர்கனின் முழு மயிர் உடையத்தை ஆறு வடிவங்களுக்கு மாற்றும்.',
    'يبدّل فرون أرجون بالكامل بين ستة أنماط مصممة.'
  ],
  kw: {
    en: ['fur', 'coat', 'color', 'colour', 'change my', 'change fur', 'outfit', 'look'],
    hi: ['रोएँ', 'रंग', 'कूट', 'बदलो', 'रूप'],
    ta: ['மயிர்', 'நிறம்', 'மாற்று', 'உடை'],
    ar: ['فرو', 'لون', 'بدّل', 'غيّر', 'مظهر']
  },
  parse(text) {
    const coat = extractCoat(text);
    return coat ? { coatId: coat } : null;
  },
  run(args) {
    const coatId = args.coatId || extractCoat(args.raw) || state.coat;
    const preset = COAT_PRESETS.find((c) => c.id === coatId);
    if (!preset) return { ok: false, say: t('reply.unknown') };
    applyCoat(coatId);
    return { ok: true, say: t('reply.coat', { name: preset.name }), detail: preset.name };
  }
});

defTool({
  id: 'fur.tint',
  icon: '🎨',
  cat: 'fur',
  name: ['Tint the fur', 'रोएँ को रंग दें', 'மயிருக்கு நிறம்', 'صبغ الفرو'],
  desc: [
    'Recolour Argon\'s root and tip colours by name, in any language.',
    'किसी भी भाषा में नाम देकर रोएँ के मूल और सिरे का रंग बदलता है।',
    'எந்த மொழியிலும் பெயரைக் கொண்டு மயிரின் அடி, நுனி நிறங்களை மாற்றும்.',
    'يعيد تلوين لون الجذر والطرف بالف الاسم بأي لغة.'
  ],
  kw: {
    en: ['tint', 'dye', 'paint', 'make me', 'make my fur'],
    hi: ['रंग', 'रंगना', 'पेंट'],
    ta: ['நிறம்', 'தீட்டு', 'அன்பு'],
    ar: ['صبغ', 'لوّن', 'اجعل فروني', 'اجعل الفرو', 'فرو', 'لون الفرو']
  },
  parse(text) {
    const color = extractColor(text);
    return color ? { color } : null;
  },
  run(args) {
    const color = args.color || extractColor(args.raw);
    if (!color) return { ok: false, say: t('reply.unknown') };
    setFurColor(color.hex);
    return { ok: true, say: t('reply.done'), detail: color.name };
  }
});

defTool({
  id: 'fur.style',
  icon: '🧶',
  cat: 'fur',
  name: ['Restyle the coat', 'कोट की शैली', 'மயிர் அமைப்பு', 'غيّر هيئة الفرو'],
  desc: [
    'Push the coat into a fluffy, short, spiky, curly or sleek silhouette.',
    'कोट को फ़फ़ली, छोटा, नुकीला, कुरली या चिकना बनाता है।',
    'மயிரை மென்மையான, குறுகிய, முள், சுருள் அல்லது மழமழப்பான வடிவத்திற்கு மாற்றும்.',
    'يدفع الفرو إلى هيئة نفش��ة أو قصيرة أو شائكة أو مجعدة أو حريرية.'
  ],
  kw: {
    en: ['style', 'fluffy', 'short', 'spiky', 'curly', 'sleek', 'silky', 'shave'],
    hi: ['फ्लफी', 'छोटा', 'नुकीला', 'कुरली', 'चिकना'],
    ta: ['மென்மை', 'குறுகிய', 'முள்', 'சுருள்'],
    ar: [' fluffy', 'قصير', 'أشواك', 'مجعد', 'حريري']
  },
  parse(text) {
    const style = extractStyle(text);
    return style ? { style } : null;
  },
  run(args) {
    const style = args.style || extractStyle(args.raw);
    const map = {
      fluffy: { furLength: 0.44, furDensity: 0.94, curliness: 0.66, clumping: 0.70 },
      short:  { furLength: 0.12, furDensity: 0.70, curliness: 0.10, clumping: 0.22 },
      spiky:  { furLength: 0.30, furDensity: 0.58, curliness: 0.05, clumping: 0.05 },
      curly:  { furLength: 0.38, furDensity: 0.88, curliness: 0.95, clumping: 0.45 },
      sleek:  { furLength: 0.20, furDensity: 0.62, curliness: 0.04, clumping: 0.18 }
    };
    if (!map[style]) return { ok: false, say: t('reply.unknown') };
    Object.keys(map[style]).forEach((k) => setFurParam(k, map[style][k]));
    creature.triggerBoop();
    return { ok: true, say: t('reply.done'), detail: style };
  }
});

defTool({
  id: 'fur.params',
  icon: '📐',
  cat: 'fur',
  name: ['Tune coat physics', 'कोट के मापदंड', 'மயிர் அளவுகள்', 'اضبط فيزياء الفرو'],
  desc: [
    'Set length, density, curl or clumping numerically — e.g. "density 40".',
    'लंबाई, घनत्व, उलझन या गुच्छेदार संख्या में बदलता है।',
    'நீளம், அடர்த்தி, சுழல் அல்லது முடிச்சை எண்களில் மாற்றும்.',
    'يضبط الطول أو الكثافة أو التجعّد أو التكتّل رقميًا.'
  ],
  kw: {
    en: ['length', 'density', 'curl', 'clump', 'clumping', 'strands'],
    hi: ['लंबाई', 'घनत्व', 'उलझन', 'गुच्छेदार'],
    ta: ['நீளம்', 'அடர்த்தி', 'சுழல்', 'முடிச்சு'],
    ar: ['طول', 'كثافة', 'تجعّد', 'تكتّل']
  },
  parse(text) {
    const s = norm(text);
    const n = extractNumber(text);
    if (n === null) return null;
    if (/density|densit|घनत्व|அடர்த்தி|كثافة/.test(s)) return { param: 'furDensity', value: clamp(n / 100, 0.12, 1) };
    if (/curl|curly|उलझन|சுழல்|تجعّد/.test(s)) return { param: 'curliness', value: clamp(n / 100, 0, 1) };
    if (/clump|गुच्छेदार|मுடிச்சு|تكتّل/.test(s)) return { param: 'clumping', value: clamp(n / 100, 0, 1) };
    if (/length|लंबाई|நீளம்|طول/.test(s)) return { param: 'furLength', value: clamp(n / 100, 0.06, 0.62) };
    return null;
  },
  run(args) {
    if (!args.param || args.value === null || args.value === undefined) return { ok: false, say: t('reply.unknown') };
    setFurParam(args.param, args.value);
    return { ok: true, say: t('reply.done'), detail: `${args.param} ${args.value.toFixed(2)}` };
  }
});

/* ---- Vibing ------------------------------------------------------------- */

defTool({
  id: 'vibe.level',
  icon: '〰️',
  cat: 'vibe',
  name: ['Set vibe energy', 'वाइब ऊर्जा सेट करें', 'வைப் ஆற்றலு அமை', 'اضبط طاقة النبض'],
  desc: [
    'Drive Argon\'s energy from 0 to 100 — it changes wind, bounce, blink rate and brightness.',
    'आर्गन की ऊर्जा 0 से 100 तक बदलता है — हवा, उछाल, पलक और चमक सब बदलते हैं।',
    'ஆர்கனின் ஆற்றலை 0 முதல் 100 வரை மாற்றும் — காற்று, துள்ளல், சொறுக்கு, ஒளி.',
    'يقود طاقة أرجون من 0 إلى 100 — الرياح والارتداد والرمش والسطوع كلها تتغير.'
  ],
  kw: {
    en: ['vibe', 'energy', 'excitement', 'calm down', 'boost'],
    hi: ['वाइब', 'ऊर्जा', 'शांत हो'],
    ta: ['வைப்', 'ஆற்றல்', 'ஆற்றல் அளவு'],
    ar: ['نبض', 'طاقة', 'هديء']
  },
  parse(text) {
    const n = extractNumber(text);
    if (n === null) return null;
    return { value: clamp(n, 0, 100) };
  },
  run(args) {
    const v = args.value !== undefined && args.value !== null ? args.value : 60;
    setVibe(v);
    return { ok: true, say: t('reply.vibe', { value: Math.round(v) }) };
  }
});

defTool({
  id: 'vibe.dance',
  icon: '🕺',
  cat: 'vibe',
  name: ['Make Argon dance', 'आर्गन से नाच करवाएँ', 'ஆர்கனை ஆடசெய்', 'اجعل أرجون يرقص'],
  desc: [
    'Trigger a full dance spin with beat-locked fur movement.',
    'पूरा डांस स्पिन और धुन से जुड़ी रोएँ की हलचल।',
    'முழு ஆட்ச் சுழல், பீட் உடன் இணைந்த மயிர் அசைவு.',
    'خدعة رقص كاملة مع حركة فرو متزامنة مع النبض.'
  ],
  kw: {
    en: ['dance', 'dance for me', 'boogie', 'spin', 'show me a dance', 'start dancing'],
    hi: ['नाच', 'डांस', 'नाचो'],
    ta: ['ஆடு', 'ஆட்சு', 'நடனம்'],
    ar: ['ارقص', 'رقص', 'تحرك']
  },
  run() {
    triggerDance();
    return { ok: true, say: t('reply.dance') };
  }
});

defTool({
  id: 'vibe.boop',
  icon: '💫',
  cat: 'vibe',
  name: ['Boop Argon', 'आर्गन को बूप करें', 'ஆர்கனை பூப்', 'خُبطة لأرجون'],
  desc: [
    'Poke Argon — a shockwave ripples through all 60,000 strands.',
    'आर्गन को छूने से 60,000 तंतुओं में लहर दौड़ती है।',
    'ஆர்கனைத் தொட்டால் 60,000 இழைகளிலும் அலை ஓடும்.',
    'لمس أرجون — تموّج يمر عبر كل الأشعة الستين ألفًا.'
  ],
  kw: {
    en: ['boop', 'poke', 'touch', 'pat', 'pet me', 'tickle'],
    hi: ['बूप', 'छू', 'प्यार'],
    ta: ['பூப்', 'தொடு', 'அண்பு'],
    ar: ['خُبطة', 'المس', ' ربّت']
  },
  run() {
    triggerBoop();
    return { ok: true, say: t('reply.boop') };
  }
});

defTool({
  id: 'vibe.pet',
  icon: '🤲',
  cat: 'vibe',
  name: ['Pet sweep', 'प्यार का वाइप', 'கடக்கு வாரு', 'مسحة حنان'],
  desc: [
    'Sweep a virtual hand across the fur and let it settle back down.',
    'रोएँ पर एक काल्पनिक हाथ फिराता है और उसे वापस बिठलाता है।',
    'மயிர் மீது ஒரு கை போல் செல்லச் செய்து மீண்டும் அமைக்கும்.',
    'يمرّر يدًا افتراضية على الفرو ثم يتركه يستقر.'
  ],
  kw: {
    en: ['pet', 'pet me', 'stroke', 'brush', 'comb'],
    hi: ['प्यार', 'सहलाओ', 'कंब'],
    ta: ['வரி', 'மயிர் வாரு'],
    ar: ['ربّت', 'مشط']
  },
  run() {
    triggerPetSweep();
    return { ok: true, say: t('reply.boop') };
  }
});

/* ---- Mood --------------------------------------------------------------- */

defTool({
  id: 'mood.set',
  icon: '🎭',
  cat: 'vibe',
  name: ['Switch mood', 'मूड बदलें', 'மேஜனை மாற்று', 'غيّر المزاج'],
  desc: [
    'Retune Argon completely: coat, energy, voice timbre, music station and tone.',
    'आर्गन को पूरी तरह बदलता है — परत, ऊर्जा, आवाज़, संगीत और बोल का लहज़ा।',
    'ஆர்கனை முழுமையாக மாற்றும் — நிறம், ஆற்றல், குரல், இசை, பேசும் முறை.',
    'يعيد ضبط أرجون بالكامل: الفرو والطاقة ونبرة الصوت محطة الموسيقى والأسلوب.'
  ],
  kw: {
    en: ['mood', 'be calm', 'be happy', 'be sleepy', 'focus', 'cheer up', 'be serious'],
    hi: ['मूड', 'शांत', 'खुश', 'सोओ', 'एकाग्र'],
    ta: ['மேஜன்', 'அமைதி', 'மகிழ்ச்சி', 'கவனம்'],
    ar: ['مزاج', 'هادئ', 'مرح', 'ركّز']
  },
  parse(text) {
    const mood = extractMood(text);
    return mood ? { mood } : null;
  },
  run(args) {
    const mood = args.mood || extractMood(args.raw);
    if (!mood) return { ok: false, say: t('reply.unknown') };
    setMood(mood);
    return { ok: true, say: t('reply.mood', { mood: t('mood.' + mood) }), detail: mood };
  }
});

/* ---- Music -------------------------------------------------------------- */

defTool({
  id: 'music.play',
  icon: '▶️',
  conflicts: ['music.pause'],
  cat: 'music',
  name: ['Play music', 'संगीत चलाएँ', 'இசை வாசி', 'شغّل الموسيقى'],
  desc: [
    'Start a generative station — "play lo-fi" picks a station by name.',
    'जनरेटिव स्टेशन शुरू करता है — "लो-फाई चलाओ" नाम से स्टेशन चुनता है।',
    'உருவாக்கப்பட்ட நிலையத்தைத் தொடங்கும் — பெயரால் தேர்ந்தெடுக்கலாம்.',
    'يشغّل محطة مولّدة — «شغّل لوفي» يختار المحطة بالاسم.'
  ],
  kw: {
    en: ['play music', 'play song', 'put on music', 'start music', 'play', 'music', 'song', 'track', 'listen to'],
    hi: ['संगीत चला', 'गाना', 'संगीत', 'चलाओ', 'सुनाओ'],
    ta: ['இசை வாசி', 'பாடல்', 'இசை', 'வாசி', 'இயங்கு'],
    ar: ['شغل موسيقى', 'شغل أغنية', 'موسيقى', 'أغنية', 'شغل', 'انغام']
  },
  parse(text) {
    const station = extractStation(text);
    return station ? { station } : {};
  },
  run(args) {
    const id = args.station || state.musicStation || 'lofi';
    musicPlay(id);
    const st = MUSIC_STATIONS.find((s) => s.id === id);
    return { ok: true, say: t('reply.music.play', { station: st ? st.name : id }), detail: id };
  }
});

defTool({
  id: 'music.pause',
  icon: '⏸',
  conflicts: ['music.play'],
  cat: 'music',
  name: ['Pause music', 'संगीत रोकें', 'இசை நிறுத்து', 'أوقف الموسيقى'],
  desc: ['Pause the player without losing the station.', 'स्टेशन बनाए रखते हुए प्लेयर रोकता है।', 'நிலையத்தை வைத்துக்கொண்டு நிறுத்துகிறது.', 'يوقف المشغّل مع الاحتفاظ بالمحطة.'],
  kw: {
    en: ['pause', 'stop music', 'quiet', 'silence the music'],
    hi: ['रोको', 'बंद करो', 'संगीत रोको', 'धीमा करो'],
    ta: ['நிறுத்து', 'நிறுத்து'],
    ar: ['أوقف', 'إيقاف', 'اسكت']
  },
  run() {
    musicPause();
    return { ok: true, say: t('reply.music.pause') };
  }
});

defTool({
  id: 'music.next',
  icon: '⏭',
  cat: 'music',
  name: ['Next track', 'अगला ट्रैक', 'அடுத்த பாடல்', 'المقطع التالي'],
  desc: ['Skip to the next variation inside the current station.', 'वर्तमान स्टेशन में अगला ट्रैक।', 'தற்போதைய நிலையத்தில் அடுத்த பாடல்.', 'انتقل إلى المقطع التالي داخل المحطة الحالية.'],
  kw: { en: ['next', 'skip', 'next song', 'another'], hi: ['अगला', 'छोड़ो'], ta: ['அடுத்து', 'தாவு'], ar: ['التالي', 'تخطي'] },
  run() {
    const info = musicNext();
    return { ok: true, say: t('reply.music.next', { title: info.title }), detail: info.title };
  }
});

defTool({
  id: 'music.prev',
  icon: '⏮',
  cat: 'music',
  name: ['Previous track', 'पिछला ट्रैक', 'முந்தைய பாடல்', 'المقطع السابق'],
  desc: ['Go back one variation in the current station.', 'वर्तमान स्टेशन में एक ट्रैक पीछे।', 'தற்போதைய நிலையத்தில் ஒரு பாடல் பின்.', 'ارجع مقطعًا واحدًا في المحطة الحالية.'],
  kw: { en: ['previous', 'back', 'last song'], hi: ['पिछला', 'वापस'], ta: ['முந்தைய', 'பின்'], ar: ['السابق', 'رجوع'] },
  run() {
    const info = musicPrev();
    return { ok: true, say: t('reply.music.prev', { title: info.title }), detail: info.title };
  }
});

defTool({
  id: 'music.volume',
  icon: '🔊',
  cat: 'music',
  name: ['Set volume', 'आवाज़ का स्तर', 'ஒலி அளவு', 'اضبط مستوى الصوت'],
  desc: ['Set the master volume as a percentage, e.g. "volume 30".', 'मास्टर आवाज़ प्रतिशत में बदलता है।', 'முதன்மை ஒலியை சதவீதமாக மாற்றும்.', 'يضبط مستوى الصوت الأساسي بنسبة مئوية.'],
  kw: { en: ['volume', 'louder', 'quieter', 'turn up', 'turn down'], hi: ['आवाज़', 'तेज़', 'धीमी'], ta: ['ஒலி', 'பலத்தில்'], ar: ['صوت', 'أعلى', 'أخفض'] },
  parse(text) {
    const n = extractNumber(text);
    if (n !== null) return { value: clamp(n, 0, 100) };
    if (/loud|high|more|तेज|அதிக|أعلى/.test(norm(text))) return { value: 80 };
    if (/quiet|low|soft|less|धीम|குறை|أخفض/.test(norm(text))) return { value: 25 };
    return null;
  },
  run(args) {
    const v = args.value !== undefined && args.value !== null ? args.value : 55;
    musicSetVolume(v);
    return { ok: true, say: t('reply.music.volume', { value: Math.round(v) }) };
  }
});

defTool({
  id: 'music.tempo',
  icon: '⏱',
  cat: 'music',
  name: ['Set tempo', 'टेम्पो सेट करें', 'வேகத்தை அமை', 'اضبط الإيقاع'],
  desc: ['Change the generative tempo in BPM, e.g. "tempo 110".', 'जनरेटिव टेम्पो BPM में बदलता है।', 'உருவாக்கப்பட்ட வேகத்தை BPM இல் மாற்றும்.', 'غيّر الإيقاع المولّد بالم نبضة في الدقيقة.'],
  kw: { en: ['tempo', 'bpm', 'speed', 'faster', 'slower'], hi: ['टेम्पो', 'गति', 'तेज़', 'धीमा'], ta: ['வேகம்', 'அதிக', 'மெதுவாக'], ar: ['إيقاع', 'أسرع', 'أبطأ'] },
  parse(text) {
    const n = extractNumber(text);
    return n === null ? null : { value: clamp(n, 50, 150) };
  },
  run(args) {
    const v = args.value !== undefined && args.value !== null ? args.value : 82;
    musicSetBpm(v);
    return { ok: true, say: t('reply.music.bpm', { value: Math.round(v) }) };
  }
});

defTool({
  id: 'music.dj',
  icon: '🎛',
  cat: 'music',
  name: ['Toggle Auto-DJ', 'ऑटो-डीजे चालू/बंद', 'ஆட்டோ-டிஜே மாற்று', 'بدّل الدي جي الآلي'],
  desc: ['Let Argon swap the station whenever his mood changes.', 'मूड बदलते ही आर्गन स्टेशन बदलता है।', 'மேஜன் மாறும்போது ஆர்கன் நிலையத்தை மாற்றும்.', 'يبدّل أرجون المحطة كلما تغيّر مزاجه.'],
  kw: { en: ['auto dj', 'autodj', 'dj mode', 'follow my mood'], hi: ['ऑटो डीजे', 'डीजे'], ta: ['ஆட்டோ டிஜே', 'டிஜே'], ar: ['دي جي آلي', 'وضع الدي جي'] },
  parse(text) {
    const s = norm(text);
    if (/off|stop|बंद|நிறுத்து|أوقف/.test(s)) return { on: false };
    if (/on|start|चालू|தொடங்கு|شغل/.test(s)) return { on: true };
    return { on: !state.autoDJ };
  },
  run(args) {
    setAutoDJ(Boolean(args.on));
    return { ok: true, say: state.autoDJ ? t('music.djOn') : t('music.djOff') };
  }
});

/* ---- Voice -------------------------------------------------------------- */

defTool({
  id: 'voice.language',
  icon: '🌐',
  cat: 'voice',
  name: ['Change language', 'भाषा बदलें', 'மொழியை மாற்று', 'غيّر اللغة'],
  desc: ['Switch Argon between English, Hindi, Tamil and Arabic (with RTL).', 'अंग्रेज़ी, हिन्दी, तमिल और अरबी में बदलता है।', 'ஆங்கிலம், இந்தி, தமிழ், அரபி மாறுகிறது.', 'ينتقل بين الإنجليزية والهندية والتاميل والعربية.'],
  kw: {
    en: ['language', 'speak english', 'speak hindi', 'speak tamil', 'speak arabic', 'in tamil', 'in hindi', 'in arabic'],
    hi: ['भाषा', 'हिंदी में', 'अंग्रेज़ी में', 'अरबी में'],
    ta: ['மொழி', 'தமிழில்', 'ஆங்கிலத்தில்', 'அரபியில்'],
    ar: ['لغة', 'بالعربية', 'بالإنجليزية', 'بالهندية', 'بالتاميل']
  },
  parse(text) {
    const s = norm(text);
    if (/(english|angrez|angril|ஆங்கில|अंग्रेज़ी|انجليزي|anglais)/.test(s)) return { lang: 'en' };
    if (/(hindi|हिंदी|हिन्दी|இந்தி|हिंदी)/.test(s)) return { lang: 'hi' };
    if (/(tamil|தமிழ்|தமிழில|تاميلي)/.test(s)) return { lang: 'ta' };
    if (/(arabic|अरबी|அரபி|عربي)/.test(s)) return { lang: 'ar' };
    return null;
  },
  run(args) {
    const lang = args.lang || 'en';
    setLang(lang);
    return { ok: true, say: t('reply.lang', { lang: LOCALES[lang].native }), detail: lang };
  }
});

defTool({
  id: 'voice.tts',
  icon: '🔈',
  cat: 'voice',
  name: ['Toggle speech', 'बोलना चालू/बंद', 'பேசுதல் மாற்று', 'بدّل النطق'],
  desc: ['Mute or unmute Argon\'s spoken replies.', 'आर्गन की आवाज़ म्यूट या अनम्यूट करता है।', 'ஆர்கனின் குரலை மியூட் அல்லது திறக்கும்.', 'يكتم أو يفتح ردود أرجون الصوتية.'],
  kw: { en: ['be quiet', 'stop talking', 'mute', 'unmute', 'voice on', 'voice off'], hi: ['चुप', 'म्यूट', 'आवाज़ बंद'], ta: ['மூடு', 'ஒலி மூடு'], ar: ['اسكت', 'كتم', 'افتح الصوت'] },
  parse(text) {
    const s = norm(text);
    if (/off|stop|quiet|mute|बंद|चुप|அணை|أغلق|اسكت/.test(s)) return { on: false };
    return { on: true };
  },
  run(args) {
    setTts(Boolean(args.on));
    return { ok: true, say: args.on ? t('reply.ttsOn') : t('reply.ttsOff') };
  }
});

defTool({
  id: 'voice.rate',
  icon: '🐇',
  cat: 'voice',
  name: ['Speech speed', 'बोलने की गति', 'பேசும் வேகம்', 'سرعة النطق'],
  desc: ['Change how fast Argon talks, 0.5× to 1.8×.', 'आर्गन की बोलने की गति 0.5× से 1.8× तक।', 'ஆர்கன் பேசும் வேகம் 0.5× முதல் 1.8× வரை.', 'غيّر سرعة كلام أرجون من 0.5× إلى 1.8×.'],
  kw: { en: ['talk faster', 'talk slower', 'speech speed', 'speak faster', 'speak slower'], hi: ['तेज़ बोल', 'धीरे बोल', 'गति'], ta: ['வேகமாக', 'மெதுவாகப் பேசு'], ar: ['أسرع', 'أبطأ', 'سرعة الكلام'] },
  parse(text) {
    const n = extractNumber(text);
    if (n !== null) return { value: clamp(n, 0.5, 1.8) };
    const s = norm(text);
    if (/fast|quicker|तेज|வேகமாக|أسرع/.test(s)) return { value: 1.45 };
    if (/slow|slower|धीम|மெதுவாக|أبطأ/.test(s)) return { value: 0.75 };
    return null;
  },
  run(args) {
    const v = args.value !== undefined && args.value !== null ? args.value : 1;
    setTtsRate(v);
    return { ok: true, say: t('reply.done'), detail: `${v.toFixed(2)}×` };
  }
});

defTool({
  id: 'voice.pitch',
  icon: '📈',
  cat: 'voice',
  name: ['Voice pitch', 'आवाज़ का सुर', 'குரல் உயரம்', 'طبقة الصوت'],
  desc: ['Make Argon sound higher or lower.', 'आर्गन की आवाज़ ऊँची या नीची करता है।', 'ஆர்கனின் குரலை உயர்த்துகிறது அல்லது தாழ்த்துகிறது.', 'اجعل صوت أرجون أعلى أو أخفض.'],
  kw: { en: ['pitch', 'higher voice', 'lower voice', 'deeper'], hi: ['सुर', 'ऊँची आवाज़', 'गहरी आवाज़'], ta: ['உயரம்', 'ஆழமான குரல்'], ar: ['طبقة', 'صوت أعلى', 'صوت أخفض'] },
  parse(text) {
    const n = extractNumber(text);
    if (n !== null) return { value: clamp(n, 0.5, 1.8) };
    const s = norm(text);
    if (/high|deeper|up|ऊँचा|உயரம்|أعلى/.test(s)) return { value: 1.4 };
    if (/low|down|नीचा|குறை|أخفض/.test(s)) return { value: 0.8 };
    return null;
  },
  run(args) {
    const v = args.value !== undefined && args.value !== null ? args.value : 1.15;
    setTtsPitch(v);
    return { ok: true, say: t('reply.done'), detail: v.toFixed(2) };
  }
});

defTool({
  id: 'voice.listen',
  icon: '🎙',
  cat: 'voice',
  name: ['Listen once', 'एक बार सुनें', 'ஒரு முறை கேள்', 'استمع مرة'],
  desc: ['Open the microphone for a single utterance.', 'एक बात के लिए माइक्रोफ़ोन खोलता है।', 'ஒரு மொழி கேட்க மைக்ரோபோன் திறக்கும்.', 'يفتح الميكروفون لجملة واحدة.'],
  kw: { en: ['listen', 'hear me', 'i will speak', 'start listening'], hi: ['सुनो', 'सुनना'], ta: ['கேள்', 'கேட்பு'], ar: ['استمع', 'اسمعني'] },
  run() {
    startListening(false);
    return { ok: true, say: t('reply.listen') };
  }
});

defTool({
  id: 'voice.live',
  icon: '🔁',
  cat: 'voice',
  name: ['Hands-free mode', 'हैंड्स-फ्री मोड', 'கைமாத்திர முறை', 'وضع اليدين الحرّتين'],
  desc: ['Continuous listening with a "hey argon" wake phrase.', '"हे आर्गन" वाक्यांश के साथ लगातार सुनना।', '"ஹே ஆர்கன்" என்ற சொல்லும்போது தொடர் கேட்பு.', 'استماع مستمر مع عبارة «يا أرجون».'],
  kw: { en: ['hands free', 'live mode', 'always listening', 'wake word'], hi: ['हैंड्स फ्री', 'लाइव मोड'], ta: ['கைமாத்திர', 'நேரடி முறை'], ar: ['بدون استخدام اليدين', 'وضع دائم'] },
  parse(text) {
    const s = norm(text);
    if (/off|stop|बंद|நிறுத்து|أوقف/.test(s)) return { on: false };
    return { on: true };
  },
  run(args) {
    setLiveMode(Boolean(args.on));
    return { ok: true, say: state.liveMode ? t('reply.liveOn') : t('reply.liveOff') };
  }
});

defTool({
  id: 'voice.say',
  icon: '💬',
  cat: 'voice',
  name: ['Say something', 'कुछ कहो', 'ஏதாவது சொல்', 'قل شيئًا'],
  desc: ['Make Argon speak any phrase aloud — "say hello argon".', 'आर्गन से कोई भी वाक्य बुलवाता है।', 'ஆர்கனிடம் எந்த வாக்கியத்தையும் பேசச் செய்கிறது.', 'اجعل أرجون ينطق أي عبارة.'],
  kw: { en: ['say', 'repeat', 'tell me', 'speak'], hi: ['कहो', 'बोलो', 'दोहराओ'], ta: ['பேசு', 'ஒலு', 'ஒல்லு'], ar: ['قل', 'كرر', 'أخبرني'] },
  parse(text) {
    const s = norm(text);
    const m = s.match(/\bsay\b\s+(.+)$/) || s.match(/\bspeak\b\s+(.+)$/) || s.match(/\brepeat\b\s+(.+)$/);
    if (m) return { text: m[1].trim() };
    return null;
  },
  run(args) {
    const phrase = args.text || t('reply.sayHello');
    speakText(phrase);
    return { ok: true, say: phrase };
  }
});

/* ---- Window & display --------------------------------------------------- */

defTool({
  id: 'window.size',
  icon: '🪟',
  cat: 'window',
  name: ['Resize the window', 'विंडो का आकार', 'வின்டோ அளவு', 'غيّر حجم النافذة'],
  desc: ['Snap Argon to pocket, compact, half, wide or full size.', 'आर्गन को जेब, छोटा, आधा, चौड़ा या पूरा आकार दें।', 'ஆர்கனை பாக்கெட்ட், சிறிய, பாதி, அகல், முழு அளவுக்கு மாற்றும்.', 'اضبط أرجون على جيب أو مضغوط أو نصف أو عريض أو كامل.'],
  kw: {
    en: ['resize', 'make it small', 'make it big', 'minimise', 'minimize', 'maximize', 'window size', 'go tiny', 'go full', 'tiny', 'half', 'half size', 'full size', 'wide', 'smaller', 'bigger', 'shrink', 'enlarge'],
    hi: ['आकार', 'छोटा कर', 'बड़ा कर', 'विंडो'],
    ta: ['அளவு', 'அளவில்', 'பாதி அளவு', 'சிறியாக', 'பெரியாக', 'வின்டோ'],
    ar: ['حجم', 'صغر', 'كبر', 'نافذة']
  },
  parse(text) {
    const size = extractSize(text);
    return size ? { size } : null;
  },
  run(args) {
    const size = args.size || 'half';
    setWindowSize(size);
    return { ok: true, say: t('reply.window', { size: t('system.size.' + size) }), detail: size };
  }
});

defTool({
  id: 'window.fullscreen',
  icon: '⛶',
  cat: 'window',
  name: ['Toggle fullscreen', 'फ़ुल स्क्रीन', 'முழுத் திரை', 'ملء الشاشة'],
  desc: ['Go truly fullscreen on the browser window.', 'ब्राउज़र को सच में पूर्ण स्क्रीन में ले जाता है।', 'உலாவியை முழு திரையில் திறக்கும்.', 'ينقل المتصفح إلى ملء الشاشة فعليًا.'],
  kw: { en: ['fullscreen', 'full screen', 'maximize'], hi: ['फ़ुल स्क्रीन', 'पूरा स्क्रीन'], ta: ['முழு திரை'], ar: ['ملء الشاشة', 'شاشة كاملة'] },
  run() {
    toggleFullscreen();
    return { ok: true, say: t('reply.done') };
  }
});

defTool({
  id: 'display.backdrop',
  icon: '🌌',
  cat: 'window',
  name: ['Change backdrop', 'पृष्ठभूमि बदलें', 'பின்னணி மாற்று', 'غيّر الخلفية'],
  desc: ['Swap the void for another backdrop: nebula, sunrise, deep sea, ember.', 'शून्य की जगह दूसरी पृष्ठभूमि: नेबुला, सूर्योदय, गहरा समुद्र, अंगार।', 'வெறுமையை விட்டு மற்ற பின்னணி: நெபுலா, சூரிய உதயம், ஆழ்கடல், நெருப்பு.', 'يبدّل الفراغ بخلفية أخرى: سديم أو شروق أو بحر عميق أو جمر.'],
  kw: { en: ['background', 'backdrop', 'scene', 'nebula', 'sunrise', 'ocean', 'ember'], hi: ['पृष्ठभूमि', 'दृश्य', 'नेबुला', 'सूर्योदय'], ta: ['பின்னணி', 'காட்சி', 'நெபுலா'], ar: ['خلفية', 'مشهد', 'سديم', 'شروق'] },
  parse(text) {
    const s = norm(text);
    if (/sunrise|sun|morning|सूर्योदय|சூரிய|شروق|شمس/.test(s)) return { id: 'sunrise' };
    if (/ocean|sea|underwater|समुद्र|கடல்|بحر|محيط/.test(s)) return { id: 'ocean' };
    if (/ember|fire|campfire|अंगार|கரி|جمر|نار/.test(s)) return { id: 'ember' };
    if (/nebula|space|cosmic|नेबुला|நெபுலா|سديم|فضاء/.test(s)) return { id: 'nebula' };
    return { id: 'void' };
  },
  run(args) {
    setBackdrop(args.id || 'void');
    return { ok: true, say: t('reply.done'), detail: args.id };
  }
});

defTool({
  id: 'display.gpufur',
  icon: '⚡',
  cat: 'window',
  name: ['Toggle GPU fur', 'जीपीयू रोएँ चालू/बंद', 'GPU மயிர் மாற்று', 'بدّل فرو GPU'],
  desc: ['Switch between 60,000 volumetric strands and the light WebGL coat.', '60,000 आयतनिक तंतुओं और हल्की WebGL परत के बीच।', '60,000 பரிமாண இழைகளும் எளிய WebGL மயிரும் இடையே.', 'يتبدّل بين ستين ألف شعرة حجمية وفرو WebGL الخفيف.'],
  kw: { en: ['gpu', 'gpu fur', 'performance', 'lag', 'quality'], hi: ['जीपीयू', 'प्रदर्शन', 'गति'], ta: ['GPU', 'செயல்திறன்'], ar: ['gpu', 'أداء', 'جودة'] },
  parse(text) {
    const s = norm(text);
    if (/off|light|simple|low|बंद|हल्का|தான்|خفيف|أوقف/.test(s)) return { on: false };
    if (/on|full|high|चालू|पूरा|முழு|شغل/.test(s)) return { on: true };
    return { on: !state.gpuFur };
  },
  run(args) {
    setGpuFur(Boolean(args.on));
    return { ok: true, say: state.gpuFur ? t('reply.gpuOn') : t('reply.gpuOff') };
  }
});

/* ---- Utilities ---------------------------------------------------------- */

defTool({
  id: 'util.time',
  icon: '🕐',
  cat: 'utility',
  name: ['Tell the time', 'समय बताओ', 'நேரம் சொல்', 'أخبرني بالوقت'],
  desc: ['Ask Argon what time it is.', 'आर्गन समय बताता है।', 'ஆர்கன் நேரத்தைச் சொல்லும்.', 'يسأل أرجون عن الوقت.'],
  kw: { en: ['time', 'what time', 'clock', 'o clock'], hi: ['समय', 'घड़ी'], ta: ['நேரம்', 'மணி'], ar: ['وقت', 'الساعة', 'كم الساعة'] },
  run() {
    const now = new Date();
    const loc = LOCALES[currentLang].code;
    let text;
    try {
      text = new Intl.DateTimeFormat(loc === 'en' ? 'en-GB' : loc === 'ta' ? 'ta-IN' : loc === 'hi' ? 'hi-IN' : 'ar-SA',
        { hour: '2-digit', minute: '2-digit' }).format(now);
    } catch (e) { text = now.toTimeString().slice(0, 5); }
    return { ok: true, say: t('reply.time', { time: text }) };
  }
});

defTool({
  id: 'util.date',
  icon: '📅',
  cat: 'utility',
  name: ['Today\'s date', 'आज की तारीख', 'இன்றைய தேதி', 'تاريخ اليوم'],
  desc: ['Ask Argon for today\'s date.', 'आर्गन आज की तारीख बताता है।', 'ஆர்கன் இன்றைய தேதியைச் சொல்லும்.', 'يسأل أرجون عن تاريخ اليوم.'],
  kw: { en: ['date', 'today', 'what day'], hi: ['तारीख', 'आज', 'दिन'], ta: ['தேதி', 'இன்று'], ar: ['تاريخ', 'اليوم', 'يوم'] },
  run() {
    const now = new Date();
    const loc = currentLang === 'en' ? 'en-GB' : currentLang === 'ta' ? 'ta-IN' : currentLang === 'hi' ? 'hi-IN' : 'ar-SA';
    let text;
    try {
      text = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    } catch (e) { text = now.toDateString(); }
    return { ok: true, say: t('reply.date', { date: text }) };
  }
});

defTool({
  id: 'util.math',
  icon: '🧮',
  cat: 'utility',
  name: ['Do maths', 'गणित करो', 'கணக்கு செய்', 'احسب'],
  desc: ['Evaluate an expression like "25 * 4 + 6".', '"25 * 4 + 6" जैसा हिसाब लगाता है।', '"25 * 4 + 6" போன்ற கணக்கை செய்கிறது.', 'يحسب تعبيرًا مثل «25 * 4 + 6».'],
  kw: { en: ['calculate', 'math', 'plus', 'minus', 'multiply', 'divide', 'sum', 'how much is'], hi: ['गणना', 'जोड़', 'घटाव', 'गुणा'], ta: ['கணக்கு', 'கூட்டு', 'பெருக்கு'], ar: ['احسب', 'جمع', 'طرح', 'ضرب'] },
  detect(text) {
    const s = norm(text);
    if (!/\d/.test(s)) return false;
    return /-?\d+(?:\.\d+)?\s*(?:[+\-*\/x×÷]\s*-?\d+(?:\.\d+)?\s*)+/.test(s);
  },
  parse(text) {
    const s = norm(text);
    const m = s.match(/(-?\d+(?:\.\d+)?\s*(?:[+\-*\/x×÷]\s*-?\d+(?:\.\d+)?\s*)+)/);
    if (!m) return null;
    return { expr: m[1].replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '') };
  },
  run(args) {
    const expr = args.expr;
    if (!expr || !/^[-+*/().\d\s]+$/.test(expr)) return { ok: false, say: t('reply.unknown') };
    try {
      const result = Function('"use strict";return (' + expr + ')')();
      if (typeof result !== 'number' || !isFinite(result)) throw new Error('nan');
      return { ok: true, say: t('reply.math', { result: Math.round(result * 1e6) / 1e6 }), detail: expr + ' = ' + result };
    } catch (e) {
      return { ok: false, say: t('reply.unknown') };
    }
  }
});

defTool({
  id: 'util.convert',
  icon: '📐',
  cat: 'utility',
  name: ['Convert units', 'इकाई बदलें', 'அலகு மாற்று', 'حوّل الوحدات'],
  desc: ['Convert length, weight and temperature — "10 km to miles".', 'लंबाई, वज़न और तापमान बदलता है।', 'நீளம், எடை, வெப்பநிலை மாற்றும்.', 'يحوّل الطول والوزن ودرجة الحرارة.'],
  kw: { en: ['convert', 'how many', 'in miles', 'in kg', 'in celsius', 'fahrenheit'], hi: ['बदलो', 'किलो', 'मील'], ta: ['மாற்று', 'கிலோ', 'மைல்'], ar: ['حوّل', 'كيلو', 'ميل'] },
  parse(text) {
    const s = norm(text);
    const n = extractNumber(text);
    if (n === null) return null;
    const from = /km|kilometer|kilometre/.test(s) ? 'km' : /mi|mile/.test(s) ? 'mi' : /m|meter|metre/.test(s) ? 'm' : /cm/.test(s) ? 'cm' : /kg/.test(s) ? 'kg' : /g|gram/.test(s) ? 'g' : /lb|pound/.test(s) ? 'lb' : /c|celsius/.test(s) ? 'c' : /f|fahrenheit/.test(s) ? 'f' : null;
    const to = /to|in/.test(s) ? (s.match(/to\s+([a-z]+)/) || s.match(/in\s+([a-z]+)/) || [])[1] : null;
    let target = null;
    if (to) {
      if (/km|kilometer/.test(to)) target = 'km';
      else if (/mi|mile/.test(to)) target = 'mi';
      else if (/cm/.test(to)) target = 'cm';
      else if (/m\b|meter|metre/.test(to)) target = 'm';
      else if (/kg/.test(to)) target = 'kg';
      else if (/g\b|gram/.test(to)) target = 'g';
      else if (/lb|pound/.test(to)) target = 'lb';
      else if (/c\b|celsius/.test(to)) target = 'c';
      else if (/f\b|fahrenheit/.test(to)) target = 'f';
    }
    if (!from || !target) return null;
    return { value: n, from, to: target };
  },
  run(args) {
    if (!args.from || !args.to) return { ok: false, say: t('reply.unknown') };
    const table = {
      km: { mi: 0.621371, m: 1000, cm: 100000 },
      mi: { km: 1.60934, m: 1609.34, cm: 160934 },
      m:  { km: 0.001, mi: 0.000621371, cm: 100 },
      cm: { m: 0.01, km: 0.00001, mi: 0.00000621371 },
      kg: { g: 1000, lb: 2.20462 },
      g:  { kg: 0.001, lb: 0.00220462 },
      lb: { kg: 0.453592, g: 453.592 }
    };
    let result = null;
    if (table[args.from] && table[args.from][args.to] !== undefined) {
      result = args.value * table[args.from][args.to];
    } else if ((args.from === 'c' && args.to === 'f') || (args.from === 'f' && args.to === 'c')) {
      result = args.from === 'c' ? args.value * 9 / 5 + 32 : (args.value - 32) * 5 / 9;
    }
    if (result === null) return { ok: false, say: t('reply.unknown') };
    const rounded = Math.round(result * 100) / 100;
    return { ok: true, say: t('reply.convert', { value: `${args.value} ${args.from}`, result: `${rounded} ${args.to}` }), detail: `${args.value}${args.from} → ${rounded}${args.to}` };
  }
});

defTool({
  id: 'util.status',
  icon: '📊',
  cat: 'utility',
  name: ['System status', 'सिस्टम स्थिति', 'நிலை அறிக்கை', 'حالة النظام'],
  desc: ['Report Argon\'s mood, energy, music, language and window state.', 'मूड, ऊर्जा, संगीत, भाषा और विंडो की स्थिति बताता है।', 'மேஜன், ஆற்றல், இசை, மொழி, வின்டோ நிலை.', 'يبلّغ عن المزاج والطاقة والموسيقى واللغة وحالة النافذة.'],
  kw: { en: ['status', 'how are you', 'how are you doing', 'report', 'state'], hi: ['स्थिति', 'कैसे हो', 'हाल'], ta: ['நிலை', 'எப்படி', 'இருக்கிறாய்'], ar: ['الحالة', 'كيف حالك', 'وضع'] },
  run() {
    const music = state.musicPlaying ? t('music.play') : t('music.pause');
    return {
      ok: true,
      say: t('reply.status', {
        mood: t('mood.' + state.mood),
        vibe: Math.round(state.vibe),
        music,
        lang: LOCALES[state.lang].native
      })
    };
  }
});

defTool({
  id: 'util.rename',
  icon: '🏷',
  cat: 'utility',
  name: ['Rename Argon', 'आर्गन का नाम बदलें', 'ஆர்கனை மறுபெயர்', 'غيّر اسمي'],
  desc: ['Give Argon a new name — he answers to it from then on.', 'आर्गन को नया नाम दें — अब वह उसी से जवाब देगा।', 'ஆர்கனுக்கு புதிய பெயர் — அதையே அது பதிலளிக்கும்.', 'امنح أرجون اسمًا جديدًا — سيجيب به من الآن فصاعدًا.'],
  kw: { en: ['your name', 'rename', 'call you', 'i call you', 'your name is'], hi: ['नाम', 'बदलो'], ta: ['பெயர்', 'மாற்று'], ar: ['اسمك', 'غير اسمك'] },
  parse(text) {
    const s = norm(text);
    const m = s.match(/(?:call you|rename(?: you)? to|your name is|name is)\s+(.+)$/);
    if (m) return { name: m[1].trim().slice(0, 24) };
    return null;
  },
  run(args) {
    const name = (args.name || t('app.name')).trim().slice(0, 24);
    state.name = name || t('app.name');
    saveState();
    bus.emit('name:changed', state.name);
    return { ok: true, say: t('reply.name', { name: state.name }), detail: state.name };
  }
});

defTool({
  id: 'util.help',
  icon: '💡',
  cat: 'utility',
  name: ['List capabilities', 'क्षमताएँ बताओ', 'திறன்களைப் பட்டியல்', 'اذكر القدرات'],
  desc: ['Ask what Argon can do — he lists his own skills.', 'आर्गन अपनी क्षमताएँ बताता है।', 'ஆர்கன் தன் திறன்களைச் சொல்வான்.', 'يطلب من أرجون أن يعدّد مهاراته.'],
  kw: { en: ['help', 'what can you do', 'capabilities', 'commands', 'skills', 'options'], hi: ['मदद', 'क्या कर सकते', 'कौशल'], ta: ['உதவி', 'என்ன செய்ய முடியும்', 'திறன்கள்'], ar: ['مساعدة', 'ماذا تستطيع', 'قدراتك', 'مهاراتك'] },
  run() {
    return { ok: true, say: t('reply.help', { count: ARGON_TOOLS.length }), detail: ARGON_TOOLS.length + ' tools' };
  }
});

defTool({
  id: 'util.export',
  icon: '⬇',
  cat: 'utility',
  name: ['Export settings', 'सेटिंग निर्यात', 'அமைப்புகளை ஏற்றுமதி', 'صدّر الإعدادات'],
  desc: ['Download Argon\'s current configuration as a JSON file.', 'वर्तमान सेटिंग JSON फ़ाइल के रूप में डाउनलोड करता है।', 'தற்போதைய அமைப்பை JSON கோப்பாகப் பதிவிறக்கும்.', 'ينزّل إعداد أرجون الحالي كملف JSON.'],
  kw: { en: ['export', 'download settings', 'backup', 'save config'], hi: ['निर्यात', 'सेव करो'], ta: ['ஏற்றுமதி', 'சேமி'], ar: ['صدّر', 'احفظ'] },
  run() {
    exportSettings();
    return { ok: true, say: t('system.exported') };
  }
});

/* ---- Social small talk -------------------------------------------------- */

defTool({
  id: 'social.greet',
  icon: '👋',
  cat: 'vibe',
  name: ['Say hello', 'नमस्ते कहो', 'வணக்கம் சொல்', 'ألقِ التحية'],
  desc: [
    'A proper greeting, in whatever language you greet him in.',
    'जिस भी भाषा में आप नमस्ते कहें, वही जवाब।',
    'நீங்கள் வணக்கம் சொல்வதே அதன் மொழியில் பதிலளிக்கும்.',
    'ردّه عليك بنفس اللغة التي حيّيتَه بها.'
  ],
  kw: {
    en: ['hello', 'hi ', 'hey', 'good morning', 'good evening', 'greetings', 'yo'],
    hi: ['नमस्ते', 'नमस्कार', 'सुप्रभात', 'हैलो'],
    ta: ['வணக்கம்', 'காலை வணக்கம்', 'வணக்கம் '],
    ar: ['مرحبا', 'السلام', 'صباح الخير', 'اهلا', 'هاي']
  },
  run() {
    return { ok: true, say: t('reply.sayHello') };
  }
});

defTool({
  id: 'social.thanks',
  icon: '🙏',
  cat: 'vibe',
  name: ['Answer thanks', 'धन्यवाद का जवाब', 'நன்றி சொல்லு', 'ردّ على الشكر'],
  desc: ['Argon acknowledges your thanks warmly.', 'आर्गन धन्यवाद का प्यार से जवाब देता है।', 'ஆர்கன் நன்றிகளுக்கு அன்புடன் பதிலளிக்கும்.', 'يعترف أرجون بشكرك بدفء.'],
  kw: {
    en: ['thank', 'thanks', 'thx', 'appreciate'],
    hi: ['धन्यवाद', 'शुक्रिया'],
    ta: ['நன்றி', 'நன்றி '],
    ar: ['شكرا', 'شكر', 'ممتاز']
  },
  run() {
    return { ok: true, say: t('reply.thanks') };
  }
});

defTool({
  id: 'social.joke',
  icon: '🎭',
  cat: 'utility',
  name: ['Tell a joke', 'एक चुटकुला सुनाओ', 'ஒரு நகைச்சுவா சொல்', 'احكِ نكتة'],
  desc: ['Argon tells a small joke — he only knows a few, but he likes them.', 'आर्गन एक छोटा चुटकुला सुनाता है।', 'ஆர்கன் ஒரு சிறிய நகைச்சுவா சொல்கிறான்.', 'روي أرجون نكتة صغيرة يحبها كثيرًا.'],
  kw: {
    en: ['joke', 'funny', 'make me laugh', 'punchline'],
    hi: ['चुटकुला', 'मज़ाक', 'हँसाओ'],
    ta: ['நகைச்சுவா', 'கேடி', 'சிரிக்க'],
    ar: ['نكتة', 'اضحكني', 'مزح']
  },
  run() {
    return { ok: true, say: t('reply.joke') };
  }
});

defTool({
  id: 'social.who',
  icon: '🫀',
  cat: 'utility',
  name: ['Who are you', 'तुम कौन हो', 'நீ யார்', 'من أنت'],
  desc: ['Argon explains what he is and what he can do.', 'आर्गन बताता है कि वो क्या है।', 'ஆர்கன் தன்னைப் பற்றி சொல்கிறான்.', 'يشرح أرجون ما هو وما يستطيع فعله.'],
  kw: {
    en: ['who are you', 'what are you', 'your name', 'introduce yourself'],
    hi: ['तुम कौन', 'आप कौन', 'अपना परिचय'],
    ta: ['நீ யார்', 'உன் பெயர்', 'உடன் அறிமுகம்'],
    ar: ['من أنت', 'ما اسمك', 'عرّف بنفسك']
  },
  run() {
    return { ok: true, say: t('reply.whoAreYou', { count: toolCount() }) };
  }
});

/* ==========================================================================
   Registry helpers
   ========================================================================== */

function getTool(id) { return ARGON_TOOLS.find((t) => t.id === id); }
function toolCount() { return ARGON_TOOLS.length; }
