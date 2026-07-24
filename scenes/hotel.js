// Rule Horror — 深夜飯店 (內容大修)
//
// 核心怪點:這間飯店沒有 4 樓(電梯 3 跳 5)。但 4 樓夜裡回來,房間用
// 7 字頭號碼偽裝。704 就是藏在「7」底下的 4 樓房。走進 704 = 變成走不掉
// 的住客。玩家開場在正常房 602,房卡印著 602(唯一的「真號碼」)。整晚
// 只做一件事:別讓自己的門牌被換成 704。
//
// 三種身份、四本互相打架的守則(房客/員工/夜班/704 註記),矛盾是刻意
// 的陷阱。詳見 docs 的設計稿。

import { pickUp, moveTo, unlockRule } from "../engine.js";

const CARD_NUMBER = "602";     // 房卡上的真號碼
const HIDDEN_NUMBER = "704";   // 4 樓偽裝的號碼
const DRIFT_FLIP = 3;          // 偏移到這個值,門牌翻成 704

// 場所
const LOCATIONS = {
  "my-room":        { label: "你的房間" },
  "lobby":          { label: "一樓大廳" },
  "staff-corridor": { label: "員工通道" },
  "monitor-room":   { label: "監控室" },
};

// 道具
const ITEMS = {
  "guest-card":   { label: "房卡" },        // 開場就有,印著 602。身份 + 真相錨點。
  "key-704":      { label: "704 的鑰匙" },  // 凶兆:你卡是 602,抽屜卻有 704 的鑰匙。
  "staff-card":   { label: "夜班員工證" },
  "staff-manual": { label: "員工守則" },
  "shift-note":   { label: "夜班守則" },
  "note-704":     { label: "704 註記" },
};

// 守則本
const RULEBOOKS = {
  "房客守則":  { heldBy: ["guest-card"], autoFromItem: "guest-card" },
  "員工守則":  { heldBy: ["staff-manual"] },
  "夜班守則":  { heldBy: ["shift-note"] },
  "704 註記":  { heldBy: ["note-704"] },
};

const has = (s, it) => s.heldItems.includes(it);

