import { describe, it, expect } from "vitest";
import {
  freshState, evaluateTriggers, checkEndings, formatTime, narrate, applyAction,
  rulesFor, pickUp, moveTo, unlockRule, recomputeHotelView,
} from "../engine.js";
import { hotel as hotelScene } from "../scenes/hotel.js";

function boot(visitCount = 1) {
  const state = freshState(hotelScene, 1700000000000);
  state.visitCount = visitCount;
  const ctx = { scene: hotelScene, visitCount, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}

function pretendNextMorning(state, h = 10, m = 0) {
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
});

describe("new applies-based system", () => {
  it("freshState seeds heldItems, hotelView, location, unlockedRuleIds", () => {
    const { state } = boot();
    expect(state.heldItems).toEqual(["guest-card"]);
    expect(state.hotelView).toBe("unknown");
    expect(state.location).toBe("room-704");
    expect(state.unlockedRuleIds).toEqual([]);
  });
  it("rulesFor returns only rules that are unlocked AND pass applies()", () => {
    const { state } = boot();
    expect(rulesFor(hotelScene, state)).toHaveLength(0);
    unlockRule("r1", state, hotelScene);
    expect(rulesFor(hotelScene, state)).toHaveLength(1);
    state.location = "lobby";
    expect(rulesFor(hotelScene, state)).toHaveLength(0);
  });
  it("pickUp adds item, narrates, and triggers hotelView recompute", () => {
    const { state } = boot();
    expect(pickUp("staff-card", state, hotelScene)).toBe(true);
    expect(state.heldItems).toContain("staff-card");
    expect(pickUp("staff-card", state, hotelScene)).toBe(false);
  });
});

describe("hotel judges — time-based view", () => {
  it("staff-card at 20:00 → hotelView = staff", () => {
    const { state } = boot();
    pickUp("staff-card", state, hotelScene);
    state.time = 20 * 60;
    evaluateTriggers(hotelScene, state, { narrate: () => {} });
    expect(state.hotelView).toBe("staff");
  });
  it("staff-card at 23:00 → hotelView = intruder (expired)", () => {
    const { state } = boot();
    pickUp("staff-card", state, hotelScene);
    state.time = 23 * 60;
    evaluateTriggers(hotelScene, state, { narrate: () => {} });
    expect(state.hotelView).toBe("intruder");
  });
  it("guest-card in room-704 → hotelView = guest", () => {
    const { state } = boot();
    state.time = 22 * 60;
    evaluateTriggers(hotelScene, state, { narrate: () => {} });
    expect(state.hotelView).toBe("guest");
  });
});

describe("endings", () => {
  it("checkout-passed fires at 06:00 if hotelView = guest", () => {
    const { state } = boot();
    pretendNextMorning(state, 6, 0);
    state.hotelView = "guest";
    const e = checkEndings(hotelScene, state, { narrate: () => {} });
    expect(e && e.id).toBe("checkout-passed");
  });
  it("claimed-by-clerk fires if hotelView = intruder past 22:00", () => {
    const { state } = boot();
    state.hotelView = "intruder";
    state.time = 23 * 60;
    const e = checkEndings(hotelScene, state, { narrate: () => {} });
    expect(e && e.id).toBe("claimed-by-clerk");
  });
});

describe("applyAction", () => {
  it("throws on unknown action id", () => {
    const { state, ctx } = boot();
    expect(() => applyAction(hotelScene, state, "nope", ctx)).toThrow();
  });
  it("does nothing after state.ended is set", () => {
    const { state, ctx } = boot();
    state.ended = "checkout-passed";
    const before = state.narrative.length;
    const e = applyAction(hotelScene, state, "look-door", ctx);
    expect(e && e.id).toBe("checkout-passed");
    expect(state.narrative.length).toBe(before);
  });
});
