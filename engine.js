// Rule Horror — engine (pure logic, no DOM).
//
// A scene-agnostic state machine. It knows only universal concepts:
//   narrative, held items, identity, location, unlocked rules, time, endings.
// Everything scene-specific (a hotel's door number, a library's noise meter…)
// lives in the scene via `initialState` + the `derive` hook + `actions`.
//
// See docs/scene-contract.md for what a scene must export.
//
// Kept DOM-free so it can be unit-tested under Node. core.js imports from here.

// Bump the version segment whenever the persisted state shape changes; old
// saves under a previous version are simply ignored (a fresh run starts).
const STORAGE_PREFIX = "rule-horror:v2:";

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

// Build a clean state for a scene. Only universal fields live here; a scene
// adds its own private fields (door numbers, meters, flags…) via
// `scene.initialState`, which is spread in last. The engine never reads those
// private fields — only the scene's own `derive`/`actions`/`judges` do.
export function freshState(scene, now = Date.now()) {
  const t0 = scene.initialTime ?? 0;
  return {
    startedAt: now,
    visitCount: 1,
    // In-game clock, in minutes. Actions advance it; core.js also ticks it
    // on idle. crossedMidnight latches once the clock wraps past a day.
    time: t0,
    _lastTime: t0,
    crossedMidnight: false,
    // The narrative stream shown in the centre column.
    narrative: scene.openingNarrative
      ? [{ time: t0, kind: "narration", text: scene.openingNarrative }]
      : [],
    // What the player is carrying. Identity is *implied* by what's in here.
    heldItems: scene.initialItems ? [...scene.initialItems] : [],
    // The place's (possibly supernatural) judgment of who the player is,
    // recomputed from held items / location / time by scene.judges.
    identity: scene.initialIdentity || 'unknown',
    // Where the player currently is (a scene location id).
    location: scene.initialLocation ?? null,
    // Rule ids unlocked through exploration. Once unlocked a rule stays in
    // the player's library for the whole run (see rulesFor).
    unlockedRuleIds: scene.initialUnlockedRuleIds
      ? [...scene.initialUnlockedRuleIds]
      : [],
    // Scene-private state (e.g. hotel's { doorNumber, drift, tvOff }).
    ...(scene.initialState || {}),
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

// Recompute state.identity from the current held items, location, and time.
// A scene supplies `scene.judges`: an array of `{when, identity}` clauses
// evaluated in order; the first match wins. No clause / no judges → falls
// back to scene.defaultIdentity or 'unknown'.
//
// Called at the start of evaluateTriggers (and after pickUp/moveTo) so scene
// predicates always see a fresh identity.
function recomputeIdentity(scene, state) {
  if (!Array.isArray(scene.judges)) {
    state.identity = scene.defaultIdentity || 'unknown';
    return;
  }
  for (const clause of scene.judges) {
    if (clause.when(state)) {
      state.identity = clause.identity;
      return;
    }
  }
  state.identity = scene.defaultIdentity || 'unknown';
}

// Advance derived state one step: latch midnight, recompute identity, then let
// the scene recompute its own derived fields (e.g. a door number from drift).
export function evaluateTriggers(scene, state) {
  if (typeof state._lastTime === "number" && state.time < state._lastTime) {
    state.crossedMidnight = true;
  }
  state._lastTime = state.time;

  recomputeIdentity(scene, state);

  // Generic per-step hook: scenes with derived state implement `derive(state)`;
  // scenes without it are unaffected.
  if (typeof scene.derive === "function") scene.derive(state);
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
// identity so any scene predicates that gate on the item see it.
export function pickUp(itemId, state, ctx) {
  if (state.heldItems.includes(itemId)) return false;
  state.heldItems.push(itemId);
  const label = (ctx && ctx.itemLabels && ctx.itemLabels[itemId]) || itemId;
  if (ctx && ctx.narrate) ctx.narrate(`你撿到了${label}。`, "item");
  else narrate(state, `你撿到了${label}。`, "item");
  if (ctx && ctx.scene) recomputeIdentity(ctx.scene, state);
  return true;
}


// Move the player to a new location. Narrates the move, recomputes identity
// (some judge clauses gate on location).
export function moveTo(scene, state, locationId, label) {
  if (state.location === locationId) return false;
  state.location = locationId;
  narrate(state, `你走到${label}。`, "movement");
  recomputeIdentity(scene, state);
  return true;
}

// Unlock a rule for the player. Rules are content-addressed by id; once
// unlocked they stay in state.unlockedRuleIds for the rest of the run.
// Unlock a rule for the player. Silent by design: the newly-collected
// rulebook already shows up in the rules panel, so dumping each rule's text
// into the narrative stream is redundant noise. The signal that a rulebook
// was gained is the item pickup ("你撿到了員工守則"), not a per-rule line.
// A scene that wants to announce an unlock can narrate in its own action.
export function unlockRule(ruleId, state) {
  if (state.unlockedRuleIds.includes(ruleId)) return false;
  state.unlockedRuleIds.push(ruleId);
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