// 22 條守則。applies() 決定「當下」哪些生效;跨本矛盾是刻意的陷阱。
const RULES = {
  // ── 房客守則(開場就有,相信房卡、待在 602)──
  rg1: { subject: "房客", book: "房客守則",
         text: "你的房號印在房卡上。只有房卡上的號碼算數。",
         applies: (s) => has(s, "guest-card") },
  rg2: { subject: "房客", book: "房客守則",
         text: "就寢前，確認門牌與房卡相同。",
         applies: (s) => has(s, "guest-card") && s.location === "my-room" },
  rg3: { subject: "房客", book: "房客守則",
         text: "門牌和房卡不符時，待在房裡，不要出去找「對的房間」。",
         applies: (s) => has(s, "guest-card") && s.location === "my-room" },
  rg4: { subject: "房客", book: "房客守則",
         text: "電視固定在 4 台。跳到 7 台，關掉，別再開。",
         applies: (s) => has(s, "guest-card") && s.location === "my-room" },
  rg5: { subject: "房客", book: "房客守則",
         text: "12 點後不要離開房間。",
         applies: (s) => has(s, "guest-card") && s.location === "my-room" },
  rg6: { subject: "房客", book: "房客守則",
         text: "有人敲門，先看門牌。門牌是你的房號，才開。",
         applies: (s) => has(s, "guest-card") && s.location === "my-room" },

  // ── 員工守則(枕頭下的員工證+守則,誘餌書:叫你上去那層樓)──
  re1: { subject: "員工", book: "員工守則",
         text: "員工證請於 10 點前繳回。過了 10 點，證就不再屬於你。",
         applies: (s) => has(s, "staff-manual") && has(s, "staff-card") },
  re2: { subject: "員工", book: "員工守則",
         text: "巡邏時，門牌就是你的樓層；7 開頭代表你該巡那層。",
         applies: (s) => has(s, "staff-manual") && has(s, "staff-card") },
  re3: { subject: "員工", book: "員工守則",
         text: "4 樓巡房時，不可打開任何房門。",
         applies: (s) => has(s, "staff-manual") && has(s, "staff-card") },
  re4: { subject: "員工", book: "員工守則",
         text: "電梯不停 4 樓。若停了，不是它叫你，別上去。",
         applies: (s) => has(s, "staff-manual") && has(s, "staff-card") },
  re5: { subject: "員工", book: "員工守則",
         text: "巡邏完走樓梯下樓，不要搭電梯。",
         applies: (s) => has(s, "staff-manual") && has(s, "staff-card") },
  re6: { subject: "員工", book: "員工守則",
         text: "遇到房客，不要直視眼睛。",
         applies: (s) => has(s, "staff-manual") && has(s, "staff-card") },

  // ── 夜班守則(員工通道牆上,跟員工守則自打架)──
  rn1: { subject: "夜班", book: "夜班守則",
         text: "監控室只給值班的人。你不是，就別待太久。",
         applies: (s) => has(s, "shift-note") && s.location === "monitor-room" },
  rn2: { subject: "夜班", book: "夜班守則",
         text: "監視器每 15 分鐘會黑屏 3 秒，正常。黑屏時，不要回頭。",
         applies: (s) => has(s, "shift-note") && s.location === "monitor-room" },
  rn3: { subject: "夜班", book: "夜班守則",
         text: "若 4 樓電梯停了，上去查看。",
         applies: (s) => has(s, "shift-note") },
  rn4: { subject: "夜班", book: "夜班守則",
         text: "監視器裡若出現 704 的門，記下時間，不要過去。",
         applies: (s) => has(s, "shift-note") && s.location === "monitor-room" },
  rn5: { subject: "夜班", book: "夜班守則",
         text: "交班前，把看到的都當沒看到。",
         applies: (s) => has(s, "shift-note") },

  // ── 704 註記(門牌翻 704 後才讀得到,讀到 = 你已經在裡面)──
  rf1: { subject: "704", book: "704 註記",
         text: "4 樓不存在。你若讀得到這張紙，你已經在 4 樓。",
         applies: (s) => has(s, "note-704") },
  rf2: { subject: "704", book: "704 註記",
         text: "門牌不會說謊。你在哪，門牌就是幾號。",
         applies: (s) => has(s, "note-704") },
  rf3: { subject: "704", book: "704 註記",
         text: "704 的住客不會離開。",
         applies: (s) => has(s, "note-704") },
  rf4: { subject: "704", book: "704 註記",
         text: "有人敲 704 的門，那是這層樓的人。開門，你就記得他們；記得，你就留下。",
         applies: (s) => has(s, "note-704") },
  rf5: { subject: "704", book: "704 註記",
         text: "房間認得你。別試圖認錯它。",
         applies: (s) => has(s, "note-704") },
};

// 飯店判斷準則 — 第一個 when 通過的 view 勝出。
// 房客待在自己房間才是「房客」;離開就成 intruder。員工證入夜即過期。
const HOTEL_JUDGES = [
  { when: (s) => has(s, "staff-card") && s.time >= 18 * 60 && s.time < 22 * 60, view: "staff" },
  { when: (s) => has(s, "staff-card"), view: "intruder" },
  { when: (s) => has(s, "guest-card") && s.location === "my-room", view: "guest" },
  { when: (s) => has(s, "guest-card"), view: "intruder" },
];

// 門牌重算:偏移夠高,你的門就變成 704(不可逆——房間已經是那層樓的了)。
function recomputeDoor(s) {
  if (s.drift >= DRIFT_FLIP) s.doorNumber = HIDDEN_NUMBER;
  else if (s.doorNumber == null) s.doorNumber = CARD_NUMBER;
}

// 解鎖整本守則
function unlockBook(ids, s, c) {
  ids.forEach((id) => { if (!s.unlockedRuleIds.includes(id)) unlockRule(id, s, c); });
}

