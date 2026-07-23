// Exhaustive playthrough: keep clicking available actions until the
// scene ends, then print the full state + every trigger / narrative
// entry. Goal: surface any state where the game "can't be played".
import { freshState, evaluateTriggers, checkEndings, applyAction, narrate, formatTime } from "../engine.js";
import { hotel as hotelScene } from "../scenes/hotel.js";

const state = freshState(hotelScene);
const ctx = { visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };

console.log("=== START ===");
console.log("time:", formatTime(state.time));
console.log("rules:", state.rules.length);
console.log("narrative:", state.narrative.length);
console.log("fired:", Object.keys(state.fired).join(", ") || "(none)");
console.log("");

const MAX = 50;
const path = [];
for (let step = 0; step < MAX; step++) {
  const actions = hotelScene.actions(state, ctx) || [];
  if (state.ended) { console.log(`ended=${state.ended} at step ${step}`); break; }
  if (actions.length === 0) {
    console.log(`step ${step}: NO ACTIONS AVAILABLE`);
    console.log("  time:", formatTime(state.time));
    console.log("  fired:", Object.keys(state.fired).join(", "));
    console.log("  actions(state):", actions);
    break;
  }
  // Pick first available action deterministically
  const a = actions[0];
  path.push({ step, id: a.id, label: a.label, timeBefore: state.time, firedBefore: Object.keys(state.fired).length, rulesBefore: state.rules.length });
  applyAction(hotelScene, state, a.id, ctx);
  // Also run ending check after every step (applyAction already does this,
  // but be defensive)
  if (state.ended) {
    console.log(`ended=${state.ended} at step ${step+1} after click ${a.id}`);
    break;
  }
}

console.log("\n=== PATH ===");
path.forEach((p) => console.log(`  step ${p.step}: ${p.id} (time=${formatTime(p.timeBefore)}, rules=${p.rulesBefore}, fired=${p.firedBefore})`));

console.log("\n=== FINAL STATE ===");
console.log("time:", formatTime(state.time));
console.log("ended:", state.ended);
console.log("rules:", state.rules.length);
console.log("actions used:", Object.entries(state.actions).map(([k,v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(", "));
console.log("fired triggers:", Object.entries(state.fired).filter(([,v]) => v).map(([k]) => k).join(", "));

console.log("\n=== NARRATIVE ===");
state.narrative.forEach((n, i) => {
  console.log(`  [${formatTime(n.time)}] (${n.kind}) ${n.text}`);
});
