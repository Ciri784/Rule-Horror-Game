// Exhaustive playthrough: keep clicking the first available action until the
// scene ends, then print the path + final state + narrative. Goal: surface
// any state where the game "can't be played". Manual debug script, not a
// vitest test — run with `node tests/playthrough-exhaustive.mjs`.
import { freshState, applyAction, narrate, rulesFor, formatTime } from "../engine.js";
import { hotel as hotelScene } from "../scenes/hotel.js";

const state = freshState(hotelScene);
const ctx = { scene: hotelScene, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
const ruleCount = (s) => rulesFor(hotelScene, s).length;

console.log("=== START ===");
console.log("time:", formatTime(state.time));
console.log("identity:", state.identity, "| location:", state.location, "| door:", state.doorNumber);
console.log("rules unlocked:", ruleCount(state));
console.log("narrative:", state.narrative.length);
console.log("");

const MAX = 50;
const path = [];
for (let step = 0; step < MAX; step++) {
  const actions = hotelScene.actions(state, ctx) || [];
  if (state.ended) { console.log(`ended=${state.ended} at step ${step}`); break; }
  if (actions.length === 0) {
    console.log(`step ${step}: NO ACTIONS AVAILABLE (time=${formatTime(state.time)})`);
    break;
  }
  const a = actions[0];
  path.push({ step, id: a.id, timeBefore: state.time, rulesBefore: ruleCount(state) });
  applyAction(hotelScene, state, a.id, ctx);
  if (state.ended) {
    console.log(`ended=${state.ended} at step ${step + 1} after click ${a.id}`);
    break;
  }
}

console.log("\n=== PATH ===");
path.forEach((p) => console.log(`  step ${p.step}: ${p.id} (time=${formatTime(p.timeBefore)}, rules=${p.rulesBefore})`));

console.log("\n=== FINAL STATE ===");
console.log("time:", formatTime(state.time), "| ended:", state.ended);
console.log("identity:", state.identity, "| door:", state.doorNumber, "| drift:", state.drift);
console.log("rules unlocked:", ruleCount(state));

console.log("\n=== NARRATIVE ===");
state.narrative.forEach((n) => console.log(`  [${formatTime(n.time)}] (${n.kind}) ${n.text}`));