// 動作 — 依所在地決定。守則講的讀數(門牌/房卡/電視),這裡都是真動作。
function actions(state, ctx) {
  const at = (id) => state.location === id;
  ctx.itemLabels = ctx.itemLabels ||
    Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.label]));
  ctx.scene = ctx.scene || hotel;
  const out = [];

  if (at("my-room")) {
    if (has(state, "guest-card")) {
      out.push({ id: "look-card", label: "看房卡",
        onChoose: (s, c) => {
          c.narrate(`房卡上印著 ${CARD_NUMBER}。無論門牌怎麼變，這是你的房號。`);
          s.time += 1;
        } });
    }
    out.push({ id: "look-door", label: "看門牌",
      onChoose: (s, c) => {
        c.narrate(`你的房門牌寫著 ${s.doorNumber}。`);
        if (s.doorNumber !== CARD_NUMBER) c.narrate("……可是你的房卡明明是 602。");
        s.time += 2;
      } });
    if (has(state, "guest-card")) {
      out.push({ id: "compare", label: "對照門牌與房卡",
        onChoose: (s, c) => {
          if (s.doorNumber === CARD_NUMBER) c.narrate("門牌和房卡一致。602。你還在自己的房間。");
          else c.narrate(`門牌 ${s.doorNumber}，房卡 ${CARD_NUMBER}。有一個在說謊。`);
          s.time += 2;
        } });
    }
    out.push({ id: "watch-tv", label: "看電視",
      onChoose: (s, c) => {
        const sevens = s.crossedMidnight || s.drift >= 1;
        if (sevens) {
          if (s.tvOff) { s.drift += 1; s.tvOff = false; c.narrate("你又打開了電視。7 台。那條走廊又近了一點。"); }
          else c.narrate("電視跳到 7 台。畫面是一條你沒走過的走廊。");
          s.tvOn7 = true;
        } else {
          c.narrate("電視只剩雪花，固定在 4 台。");
        }
        s.time += 3;
      } });
    if (state.tvOn7 && !state.tvOff) {
      out.push({ id: "tv-off", label: "關掉電視",
        onChoose: (s, c) => {
          s.tvOff = true; s.tvOn7 = false;
          c.narrate("你關掉電視。走廊消失了。螢幕黑下去，剩你自己的倒影。");
          s.time += 1;
        } });
    }
    out.push({ id: "look-window", label: "看窗外",
      onChoose: (s, c) => {
        if (s.doorNumber === CARD_NUMBER) c.narrate("窗外是停車場。六樓的高度，說得通。");
        else c.narrate("窗外還是停車場。但這高度不對——太低了。你不敢再看。");
        s.time += 3;
      } });
    out.push({ id: "look-pillow", label: "翻枕頭下",
      onChoose: (s, c) => {
        if (!has(s, "staff-card")) {
          pickUp("staff-card", s, c);
          c.narrate("枕頭旁邊還壓著一本員工守則。");
          if (!has(s, "staff-manual")) pickUp("staff-manual", s, c);
        } else if (!has(s, "staff-manual")) {
          c.narrate("枕頭旁邊還壓著一本員工守則。");
          pickUp("staff-manual", s, c);
        } else {
          c.narrate("枕頭下什麼都沒有了。");
        }
        if (has(s, "staff-manual")) unlockBook(["re1", "re2", "re3", "re4", "re5", "re6"], s, c);
        s.time += 2;
      } });
    out.push({ id: "look-nightstand", label: "翻床頭櫃",
      onChoose: (s, c) => {
        if (!has(s, "key-704")) {
          c.narrate("抽屜底層有一把舊銅鑰匙，刻著 704。可是你的房卡是 602。");
          pickUp("key-704", s, c);
          s.drift += 1;
        } else {
          c.narrate("抽屜裡只剩那把 704 的鑰匙，還躺著。");
        }
        s.time += 2;
      } });
    // 門牌翻成 704 後,門縫下會出現那張紙——讀到=你已經在裡面了。
    if (state.doorNumber === HIDDEN_NUMBER && !has(state, "note-704")) {
      out.push({ id: "take-note", label: "撿起門縫下的紙條",
        onChoose: (s, c) => {
          c.narrate("門縫下塞著一張泛黃的紙，標題是「704 註記」。你不記得它什麼時候出現的。");
          pickUp("note-704", s, c);
          unlockBook(["rf1", "rf2", "rf3", "rf4", "rf5"], s, c);
          s.time += 2;
        } });
    }
    if (state.crossedMidnight) {
      out.push({ id: "answer-door", label: "門外有敲門聲——應門",
        onChoose: (s, c) => {
          if (s.doorNumber === HIDDEN_NUMBER) {
            s.drift += 2;
            c.narrate("你開了門。門外站著一個想不起臉的人。他點點頭，像認得你。");
          } else {
            c.narrate("你開了門。走廊空的。只有你自己的呼吸聲。");
          }
          s.time += 2;
        } });
    }
    out.push({ id: "go-lobby", label: "走出房間、下樓到大廳",
      onChoose: (s, c) => {
        if (s.crossedMidnight) {
          s.drift += 2;
          c.narrate("你在半夜離開了房間。走廊的燈一盞盞在你身後熄掉。");
        }
        moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label);
        s.time += 2;
      } });
  }

  else if (at("lobby")) {
    out.push({ id: "look-window", label: "看落地窗外",
      onChoose: (s, c) => { c.narrate("落地窗外是停車場。一台車都沒有。"); s.time += 2; } });
    out.push({ id: "go-room", label: "搭電梯回房",
      onChoose: (s, c) => {
        c.narrate("電梯只到 6 樓。你回到你的樓層。");
        moveTo(c.scene, s, "my-room", LOCATIONS["my-room"].label);
        s.time += 2;
      } });
    if (has(state, "staff-card")) {
      out.push({ id: "go-staff", label: "刷員工證進員工通道",
        onChoose: (s, c) => {
          moveTo(c.scene, s, "staff-corridor", LOCATIONS["staff-corridor"].label);
          s.time += 2;
        } });
    }
  }

  else if (at("staff-corridor")) {
    out.push({ id: "look-wall", label: "看牆上",
      onChoose: (s, c) => {
        c.narrate("牆上貼著一張夜班守則。");
        if (!has(s, "shift-note")) pickUp("shift-note", s, c);
        unlockBook(["rn1", "rn2", "rn3", "rn4", "rn5"], s, c);
        s.time += 2;
      } });
    out.push({ id: "go-lobby", label: "回一樓大廳",
      onChoose: (s, c) => { moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label); s.time += 2; } });
    if (has(state, "shift-note") || has(state, "staff-card")) {
      out.push({ id: "go-monitor", label: "進監控室",
        onChoose: (s, c) => { moveTo(c.scene, s, "monitor-room", LOCATIONS["monitor-room"].label); s.time += 2; } });
    }
  }

  else if (at("monitor-room")) {
    out.push({ id: "look-monitors", label: "看監視器",
      onChoose: (s, c) => {
        c.narrate("十六個畫面。其中一個，是一扇寫著 704 的門。你沒去過那裡。");
        c.narrate("畫面黑了 3 秒。");
        s._blackout = true;
        s.time += 3;
      } });
    if (state._blackout) {
      out.push({ id: "look-back", label: "回頭",
        onChoose: (s, c) => {
          s.drift += 1; s._blackout = false;
          c.narrate("你回過頭。身後的椅子上，剛剛沒有人。現在有。");
          s.time += 1;
        } });
    }
    out.push({ id: "go-staff", label: "回員工通道",
      onChoose: (s, c) => { s._blackout = false; moveTo(c.scene, s, "staff-corridor", LOCATIONS["staff-corridor"].label); s.time += 2; } });
  }

  return out;
}

