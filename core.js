// Rule Horror — core (browser layer): DOM rendering, routing, storage.
// The generic state machine lives in engine.js; scenes drive behaviour.
//
// Scene contract (full spec + minimal skeleton: docs/scene-contract.md):
//   {
//     id, title, blurb, openingNarrative,
//     initialItems?, initialLocation?, initialIdentity?, initialTime?,
//     initialUnlockedRuleIds?, initialState?,      // scene-private fields
//     rules, rulebooks, judges?, derive?,
//     actions(state, ctx) -> [{ id, label, onChoose(state, ctx) }, ...],
//     endings: [{ id, label, when(state, ctx) -> bool, text }],
//     ui?: { visitLabel?(n), restart?, rulesTitle?, nowTitle?, actionsTitle?,
//            reset?, home?, emptyRules? },
//   }
//   onChoose may call ctx.narrate(text, kind?) to push a narration entry.

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

// Generic UI labels. A scene may override any of these via `scene.ui`;
// place-specific wording (a hotel's 入住/退房) lives there, not here.
const UI_DEFAULTS = {
  rulesTitle: "已知規則",
  nowTitle: "此刻",
  actionsTitle: "您可以",
  reset: "重置本關",
  home: "回到首頁",
  restart: "重新開始",
  emptyRules: "您目前還沒有拿到任何守則。",
  visitLabel: (n) => `第 ${n} 次`,
};
function label(scene, key, ...args) {
  const v = (scene.ui && scene.ui[key] != null) ? scene.ui[key] : UI_DEFAULTS[key];
  return typeof v === "function" ? v(...args) : v;
}

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

function renderRules(scene, state, openBooks) {
  // Each rulebook is a <details> dropdown. The player collects rulebooks by
  // holding the matching items; each is collapsed until opened. Multiple
  // rulebooks coexist so the player can compare contradictory rules.
  //
  // `openBooks` is a Set (owned by renderScene) of book names the player has
  // expanded. rerender() rebuilds the DOM from scratch on every action, so
  // without this the <details> would snap shut each turn — we reapply the
  // open state here and keep the Set in sync via the toggle event.
  const list = rulesFor(scene, state);

  if (scene.rulebooks) {
    // 把 rule 依 book 分群
    const groups = {};
    for (const bookName of Object.keys(scene.rulebooks)) {
      groups[bookName] = list.filter((r) => r.book === bookName);
    }
    // 沒有 book 欄位的 rule (legacy) 歸到 "其他"
    const orphans = list.filter((r) => !r.book);
    if (orphans.length) groups["其他"] = orphans;

    const wrap = el("div", { class: "rulebooks" });
    for (const [bookName, rules] of Object.entries(groups)) {
      if (!rules || rules.length === 0) continue;
      // 計算這份守則單有幾條條件還沒過的 (顯示為「待解鎖」)
      const lockedHint = rules.length === 0 ? "" : `（${rules.length} 條）`;
      const props = {
        class: "rulebook",
        ontoggle: (ev) => {
          if (ev.target.open) openBooks.add(bookName);
          else openBooks.delete(bookName);
        },
      };
      if (openBooks && openBooks.has(bookName)) props.open = "";
      const details = el("details", props);
      const summary = el("summary", { class: "rulebook-summary" }, [
        el("span", { class: "rulebook-title" }, bookName),
        el("span", { class: "rulebook-count" }, lockedHint),
      ]);
      details.appendChild(summary);
      const ol = el("ol", { class: "rules" });
      rules.forEach((rule, i) => {
        ol.appendChild(el("li", { class: "rule" }, [
          el("span", { class: "rule-num" }, `第 ${i + 1} 條`),
          el("span", { class: "rule-body" }, rule.text),
        ]));
      });
      details.appendChild(ol);
      wrap.appendChild(details);
    }
    if (!wrap.children.length) {
      wrap.appendChild(el("p", { class: "rules-empty" }, label(scene, "emptyRules")));
    }
    return wrap;
  }

  // Scene without rulebooks: render its unlocked rules as one flat list.
  const ol = el("ol", { class: "rules" });
  list.forEach((rule, i) => {
    ol.appendChild(el("li", { class: "rule" }, [
      el("span", { class: "rule-num" }, `第 ${i + 1} 條`),
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

  // Saves are versioned (see STORAGE_PREFIX); a load either returns a
  // current-shape state or null, so no in-place migration is needed.
  let state = loadState(sceneId);
  const fresh = !state;
  if (fresh) {
    const visitCount = (loadState(sceneId + ":visits") || 0) + 1;
    state = freshState(scene);
    state.visitCount = visitCount;
    saveState(sceneId + ":visits", visitCount);
    saveState(sceneId, state);
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

  // Which rulebooks the player has expanded. Lives here (view state, not game
  // state) so it survives every rerender() but resets on a fresh scene load.
  const openBooks = new Set();

  function rerender() {
    appRoot().innerHTML = "";

    // 規則欄 (left on desktop, top on mobile)
    const rulesCol = el("aside", { class: "col col-rules" });
    rulesCol.appendChild(el("h2", { class: "col-title" }, label(scene, "rulesTitle")));
    if (state.visitCount > 1) {
      rulesCol.appendChild(el("p", { class: "col-sub" },
        label(scene, "visitLabel", state.visitCount)));
    }
    rulesCol.appendChild(renderRules(scene, state, openBooks));

    // 敘事欄 (center)
    const narrCol = el("section", { class: "col col-narrative" });
    narrCol.appendChild(el("h2", { class: "col-title" }, label(scene, "nowTitle")));
    const streamEl = el("div", { class: "narrative-stream", id: "narrative-stream" });
    narrCol.appendChild(streamEl);
    // 行動欄 (right on desktop, bottom on mobile)
    const actCol = el("aside", { class: "col col-actions" });
    actCol.appendChild(el("h2", { class: "col-title" }, label(scene, "actionsTitle")));
    const ending = state.ended ? scene.endings.find((e) => e.id === state.ended) : null;
    if (ending) {
      actCol.appendChild(el("div", { class: "scene-end" }, [
        el("div", { class: "stamp" }, ending.label),
        el("a", { href: "#", onclick: (ev) => { ev.preventDefault(); restart(); } },
          el("button", { class: "restart" }, label(scene, "restart"))),
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
        class: "home-btn",
        title: "回到場所選單，本關進度會保留",
        onclick: (ev) => {
          ev.preventDefault();
          location.hash = "";
        },
      }, label(scene, "home")),
      el("button", {
        type: "button",
        class: "reset-btn",
        title: "清除本關進度，從頭開始",
        onclick: (ev) => {
          ev.preventDefault();
          if (confirm("確定要重置本關嗎？目前的進度會全部消失。")) {
            clearState(sceneId);
            location.hash = "";
            location.reload();
          }
        },
      }, label(scene, "reset")),
    ]));

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
      el("h2", { class: "name" }, s.title),
      el("p", { class: "blurb" }, s.blurb || ""),
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
