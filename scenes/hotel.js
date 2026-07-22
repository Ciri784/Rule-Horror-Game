// Rule Horror — 飯店場景 (Stage B)
// 6 個探索地點純按鈕、4 個場所、4 個道具、8 條守則、4 種 ending。
// 守則透過探索解鎖、applies 動態過濾生效；飯店(詭異方)有自己判斷準則。

import {
  pickUp, moveTo, unlockRule, narrate, formatTime,
} from "../engine.js";

// 場所定義
const LOCATIONS = {
  "room-704":       { label: "704 號房" },
  "lobby":          { label: "一樓大廳" },
  "staff-corridor": { label: "員工通道" },
  "monitor-room":   { label: "監控室" },
};

// 道具定義 — 玩家撿到就以為自己是什麼
const ITEMS = {
  "guest-card":   { label: "旅客房卡" },
  "staff-card":   { label: "夜班員工證" },
  "room-key-704": { label: "704 號房鑰匙" },
  "master-key":   { label: "萬能鑰匙" },
};

// 守則 — 8 條固定寫死、applies 動態過濾
const RULES = {
  r1: { subject: "旅客", text: "12 點後請勿離開房間。",
        applies: (s) => s.heldItems.includes("guest-card") && s.location === "room-704" },
  r2: { subject: "旅客", text: "聽到敲門聲請勿回應。",
        applies: (s) => s.location === "room-704" },
  r3: { subject: "旅客", text: "房卡請隨身攜帶。",
        applies: (s) => s.heldItems.includes("guest-card") },
  r4: { subject: "員工", text: "5 點前完成 4 樓房間巡邏。",
        applies: (s) => s.heldItems.includes("staff-card") && s.hotelView === "staff" && s.location === "staff-corridor" },
  r5: { subject: "員工", text: "員工證請於 22:00 前繳回。",
        applies: (s) => s.heldItems.includes("staff-card") && s.time >= 22 * 60 },
  r6: { subject: "員工", text: "監控室僅限值班員工進入。",
        applies: (s) => s.location === "monitor-room" },
  r7: { subject: "4 樓", text: "4 樓不存在。",
        applies: (s) => s.heldItems.includes("room-key-704") },
  r8: { subject: "4 樓", text: "凌晨 3 點到 4 點請保持清醒。",
        applies: (s) => s.location === "room-704" && s.time >= 3 * 60 && s.time < 4 * 60 },
};

// 飯店判斷準則 — 按順序評估、第一個 when 通過的 view 勝出
const HOTEL_JUDGES = [
  { when: (s) => s.heldItems.includes("staff-card") && s.time >= 18 * 60 && s.time < 22 * 60, view: "staff" },
  { when: (s) => s.heldItems.includes("staff-card") && s.time >= 22 * 60, view: "intruder" },
  { when: (s) => s.heldItems.includes("staff-card"), view: "intruder" },
  { when: (s) => s.heldItems.includes("guest-card") && s.location === "room-704", view: "guest" },
  { when: (s) => s.heldItems.includes("guest-card"), view: "intruder" },
];

// 探索動作 — 6 個地點純按鈕
function actions(state, ctx) {
  const at = (id) => state.location === id;
  const out = [];
  out.push({ id: "look-door", label: at("room-704") ? "看房門" : "看最近的門",
             hint: "門外是走廊。",
             onChoose: (s, c) => {
               if (at("room-704")) { c.narrate("門是鎖著的。門縫透著走廊的光。"); s.time += 3; }
               else { c.narrate("門緊閉。"); s.time += 2; }
             }});
  out.push({ id: "watch-tv", label: "看電視",
             hint: "電視在播什麼？",
             onChoose: (s, c) => {
               c.narrate("電視只剩雪花。偶爾跳出一幀模糊的走廊畫面。");
               s.time += 5;
               if (!s.unlockedRuleIds.includes("r2")) unlockRule("r2", s, ctx);
             }});
  out.push({ id: "look-pillow", label: "翻枕頭下",
             hint: "枕頭下面藏了什麼？",
             onChoose: (s, c) => {
               if (!s.heldItems.includes("staff-card")) {
                 pickUp("staff-card", s, c, "夜班員工證");
                 if (!s.unlockedRuleIds.includes("r5")) unlockRule("r5", s, ctx);
               } else { c.narrate("枕頭下什麼都沒有。"); }
               s.time += 2;
             }});
  out.push({ id: "look-nightstand", label: "翻床頭櫃",
             hint: "抽屜裡有什麼？",
             onChoose: (s, c) => {
               if (!s.heldItems.includes("room-key-704")) {
                 pickUp("room-key-704", s, c, "704 號房鑰匙");
                 if (!s.unlockedRuleIds.includes("r7")) unlockRule("r7", s, ctx);
               } else { c.narrate("抽屜空空的。"); }
               s.time += 2;
             }});
  out.push({ id: "look-window", label: "看窗外",
             hint: "4 樓窗外是什麼？",
             onChoose: (s, c) => {
               if (at("room-704")) {
                 c.narrate("窗外是停車場。但你沒看過 4 樓以下的窗。");
                 if (!s.unlockedRuleIds.includes("r7")) unlockRule("r7", s, ctx);
               } else { c.narrate("窗外的城市不認識。"); }
               s.time += 3;
             }});
  out.push({ id: "look-wall", label: "看牆壁",
             hint: "牆上寫了什麼？",
             onChoose: (s, c) => {
               if (at("room-704")) { c.narrate("牆角有抓痕。新鮮的。"); }
               else { c.narrate("牆上沒有任何東西。"); }
               s.time += 2;
             }});
  return out;
}

// Ending 定義
const ENDINGS = [
  { id: "checkout-passed", text: "你撐到了早上 6 點。飯店把你當成旅客，準時退房。",
    when: (s) => s.time >= 6 * 60 && s.hotelView === "guest" },
  { id: "claimed-by-clerk", text: "夜班櫃台員工站在你身後。你不記得是怎麼離開房間的。",
    when: (s) => s.hotelView === "intruder" && s.time >= 22 * 60 },
  { id: "room-consumed", text: "房間認得你。你也認得房間。",
    when: (s) => s.heldItems.includes("room-key-704") && s.time >= 3 * 60 && s.location === "room-704" && s.hotelView !== "guest" },
];

export const hotel = {
  id: "hotel",
  title: "深夜飯店",
  blurb: "持證件、住房間、守規則。",
  intro: "夜班。",
  openingNarrative: "你站在 704 號房門口。",
  initialItems: ["guest-card"],
  initialHotelView: "unknown",
  initialLocation: "room-704",
  rules: RULES,
  hotelJudges: HOTEL_JUDGES,
  actions,
  endings: ENDINGS,
};

export default hotel;