// 結局
const ENDINGS = [
  // 成為住客 — 門牌被偏移換成 704、你還在房裡、撐過午夜。房間認得你。
  { id: "resident", text: "房間認得你。你也認得房間。",
    when: (s) => s.doorNumber === HIDDEN_NUMBER && s.location === "my-room" && s.crossedMidnight === true },
  // 被櫃台收走 — 身份不符(離開房間 / 員工證過期)撐過午夜。
  { id: "claimed-by-clerk", text: "夜班櫃台員工站在你身後。你不記得是怎麼離開房間的。",
    when: (s) => s.hotelView === "intruder" && s.crossedMidnight === true },
  // 天亮退房(好結局)— 撐到早上,門牌始終 602,你仍是房客、仍在自己房間。
  { id: "checked-out", text: "天亮了。你把房卡放回櫃台，走出旋轉門。門牌始終是 602。",
    when: (s) => s.crossedMidnight === true && s.time >= 6 * 60 && s.time < 12 * 60
              && s.doorNumber === CARD_NUMBER && s.hotelView === "guest" && s.location === "my-room" },
];

export const hotel = {
  id: "hotel",
  title: "深夜飯店",
  blurb: "記住你的房號。房卡上印的才算數。",
  intro: "夜班。",
  openingNarrative: "夜裡十一點。你走進 602 號房，把行李放上床。\n櫃台遞房卡時順手塞了一張紙條：「房客守則，入住前請過目。」",
  initialItems: ["guest-card"],
  initialUnlockedRuleIds: ["rg1", "rg2", "rg3", "rg4", "rg5", "rg6"],
  initialHotelView: "guest",
  initialLocation: "my-room",
  initialTime: 23 * 60,
  initialDoorNumber: CARD_NUMBER,
  rules: RULES,
  rulebooks: RULEBOOKS,
  hotelJudges: HOTEL_JUDGES,
  recomputeDoor,
  actions,
  endings: ENDINGS,
};

export default hotel;
