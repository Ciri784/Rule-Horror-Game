import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate, formatTime } from "../engine.js";
import { hotel as hotelScene } from "../scenes/hotel.js";

function newRun() {
  const state = freshState(hotelScene);
  const ctx = { visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}

describe("Rule-Horror-Game hotel playthrough", () => {
  it("survives a full run picking up items, exploring, and reaching an ending without throwing", () => {
    const { state, ctx } = newRun();
    const a = (id) => applyAction(hotelScene, state, id, ctx);
    expect(() => {
      a("look-door");
      a("watch-tv");
      a("look-pillow");
      a("look-nightstand");
      a("look-window");
      a("look-wall");
      for (let i = 0; i < 5; i++) a("look-door");
    }).not.toThrow();
    expect(state.narrative.length).toBeGreaterThanOrEqual(5);
  });

  it("picking up staff-card at 20:00 marks player as staff per hotel judges", () => {
    const { state, ctx } = newRun();
    state.time = 20 * 60;
    applyAction(hotelScene, state, "look-pillow", ctx);
    expect(state.heldItems).toContain("staff-card");
    expect(state.hotelView).toBe("staff");
  });

  it("picking up staff-card at 23:00 marks player as intruder (expired)", () => {
    const { state, ctx } = newRun();
    state.time = 23 * 60;
    applyAction(hotelScene, state, "look-pillow", ctx);
    expect(state.heldItems).toContain("staff-card");
    expect(state.hotelView).toBe("intruder");
  });

  it("every action in the scene is reachable and callable without throwing", () => {
    const { state, ctx } = newRun();
    for (const a of hotelScene.actions(state, ctx)) {
      expect(() => applyAction(hotelScene, state, a.id, ctx)).not.toThrow();
    }
  });
});
