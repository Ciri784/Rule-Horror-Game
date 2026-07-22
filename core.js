// Rule Horror — core engine
// State machine: scenes drive behavior; this file owns rendering, storage,
// and the "rules mutate in the middle of the list" trick.
//
// Scene contract:
//   {
//     id, title, blurb, intro,
//     openingNarrative: string,                       // first beat in the narrative stream
//     initialRules: [string, ...],
//     actions(state, ctx) -> [{ id, label, onChoose(state, ctx) }, ...],
//     triggers: [{ id, when(state, ctx) -> bool, body, mode: "insert"|"amend", target? }],
//     endings: [{ id, label, when(state, ctx) -> bool, text }]
//   }
//   onChoose may call ctx.narrate(text, kind?) to push a narration entry
//   into the current state's narrative stream.

import {
  loadState, saveState, clearState,
  narrate, evaluateTriggers, checkEndings, formatTime,
  freshState, rulesFor, applyAction,
} from "./engine.js";

const scenes = {};

// $app is only meaningful in a browser. Resolve lazily so this module is
// importable under Node (e.g. by tests) without a real document.
let $app = null;
function appRoot() {
  if ($app) return $app;
  $app = document.getElementById("app");
  return $app;
}
export function registerScene(scene) { scenes[scene.id] = scene; }
export function getScene(id) { return scenes[id]; }
export function listScenes() { return Object.values(scenes); }

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function renderRules(scene, state) {
  const ol = el("ol", { class: "rules" });
  // New applies-based scenes: use rulesFor(scene, state) which filters
  // unlocked + applies(). Falls back to legacy state.rules list otherwise.
  const list = (scene.rules || scene.initialRules)
    ? rulesFor(scene, state)
    : state.rules.map((r, i) => ({ id: "L" + i, subject: "", text: r.text }));
  list.forEach((rule, i) => {
    // Use real markup for the rule index, not a CSS pseudo-element.
    // CJK + monospace mixed metrics across iOS / Telegram WebView broke
    // the previous "content: '第 ' counter(rule) ' 條'" approach.
    ol.appendChild(el("li", { class: "rule" }, [
      el("span", { class: "rule-num" }, `第 ${i + 1} 條`),
      el("span", { class: "rule-subject" }, rule.subject ? `${rule.subject}：` : ""),
      el("span", { class: "rule-body" }, rule.text),
    ]));
  });
  return ol;
}

