import { describe, it, expect } from "vitest";
import {
  freshState, evaluateTriggers, checkEndings, formatTime, narrate, applyAction,
  rulesFor, pickUp,
} from "../engine.js";
import { hotel } from "../scenes/hotel.js";

function boot() {
  const state = freshState(hotel, 1700000000000);
  state.time = hotel.initialTime;
  const ctx = { scene: hotel, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}
const silent = { narrate: () => {} };

describe("engine basics", () => {
  it("formatTime pads and wraps at 24h", () => {
    expect(formatTime(21 * 60)).toBe("21:00");
    expect(formatTime(9 * 60 + 5)).toBe("09:05");
    expect(formatTime(23 * 60 + 70)).toBe("00:10");
  });
});

describe("fresh state", () => {
  it("starts in room 602 as a guest holding only the house rulebook", () => {
    const { state } = boot();
    expect(state.heldItems).toEqual(["guest-card"]);
    expect(state.identity).toBe("guest");
    expect(state.location).toBe("my-room");
    expect(state.doorNumber).toBe("602");
    expect(state.drift).toBe(0);
    expect(state.unlockedRuleIds).toContain("rg1");
  });
  it("only 房客守則 is in effect at boot; the other books are locked", () => {
    const { state } = boot();
    const books = [...new Set(rulesFor(hotel, state).map((r) => r.book))];
    expect(books).toEqual(["房客守則"]);
  });
});

describe("door drift", () => {
  it("door holds at 602 below the flip threshold and turns 704 at it", () => {
    const { state } = boot();
    state.drift = 2;
    evaluateTriggers(hotel, state, silent);
    expect(state.doorNumber).toBe("602");
    state.drift = 3;
    evaluateTriggers(hotel, state, silent);
    expect(state.doorNumber).toBe("704");
  });
  it("the flip is one-way: dropping drift does not restore 602", () => {
    const { state } = boot();
    state.drift = 3;
    evaluateTriggers(hotel, state, silent);
    expect(state.doorNumber).toBe("704");
    state.drift = 0;
    evaluateTriggers(hotel, state, silent);
    expect(state.doorNumber).toBe("704");
  });
});

describe("hotel judges — identity", () => {
  it("guest-card in my-room → guest", () => {
    const { state } = boot();
    state.time = 22 * 60;
    evaluateTriggers(hotel, state, silent);
    expect(state.identity).toBe("guest");
  });
  it("guest-card outside my-room → intruder", () => {
    const { state } = boot();
    state.location = "lobby";
    evaluateTriggers(hotel, state, silent);
    expect(state.identity).toBe("intruder");
  });
  it("expired staff-card at 23:00 → intruder", () => {
    const { state } = boot();
    pickUp("staff-card", state, hotel);
    state.time = 23 * 60;
    evaluateTriggers(hotel, state, silent);
    expect(state.identity).toBe("intruder");
  });
  it("valid staff-card at 20:00 → staff", () => {
    const { state } = boot();
    pickUp("staff-card", state, hotel);
    state.time = 20 * 60;
    evaluateTriggers(hotel, state, silent);
    expect(state.identity).toBe("staff");
  });
});

describe("endings", () => {
  it("resident fires when the door has turned 704 in your room past midnight", () => {
    const { state } = boot();
    state.doorNumber = "704";
    state.location = "my-room";
    state.crossedMidnight = true;
    expect(checkEndings(hotel, state, silent).id).toBe("resident");
  });
  it("claimed-by-clerk fires for an intruder past midnight", () => {
    const { state } = boot();
    state.identity = "intruder";
    state.crossedMidnight = true;
    state.time = 30;
    expect(checkEndings(hotel, state, silent).id).toBe("claimed-by-clerk");
  });
  it("checked-out fires for a guest still in 602 at dawn", () => {
    const { state } = boot();
    state.crossedMidnight = true;
    state.time = 6 * 60;
    expect(checkEndings(hotel, state, silent).id).toBe("checked-out");
  });
  it("nothing ends at the 23:00 spawn (regression: 開場即死)", () => {
    const { state } = boot();
    expect(checkEndings(hotel, state, silent)).toBeNull();
  });
});

describe("applyAction", () => {
  it("throws on unknown action id", () => {
    const { state, ctx } = boot();
    expect(() => applyAction(hotel, state, "nope", ctx)).toThrow();
  });
  it("does nothing after state.ended is set", () => {
    const { state, ctx } = boot();
    state.ended = "resident";
    const before = state.narrative.length;
    applyAction(hotel, state, "look-door", ctx);
    expect(state.narrative.length).toBe(before);
  });
});
