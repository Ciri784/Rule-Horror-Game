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

// 移動圖 — 依所在地決定能去哪。need/needAny 是通行所需的持有物。
// 這是整個遊戲的移動系統:沒有它、玩家永遠卡在 704,一半的場所與
// 「夜班守則」整本都到不了。離開 704 會讓飯店把旅客視為 intruder
// (見 HOTEL_JUDGES),所以探索本身就是 rule-horror 的風險。
const MOVES = {
  "room-704":       [{ to: "lobby",          label: "走出房間、下樓到大廳" }],
  "lobby":          [{ to: "room-704",       label: "回 704 號房" },
                     { to: "staff-corridor", label: "刷員工證進員工通道", need: "staff-card" }],
  "staff-corridor": [{ to: "lobby",          label: "回一樓大廳" },
                     { to: "monitor-room",   label: "進監控室", needAny: ["shift-note", "staff-card"] }],
  "monitor-room":   [{ to: "staff-corridor", label: "回員工通道" }],
};

// 道具定義 — 玩家撿到就以為自己是什麼
const ITEMS = {
  "guest-card":   { label: "旅客房卡" },
  "staff-card":   { label: "夜班員工證" },
  "room-key-704": { label: "704 號房鑰匙" },
  "staff-manual":  { label: "員工守則",   reveals: ["r4", "r5"] },
  "shift-note":    { label: "夜班守則",   reveals: ["r6"] },
  "floor-4-note":  { label: "4 樓註記",   reveals: ["r7", "r8"] },
};

// 守則 — 8 條固定寫死、applies 動態過濾
// 守則 — 拿到的都並存、不會因身份轉換消失 (rule horror 核心:多身份守則 + 互相矛盾 + 玩家自己記得)
const RULEBOOKS = {
  "旅客守則":    { heldBy: ["guest-card"],  autoFromItem: "guest-card" },
  "員工守則":    { heldBy: ["staff-manual"] },
  "夜班守則":    { heldBy: ["shift-note"] },
  "4 樓註記":    { heldBy: ["floor-4-note"] },
};

