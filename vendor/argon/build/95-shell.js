/* ==========================================================================
   ARGON — SHELL
   The resizable frame, the single-gear control deck, and all UI wiring.
   ========================================================================== */

const frameEl = el('argon-frame');
const deckEl = el('deck');

/* ==========================================================================
   1. RESIZABLE FRAME — from a 180px pocket to the full browser window
   ========================================================================== */

const FRAME_PRESETS = {
  tiny:    { w: 180, h: 180 },
  compact: { w: 380, h: 320 },
  half:    { w: 0, h: 0, ratioW: 0.52, ratioH: 0.66 },
  wide:    { w: 0, h: 0, ratioW: 0.92, ratioH: 0.80 },
  full:    { w: 0, h: 0, ratioW: 1, ratioH: 1 }
};

let frameState = {
  x: 0, y: 0, w: 0, h: 0,
  mode: 'free',
  restore: null
};

function viewportSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

function clampFrame(x, y, w, h) {
  const vp = viewportSize();
  const minW = 200, minH = 160;
  w = Math.max(minW, Math.min(w, vp.w));
  h = Math.max(minH, Math.min(h, vp.h));
  x = Math.max(0, Math.min(x, vp.w - w));
  y = Math.max(0, Math.min(y, vp.h - h));
  return { x, y, w, h };
}

function applyFrame() {
  const f = frameState;
  frameEl.style.left = Math.round(f.x) + 'px';
  frameEl.style.top = Math.round(f.y) + 'px';
  frameEl.style.width = Math.round(f.w) + 'px';
  frameEl.style.height = Math.round(f.h) + 'px';
  frameEl.style.right = 'auto';
  frameEl.style.bottom = 'auto';
  frameEl.setAttribute('data-mode', f.mode);
  const vp = viewportSize();
  const isFull = f.mode === 'full';
  frameEl.style.borderRadius = isFull ? '0' : (f.mode === 'tiny' ? '50%' : '');
  const tinyBadge = el('tiny-badge');
  if (tinyBadge) tinyBadge.style.display = f.mode === 'tiny' ? 'block' : 'none';
  if (tinyBadge && MOODS[state.mood]) tinyBadge.textContent = MOODS[state.mood].emoji;
  bus.emit('frame:changed', f);
  void vp;
}

function setWindowSize(size) {
  const vp = viewportSize();
  const preset = FRAME_PRESETS[size] || FRAME_PRESETS.compact;
  if (size === 'tiny') {
    if (frameState.mode !== 'tiny') {
      frameState.restore = { x: frameState.x, y: frameState.y, w: frameState.w, h: frameState.h };
    }
    frameState.mode = 'tiny';
    frameState.w = preset.w;
    frameState.h = preset.h;
    frameState.x = Math.round((vp.w - preset.w) / 2);
    frameState.y = Math.round((vp.h - preset.h) / 2);
  } else if (size === 'free') {
    if (frameState.mode === 'tiny' && frameState.restore) {
      const r = frameState.restore;
      frameState.x = r.x; frameState.y = r.y; frameState.w = r.w; frameState.h = r.h;
      frameState.restore = null;
    }
    frameState.mode = 'free';
  } else {
    frameState.mode = size;
    frameState.w = preset.ratioW ? Math.round(vp.w * preset.ratioW) : preset.w;
    frameState.h = preset.ratioH ? Math.round(vp.h * preset.ratioH) : preset.h;
    frameState.x = Math.round((vp.w - frameState.w) / 2);
    frameState.y = Math.round((vp.h - frameState.h) / 2);
  }
  const c = clampFrame(frameState.x, frameState.y, frameState.w, frameState.h);
  frameState.x = c.x; frameState.y = c.y; frameState.w = c.w; frameState.h = c.h;
  applyFrame();
  saveState();
  bus.emit('window:size', frameState.mode);
  return frameState.mode;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const p = frameEl.requestFullscreen ? frameEl.requestFullscreen() : null;
    if (p && p.catch) p.catch(() => {});
    setWindowSize('full');
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    setWindowSize('wide');
  }
}

/* ---- Dragging & resizing ------------------------------------------------ */

let dragState = null;
let resizeState = null;

function startDrag(e) {
  if (e.target.closest('button') && e.target.closest('#argon-chrome')) return;
  if (frameState.mode === 'tiny') {
    dragState = { kind: 'tiny', startX: e.clientX, startY: e.clientY, origX: frameState.x, origY: frameState.y, moved: false };
  } else {
    dragState = { kind: 'move', startX: e.clientX, startY: e.clientY, origX: frameState.x, origY: frameState.y, moved: false };
  }
  frameEl.setAttribute('data-dragging', '1');
  e.preventDefault();
}

