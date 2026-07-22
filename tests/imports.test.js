import { describe, it, expect } from "vitest";

// 確保 core.js 跟 engine.js 互相 import 對齊
// (不會 throw SyntaxError、每個被 import 的 export 都真實存在)
// 這個 test 是 contract guard: 之後有人改 engine.js 沒同步 core.js import,
// 或反過來 core.js 引用了不存在的 export,CI 會立刻抓到。

describe("module exports align with core.js imports", () => {
  it("core.js imports no missing export from engine.js", async () => {
    // 動態 import 兩個 module;如果核心 import 寫錯了(例如引用不存在的
    // export),這裡直接就 throw。
    await expect(import("../core.js")).resolves.toBeDefined();
  });

  it("core.js exports the symbols engine.js is allowed to import back", async () => {
    const core = await import("../core.js");
    // engine.js 不會 import core.js(它是無依賴 leaf module)、但保留這個
    // test slot 給未來 cross-module 引用。
    expect(typeof core.renderScene).toBe("function");
    expect(typeof core.registerScene).toBe("function");
    expect(typeof core.getScene).toBe("function");
    expect(typeof core.listScenes).toBe("function");
  });

  it("engine.js surface is exactly the 13 exports core.js depends on", async () => {
    const engine = await import("../engine.js");
    // core.js 真實用到的:loadState, saveState, clearState, narrate,
    // evaluateTriggers, checkEndings, formatTime, freshState, rulesFor,
    // applyAction。core.js 不會直接呼叫 pickUp / moveTo / unlockRule,
    // 但 engine.js 內部會跑、所以也列入。
    const expected = [
      "loadState", "saveState", "clearState", "narrate",
      "freshState", "rulesFor", "evaluateTriggers", "checkEndings",
      "formatTime", "pickUp", "moveTo", "unlockRule", "applyAction",
    ];
    for (const name of expected) {
      expect(typeof engine[name]).toBe("function");
    }
    // 防呆: 確認未來加 export 也會被偵測到
    const actual = Object.keys(engine).filter((k) => typeof engine[k] === "function").sort();
    expect(actual).toEqual(expected.slice().sort());
  });
});
