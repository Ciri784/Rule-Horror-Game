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

// Build a clean state for a scene. Scenes opt in to the new applies-based
// rules system by providing `scene.rules` (an object keyed by id). Scenes
// that still use the legacy `scene.initialRules + scene.triggers` flow
// get a `state.rules` array pre-populated with `{text, inserted, amended}`
// entries; that legacy path is kept for backward compat with older tests
// but the hotel scene no longer uses it.
export function freshState(scene, now = Date.now()) {
  const visitCount = 1;
  return {
    // legacy rules list — only populated for scenes that opt in to the
    // trigger/insert/amend flow via scene.initialRules. New scenes
    // (with scene.rules + applies) leave this empty; renderRules falls
    // back to rulesFor() in that case.
    rules: (scene.initialRules || []).map((t) => ({ text: t, inserted: false, amended: false })),
    choices: [], fired: {},
    actions: {},
    startedAt: now, visitCount,
    time: 23 * 60,
    crossedMidnight: false,
    _lastTime: 23 * 60,
    checkOutPassed: false,
    narrative: scene.openingNarrative
      ? [{ time: 23 * 60, kind: "narration", text: scene.openingNarrative }]
      : [],

    // — new state shape for the applies-based system —
    // What the player is actually carrying. Identity is *implied* by
    // what's in here: a staff-card means they think they're staff,
    // a guest-card means they think they're a guest. The hotel may
    // disagree (see hotelView).
    heldItems: scene.initialItems ? [...scene.initialItems] : [],
    // The hotel's (possibly supernatural) judgment of who the player
    // actually is, given the current held items, location, and time.
    // Possible values: 'guest' | 'staff' | 'intruder' | 'unknown'.
    hotelView: scene.initialHotelView || 'unknown',
    // Where the player currently is. Drives the applies() filter on
    // rules (rules can gate on location).
    location: scene.initialLocation || 'room-704',
    // Rule ids the player has *unlocked* so far through exploration.
    // Once unlocked, a rule is part of the player's library even if it
    // isn't currently in effect — they can re-read the collection.
    unlockedRuleIds: scene.initialUnlockedRuleIds
      ? [...scene.initialUnlockedRuleIds]
      : [],

    // — door/drift model (深夜飯店) —
    // The number on the player's own door. Starts as their real room number
    // and can be rewritten to the hidden-floor number as `drift` accrues.
    // Scenes without a door model simply never read these.
    doorNumber: scene.initialDoorNumber || null,
    // How many transgressions the player has committed. Scene logic (via
    // scene.recomputeDoor) decides when accumulated drift rewrites the door.
    drift: 0,
  };
}

// Compute which rules the player currently *holds*. A rule shows if the
// player has unlocked it (its id is in state.unlockedRuleIds) — nothing
// more. Whether a held rule is "in effect" right now is deliberately NOT
// computed here: in rule-horror the player judges that themselves. Showing
// only the "active" rules would do the thinking for them and kill the whole
// point. (Rules carry an `applies` predicate for authoring reference, but it
// must never gate display.)
//
// Rules are returned in the order the scene declared them, so a collected
// rulebook stays a fixed wall of text that only ever grows as you explore.
export function rulesFor(scene, state) {
  if (!scene.rules) return [];
  const out = [];
  for (const [id, rule] of Object.entries(scene.rules)) {
    if (!state.unlockedRuleIds.includes(id)) continue;
    out.push({ id, ...rule });
  }
  return out;
}

// Recompute state.hotelView from the current held items, location, and
// time. The hotel's judgment rules are scene-defined via
// `scene.hotelJudges` (an array of `{when, view}` clauses evaluated in
// order; the first match wins). If no clause matches, defaults to
// scene.defaultHotelView or 'unknown'.
//
// This is called at the start of evaluateTriggers so the predicate
// functions on the rules always see a fresh hotelView.
function recomputeHotelView(scene, state) {
  if (!Array.isArray(scene.hotelJudges)) {
    state.hotelView = scene.defaultHotelView || 'unknown';
    return;
  }
  for (const clause of scene.hotelJudges) {
    if (clause.when(state)) {
      state.hotelView = clause.view;
      return;
    }
  }
  state.hotelView = scene.defaultHotelView || 'unknown';
}

export function evaluateTriggers(scene, state, ctx) {
  // Day-rollover detection.
  if (typeof state._lastTime === "number" && state.time < state._lastTime) {
    state.crossedMidnight = true;
  }
  state._lastTime = state.time;

  // Recompute the hotel's view of the player before any rules fire,
  // so applies() predicates see the current view.
  recomputeHotelView(scene, state);

  // Let a scene recompute derived state (e.g. the door number from drift)
  // before rules and endings are evaluated. Generic hook — scenes without it
  // are unaffected.
  if (typeof scene.recomputeDoor === "function") scene.recomputeDoor(state);

  // Legacy trigger/insert/amend flow. Only used by scenes that still
  // have scene.triggers defined; the new applies-based hotel scene
  // doesn't have any.
  if (Array.isArray(scene.triggers)) {
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
  return [];
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

// Convenience for scenes whose actions want to hand the player a new
// item. Records the pickup in heldItems, narrates it, and recomputes
// hotelView so any rule predicates that gate on the item see it.
export function pickUp(itemId, state, ctx) {
  if (state.heldItems.includes(itemId)) return false;
  state.heldItems.push(itemId);
  const label = (ctx && ctx.itemLabels && ctx.itemLabels[itemId]) || itemId;
  if (ctx && ctx.narrate) ctx.narrate(`你撿到了${label}。`, "item");
  else narrate(state, `你撿到了${label}。`, "item");
  if (ctx && ctx.scene) recomputeHotelView(ctx.scene, state);
  return true;
}


// Move the player to a new location. Narrates the move, recomputes
// hotelView (some clauses gate on location).
export function moveTo(scene, state, locationId, label) {
  if (state.location === locationId) return false;
  state.location = locationId;
  narrate(state, `你走到${label}。`, "movement");
  recomputeHotelView(scene, state);
  return true;
}

// Unlock a rule for the player. Rules are content-addressed by id; once
// unlocked they stay in state.unlockedRuleIds for the rest of the run.
export function unlockRule(ruleId, state, ctx) {
  if (state.unlockedRuleIds.includes(ruleId)) return false;
  state.unlockedRuleIds.push(ruleId);
  const scene = ctx && ctx.scene;
  const rule = scene && scene.rules && scene.rules[ruleId];
  if (rule) {
    const text = `你學到了一條守則：「${rule.text}」`;
    if (ctx && ctx.narrate) ctx.narrate(text, "rule-unlocked");
    else narrate(state, text, "rule-unlocked");
  }
  return true;
}

// Run one player action the same way renderScene does. Returns the
// ending if the action ended the scene, else null. Pure: mutates
// state, no DOM, no storage.
export function applyAction(scene, state, actionId, ctx) {
  const actions = scene.actions(state, ctx) || [];
  const a = actions.find((x) => x.id === actionId);
  if (!a) throw new Error(`unknown action: ${actionId}`);
  if (state.ended) return scene.endings.find((e) => e.id === state.ended) || null;
  a.onChoose(state, ctx);
  evaluateTriggers(scene, state, ctx);
  return checkEndings(scene, state, ctx);
}