function startResize(e, dir) {
  resizeState = {
    dir,
    startX: e.clientX, startY: e.clientY,
    origX: frameState.x, origY: frameState.y, origW: frameState.w, origH: frameState.h
  };
  frameEl.setAttribute('data-resizing', '1');
  e.preventDefault();
  e.stopPropagation();
}

window.addEventListener('pointermove', (e) => {
  if (dragState) {
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
    const c = clampFrame(dragState.origX + dx, dragState.origY + dy, frameState.w, frameState.h);
    frameState.x = c.x; frameState.y = c.y;
    applyFrame();
    return;
  }
  if (resizeState) {
    const dx = e.clientX - resizeState.startX;
    const dy = e.clientY - resizeState.startY;
    let { x, y, w, h } = resizeState;
    const d = resizeState.dir;
    if (d.includes('e')) w = resizeState.origW + dx;
    if (d.includes('s')) h = resizeState.origH + dy;
    if (d.includes('w')) { w = resizeState.origW - dx; x = resizeState.origX + dx; }
    if (d.includes('n')) { h = resizeState.origH - dy; y = resizeState.origY + dy; }
    const c = clampFrame(x, y, w, h);
    frameState.x = c.x; frameState.y = c.y; frameState.w = c.w; frameState.h = c.h;
    if (d.includes('w') || d.includes('n')) frameState.x = c.x;
    applyFrame();
  }
});

window.addEventListener('pointerup', (e) => {
  if (dragState && dragState.kind === 'tiny' && !dragState.moved) {
    // A tap on the tiny orb expands it back.
    setWindowSize('free');
    if (frameState.restore) {
      frameState.mode = 'free';
      applyFrame();
    }
  }
  if (dragState) {
    dragState = null;
    frameEl.setAttribute('data-dragging', '0');
    saveState();
  }
  if (resizeState) {
    resizeState = null;
    frameEl.setAttribute('data-resizing', '0');
    frameState.mode = 'free';
    saveState();
    bus.emit('window:size', frameState.mode);
  }
});

/* ==========================================================================
   2. CONTROL DECK
   ========================================================================== */

const NAV_ITEMS = [
  { id: 'assistant', icon: 'assistant' },
  { id: 'skills', icon: 'skills' },
  { id: 'music', icon: 'music' },
  { id: 'voice', icon: 'voice' },
  { id: 'scene', icon: 'scene' },
  { id: 'language', icon: 'language' },
  { id: 'system', icon: 'system' }
];

const NAV_ICONS = {
  assistant: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  skills: '<path d="M12 2l2.4 6.2L21 10.6l-4.6 4.3 1.2 6.5L12 18l-5.6 3.4 1.2-6.5L3 10.6l6.6-2.4L12 2z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  scene: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  language: '<path d="M4 5h10M9 3v2c0 5-2.5 9-5 11"/><path d="M7 10c1.5 3 4 6 7 7.5"/><path d="M13 21l4.5-11L22 21"/><path d="M15 17h5"/>',
  system: '<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" x2="16" y1="20" y2="20"/><line x1="12" x2="12" y1="16" y2="20"/>'
};

function svgIcon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + NAV_ICONS[name] + '</svg>';
}

let activePane = 'assistant';

function renderNav() {
  const nav = el('deck-nav');
  if (!nav) return;
  nav.replaceChildren();
  NAV_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-btn' + (activePane === item.id ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(activePane === item.id));
    btn.innerHTML = svgIcon(item.icon) + '<span class="nav-label">' + t('nav.' + item.id) + '</span>';
    btn.addEventListener('click', () => {
      activePane = item.id;
      renderNav();
      document.querySelectorAll('.pane').forEach((p) => {
        p.classList.toggle('active', p.getAttribute('data-pane') === activePane);
      });
      el('deck-panes').scrollTop = 0;
    });
    nav.appendChild(btn);
  });
}

function openDeck() {
  if (frameState.mode === 'tiny') return;
  deckEl.classList.add('open');
  deckEl.setAttribute('aria-hidden', 'false');
  const btn = el('deck-btn');
  if (btn) { btn.classList.add('active', 'spin'); setTimeout(() => btn.classList.remove('spin'), 520); btn.setAttribute('aria-expanded', 'true'); }
  renderAll();
  if (activePane === 'voice') startMicMeter();
}

