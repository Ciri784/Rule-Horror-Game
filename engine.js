// Rule Horror — engine (pure logic, no DOM).
// State machine pieces: narrate, evaluateTriggers, checkEndings, formatTime,
// plus the fresh-state factory used by renderScene.
//
// Kept separate from core.js so it can be unit-tested under Node without
// needing jsdom or a fake document. core.js imports from here.

const STORAGE_PREFIX = "rule-horror:";

export function loadState(id) {
  try { const r = localStorage.getItem(STORAGE_PREFIX + id); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function saveState(id, s) {
  try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(s)); } catch {}
}
export function clearState(id) {
  try { localStorage.removeItem(STORAGE_PREFIX + id); } catch {}
}

export function narrate(state, text, kind) {
  state.narrative.push({ time: state.time, kind: kind || "narration", text });
}

// Pure rule list with the same shape renderScene uses for initial state.
// (The DOM-ful "fresh state" builder lives in core.js; this is the same
// factory minus the localStorage calls, so tests can build a clean state
// without mocking storage.)
export function freshState(scene, now = Date.now()) {
  const visitCount = 1; // tests start at 1; renderScene bumps for real plays
  return {
    rules: scene.initialRules.map((t) => ({ text: t, inserted: false, amended: false })),
    choices: [], fired: {},
    actions: {},
    startedAt: now, visitCount,
    time: 21 * 60,
    // True once game time has wrapped past 24:00 into a new day. Triggers
    // that mean "after checkout the next morning" gate on this so they
    // don't fire on the very first action at 21:00.
    crossedMidnight: false,
    _lastTime: 21 * 60,
    checkOutPassed: false,
    narrative: scene.openingNarrative
      ? [{ time: 21 * 60, kind: "narration", text: scene.openingNarrative }]
      : [],
  };
}

export function evaluateTriggers(scene, state, ctx) {
  // Day-rollover detection: if onChoose pushed time forward and the new
  // time is earlier than the previous one, we just crossed midnight. This
  // is what "the night is over" actually means in this engine, since
  // state.time is minutes-of-day (mod 24*60).
  if (typeof state._lastTime === "number" && state.time < state._lastTime) {
    state.crossedMidnight = true;
  }
  state._lastTime = state.time;

  const added = [];
  for (const t of scene.triggers) {
    if (state.fired[t.id]) continue;
    if (!t.when(state, ctx)) continue;
    state.fired[t.id] = true;
    if (t.mode === "amend" && typeof t.target === "number") {
      const target = state.rules[t.target];
      if (target) {
        target.amended = true;
        target.text = t.body;
        narrate(state, `守則第 ${t.target + 1} 條被悄悄修訂。`, "rule-amended");
      }
    } else {
      const pos = Math.max(1, Math.floor(Math.random() * state.rules.length));
      state.rules.splice(pos, 0, { text: t.body, inserted: true });
      narrate(state, `守則多了一條——第 ${pos + 1} 條：「${t.body}」`, "rule-added");
    }
    added.push(t);
  }
  return added;
}

export function checkEndings(scene, state, ctx) {
  for (const e of scene.endings) {
    if (state.ended === e.id) return e;
    if (e.when(state, ctx)) {
      state.ended = e.id;
      narrate(state, e.text, "ending");
      return e;
    }
  }
  return null;
}

export function formatTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Run one player action the same way renderScene does. Returns the ending
// if the action ended the scene, else null. Pure: mutates state, no DOM,
// no storage.
export function applyAction(scene, state, actionId, ctx) {
  const actions = scene.actions(state, ctx) || [];
  const a = actions.find((x) => x.id === actionId);
  if (!a) throw new Error(`unknown action: ${actionId}`);
  if (state.ended) return scene.endings.find((e) => e.id === state.ended) || null;
  a.onChoose(state, ctx);
  evaluateTriggers(scene, state, ctx);
  return checkEndings(scene, state, ctx);
}
