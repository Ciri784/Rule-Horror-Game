import { describe, it, expect } from "vitest";
import {
  freshState, evaluateTriggers, checkEndings, formatTime, narrate, applyAction,
} from "../engine.js";
import { hotelScene } from "../scenes/hotel.js";

// Build a fresh state and a matching ctx (the same shape renderScene
// hands to onChoose / when). Note: the scene's action ids are
// kebab-case (try-leave, watch-tv, ...), not camelCase.
function boot(visitCount = 1) {
  const state = freshState(hotelScene, 1700000000000);
  state.visitCount = visitCount;
  const ctx = { visitCount, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}

// Simulate that the player has stayed up past midnight by setting
// crossedMidnight and a time on the next morning. Wrapping past 24:00
// is also covered by the live-action path (each applyAction goes through
// evaluateTriggers), but for trigger / ending tests it's faster to set
// the flags directly.
function pretendItIsNextMorning(state, h = 10, m = 0) {
  state.crossedMidnight = true;
  state.time = h * 60 + m;
  state._lastTime = state.time;
}

describe("engine basics", () => {
  it("formatTime pads and wraps at 24h", () => {
    expect(formatTime(21 * 60)).toBe("21:00");
    expect(formatTime(9 * 60 + 5)).toBe("09:05");
    expect(formatTime(23 * 60 + 70)).toBe("00:10");
  });

  it("freshState seeds 8 rules and an opening narrative line", () => {
    const { state } = boot();
    expect(state.rules).toHaveLength(8);
    expect(state.time).toBe(21 * 60);
    expect(state.actions).toEqual({});
    expect(state.fired).toEqual({});
    expect(state.narrative).toHaveLength(1);
    expect(state.narrative[0].kind).toBe("narration");
  });
});

describe("hotel triggers — fire conditions", () => {
  it("key-outside fires only after doorOpened, not on plain try-leave", () => {
    const { state, ctx } = boot();
    applyAction(hotelScene, state, "try-leave", ctx);
    // The old bug: key-outside fired as soon as tryLeave was set, so
    // the inserted rule said "if you open the door" before the player
    // had done anything resembling opening a door.
    expect(state.fired["key-outside"]).toBeFalsy();
    const text = state.rules.map((r) => r.text).join("\n");
    expect(text).not.toMatch(/鑰匙已在門外/);

    // Now commit by opening the door.
    applyAction(hotelScene, state, "open-the-door", ctx);
    expect(state.fired["key-outside"]).toBe(true);
    const text2 = state.rules.map((r) => r.text).join("\n");
    expect(text2).toMatch(/鑰匙已在門外/);
  });

  it("amend-return-time only fires after 23:00 and only rewrites rule 0", () => {
    const { state, ctx } = boot();
    state.time = 22 * 60; // 22:00
    evaluateTriggers(hotelScene, state, ctx);
    expect(state.fired["amend-return-time"]).toBeFalsy();
    expect(state.rules[0].text).toMatch(/22:00 前返回房間/);
    expect(state.rules[0].amended).toBeFalsy();

    state.time = 23 * 60; // 23:00
    evaluateTriggers(hotelScene, state, ctx);
    expect(state.fired["amend-return-time"]).toBe(true);
    expect(state.rules[0].amended).toBe(true);
    expect(state.rules[0].text).toMatch(/您沒有選擇/);
  });

  it("trigger knock-three-times requires wait-and-listen >= 2 and time >= 22:30", () => {
    const { state, ctx } = boot();
    applyAction(hotelScene, state, "wait-and-listen", ctx); // 1
    applyAction(hotelScene, state, "wait-and-listen", ctx); // 2
    state.time = 22 * 60 + 30;
    evaluateTriggers(hotelScene, state, ctx);
    expect(state.fired["knock-three-times"]).toBe(true);
  });

  // Fix for the time-bug: `checkout-passed` was firing on the first
  // action at 21:00 because 1260 > 600 numerically. It must wait for
  // the night to actually end.
  it("checkout-passed does NOT fire at 21:00 (no crossedMidnight yet)", () => {
    const { state, ctx } = boot();
    evaluateTriggers(hotelScene, state, ctx);
    expect(state.fired["checkout-passed"]).toBeFalsy();
  });

  it("checkout-passed does NOT fire at 22:30 of the same night", () => {
    const { state, ctx } = boot();
    state.time = 22 * 60 + 30;
    state.actions.peekHall = 1;
    evaluateTriggers(hotelScene, state, ctx);
    // shadow-self may fire; checkout-passed must not.
    expect(state.fired["checkout-passed"]).toBeFalsy();
    expect(state.fired["shadow-self"]).toBe(true);
    // Exactly one new rule was inserted.
    const inserted = state.rules.filter((r) => r.inserted);
    expect(inserted).toHaveLength(1);
  });

  it("checkout-passed fires the morning after crossedMidnight && time>=10:00", () => {
    const { state, ctx } = boot();
    pretendItIsNextMorning(state, 10, 0);
    evaluateTriggers(hotelScene, state, ctx);
    expect(state.fired["checkout-passed"]).toBe(true);
    const text = state.rules.map((r) => r.text).join("\n");
    expect(text).toMatch(/錯過退房時間/);
  });

  it("crossedMidnight is set automatically when onChoose wraps the clock", () => {
    // 21:00 + 36 actions of +5 = 180 minutes → 00:00. The 36th action
    // should set crossedMidnight = true. That's the cheap version of
    // a "long night" playthrough without simulating 36 clicks.
    const { state, ctx } = boot();
    state._lastTime = 23 * 60 + 55; // 23:55
    state.time = 0;                  // wrapped to 00:00
    evaluateTriggers(hotelScene, state, ctx);
    expect(state.crossedMidnight).toBe(true);
  });
});

describe("hotel endings — reachability", () => {
  // Fix for the auto-end bug: previously the `left` ending fired the
  // first time anything ran past 22:00 after the player had clicked
  // try-leave. There was no "actually open the door" beat.
  it("left ending does NOT fire on try-leave alone, even past 22:00", () => {
    const { state, ctx } = boot();
    applyAction(hotelScene, state, "try-leave", ctx); // time -> 21:05
    state.time = 22 * 60 + 1; // jump past 22:00
    evaluateTriggers(hotelScene, state, ctx);
    const e = checkEndings(hotelScene, state, ctx);
    expect(e).toBeNull();
    expect(state.ended).toBeFalsy();
  });

  it("left ending fires only after doorOpened + time>=22:00 + no call", () => {
    const { state, ctx } = boot();
    applyAction(hotelScene, state, "try-leave", ctx);
    applyAction(hotelScene, state, "open-the-door", ctx);
    state.time = 22 * 60 + 1;
    evaluateTriggers(hotelScene, state, ctx);
    const e = checkEndings(hotelScene, state, ctx);
    expect(e?.id).toBe("left");
  });

  it("open-the-door is only available after try-leave and before opened", () => {
    const { state, ctx } = boot();
    let opts = hotelScene.actions(state, ctx).map((a) => a.id);
    expect(opts).not.toContain("open-the-door");

    applyAction(hotelScene, state, "try-leave", ctx);
    opts = hotelScene.actions(state, ctx).map((a) => a.id);
    expect(opts).toContain("open-the-door");

    applyAction(hotelScene, state, "open-the-door", ctx);
    opts = hotelScene.actions(state, ctx).map((a) => a.id);
    expect(opts).not.toContain("open-the-door");
    expect(state.actions.doorOpened).toBe(true);
  });

  it("became ending requires watch-tv >= 3 + tvChanged + time>=22:00", () => {
    const { state, ctx } = boot();
    applyAction(hotelScene, state, "watch-tv", ctx);
    applyAction(hotelScene, state, "watch-tv", ctx);
    applyAction(hotelScene, state, "watch-tv", ctx);
    expect(state.tvChanged).toBe(true);
    state.time = 22 * 60;
    const e = checkEndings(hotelScene, state, ctx);
    expect(e?.id).toBe("became");
  });

  it("claimed ending needs call-front-desk + tvChanged + peek-hall >= 2", () => {
    const { state, ctx } = boot();
    applyAction(hotelScene, state, "peek-hall", ctx);
    applyAction(hotelScene, state, "peek-hall", ctx);
    applyAction(hotelScene, state, "watch-tv", ctx);
    applyAction(hotelScene, state, "watch-tv", ctx);
    applyAction(hotelScene, state, "call-front-desk", ctx);
    state.time = 22 * 60;
    const e = checkEndings(hotelScene, state, ctx);
    expect(e?.id).toBe("claimed");
  });
});

describe("rule insertion math", () => {
  it("insert position is always >= 1 (never at the very top)", () => {
    // Run 50 trials across a scenario where exactly one insert trigger
    // fires. We bypass onChoose by writing state.actions directly.
    for (let trial = 0; trial < 50; trial++) {
      const { state, ctx } = boot();
      state.actions.waitListen = 2;
      state.time = 22 * 60 + 30;
      evaluateTriggers(hotelScene, state, ctx);
      const knock = state.rules.find((r) => r.inserted && /敲門/.test(r.text));
      expect(knock).toBeTruthy();
      const idx = state.rules.indexOf(knock);
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThan(state.rules.length);
    }
  });
});