function closeDeck() {
  deckEl.classList.remove('open');
  deckEl.setAttribute('aria-hidden', 'true');
  const btn = el('deck-btn');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
}

function toggleDeck() {
  if (deckEl.classList.contains('open')) closeDeck(); else openDeck();
}

/* ==========================================================================
   3. RENDERERS — every list in the deck is rebuilt from data
   ========================================================================== */

const CHIPS = [
  { key: 'chip.lofi', cmd: 'chip.cmd.lofi' },
  { key: 'chip.half', cmd: 'chip.cmd.half' },
  { key: 'chip.dance', cmd: 'chip.cmd.dance' },
  { key: 'chip.gold', cmd: 'chip.cmd.gold' },
  { key: 'chip.help', cmd: 'chip.cmd.help' }
];

function renderChips() {
  const row = el('chip-row');
  if (!row) return;
  row.replaceChildren();
  CHIPS.forEach((chip) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill';
    b.textContent = t(chip.key);
    b.addEventListener('click', () => submitUtterance(t(chip.cmd), 'chip'));
    row.appendChild(b);
  });
}

function renderMoods() {
  const strip = el('mood-strip');
  if (!strip) return;
  strip.replaceChildren();
  MOOD_ORDER.forEach((id) => {
    const m = MOODS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mood-chip' + (state.mood === id ? ' active' : '');
    b.title = t4(m.desc);
    b.innerHTML = '<span class="emo">' + m.emoji + '</span><span>' + t('mood.' + id) + '</span>';
    b.addEventListener('click', () => { setMood(id); });
    strip.appendChild(b);
  });
  const hint = el('mood-hint');
  if (hint) hint.textContent = MOODS[state.mood] ? t4(MOODS[state.mood].desc) : '';
  const badge = el('tiny-badge');
  if (badge && MOODS[state.mood]) badge.textContent = MOODS[state.mood].emoji;
}

function renderSkills() {
  const grid = el('skill-grid');
  if (!grid) return;
  grid.replaceChildren();
  ARGON_TOOLS.forEach((tool) => {
    const card = document.createElement('div');
    card.className = 'skill' + (tool.enabled ? '' : ' off');

    const head = document.createElement('div');
    head.className = 'skill-head';
    const icon = document.createElement('span');
    icon.className = 'skill-icon';
    icon.textContent = tool.icon;
    const titleWrap = document.createElement('div');
    titleWrap.style.minWidth = '0';
    const name = document.createElement('div');
    name.className = 'skill-name';
    name.textContent = t4(tool.name);
    const idEl = document.createElement('div');
    idEl.className = 'skill-id';
    idEl.textContent = tool.id;
    titleWrap.appendChild(name);
    titleWrap.appendChild(idEl);
    head.appendChild(icon);
    head.appendChild(titleWrap);

    const desc = document.createElement('div');
    desc.className = 'skill-desc';
    desc.textContent = t4(tool.desc);

    const foot = document.createElement('div');
    foot.className = 'skill-foot';
    const cat = document.createElement('span');
    cat.className = 'skill-cat';
    cat.textContent = t('skills.category.' + tool.cat);
    const run = document.createElement('button');
    run.type = 'button';
    run.className = 'btn sm skill-run';
    run.textContent = t('skills.run');
    run.addEventListener('click', () => {
      const res = runTool(tool.id, {});
      if (res && res.say) speakArgonReply(res.say);
      logToolResult({ id: tool.id, icon: tool.icon, name: t4(tool.name), ok: res && res.ok, say: res && res.say, detail: res && res.detail });
    });
    foot.appendChild(cat);
    foot.appendChild(run);

    card.appendChild(head);
    card.appendChild(desc);
    card.appendChild(foot);
    grid.appendChild(card);
  });
  const count = el('skills-count');
  if (count) count.textContent = ARGON_TOOLS.length + ' ' + t('skills.count');
}

function renderStations() {
  const list = el('station-list');
  if (!list) return;
  list.replaceChildren();
  MUSIC_STATIONS.forEach((st) => {
    const row = document.createElement('div');
    row.className = 'station' + (state.musicStation === st.id ? ' active' : '');
    const art = document.createElement('span');
    art.className = 'station-art';
    art.style.background = 'linear-gradient(135deg, rgba(168,85,247,.4), rgba(56,189,248,.25))';
    art.textContent = st.icon;
    const meta = document.createElement('div');
    meta.className = 'station-meta';
    const n = document.createElement('div');
    n.className = 'station-name';
    n.textContent = st.name;
    const d = document.createElement('div');
    d.className = 'station-desc';
    d.textContent = st.desc;
    meta.appendChild(n);
    meta.appendChild(d);
    const bpm = document.createElement('span');
    bpm.className = 'station-bpm';
    bpm.textContent = st.bpm + ' BPM';
    row.appendChild(art);
    row.appendChild(meta);
    row.appendChild(bpm);
    row.addEventListener('click', () => {
      Music.play(st.id);
      Music.setBpm(st.bpm);
      updateMusicUI();
    });
    list.appendChild(row);
  });
  const hint = el('stations-hint');
  if (hint) hint.textContent = MUSIC_STATIONS.length + ' stations';
}

