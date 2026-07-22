// Rule Horror — core engine
// State machine: scenes drive behavior; this file owns rendering, storage,
// and the "rules mutate in the middle of the list" trick.
//
// Scene contract:
//   {
//     id, title, blurb, intro,
//     initialRules: [string, ...],
//     actions(state, ctx) -> [{ id, label, onChoose(state, ctx) }, ...],
//     triggers: [{ id, when(state, ctx) -> bool, body, mode: "insert"|"amend", target? }],
//     endings: [{ id, label, when(state, ctx) -> bool, text }]
//   }

const STORAGE_PREFIX = "rule-horror:";
const $app = document.getElementById("app");

function loadState(id) {
  try { const r = localStorage.getItem(STORAGE_PREFIX + id); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function saveState(id, s) {
  try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(s)); } catch {}
}
function clearState(id) {
  try { localStorage.removeItem(STORAGE_PREFIX + id); } catch {}
}

const scenes = {};
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

function renderRules(state) {
  const ol = el("ol", { class: "rules" });
  state.rules.forEach((rule) => {
    const cls = ["rule"];
    if (rule.inserted) cls.push("inserted");
    if (rule.amended) cls.push("amended");
    ol.appendChild(el("li", { class: cls.join(" ") }, [rule.text]));
  });
  return ol;
}

function evaluateTriggers(scene, state, ctx) {
  const added = [];
  for (const t of scene.triggers) {
    if (state.fired[t.id]) continue;
    if (!t.when(state, ctx)) continue;
    state.fired[t.id] = true;
    if (t.mode === "amend" && typeof t.target === "number") {
      const target = state.rules[t.target];
      if (target) { target.amended = true; target.text = t.body; }
    } else {
      const pos = Math.max(1, Math.floor(Math.random() * state.rules.length));
      state.rules.splice(pos, 0, { text: t.body, inserted: true });
    }
    added.push(t);
  }
  return added;
}

function checkEndings(scene, state, ctx) {
  for (const e of scene.endings) {
    if (state.ended === e.id) return e;
    if (e.when(state, ctx)) { state.ended = e.id; return e; }
  }
  return null;
}

export function renderScene(sceneId) {
  const scene = scenes[sceneId];
  if (!scene) {
    $app.innerHTML = "";
    $app.appendChild(el("div", { class: "scene-card" }, [
      el("h1", {}, "找不到這個場所。"),
      el("p", {}, "請從首頁重新選擇。"),
    ]));
    return;
  }

  let state = loadState(sceneId);
  const fresh = !state;
  if (fresh) {
    const visitCount = (loadState(sceneId + ":visits") || 0) + 1;
    state = {
      rules: scene.initialRules.map((t) => ({ text: t, inserted: false, amended: false })),
      choices: [], fired: {},
      startedAt: Date.now(), visitCount,
      time: 21 * 60, // 21:00 as minutes-of-day, ticks +5 per action
      checkOutPassed: false,
    };
    saveState(sceneId + ":visits", visitCount);
    saveState(sceneId, state);
  }

  const ctx = { visitCount: state.visitCount, fresh };

  function rerender() {
    $app.innerHTML = "";
    const card = el("div", { class: "scene-card" });
    card.appendChild(el("h1", {}, scene.title));
    if (scene.intro) card.appendChild(el("p", { class: "scene-intro" }, scene.intro));
    if (state.visitCount > 1) {
      card.appendChild(el("p", { class: "scene-intro" },
        `這是您第 ${state.visitCount} 次進入這個場所。`));
    }
    card.appendChild(renderRules(state));

    const ending = state.ended ? scene.endings.find((e) => e.id === state.ended) : null;
    if (ending) {
      card.appendChild(el("div", { class: "scene-end" }, [
        el("p", {}, ending.text),
        el("div", { class: "stamp" }, ending.label),
        el("br", {}),
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
            onclick: (ev) => {
              ev.preventDefault();
              if (state.ended) return;
              a.onChoose(state, ctx);
              evaluateTriggers(scene, state, ctx);
              checkEndings(scene, state, ctx);
              saveState(sceneId, state);
              rerender();
            },
          }, a.label));
        }
        card.appendChild(wrap);
      }
    }
    card.appendChild(el("div", { class: "meta" },
      `本場所版本 · ${state.visitCount} · 房間時間 ${formatTime(state.time)}`));
    $app.appendChild(card);
  }

  function restart() { clearState(sceneId); renderScene(sceneId); }
  rerender();
}

function formatTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function renderIndex() {
  $app.innerHTML = "";
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
  $app.appendChild(card);
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