const RULES = {
  // 旅客守則 — 持房卡就有
  r1: { subject: "旅客", book: "旅客守則",
        text: "12 點後請勿離開房間。",
        applies: (s) => s.heldItems.includes("guest-card")
                     && s.location === "room-704"
                     && (s.time >= 19 * 60 || s.time < 6 * 60) },
  r2: { subject: "旅客", book: "旅客守則",
        text: "聽到敲門聲請勿回應。",
        applies: (s) => s.heldItems.includes("guest-card")
                     && s.location === "room-704" },
  r3: { subject: "旅客", book: "旅客守則",
        text: "房卡請隨身攜帶。",
        applies: (s) => s.heldItems.includes("guest-card") },
  // 員工守則 — 撿到 staff-manual 解鎖
  r4: { subject: "員工", book: "員工守則",
        text: "5 點前完成 4 樓房間巡邏。",
        applies: (s) => s.heldItems.includes("staff-manual")
                     && s.heldItems.includes("staff-card")
                     && s.location === "staff-corridor" },
  r5: { subject: "員工", book: "員工守則",
        text: "員工證請於 22:00 前繳回。",
        applies: (s) => s.heldItems.includes("staff-manual")
                     && s.heldItems.includes("staff-card")
                     && s.time >= 18 * 60 && s.time < 22 * 60 },
  // 夜班守則 — 撿到 shift-note 解鎖
  r6: { subject: "員工", book: "夜班守則",
        text: "監控室僅限值班員工進入。",
        applies: (s) => s.heldItems.includes("shift-note")
                     && s.location === "monitor-room" },
  // 4 樓註記 — 撿到 floor-4-note 解鎖
  r7: { subject: "4 樓", book: "4 樓註記",
        text: "4 樓不存在。",
        applies: (s) => s.heldItems.includes("floor-4-note") },
  r8: { subject: "4 樓", book: "4 樓註記",
        text: "凌晨 3 點到 4 點請保持清醒。",
        applies: (s) => s.heldItems.includes("floor-4-note")
                     && s.time >= 3 * 60 && s.time < 4 * 60 },
  r18: { subject: "4 樓", book: "4 樓註記",
        text: "4F 的房間號碼是 7XX 開頭。但 X 會換。",
        applies: (s) => s.heldItems.includes("floor-4-note") },
  r19: { subject: "4 樓", book: "4 樓註記",
        text: "凌晨 3 點以後、不要打開房門。",
        applies: (s) => s.heldItems.includes("floor-4-note")
                     && s.time >= 3 * 60 },
  r20: { subject: "4 樓", book: "4 樓註記",
        text: "4F 沒有員工。4F 沒有監控。4F 沒有登記簿。",
        applies: (s) => s.heldItems.includes("floor-4-note") },
  // === 矛盾守則 (rule horror 核心:同一身份守則之間直接打臉、玩家自己挑) ===
  r21: { subject: "旅客", book: "旅客守則",
        text: "12 點前入睡。",
        applies: (s) => s.heldItems.includes("guest-card") && s.time >= 19 * 60 },
  r22: { subject: "旅客", book: "旅客守則",
        text: "聽見走廊有腳步聲、起床觀察。",
        applies: (s) => s.heldItems.includes("guest-card") && s.location === "room-704" },
  r23: { subject: "員工", book: "員工守則",
        text: "巡邏時可以搭電梯。",
        applies: (s) => s.heldItems.includes("staff-manual") && s.heldItems.includes("staff-card") },
  r24: { subject: "員工", book: "員工守則",
        text: "4F 巡邏時不可打開任何房門。",
        applies: (s) => s.heldItems.includes("staff-manual") && s.heldItems.includes("staff-card") && s.location === "staff-corridor" },
  r25: { subject: "員工", book: "夜班守則",
        text: "如果 4F 電梯停了、上去查看。",
        applies: (s) => s.heldItems.includes("shift-note") },
  r26: { subject: "員工", book: "夜班守則",
        text: "監視器黑屏時、不要回頭看。",
        applies: (s) => s.heldItems.includes("shift-note") && s.location === "monitor-room" },
  r27: { subject: "4 樓", book: "4 樓註記",
        text: "4 樓的住客不會離開。",
        applies: (s) => s.heldItems.includes("floor-4-note") },
  r28: { subject: "4 樓", book: "4 樓註記",
        text: "如果有人敲 704 的門、那是 4 樓的人。",
        applies: (s) => s.heldItems.includes("floor-4-note") && s.location === "room-704" },
  // 旅客守則 — 開局解鎖
  r9: { subject: "旅客", book: "旅客守則",
        text: "房間裡的時鐘不一定準。",
        applies: (s) => s.heldItems.includes("guest-card") },
  r10: { subject: "旅客", book: "旅客守則",
        text: "不要試圖從窗戶確認自己在幾樓。",
        applies: (s) => s.heldItems.includes("guest-card") },
  // 員工守則 — 撿到 staff-manual 解鎖
  r11: { subject: "員工", book: "員工守則",
        text: "巡邏時不可搭電梯。",
        applies: (s) => s.heldItems.includes("staff-manual")
                     && s.heldItems.includes("staff-card") },
  r12: { subject: "員工", book: "員工守則",
        text: "4F 巡邏完必須搭 3F 樓梯下來。",
        applies: (s) => s.heldItems.includes("staff-manual")
                     && s.heldItems.includes("staff-card")
                     && s.location === "staff-corridor" },
  r13: { subject: "員工", book: "員工守則",
        text: "遇到旅客時不要直視他的眼睛。",
        applies: (s) => s.heldItems.includes("staff-manual")
                     && s.heldItems.includes("staff-card") },
  // 夜班守則 — 撿到 shift-note 解鎖
  r14: { subject: "員工", book: "夜班守則",
        text: "02:00 必須關閉所有大廳燈。",
        applies: (s) => s.heldItems.includes("shift-note")
                     && s.location === "lobby"
                     && s.time >= 2 * 60 && s.time < 3 * 60 },
  r15: { subject: "員工", book: "夜班守則",
        text: "電梯不會停在 4F。如果停了、報修。",
        applies: (s) => s.heldItems.includes("shift-note") },
  r16: { subject: "員工", book: "夜班守則",
        text: "監視器每隔 15 分鐘會黑屏 3 秒。屬正常現象。",
        applies: (s) => s.heldItems.includes("shift-note")
                     && s.location === "monitor-room" },
  r17: { subject: "員工", book: "夜班守則",
        text: "員工證若在 22:00 後未繳回、飯店會自己來收。",
        applies: (s) => s.heldItems.includes("shift-note")
                     && s.heldItems.includes("staff-card")
                     && s.time >= 22 * 60 },
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
  // 讓 pickUp/moveTo 找得到中文 label、unlockRule 找得到 scene
  ctx.itemLabels = ctx.itemLabels || Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.label]));
  ctx.locationLabels = ctx.locationLabels || Object.fromEntries(Object.entries(LOCATIONS).map(([k, v]) => [k, v.label]));
  ctx.scene = ctx.scene || hotel;
  const out = [];
  out.push({ id: "look-door", label: at("room-704") ? "看房門" : "看最近的門",
             hint: "門外是走廊。",
             onChoose: (s, c) => {
               if (at("room-704")) { c.narrate("門是鎖著的。門縫透著走廊的光。"); s.time += 3; }
               else if (at("staff-corridor")) { c.narrate("員工通道的金屬門、刷員工證才能過。"); s.time += 2; }
               else if (at("monitor-room")) { c.narrate("監控室的門半掩。裡面沒人。"); s.time += 2; }
               else { c.narrate("門緊閉。"); s.time += 2; }
             }});
  out.push({ id: "watch-tv", label: "看電視",
             hint: "電視在播什麼？",
             onChoose: (s, c) => {
               c.narrate("電視只剩雪花。偶爾跳出一幀模糊的走廊畫面。");
               s.time += 5;
               if (!s.unlockedRuleIds.includes("r2")) unlockRule("r2", s, ctx);
               if (!s.unlockedRuleIds.includes("r3")) unlockRule("r3", s, ctx);
             }});
  out.push({ id: "look-pillow", label: "翻枕頭下",
             hint: "枕頭下面藏了什麼？",
             onChoose: (s, c) => {
               if (!s.heldItems.includes("staff-card")) {
                 pickUp("staff-card", s, c);
                 c.narrate("枕頭旁邊還壓著一本員工守則。");
                 if (!s.heldItems.includes("staff-manual")) pickUp("staff-manual", s, c);
               } else if (!s.heldItems.includes("staff-manual")) {
                 c.narrate("枕頭旁邊還壓著一本員工守則。");
                 pickUp("staff-manual", s, c);
               } else { c.narrate("枕頭下什麼都沒有。"); }
               // 撿到員工守則 = 員工守則解鎖 (r4, r5, r11, r12, r13)
               if (s.heldItems.includes("staff-manual")) {
                 ["r4", "r5", "r11", "r12", "r13", "r23", "r24"].forEach((id) => {
                   if (!s.unlockedRuleIds.includes(id)) unlockRule(id, s, c);
                 });
               }
               s.time += 2;
             }});
  out.push({ id: "look-nightstand", label: "翻床頭櫃",
             hint: "抽屜裡有什麼？",
             onChoose: (s, c) => {
               if (!s.heldItems.includes("room-key-704")) {
                 pickUp("room-key-704", s, c);
                 c.narrate("抽屜底層壓著一張泛黃的 4 樓註記。");
                 if (!s.heldItems.includes("floor-4-note")) pickUp("floor-4-note", s, c);
               } else if (!s.heldItems.includes("floor-4-note")) {
                 c.narrate("抽屜底層壓著一張泛黃的 4 樓註記。");
                 pickUp("floor-4-note", s, c);
               } else { c.narrate("抽屜空空的。"); }
               // 撿到 4 樓註記 = 4 樓註記守則單解鎖 (r7, r8, r18, r19, r20)
               if (s.heldItems.includes("floor-4-note")) {
                 ["r7", "r8", "r18", "r19", "r20", "r27", "r28"].forEach((id) => {
                   if (!s.unlockedRuleIds.includes(id)) unlockRule(id, s, c);
                 });
               }
               s.time += 2;
             }});
  out.push({ id: "look-window", label: "看窗外",
             hint: "4 樓窗外是什麼？",
             onChoose: (s, c) => {
               if (at("room-704")) {
                 c.narrate("窗外是停車場。但你沒看過 4 樓以下的窗。");
                 if (!s.unlockedRuleIds.includes("r7")) unlockRule("r7", s, ctx);
                 if (!s.unlockedRuleIds.includes("r8")) unlockRule("r8", s, ctx);
               } else if (at("lobby")) {
                 c.narrate("落地窗外是停車場。一台車都沒有。");
               } else { c.narrate("窗外的城市不認識。"); }
               s.time += 3;
             }});
  out.push({ id: "look-wall", label: "看牆壁",
             hint: "牆上寫了什麼？",
             onChoose: (s, c) => {
               if (at("room-704")) {
                 c.narrate("牆角有抓痕。新鮮的。牆上貼著飯店的旅客守則。");
                 if (!s.unlockedRuleIds.includes("r1")) unlockRule("r1", s, ctx);
               } else if (at("staff-corridor")) {
                 c.narrate("牆上貼著一張夜班守則。");
                 if (!s.heldItems.includes("shift-note")) pickUp("shift-note", s, c);
                 // 撿到夜班守則 = 「夜班守則」整本解鎖 (r6, r14–r17, r25, r26)。
                 // 舊版只在第二次看牆才解鎖 r6、其餘永遠鎖著,整本內容是死的。
                 ["r6", "r14", "r15", "r16", "r17", "r25", "r26"].forEach((id) => {
                   if (!s.unlockedRuleIds.includes(id)) unlockRule(id, s, c);
                 });
               } else { c.narrate("牆上沒有任何東西。"); }
               s.time += 2;
             }});

  // 移動動作 — 依所在地與持有物品開放。moveTo 會敘事並重算 hotelView。
  for (const mv of (MOVES[state.location] || [])) {
    if (mv.need && !state.heldItems.includes(mv.need)) continue;
    if (mv.needAny && !mv.needAny.some((it) => state.heldItems.includes(it))) continue;
    out.push({ id: "go-" + mv.to, label: mv.label,
               onChoose: (s, c) => {
                 moveTo(c.scene, s, mv.to, LOCATIONS[mv.to].label);
                 s.time += 2;
               }});
  }
  return out;
}