function renderLanguages() {
  const grid = el('lang-grid');
  const row = el('lang-row');
  if (grid) grid.replaceChildren();
  if (row) row.replaceChildren();

  LOCALE_ORDER.forEach((code) => {
    const loc = LOCALES[code];
    if (grid) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lang-card' + (state.lang === code ? ' active' : '');
      card.setAttribute('lang', code);
      const native = document.createElement('div');
      native.className = 'lang-native';
      native.textContent = loc.native;
      const en = document.createElement('div');
      en.className = 'lang-en';
      en.textContent = loc.name + ' · ' + loc.hint;
      const sample = document.createElement('div');
      sample.className = 'lang-sample';
      sample.textContent = t('language.sample.' + code);
      card.appendChild(native);
      card.appendChild(en);
      card.appendChild(sample);
      card.addEventListener('click', () => setLang(code));
      grid.appendChild(card);
    }
    if (row) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill' + (state.lang === code ? ' active' : '');
      pill.setAttribute('lang', code);
      pill.textContent = loc.native;
      pill.addEventListener('click', () => setLang(code));
      row.appendChild(pill);
    }
  });

  const hint = el('lang-hint');
  if (hint) hint.textContent = LOCALES[state.lang].native;
  const hint2 = el('lang-hint2');
  if (hint2) hint2.textContent = LOCALES[state.lang].native;
  const preview = el('lang-preview');
  if (preview) {
    preview.setAttribute('lang', state.lang);
    preview.textContent = t('reply.hello') + '  ' + t('language.sample.' + state.lang);
  }
}

function renderCoats() {
  const grid = el('coat-grid');
  if (!grid) return;
  grid.replaceChildren();
  COAT_PRESETS.forEach((coat) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'coat' + (state.coat === coat.id ? ' active' : '');
    const sw = document.createElement('div');
    sw.className = 'coat-swatch';
    sw.style.background = 'linear-gradient(135deg, ' + coat.tipColor + ' 0%, ' + coat.baseColor + ' 100%)';
    const nm = document.createElement('div');
    nm.className = 'coat-name';
    nm.textContent = coat.name;
    b.appendChild(sw);
    b.appendChild(nm);
    b.addEventListener('click', () => { applyCoat(coat.id); renderCoats(); });
    grid.appendChild(b);
  });
  const hint = el('coat-hint');
  if (hint) hint.textContent = COAT_PRESETS.length + ' coats';
}

function renderBackdrops() {
  const group = el('backdrop-group');
  if (!group) return;
  group.replaceChildren();
  const ids = ['void', 'nebula', 'sunrise', 'ocean', 'ember'];
  ids.forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill' + (backdropId === id ? ' active' : '');
    b.textContent = t('backdrop.' + id);
    b.addEventListener('click', () => { setBackdrop(id); renderBackdrops(); });
    group.appendChild(b);
  });
}

function renderSizes() {
  const grid = el('size-grid');
  if (!grid) return;
  grid.replaceChildren();
  const sizes = [
    { id: 'tiny', icon: '🔵' },
    { id: 'compact', icon: '▫️' },
    { id: 'half', icon: '◧' },
    { id: 'wide', icon: '▭' },
    { id: 'full', icon: '⛶' }
  ];
  sizes.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'size-card' + (frameState.mode === s.id ? ' active' : '');
    const prev = document.createElement('div');
    prev.className = 'size-preview';
    prev.textContent = s.icon;
    const nm = document.createElement('div');
    nm.className = 'size-name';
    nm.textContent = t('system.size.' + s.id);
    b.appendChild(prev);
    b.appendChild(nm);
    b.addEventListener('click', () => setWindowSize(s.id));
    grid.appendChild(b);
  });
  const hint = el('window-hint');
  if (hint) hint.textContent = Math.round(frameState.w) + ' × ' + Math.round(frameState.h);
}

