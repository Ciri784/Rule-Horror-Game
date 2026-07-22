// Live playthrough smoke test (engine-layer).
// Walks the hotel scene forward via engine.applyAction() the same way
// a real user clicking action buttons would — recording every state
// change, fired trigger, narrative entry, and ending so we can answer
// "can it actually be played?" without a browser.
//
// Engine tests (engine.test.js) cover isolated rule fires. This file
// covers the path: pick action → onChoose → trigger sweep → ending
// check, looking for: dead-end actions, unexpected endings, broken
// time advancement, and actions that throw.

import { describe, it, expect } from "vitest";
import { freshState, evaluateTriggers, checkEndings, applyAction, narrate, formatTime } from "../engine.js";
import { hotelScene } from "../scenes/hotel.js";

function newRun() {
  const state = freshState(hotelScene);
  const ctx = { visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}

function step(state, ctx, actionId, trace) {
  const actions = hotelScene.actions(state, ctx) || [];
  const before = {
    time: state.time,
    fired: { ...state.fired },
    ended: state.ended,
    rulesLen: state.rules.length,
    narrLen: state.narrative.length,
    actions: { ...state.actions },
  };
  const ending = applyAction(hotelScene, state, actionId, ctx);
  const after = {
    time: state.time,
    fired: { ...state.fired },
    ended: state.ended,
    rulesLen: state.rules.length,
    narrLen: state.narrative.length,
    actions: { ...state.actions },
  };
  if (trace) trace.push({ actionId, before, after, ending: ending?.id || null });
  return ending;
}

function fmtTrace(trace) {
  return trace.map((t) => {
    const t0 = formatTime(t.before.time);
    const t1 = formatTime(t.after.time);
    return `[${t0}→${t1}] ${t.actionId} (rules:${t.before.rulesLen}→${t.after.rulesLen}, narr:${t.before.narrLen}→${t.after.narrLen}${t.ending ? `, ENDED=${t.ending}` : ""})`;
  }).join("\n  ");
}

describe("Rule-Horror-Game hotel playthrough", () => {
  it("survives a full run to the 'left' ending without throwing", () => {
    const { state, ctx } = newRun();
    const trace = [];
    let ended = null;
    // Burn exploration actions to push time past 22:00 before committing.
    // Each exploration +5 min (watch-tv +5 each × 3 = 15), peek-hall +10,
    // look-door +10, wait-and-listen +10 = 45 min from 21:00, so 21:45
    // before try-leave; +5 = 21:50; +5 = 21:55. All clear 22:00 after
    // open-the-door + the final checkEndings sweep.
    const path = [
      "look-door", "look-door",
      "peek-hall", "peek-hall",
      "watch-tv", "watch-tv", "watch-tv",
      "wait-and-listen",
      "try-leave",
      "open-the-door",
    ];
    for (const a of path) {
      const e = step(state, ctx, a, trace);
      if (e) { ended = e; break; }
    }
    // last action may need a tick — call evaluateTriggers/checkEndings once
    // to allow the time-gate on `left` to fire if conditions are met.
    if (!ended) {
      // Bump time past 22:00 so the `left` ending's time gate can fire.
      // (Production game advances time via the idle tick; tests just
      // shortcut to the moment of truth.)
      state.time = Math.max(state.time, 22 * 60);
      evaluateTriggers(hotelScene, state, ctx);
      ended = checkEndings(hotelScene, state, ctx);
    }
    expect(ended?.id).toBe("left");
    expect(trace.length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT fire `left` ending on `try-leave` alone (the bug we fixed)", () => {
    const { state, ctx } = newRun();
    // Push past 22:00 the way an action sequence would
    state.time = 22 * 60 + 30;
    evaluateTriggers(hotelScene, state, ctx);
    const ending = checkEndings(hotelScene, state, ctx);
    // No try-leave yet → no ending.
    expect(ending).toBeNull();
    // try-leave alone (no doorOpened) → still no ending.
    step(state, ctx, "try-leave", []);
    const ending2 = checkEndings(hotelScene, state, ctx);
    expect(ending2).toBeNull();
    expect(state.ended).toBeFalsy();
  });

  it("walked-through playthrough from a fresh state produces 5+ narrative entries and 0 thrown errors", () => {
    const { state, ctx } = newRun();
    const errors = [];
    const trace = [];
    const path = ["look-door", "watch-tv", "look-door", "try-leave", "open-the-door"];
    for (const a of path) {
      try {
        const e = step(state, ctx, a, trace);
        if (e) break;
      } catch (err) {
        errors.push({ actionId: a, err: String(err) });
      }
    }
    expect(errors).toEqual([]);
    expect(state.narrative.length).toBeGreaterThan(4);
    console.log("trace:\n  " + fmtTrace(trace));
  });

  it("every action in the scene's static action list is reachable and callable", () => {
    const { state, ctx } = newRun();
    // grab the static action list (this is what the UI shows on first render)
    const staticActions = hotelScene.actions(state, ctx);
    expect(staticActions.length).toBeGreaterThan(3);
    for (const a of staticActions) {
      // Reset to a fresh state for each action
      const { state: s, ctx: c } = newRun();
      try {
        applyAction(hotelScene, s, a.id, c);
      } catch (err) {
        throw new Error(`static action ${a.id} threw: ${err}`);
      }
    }
  });
});
