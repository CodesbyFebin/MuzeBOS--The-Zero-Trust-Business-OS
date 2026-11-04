/* ==========================================================================
   ARGON — THE BRAIN
   A local orchestrator: utterance → scored intent → plan → execution → reply.
   No network, no model. Every route lands in a registered tool.
   ========================================================================== */

/** Score one tool against a normalised utterance. */
function scoreTool(tool, text) {
  const s = norm(text);
  let score = 0;
  let matched = '';
  const langs = [currentLang, 'en'];
  for (const lg of langs) {
    const kws = tool.kw[lg] || [];
    for (const kw of kws) {
      const nk = norm(kw);
      if (!nk || nk.length < 2) continue;
      if (containsWord(s, nk)) {
        const lenBoost = Math.min(1.4, nk.length / 7);
        const langBoost = lg === currentLang ? 1.18 : 1.0;
        const w = (1 + lenBoost) * langBoost;
        if (w > score) { score = w; matched = kw; }
      }
    }
  }
  // A tool may opt into a structural detector (e.g. "25 * 4 + 6" is maths
  // even though it contains no keyword at all).
  if (typeof tool.detect === 'function') {
    try {
      if (tool.detect(text, currentLang)) score = Math.max(score, 3.0);
    } catch (e) { /* detector errors never break the router */ }
  }
  return { score, matched };
}

/**
 * Build an execution plan from a free-form utterance.
 * Returns an ordered list of { tool, args, score }.
 */
function planFor(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const scored = [];
  for (const tool of ARGON_TOOLS) {
    if (!tool.enabled) continue;
    const { score, matched } = scoreTool(tool, raw);
    if (score <= 0) continue;
    let args = {};
    let parsed = false;
    if (typeof tool.parse === 'function') {
      try {
        const p = tool.parse(raw, currentLang);
        if (p && typeof p === 'object') { args = p; parsed = true; }
      } catch (e) { /* parse errors fall back to keyword args */ }
    }
    args.raw = raw;
    args.lang = currentLang;
    const bonus = parsed ? 0.4 : 0;
    scored.push({ tool, args, score: score + bonus, matched });
  }

  scored.sort((a, b) => b.score - a.score);

  const plan = [];
  const blocked = new Set();
  for (const cand of scored) {
    if (cand.score < 1.05) break;
    if (blocked.has(cand.tool.id)) continue;
    // Only chain a second tool when it is clearly intentional.
    if (plan.length > 0 && cand.score < 1.5) break;
    plan.push(cand);
    (cand.tool.conflicts || []).forEach((id) => blocked.add(id));
    // Anything the chosen tool rules out must not fire afterwards.
    plan.forEach((p) => (p.tool.conflicts || []).forEach((id) => blocked.add(id)));
    if (plan.length >= 3) break;
  }
  return plan;
}

/** Debug helper: show every candidate with its score. */
function explain(text) {
  const raw = String(text || '').trim();
  return ARGON_TOOLS.map((tool) => {
    const { score, matched } = scoreTool(tool, raw);
    return { id: tool.id, score: +score.toFixed(2), matched };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

/** Execute a plan and collect results. */
function runPlan(plan) {
  const results = [];
  for (const step of plan) {
    let res = null;
    try {
      res = step.tool.run(step.args, { state, lang: currentLang });
    } catch (err) {
      console.warn('[argon] tool failed', step.tool.id, err);
      res = { ok: false, say: t('reply.unknown') };
    }
    results.push({
      id: step.tool.id,
      icon: step.tool.icon,
      name: t4(step.tool.name),
      score: step.score,
      ok: !!(res && res.ok),
      say: (res && res.say) || '',
      detail: (res && res.detail) || ''
    });
  }
  return results;
}

/** Combine tool results into one natural sentence. */
function composeReply(results) {
  const good = results.filter((r) => r.ok);
  if (!good.length) return t('reply.unknown');
  if (good.length === 1) return good[0].say;
  // Multiple tools: join with a soft connector so it reads like one thought.
  const parts = good.map((r) => r.say.replace(/[.।。]\s*$/, ''));
  const joiner = currentLang === 'ar' ? ' و' : currentLang === 'hi' ? ' और ' : currentLang === 'ta' ? ' மேலும், ' : '. ';
  return parts.join(joiner) + '.';
}

/** Full pipeline. Returns { reply, results, plan }. */
function think(text) {
  const plan = planFor(text);
  if (!plan.length) {
    return { reply: t('reply.unknown'), results: [], plan: [] };
  }
  const results = runPlan(plan);
  return { reply: composeReply(results), results, plan };
}