function renderTelemetry() {
  const dl = el('telemetry');
  if (!dl) return;
  const rows = [
    [t('system.fps'), fps + ' fps'],
    [t('system.strands'), gpuFurOn ? '60,000' : '26,000'],
    [t('system.mood'), t('mood.' + state.mood)],
    [t('system.vibe'), Math.round(state.vibe) + '%'],
    [t('system.lang'), LOCALES[state.lang].native + ' (' + state.lang + ')'],
    [t('system.music'), Music.playing ? Music.trackTitle() : t('music.idle')]
  ];
  dl.replaceChildren();
  rows.forEach(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
}

function updateMusicUI() {
  const title = el('music-title');
  const sub = el('music-sub');
  if (title) title.textContent = Music.playing ? Music.trackTitle() : t('music.idle');
  if (sub) sub.textContent = Music.playing ? Music.stationId.toUpperCase() + ' · ' + Music.bpm + ' BPM' : t('music.idleSub');
  const icon = el('music-play-icon');
  if (icon) {
    icon.innerHTML = Music.playing
      ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
      : '<polygon points="6 4 20 12 6 20 6 4"/>';
  }
  const dj = el('music-dj');
  if (dj) dj.classList.toggle('active', state.autoDJ);
}

function renderAll() {
  translateDOM(document);
  renderNav();
  renderChips();
  renderMoods();
  renderSkills();
  renderStations();
  renderLanguages();
  renderCoats();
  renderBackdrops();
  renderSizes();
  updateMusicUI();
  renderTelemetry();
  const about = el('about-note');
  if (about) about.textContent = t('system.aboutText');
  const engHint = el('assistant-engine-hint');
  if (engHint) engHint.textContent = t('assistant.engine') + ' · ' + ARGON_TOOLS.length + ' ' + t('skills.count');
}

/* ==========================================================================
   4. CHAT
   ========================================================================== */

function appendMsg(role, text) {
  const log = el('chat-log');
  if (!log) return;
  const item = document.createElement('div');
  item.className = 'msg ' + role;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = role === 'argon' ? state.name : t('assistant.you');
  const body = document.createElement('span');
  body.textContent = text;
  item.appendChild(who);
  item.appendChild(body);
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

function logToolResult(result) {
  const log = el('tool-log');
  if (!log) return;
  const row = document.createElement('div');
  row.className = 'tl';
  const code = document.createElement('code');
  code.textContent = result.id;
  const mark = document.createElement('span');
  mark.className = result.ok ? 'ok' : 'no';
  mark.textContent = result.ok ? '✓' : '✕';
  const note = document.createElement('span');
  note.textContent = result.detail || '';
  row.appendChild(code);
  row.appendChild(mark);
  row.appendChild(note);
  log.insertBefore(row, log.firstChild);
  while (log.children.length > 24) log.removeChild(log.lastChild);
  const hint = el('trace-hint');
  if (hint) hint.textContent = log.children.length + ' calls';
}

/** Sensible demonstration arguments so every Run button does something real. */
const TOOL_DEMO = {
  'fur.coat':      { coatId: 'solar' },
  'fur.tint':      { color: { name: 'cyan', hex: '#22d3ee' } },
  'fur.style':     { style: 'fluffy' },
  'fur.params':    { param: 'furDensity', value: 0.55 },
  'vibe.level':    { value: 88 },
  'mood.set':      { mood: 'hyper' },
  'music.play':    { station: 'synth' },
  'music.volume':  { value: 70 },
  'music.tempo':   { value: 110 },
  'music.dj':      { on: true },
  'voice.language':{ lang: 'ta' },
  'voice.tts':     { on: false },
  'voice.rate':    { value: 1.3 },
  'voice.pitch':   { value: 1.35 },
  'voice.live':    { on: true },
  'voice.say':     { text: 'Hello, I am Argon!' },
  'window.size':   { size: 'half' },
  'display.backdrop': { id: 'nebula' },
  'display.gpufur':{ on: false },
  'util.math':     { expr: '12*7+5' },
  'util.convert':  { value: 10, from: 'km', to: 'mi' },
  'util.rename':   { name: 'Nova' }
};

/** Run a single tool by id with optional args — used by the Skills panel. */
function runTool(id, args) {
  const tool = getTool(id);
  if (!tool) return null;
  const demo = TOOL_DEMO[tool.id] || {};
  const full = Object.assign({ raw: '', lang: currentLang }, demo, args || {});
  try {
    return tool.run(full, { state, lang: currentLang });
  } catch (e) {
    console.warn('[argon] tool failed', id, e);
    return { ok: false, say: t('reply.unknown') };
  }
}

/** The single entry point for anything the user says or types. */
function submitUtterance(text, source) {
  const clean = String(text || '').trim();
  if (!clean) return;
  appendMsg('user', clean);
  setStatus('thinking', t('status.thinking'));
  bus.emit('brain:thinking', clean);

  setTimeout(() => {
    const outcome = think(clean);
    outcome.results.forEach((r) => logToolResult(r));
    appendMsg('argon', outcome.reply);
    speakArgonReply(outcome.reply);
    bus.emit('brain:answered', outcome);
    void source;
  }, 220);
}

/* ==========================================================================
   5. ACTIONS exposed to the tools
   ========================================================================== */

function setLang(lang) {
  if (!LOCALES[lang]) return;
  const changed = state.lang !== lang;
  state.lang = lang;
  saveState();
  applyLangToDocument(lang);
  translateDOM(document);
  renderAll();
  if (recognition) {
    try { recognition.lang = LOCALES[lang].speech; } catch (e) {}
  }
  bus.emit('lang:changed', lang);
  if (changed) {
    const bubble = el('argon-bubble');
    if (bubble) bubble.classList.remove('show');
    setStatus('vibing', t('status.vibing'));
  }
}

function setMood(mood) {
  if (!MOODS[mood]) return;
  const m = MOODS[mood];
  state.mood = mood;
  saveState();
  applyCoat(m.coat);
  setVibe(m.vibe);
  setTtsRate(clamp(state.ttsRate, 0.5, 1.8));
  setTtsPitch(clamp(state.ttsPitch, 0.5, 1.8));
  if (state.autoDJ) {
    Music.play(m.station);
    const st = MUSIC_STATIONS.find((s) => s.id === m.station);
    if (st) Music.setBpm(st.bpm);
  }
  renderMoods();
  updateMusicUI();
  bus.emit('mood:changed', mood);
}

function setAutoDJ(on) {
  state.autoDJ = Boolean(on);
  saveState();
  const sw = el('sw-autodj');
  if (sw) sw.setAttribute('aria-checked', String(state.autoDJ));
  const dj = el('music-dj');
  if (dj) dj.classList.toggle('active', state.autoDJ);
  if (state.autoDJ) {
    const m = MOODS[state.mood];
    if (m) {
      Music.play(m.station);
      const st = MUSIC_STATIONS.find((s) => s.id === m.station);
      if (st) Music.setBpm(st.bpm);
    }
  }
  bus.emit('dj:changed', state.autoDJ);
}

function exportSettings() {
  const payload = {
    exportedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state)),
    tools: ARGON_TOOLS.map((t) => t.id)
  };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'argon-settings-' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(t('system.exported'));
  } catch (e) {
    toast(t('system.exported'));
  }
}