// Ending 定義
const ENDINGS = [
  // claimed-by-clerk — 身份不符 (intruder) 被夜班櫃台收走。
  // 關鍵修正:舊版門檻是 time >= 23:00,但遊戲「就是 23:00 開場」,等於
  // 一撿到員工證變成 intruder 的同一個 click 就結束 (開場即死)。
  // 改成 crossedMidnight:午夜前 intruder 只是警訊、有一段緩衝可以趕回
  // 704 恢復旅客身份;撐不過午夜還是 intruder 才會被收走。緩衝窗口讓
  // 「探索」變得可玩,也是 rule-horror 該有的倒數壓力。
  { id: "claimed-by-clerk", text: "夜班櫃台員工站在你身後。你不記得是怎麼離開房間的。",
    when: (s) => s.hotelView === "intruder" && s.crossedMidnight === true },
  // room-consumed — 乖乖待在 704 卻讀了 4 樓註記的好奇旅客,天亮前被房間吞掉。
  // 修正:舊版要求 view 為 intruder/unknown,但凌晨還活著待在 704 的人
  // 必然是 guest (持房卡在 704),於是這個結局永遠觸發不到。改成放行
  // guest,讓「安靜的旅客」路線真的有結局。
  { id: "room-consumed", text: "房間認得你。你也認得房間。",
    when: (s) => s.heldItems.includes("room-key-704")
              && s.time >= 4 * 60 + 30 && s.time < 5 * 60
              && s.location === "room-704"
              && ["guest", "intruder", "unknown"].includes(s.hotelView)
              && s.heldItems.includes("floor-4-note")
              && s.narrative.some((n) => n.text && n.text.includes("4 樓")) },
];

export const hotel = {
  id: "hotel",
  title: "深夜飯店",
  blurb: "持證件、住房間、守規則。",
  intro: "夜班。",
  openingNarrative: "夜裡十一點。你走進 704 號房、把行李放上床。\n櫃台遞房卡時順手塞了一張紙條：「旅客守則，入住前請過目。」",
  initialItems: ["guest-card"],
  initialUnlockedRuleIds: ["r1", "r2", "r3", "r9", "r10", "r21", "r22"],
  initialHotelView: "guest",
  initialLocation: "room-704",
  initialTime: 23 * 60,  // 夜裡十一點 — 跟 openingNarrative 對齊
  rules: RULES,
  rulebooks: RULEBOOKS,
  hotelJudges: HOTEL_JUDGES,
  actions,
  endings: ENDINGS,
};

export default hotel;
