/* Hosted MuZe bridge. Local companion tools stay local; business requests are UI intents only. */
let muzeChannel = null;
const muzePost = (intent) => { if (muzeChannel) parent.postMessage({ protocol: 'muze-argon/v1', channel: muzeChannel, intent }, '*'); };
window.addEventListener('message', (e) => {
  if (e.source !== parent || !e.data || e.data.protocol !== 'muze-argon/v1') return;
  if (e.data.type === 'init' && typeof e.data.channel === 'string' && /^[0-9a-f-]{36}$/i.test(e.data.channel)) muzeChannel = e.data.channel;
  if (e.data.type === 'reply' && e.data.channel === muzeChannel && typeof e.data.text === 'string') {
    appendMsg('argon', e.data.text.slice(0, 2000));
    setStatus('idle', 'MuZe workspace');
  }
});
const argonLocalSubmit = submitUtterance;
submitUtterance = function(text, source) {
  const clean = String(text || '').trim();
  const nav = clean.match(/^(?:open|show|go to|guide me to)\s+(home|dashboard|board|issues|canvas|approvals|receipts|evidence)[.!]?$/i);
  if (nav) { appendMsg('user', clean); muzePost({ type: 'navigate', target: nav[1].toLowerCase() === 'dashboard' ? 'home' : nav[1].toLowerCase() }); return; }
  if (/^(?:business status|workspace status|worker status|brain status)[.!]?$/i.test(clean)) { appendMsg('user', clean); muzePost({ type: 'status' }); return; }
  if (/^(?:task|draft|analyse|analyze|research)\s*[: ]/i.test(clean)) {
    appendMsg('user', clean); muzePost({ type: 'draft', text: clean.slice(0, 12000) });
    appendMsg('argon', 'Review the task in the MuZe brain panel. Nothing has been queued or executed.'); return;
  }
  return argonLocalSubmit(clean, source);
};
const hostedUnavailable = new Set(['voice.listen', 'voice.live', 'window.size', 'window.fullscreen', 'util.export']);
for (const tool of ARGON_TOOLS) if (hostedUnavailable.has(tool.id)) {
  tool.enabled = false;
  tool.run = () => ({ ok: false, say: 'This control is unavailable in the isolated dashboard companion. Use the MuZe host controls.' });
}
function muzeEmbed() {
  state.name = 'MuZe'; state.tts = false; state.liveMode = false;
  setWindowSize('full');
  window.addEventListener('resize', () => setWindowSize('full'));
  document.querySelectorAll('.emo').forEach(n => n.setAttribute('aria-hidden','true'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', muzeEmbed); else muzeEmbed();