/* ==========================================================================
   6. WIRING — every control in the deck
   ========================================================================== */

function bindSwitch(id, initial, onChange) {
  const sw = el(id);
  if (!sw) return;
  sw.setAttribute('aria-checked', String(Boolean(initial)));
  const flip = () => {
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    onChange(next);
  };
  sw.addEventListener('click', flip);
  sw.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
  });
}

function bindRange(id, valId, getValue, setValue, format) {
  const input = el(id);
  const out = el(valId);
  if (!input) return;
  const paint = (v) => {
    const min = parseFloat(input.min), max = parseFloat(input.max);
    const pct = ((v - min) / (max - min)) * 100;
    input.style.setProperty('--pct', pct.toFixed(1) + '%');
    if (out) out.textContent = format(v);
  };
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    paint(v);
    setValue(v);
  });
  input.value = String(getValue());
  paint(getValue());
}

function wireUI() {
  // --- chrome / deck ------------------------------------------------------
  el('argon-chrome').addEventListener('pointerdown', startDrag);
  el('argon-chrome').addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    setWindowSize(frameState.mode === 'tiny' ? 'free' : 'tiny');
  });
  el('deck-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleDeck(); });
  el('deck-close').addEventListener('click', closeDeck);
  el('deck-fullscreen').addEventListener('click', toggleFullscreen);

  frameEl.querySelectorAll('.rz').forEach((h) => {
    h.addEventListener('pointerdown', (e) => startResize(e, h.getAttribute('data-rz')));
  });

  // tiny mode: tap the orb to expand
  el('argon-viewport').addEventListener('pointerdown', (e) => {
    if (frameState.mode === 'tiny') startDrag(e);
  });

  // --- chat ---------------------------------------------------------------
  const form = el('chat-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el('chat-input');
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    submitUtterance(v, 'text');
  });

  el('mic-btn').addEventListener('click', () => {
    if (signals.listening) { stopListening(); }
    else { startListening(false); playArgonChirp('listen'); }
  });
  el('live-btn').addEventListener('click', () => setLiveMode(!state.liveMode));
  el('bubble-close').addEventListener('click', () => el('argon-bubble').classList.remove('show'));

  // --- vibe slider --------------------------------------------------------
  bindRange('vibe-slider', 'vibe-val', () => state.vibe, (v) => { setVibe(v); }, (v) => Math.round(v) + '%');

  // --- skills -------------------------------------------------------------
  // (cards are rendered dynamically; the Run button is bound in renderSkills)

  // --- music --------------------------------------------------------------
  el('music-play').addEventListener('click', () => {
    if (Music.playing) { Music.pause(); } else { Music.play(state.musicStation); }
    updateMusicUI();
  });
  el('music-next').addEventListener('click', () => { Music.next(); updateMusicUI(); });
  el('music-prev').addEventListener('click', () => { Music.prev(); updateMusicUI(); });
  el('music-dj').addEventListener('click', () => setAutoDJ(!state.autoDJ));
  el('music-local-btn').addEventListener('click', () => el('music-file').click());
  el('music-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) { Music.playLocal(f); updateMusicUI(); }
  });
  bindRange('music-vol', 'music-vol-val', () => state.musicVolume, (v) => { Music.setVolume(v); }, (v) => Math.round(v) + '%');
  bindRange('music-bpm', 'music-bpm-val', () => state.musicBpm, (v) => { Music.setBpm(v); }, (v) => Math.round(v) + ' BPM');
  bindRange('music-reverb', 'music-reverb-val', () => state.musicReverb, (v) => { Music.setReverb(v); }, (v) => Math.round(v) + '%');

  // --- voice --------------------------------------------------------------
  el('voice-listen-btn').addEventListener('click', () => { startListening(false); playArgonChirp('listen'); });
  el('voice-live-btn').addEventListener('click', () => setLiveMode(!state.liveMode));
  el('voice-test-btn').addEventListener('click', () => {
    const phrase = t('reply.sayHello');
    speakArgonReply(phrase);
  });
  bindSwitch('sw-tts', state.tts, (on) => { setTts(on); });
  bindSwitch('sw-haptics', state.haptics, (on) => { state.haptics = on; saveState(); });
  bindRange('voice-rate', 'voice-rate-val', () => state.ttsRate, (v) => setTtsRate(v), (v) => v.toFixed(2) + '×');
  bindRange('voice-pitch', 'voice-pitch-val', () => state.ttsPitch, (v) => setTtsPitch(v), (v) => v.toFixed(2));

  // --- scene --------------------------------------------------------------
  bindRange('fur-length', 'fur-length-val', () => furSystem.sharedUniforms.uFurLength.value,
    (v) => setFurParam('furLength', v), (v) => (v * 50.8).toFixed(0) + ' mm');
  bindRange('fur-density', 'fur-density-val', () => furSystem.sharedUniforms.uFurDensity.value,
    (v) => setFurParam('furDensity', v), (v) => Math.round(v * 100) + '%');
  bindRange('fur-curl', 'fur-curl-val', () => furSystem.sharedUniforms.uCurliness.value,
    (v) => setFurParam('curliness', v), (v) => Math.round(v * 100) + '%');
  bindRange('fur-clump', 'fur-clump-val', () => furSystem.sharedUniforms.uClumping.value,
    (v) => setFurParam('clumping', v), (v) => Math.round(v * 100) + '%');
  el('fur-root').addEventListener('input', (e) => setFurColor(e.target.value));
  el('fur-tip').addEventListener('input', (e) => {
    furSystem.sharedUniforms.uTipColor.value.set(e.target.value);
  });
  el('fur-rim').addEventListener('input', (e) => {
    furSystem.sharedUniforms.uRimLightColor.value.set(e.target.value);
  });
  bindSwitch('sw-gpufur', gpuFurOn, (on) => { setGpuFur(on); });
  el('scene-reset-btn').addEventListener('click', () => resetCamera());
  el('scene-boop-btn').addEventListener('click', () => triggerBoop());
  el('scene-dance-btn').addEventListener('click', () => triggerDance());

  // --- system -------------------------------------------------------------
  el('sys-fullscreen').addEventListener('click', toggleFullscreen);
  el('sys-reset-window').addEventListener('click', () => { setWindowSize('wide'); resetCamera(); });
  el('sys-export').addEventListener('click', exportSettings);
  el('sys-reset').addEventListener('click', () => {
    resetState();
    applyLangToDocument(state.lang);
    setMood(state.mood);
    setWindowSize('wide');
    renderAll();
    toast(t('system.resetDone'));
  });
  bindSwitch('sw-motion', state.reduceMotion, (on) => {
    state.reduceMotion = on;
    document.body.classList.toggle('reduce-motion', on);
    saveState();
  });
  bindSwitch('sw-autodj', state.autoDJ, (on) => setAutoDJ(on));

  // --- visualiser ---------------------------------------------------------
  const viz = el('viz');
  if (viz) {
    viz.replaceChildren();
    for (let i = 0; i < 18; i++) viz.appendChild(document.createElement('i'));
  }
}

