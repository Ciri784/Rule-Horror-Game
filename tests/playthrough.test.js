import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate, formatTime } from "../engine.js";
import { hotel as hotel } from "../scenes/hotel.js";

function newRun() {
  const state = freshState(hotel);
  const ctx = { scene: hotel, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}

describe("Rule-Horror-Game hotel playthrough", () => {
  it("survives a full run picking up items, exploring, and reaching an ending without throwing", () => {
    const { state, ctx } = newRun();
    const a = (id) => applyAction(hotel, state, id, ctx);
    expect(() => {
      a("look-door");
      a("watch-tv");
      a("look-pillow");
      a("look-nightstand");
      a("look-window");
      a("look-wall");
      for (let i = 0; i < 5; i++) a("look-door");
    }).not.toThrow();
    // Stage B: actions split rule discovery from identity pickup. Some
    // actions narrate via ctx (require scene labels), some push directly
    // to state.narrative. 6 distinct actions should narrate at least 3
    // times after the design split (look-door no longer narrates by default
    // unless something is interesting at the door).
    expect(state.narrative.length).toBeGreaterThanOrEqual(3);
  });

  it("picking up staff-card at 20:00 marks player as staff per hotel judges", () => {
    const { state, ctx } = newRun();
    state.time = 20 * 60;
    applyAction(hotel, state, "look-pillow", ctx);
    expect(state.heldItems).toContain("staff-card");
    expect(state.hotelView).toBe("staff");
  });

  it("picking up staff-card at 23:00 marks player as intruder (expired)", () => {
    const { state, ctx } = newRun();
    state.time = 23 * 60;
    applyAction(hotel, state, "look-pillow", ctx);
    expect(state.heldItems).toContain("staff-card");
    expect(state.hotelView).toBe("intruder");
  });

  it("every action in the scene is reachable and callable without throwing", () => {
    const { state, ctx } = newRun();
    for (const a of hotel.actions(state, ctx)) {
      expect(() => applyAction(hotel, state, a.id, ctx)).not.toThrow();
    }
  });

  // === 回歸: 開場即死 ===
  // 舊 bug: 遊戲 23:00 開場、claimed-by-clerk 門檻是 time>=23:00,一撿
  // 員工證 (枕頭下,遊戲主動引導) 就在同一個 click 觸發結局。
  it("does NOT end within the first several clicks (no instant death)", () => {
    const { state, ctx } = newRun();
    const clicks = ["look-door", "watch-tv", "look-pillow", "look-nightstand", "look-window", "look-wall"];
    for (const id of clicks) {
      const avail = hotel.actions(state, ctx).some((a) => a.id === id);
      if (avail) applyAction(hotel, state, id, ctx);
      expect(state.ended, `game ended too early after ${id}`).toBeFalsy();
    }
  });

  // === 回歸: 沒有移動系統 ===
  // 舊 bug: actions() 從不呼叫 moveTo,玩家永遠卡在 704,員工通道/監控室
  // 到不了、「夜班守則」整本 (shift-note) 永遠拿不到。
  it("player can move out of 704, reach the staff corridor, and obtain 夜班守則", () => {
    const { state, ctx } = newRun();
    // 先在房間撿到員工證 (進員工通道的通行證)
    applyAction(hotel, state, "look-pillow", ctx);
    expect(state.heldItems).toContain("staff-card");
    // 下樓 → 進員工通道
    const hasMove = (id) => hotel.actions(state, ctx).some((a) => a.id === id);
    expect(hasMove("go-lobby")).toBe(true);
    applyAction(hotel, state, "go-lobby", ctx);
    expect(state.location).toBe("lobby");
    expect(hasMove("go-staff-corridor")).toBe(true);
    applyAction(hotel, state, "go-staff-corridor", ctx);
    expect(state.location).toBe("staff-corridor");
    // 員工通道看牆 → 撿到夜班守則、整本解鎖
    applyAction(hotel, state, "look-wall", ctx);
    expect(state.heldItems).toContain("shift-note");
    for (const id of ["r6", "r14", "r15", "r16", "r17", "r25", "r26"]) {
      expect(state.unlockedRuleIds, `夜班守則 ${id} not unlocked`).toContain(id);
    }
    // 監控室現在可達
    expect(hasMove("go-monitor-room")).toBe(true);
  });

  // === 回歸: 兩個結局都要真的到得了 ===
  it("claimed-by-clerk is reachable: intruder who does not get back before midnight", () => {
    const { state, ctx } = newRun();
    applyAction(hotel, state, "look-pillow", ctx);   // 員工證 → intruder (23:xx)
    expect(state.hotelView).toBe("intruder");
    expect(state.ended).toBeFalsy();                 // 但午夜前不死
    state.time = 30;                                 // 時間走到 00:30
    applyAction(hotel, state, "look-door", ctx);     // 跨過午夜後任一動作
    expect(state.ended).toBe("claimed-by-clerk");
  });

  it("room-consumed is reachable: the quiet guest who reads the 4F note", () => {
    const { state, ctx } = newRun();
    applyAction(hotel, state, "look-nightstand", ctx); // room-key + floor-4-note (+敘事提到 4 樓)
    expect(state.heldItems).toContain("floor-4-note");
    expect(state.hotelView).toBe("guest");             // 沒碰員工證、留在 704 = 仍是旅客
    state.time = 4 * 60 + 30;                          // 凌晨 04:30
    state.crossedMidnight = true;
    applyAction(hotel, state, "look-wall", ctx);
    expect(state.ended).toBe("room-consumed");
  });
});
