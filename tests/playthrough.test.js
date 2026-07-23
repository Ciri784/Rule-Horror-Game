import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate } from "../engine.js";
import { hotel } from "../scenes/hotel.js";

function newRun() {
  const state = freshState(hotel);
  state.time = hotel.initialTime;
  const ctx = { scene: hotel, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}
const ids = (s, ctx) => hotel.actions(s, ctx).map((a) => a.id);
const can = (s, ctx, id) => ids(s, ctx).includes(id);
const act = (s, ctx, id) => applyAction(hotel, s, id, ctx);

describe("深夜飯店 playthrough", () => {
  // 回歸: 開場即死。 舊版一撿員工證就結束。
  it("does not end within the first several clicks (no instant death)", () => {
    const { state, ctx } = newRun();
    for (const id of ["look-card", "look-door", "watch-tv", "look-nightstand", "look-pillow", "look-window"]) {
      if (can(state, ctx, id)) act(state, ctx, id);
      expect(state.ended, `game ended too early after ${id}`).toBeFalsy();
    }
  });

  it("all four rulebooks are obtainable through play", () => {
    const { state, ctx } = newRun();
    expect(state.unlockedRuleIds).toContain("rg1");            // 房客: 開場就有
    act(state, ctx, "look-pillow");                            // 員工: 枕頭下
    expect(state.unlockedRuleIds).toContain("re1");
    act(state, ctx, "go-lobby");                               // 午夜前探索,安全
    act(state, ctx, "go-staff");
    act(state, ctx, "look-wall");                              // 夜班: 員工通道牆
    expect(state.heldItems).toContain("shift-note");
    expect(state.unlockedRuleIds).toContain("rn1");
    // 704 註記: 房間偏移成 704 後,門縫下才出現
    act(state, ctx, "go-lobby");
    act(state, ctx, "go-room");
    state.drift = 3;                                           // 偏移到門牌翻 704
    act(state, ctx, "look-door");                              // 觸發 recompute → doorNumber 704
    expect(state.doorNumber).toBe("704");
    expect(can(state, ctx, "take-note")).toBe(true);
    act(state, ctx, "take-note");
    expect(state.unlockedRuleIds).toContain("rf1");
  });

  it("GOOD ending: the careful guest who stays put reaches dawn", () => {
    const { state, ctx } = newRun();
    act(state, ctx, "look-card");
    expect(state.drift).toBe(0);
    state.crossedMidnight = true;
    state.time = 6 * 60;                                       // 閒置到天亮,一直待在房裡
    act(state, ctx, "look-door");
    expect(state.ended).toBe("checked-out");
    expect(state.doorNumber).toBe("602");
  });

  it("BAD ending (resident): in-room drift turns the door to 704 and the room takes you", () => {
    const { state, ctx } = newRun();
    state.crossedMidnight = true;
    act(state, ctx, "look-nightstand");                        // 704 鑰匙, drift 1
    act(state, ctx, "watch-tv");                               // 7 台
    act(state, ctx, "tv-off");
    act(state, ctx, "watch-tv");                               // 重開, drift 2
    act(state, ctx, "tv-off");
    act(state, ctx, "watch-tv");                               // 重開, drift 3 → 門牌翻 704
    expect(state.ended).toBe("resident");
  });

  it("BAD ending (clerk): wandering out of your room past midnight gets you claimed", () => {
    const { state, ctx } = newRun();
    state.crossedMidnight = true;
    act(state, ctx, "go-lobby");                               // 半夜離開 → intruder → 被收走
    expect(state.ended).toBe("claimed-by-clerk");
  });

  it("staying in your room past midnight, unbothered, is safe (no premature end)", () => {
    const { state, ctx } = newRun();
    state.crossedMidnight = true;
    state.time = 2 * 60;
    for (let i = 0; i < 3; i++) { act(state, ctx, "look-card"); act(state, ctx, "look-door"); }
    expect(state.ended).toBeFalsy();
  });

  it("every action offered at spawn is callable without throwing", () => {
    const { state, ctx } = newRun();
    for (const a of hotel.actions(state, ctx)) {
      expect(() => applyAction(hotel, state, a.id, ctx)).not.toThrow();
    }
  });
});