/* ==========================================================================
   7. BOOT
   ========================================================================== */

function bootArgon() {
  loadState();
  applyLangToDocument(state.lang);
  document.body.classList.toggle('reduce-motion', !!state.reduceMotion);

  // Restore the frame geometry
  const vp = viewportSize();
  const saved = state.window || {};
  if (saved.w && saved.h && saved.mode === 'free') {
    const c = clampFrame(saved.x || 0, saved.y || 0, saved.w, saved.h);
    frameState.x = c.x; frameState.y = c.y; frameState.w = c.w; frameState.h = c.h;
    frameState.mode = 'free';
  } else {
    frameState.mode = 'wide';
    frameState.w = Math.round(vp.w * 0.92);
    frameState.h = Math.round(vp.h * 0.80);
    frameState.x = Math.round((vp.w - frameState.w) / 2);
    frameState.y = Math.round((vp.h - frameState.h) / 2);
  }
  applyFrame();

  // Restore the coat and mood
  if (state.coat) applyCoat(state.coat);
  setVibe(state.vibe);
  Music.setVolume(state.musicVolume);
  Music.setBpm(state.musicBpm);
  Music.setReverb(state.musicReverb);

  wireUI();
  renderAll();

  // Telemetry + visualiser loop
  setInterval(() => {
    renderTelemetry();
    sampleMicLevel();
  }, 500);

  const viz = el('viz');
  const bars = viz ? viz.querySelectorAll('i') : [];
  function paintViz() {
    const spec = Music.spectrum();
    if (!spec || !bars.length) return;
    const per = Math.floor(spec.length / bars.length);
    for (let i = 0; i < bars.length; i++) {
      let sum = 0;
      for (let j = 0; j < per; j++) sum += spec[i * per + j] || 0;
      const v = sum / per / 255;
      bars[i].style.height = Math.max(3, Math.round(v * 46)) + 'px';
    }
  }
  setInterval(paintViz, 60);

  // Greeting
  appendMsg('argon', t('reply.hello'));
  setStatus('vibing', t('status.vibing'));

  // Voice capability note
  const note = el('voice-note');
  if (note) {
    note.textContent = !hasRecognition && !hasSynthesis
      ? t('voice.noRecog')
      : !hasRecognition ? t('voice.noRecog')
      : !hasSynthesis ? t('voice.noSynth')
      : t('voice.ok');
    note.className = 'note ' + (!hasRecognition || !hasSynthesis ? 'warn' : 'ok');
  }
  const supportHint = el('voice-support-hint');
  if (supportHint) supportHint.textContent = (hasRecognition ? 'STT' : '—') + ' · ' + (hasSynthesis ? 'TTS' : '—');

  // Keep the chip in sync with the language
  const brandSub = el('brand-sub');
  if (brandSub) brandSub.textContent = t('app.tagline');

  bus.on('fps', () => { /* telemetry refreshes on its own interval */ });

  window.addEventListener('resize', () => {
    if (frameState.mode !== 'free') setWindowSize(frameState.mode);
    else {
      const c = clampFrame(frameState.x, frameState.y, frameState.w, frameState.h);
      frameState.x = c.x; frameState.y = c.y; frameState.w = c.w; frameState.h = c.h;
      applyFrame();
    }
  });

  // Expose a tiny automation surface for visual checks.
  window.__argon = {
    pause3d, resume3d, setWindowSize, openDeck, closeDeck, toggleDeck,
    submitUtterance, setLang, setMood, think, explain, state, Music,
    playTool: (id, args) => runTool(id, args),
    snapshot: () => ({
      lang: state.lang, mood: state.mood, vibe: state.vibe,
      frame: { ...frameState }, deckOpen: deckEl.classList.contains('open'),
      tools: ARGON_TOOLS.length, musicPlaying: Music.playing
    })
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootArgon);
} else {
  bootArgon();
}