export function renderScene(sceneId) {
  const scene = scenes[sceneId];
  if (!scene) {
    appRoot().innerHTML = "";
    appRoot().appendChild(el("div", { class: "scene-card" }, [
      el("h1", {}, "找不到這個場所。"),
      el("p", {}, "請從首頁重新選擇。"),
    ]));
    return;
  }

  let state = loadState(sceneId);
  const fresh = !state;
  if (fresh) {
    const visitCount = (loadState(sceneId + ":visits") || 0) + 1;
    // Use engine.freshState so the scene can opt in to either the legacy
    // initialRules+triggers flow or the new applies-based rules system
    // (initialItems / initialHotelView / initialLocation / initialUnlockedRuleIds).
    state = freshState(scene);
    state.startedAt = Date.now();
    state.visitCount = visitCount;
    state.time = scene.initialTime != null ? scene.initialTime : (state.time || 21 * 60);
    // openingNarrative is layered on top if the scene supplies it and the
    // fresh state didn't already include one
    if (scene.openingNarrative && (!Array.isArray(state.narrative) || state.narrative.length === 0)) {
      state.narrative = [{ time: state.time, kind: "narration", text: scene.openingNarrative }];
    }
    saveState(sceneId + ":visits", visitCount);
    saveState(sceneId, state);
  } else {
    // Migration: older saved states were created before actions existed.
    // Without this, the first onChoose call throws "Cannot read
    // properties of undefined (reading 'lookDoor')" because the saved
    // object literally has no .actions field. Patch in place and persist
    // so we don't have to do this on every render.
    if (!state.actions || typeof state.actions !== "object") {
      state.actions = {};
      saveState(sceneId, state);
    }
    if (!Array.isArray(state.narrative)) {
      // Older saved states (pre 0a57dd0) don't have the narrative log;
      // backfill it with the scene's openingNarrative so the new UI
      // doesn't throw on `for (const entry of state.narrative)`.
      state.narrative = scene.openingNarrative
        ? [{ time: state.time || 21 * 60, kind: "narration", text: scene.openingNarrative }]
        : [];
      saveState(sceneId, state);
    }
    // New Stage B scenes: heldItems / hotelView / location / unlockedRuleIds
    if (scene.rules) {
      if (!Array.isArray(state.heldItems)) state.heldItems = scene.initialItems ? [...scene.initialItems] : [];
      if (typeof state.hotelView !== "string") state.hotelView = scene.initialHotelView || "unknown";
      if (typeof state.location !== "string") state.location = scene.initialLocation || "room-704";
      if (!Array.isArray(state.unlockedRuleIds)) state.unlockedRuleIds = scene.initialUnlockedRuleIds ? [...scene.initialUnlockedRuleIds] : [];
      saveState(sceneId, state);
    }
  }

  // --- Idle time progression ---
  // Real time advances whether the player is clicking or not. We compute
  // the elapsed ms since the last render and convert that to game minutes
  // (5 real seconds = 1 in-game minute, so 1 real minute = 12 minutes).
  // This is the single thing that makes the scene actually playable: the
  // player can sit and watch the rules change, or read a slow trigger, or
  // just think — and the world keeps moving.
  if (state.startedAt) {
    const now = Date.now();
    const lastTick = state._lastTickAt || state.startedAt;
    const elapsedMs = now - lastTick;
    if (elapsedMs >= 5000) {
      const tickMinutes = Math.floor(elapsedMs / 5000);
      const before = state.time;
      // wraparound detection — same trick the engine uses for `time`
      // arithmetic, mirrored here so trigger conditions that key off
      // crossedMidnight work the same way for idle ticks.
      const DAY = 24 * 60;
      state.time = (state.time + tickMinutes) % DAY;
      if (state.time < before) state.crossedMidnight = true;
      // Mark the tick in the narrative stream so the player can see the
      // world actually moved while they weren't pressing buttons.
      narrate(state, `（時間過去了。房間的時鐘指向 ${formatTime(state.time)}。）`, "system");
      state._lastTickAt = now;
      saveState(sceneId, state);
    }
  }

  const ctx = { scene, visitCount: state.visitCount, fresh, narrate: (text, kind) => narrate(state, text, kind) };

  function rerender() {
    appRoot().innerHTML = "";

    // 規則欄 (left on desktop, top on mobile)
    const rulesCol = el("aside", { class: "col col-rules" });
    rulesCol.appendChild(el("h2", { class: "col-title" }, "旅客守則"));
    if (state.visitCount > 1) {
      rulesCol.appendChild(el("p", { class: "col-sub" },
        `第 ${state.visitCount} 次入住`));
    }
    rulesCol.appendChild(renderRules(scene, state));

    // 敘事欄 (center)
    const narrCol = el("section", { class: "col col-narrative" });
    narrCol.appendChild(el("h2", { class: "col-title" }, "此刻"));
    const streamEl = el("div", { class: "narrative-stream", id: "narrative-stream" });
    narrCol.appendChild(streamEl);
    // 行動欄 (right on desktop, bottom on mobile)
    const actCol = el("aside", { class: "col col-actions" });
    actCol.appendChild(el("h2", { class: "col-title" }, "您可以"));
    actCol.appendChild(el("div", { class: "clock" }, formatTime(state.time)));

    const ending = state.ended ? scene.endings.find((e) => e.id === state.ended) : null;
    if (ending) {
      actCol.appendChild(el("div", { class: "scene-end" }, [
        el("div", { class: "stamp" }, ending.label),
        el("a", { href: "#", onclick: (ev) => { ev.preventDefault(); restart(); } },
          el("button", { class: "restart" }, "重新入住")),
      ]));
    } else {
      const actions = scene.actions(state, ctx);
      if (actions && actions.length) {
        const wrap = el("div", { class: "actions" });
        for (const a of actions) {
          wrap.appendChild(el("button", {
            type: "button",
            class: "action-btn",
            "data-action": a.id,
            onclick: (ev) => {
              ev.preventDefault();
              if (state.ended) return;
              try {
                if (!state.actions || typeof state.actions !== "object") {
                  state.actions = {};
                }
                applyAction(scene, state, a.id, ctx);
                saveState(sceneId, state);
              } catch (err) {
                console.error("[rule-horror] action failed", a.id, err);
                renderError(err, a.id);
                return;
              }
              rerender();
              // type out the newest narrative line
              const stream = document.getElementById("narrative-stream");
              if (stream) stream.lastElementChild && stream.lastElementChild.classList.add("just-typed");
            },
          }, a.label));
        }
        actCol.appendChild(wrap);
      }
    }
    // Reset button — wipes this scene's localStorage and re-renders fresh.
    // Always visible so the player can bail out of a bad run, not just on
    // the ending stamp.
    actCol.appendChild(el("div", { class: "reset-block" }, [
      el("button", {
        type: "button",
        class: "reset-btn",
        title: "清除本關進度,從頭開始",
        onclick: (ev) => {
          ev.preventDefault();
          if (confirm("確定要重置本關嗎?目前的進度會全部消失。")) {
            clearState(sceneId);
            location.hash = "";
            location.reload();
          }
        },
      }, "重置本關"),
    ]));

    actCol.appendChild(el("div", { class: "meta" },
      `場所版本 · ${state.visitCount}`));

    // Append the grid BEFORE calling renderNarrativeStream so the
    // narrator can find the stream element via document.getElementById
    // (used by action-button onclick to add the .just-typed class).
    // Bug: previously we called renderNarrativeStream while the grid was
    // still detached, so getElementById returned null and the stream
    // stayed empty.
    const grid = el("div", { class: "scene-grid" }, [rulesCol, narrCol, actCol]);
    appRoot().appendChild(grid);
    renderNarrativeStream(streamEl, state);



    // grid is appended in the narrative-column block above so the
    // narrator can run immediately. Just scroll the stream to the
    // bottom of the newest entry here.
    const stream = document.getElementById("narrative-stream");
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function restart() { clearState(sceneId); renderScene(sceneId); }
  rerender();
}

function renderError(err, actionId) {
  appRoot().innerHTML = "";
  const card = el("div", { class: "scene-card" });
  card.appendChild(el("h1", {}, "守則出差錯了"));
  card.appendChild(el("p", { class: "scene-intro" },
    actionId ? `剛才的動作「${actionId}」把守則弄亂了。請回到首頁重來。`
             : "守則還沒準備好。請回到首頁重來。"));
  const pre = el("pre", {},
    String(err && err.stack || err));
  pre.style.cssText = "white-space:pre-wrap;font-size:12px;color:var(--accent);padding:12px;border:1px dashed var(--accent-soft);background:rgba(110,31,31,0.05);";
  card.appendChild(pre);
  card.appendChild(el("button", {
    class: "restart",
    onclick: (ev) => { ev.preventDefault(); location.hash = ""; location.reload(); },
  }, "返回首頁"));
  appRoot().appendChild(card);
}

function renderNarrativeStream(stream, state) {
  if (!stream) return;
  stream.innerHTML = "";
  if (!Array.isArray(state.narrative)) state.narrative = [];
  for (const entry of state.narrative) {
    const row = el("div", { class: `narr-row kind-${entry.kind}` }, [
      el("span", { class: "narr-time" }, formatTime(entry.time)),
      el("span", { class: "narr-text" }, entry.text),
    ]);
    stream.appendChild(row);
  }
}
export function renderIndex() {
  appRoot().innerHTML = "";
  const card = el("div", { class: "scene-card" });
  card.appendChild(el("h1", {}, "規則怪談集"));
  card.appendChild(el("p", { class: "scene-intro" },
    "這些是從不同場所流出的守則。每一份都自稱能保護您。多數是真的。"));
  const pick = el("div", { class: "scene-pick" });
  for (const s of listScenes()) {
    pick.appendChild(el("a", { href: "#" + s.id, onclick: (ev) => {
      ev.preventDefault(); location.hash = s.id;
    } }, [
      el("span", { class: "name" }, s.title),
      el("span", { class: "blurb" }, s.blurb || ""),
    ]));
  }
  card.appendChild(pick);
  card.appendChild(el("div", { class: "meta" }, "Rule Horror · Ciri784"));
  appRoot().appendChild(card);
}

export function start() {
  function route() {
    const id = (location.hash || "").replace(/^#/, "");
    if (id && scenes[id]) renderScene(id);
    else renderIndex();
  }
  window.addEventListener("hashchange", route);
  route();
}
