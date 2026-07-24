import { describe, it, expect } from "vitest";
import { freshState, applyAction, rulesFor, narrate } from "../engine.js";

// Extensibility proof: the engine must run a scene that uses NONE of the
// hotel-specific machinery — no judges, no derive, no doorNumber/drift, no
// rulebooks, no identity clauses. If this ever breaks, a hotel concept has
// leaked back into the generic engine. It also doubles as the minimal scene
// skeleton documented in docs/scene-contract.md.

const room = {
  id: "room",
  title: "空房間",
  blurb: "門是鎖著的。",
  openingNarrative: "你醒來,門上貼著一張紙。",
  initialTime: 0,
  initialUnlockedRuleIds: ["r1"],
  rules: { r1: { book: "紙條", text: "不要開燈。" } },
  actions: () => [
    { id: "wait", label: "等待", onChoose: (s) => { s.time += 60; } },
    { id: "light", label: "開燈", onChoose: (s, c) => { c.narrate("你開了燈。"); s.brokeRule = true; } },
  ],
  endings: [
    { id: "taken", label: "被帶走", when: (s) => s.brokeRule, text: "燈一亮,房間就不再是空的了。" },
    { id: "dawn", label: "天亮", when: (s) => s.time >= 6 * 60, text: "天亮了。" },
  ],
  initialState: { brokeRule: false },
};

const boot = () => {
  const s = freshState(room);
  return { s, ctx: { scene: room, narrate: (t, k) => narrate(s, t, k) } };
};

describe("engine runs a minimal scene with zero hotel-specific fields", () => {
  it("freshState builds a clean generic envelope", () => {
    const { s } = boot();
    expect(s.identity).toBe("unknown");   // no initialIdentity → default
    expect(s.location).toBe(null);        // no initialLocation → null
    expect(s.time).toBe(0);
    expect(s.brokeRule).toBe(false);      // scene-private field spread in
    expect(s.doorNumber).toBeUndefined(); // engine knows nothing about doors
    expect(rulesFor(room, s).map((r) => r.id)).toEqual(["r1"]);
  });

  it("an action + ending resolve without judges or derive", () => {
    const { s, ctx } = boot();
    const end = applyAction(room, s, "light", ctx);
    expect(end.id).toBe("taken");
    expect(s.ended).toBe("taken");
  });

  it("time-based ending fires with no identity system", () => {
    const { s, ctx } = boot();
    s.time = 6 * 60;
    const end = applyAction(room, s, "wait", ctx);
    expect(end.id).toBe("dawn");
  });
});
