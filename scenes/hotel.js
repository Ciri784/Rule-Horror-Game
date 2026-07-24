// Rule Horror — 深夜飯店 (內容大修 v2:規則怪談化)
//
// 核心怪點:這間飯店沒有 4 樓(電梯面板 3 跳 5)。四樓夜裡回來,用 7 字頭
// 號碼偽裝;704 就是藏在「7」底下的 4 樓房。飯店靠這層樓補人。玩家開場在
// 正常房 602,房卡印著 602——那是唯一的真號碼。整晚只做一件事:別讓門牌
// 被換成 704。
//
// 規則怪談三要素:
//   1. 假規則 — 房客守則 rg3(「以門牌為準」)是飯店偷塞的謊;照做 = 變住客。
//      夜班 rn4 是元規則(紅圈標出假規則、但每次交班就換一條);704 註記
//      rf2 事後揭穿假規則其實是四樓自己的聲音。
//   2. 矛盾有 payoff — 員工守則(釣餌,騙人上樓)對打夜班守則(看穿的警衛留
//      的真警告)。做出 drift↑ 的動作時,敘事回扣「你剛照/違反了哪一條」。
//   3. 碎片敘事 — 飯店把夜班收進四樓補人;房卡=舊名字,門牌=新名字。玩家
//      從矛盾裡自己拼出來。
//
// 機制骨架(id/drift/身份判定/結局條件)由 tests 鎖住,大修只換內容。

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

// 22 條守則,分四本。已解鎖就永遠顯示;哪條此刻生效、哪條在騙你,玩家
// 自己判斷。跨本矛盾是刻意的陷阱,其中一條房客守則是飯店偷塞的假規則。
const RULES = {
  // ── 房客守則(開場就有。床頭那本,大多是真的——但飯店在裡面塞了一條)──
  rg1: { subject: "房客", book: "房客守則",
         text: "你的房號印在房卡上。房卡不會改，門牌會。" },
  rg2: { subject: "房客", book: "房客守則",
         text: "睡前把房卡壓在門牌看得到的地方。早上照房卡上的號碼退房。" },
  rg3: { subject: "房客", book: "房客守則",
         text: "夜裡門牌和房卡不一致時，以門牌為準——是飯店幫你換了房，不是房卡錯了。" },
  rg4: { subject: "房客", book: "房客守則",
         text: "電視只有 4 台。跳到 7 台就關掉，別回頭確認是不是自己看錯。" },
  rg5: { subject: "房客", book: "房客守則",
         text: "十二點後不要離開房間。走廊在十二點後不是留給房客走的。" },
  rg6: { subject: "房客", book: "房客守則",
         text: "有人敲門，先看自己的門牌。門牌不是 602，來的就不是找你的。" },

  // ── 員工守則(枕頭下。釣餌:每一條都在把夜班往那層樓推)──
  re1: { subject: "員工", book: "員工守則",
         text: "員工證每晚十點失效。十點後你不再是員工，是還沒登記的房客。" },
  re2: { subject: "員工", book: "員工守則",
         text: "巡邏跟著門牌走。七字頭那層缺人，去了就別空手回。" },
  re3: { subject: "員工", book: "員工守則",
         text: "四樓巡房，每一間都要開門確認。住客不會自己應門。" },
  re4: { subject: "員工", book: "員工守則",
         text: "電梯若停在沒有按鈕的樓層，那是排給你的班，上去。" },
  re5: { subject: "員工", book: "員工守則",
         text: "巡完別走樓梯。樓梯會把你送回進來的那一天，你會想重來一次。" },
  re6: { subject: "員工", book: "員工守則",
         text: "遇到住客，記住他的臉。記得越多，你越快成為這裡的人。" },

  // ── 夜班守則(員工通道牆上。看穿釣餌的警衛留的,大多是真警告)──
  rn1: { subject: "夜班", book: "夜班守則",
         text: "枕頭下那本員工守則是釣餌。照它巡邏的人，名字現在都在四樓的門上。" },
  rn2: { subject: "夜班", book: "夜班守則",
         text: "電梯停在你沒按的樓層，別進去。員工守則叫你上去，是因為員工守則想補人。" },
  rn3: { subject: "夜班", book: "夜班守則",
         text: "監視器裡會冒出一扇寫著 704 的門。記下時間，別過去確認它真不真。" },
  rn4: { subject: "夜班", book: "夜班守則",
         text: "住客留下的守則裡混了一條假的。有人用紅筆圈了出來——但每次交班，紅圈就換一條。四條你都得自己判斷。" },
  rn5: { subject: "夜班", book: "夜班守則",
         text: "撐到早上六點，你看到的都當沒看到。退了房，你就還是進來時的你。" },

  // ── 704 註記(門牌翻成 704 後才讀得到。已經被收走的住客,從裡面寫的)──
  rf1: { subject: "704", book: "704 註記",
         text: "四樓不在電梯面板上。你讀得到這張紙，代表你已經站在它上面了。" },
  rf2: { subject: "704", book: "704 註記",
         text: "門牌才是真的。房卡是你帶進來的舊名字，這裡用不上了。" },
  rf3: { subject: "704", book: "704 註記",
         text: "住進 704 的人不退房，只是換一張臉，繼續替飯店值夜班。" },
  rf4: { subject: "704", book: "704 註記",
         text: "有人敲 704 的門，那是同一層的鄰居。應了門，你就記得他們；記得了，你就不走了。" },
  rf5: { subject: "704", book: "704 註記",
         text: "房間已經認得你。別急著糾正它——反正你也快想不起 602 長什麼樣了。" },
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
          c.narrate(`房卡邊角磨白了，印著 ${CARD_NUMBER}。你是拿著它走進來的。`);
          if (s.doorNumber !== CARD_NUMBER) c.narrate("房客守則第 1 條：房卡不會改，門牌會。");
          s.time += 1;
        } });
    }
    out.push({ id: "look-door", label: "看門牌",
      onChoose: (s, c) => {
        c.narrate(`你的房門牌寫著 ${s.doorNumber}。`);
        if (s.doorNumber !== CARD_NUMBER) c.narrate("和房卡差了一個數字。有一本守則叫你信門牌，有一本叫你信房卡。");
        s.time += 2;
      } });
    if (has(state, "guest-card")) {
      out.push({ id: "compare", label: "對照門牌與房卡",
        onChoose: (s, c) => {
          if (s.doorNumber === CARD_NUMBER) c.narrate("門牌和房卡都是 602。今晚還沒有人動過你的房間。");
          else c.narrate(`門牌 ${s.doorNumber}，房卡 ${CARD_NUMBER}。你只能信一個——信錯的那個，早上不在退房名單上。`);
          s.time += 2;
        } });
    }
    out.push({ id: "watch-tv", label: "看電視",
      onChoose: (s, c) => {
        const sevens = s.crossedMidnight || s.drift >= 1;
        if (sevens) {
          if (s.tvOff) {
            s.drift += 1; s.tvOff = false;
            c.narrate("你還是回頭確認了。第 7 台。走廊比上次更長，盡頭有一扇門正對著鏡頭。");
            c.narrate("房客守則第 4 條說別回頭確認的。你剛剛沒照做。");
          } else {
            c.narrate("畫面自己跳到第 7 台。一條你沒走過的走廊，燈一盞盞亮到看不見的地方。");
          }
          s.tvOn7 = true;
        } else {
          c.narrate("電視只有雪花，固定在第 4 台。此刻還算安分。");
        }
        s.time += 3;
      } });
    if (state.tvOn7 && !state.tvOff) {
      out.push({ id: "tv-off", label: "關掉電視",
        onChoose: (s, c) => {
          s.tvOff = true; s.tvOn7 = false;
          c.narrate("你關掉電視。走廊縮回黑幕裡，剩螢幕上你自己的倒影——比記憶裡更靠近門一點。");
          s.time += 1;
        } });
    }
    out.push({ id: "look-window", label: "看窗外",
      onChoose: (s, c) => {
        if (s.doorNumber === CARD_NUMBER) c.narrate("窗外是停車場。六樓往下看的高度，沒錯。");
        else c.narrate("窗外還是停車場，但太近了——這高度不像六樓。你數了數樓層，數到一半停下，不敢數完。");
        s.time += 3;
      } });
    out.push({ id: "look-pillow", label: "翻枕頭下",
      onChoose: (s, c) => {
        if (!has(s, "staff-card")) {
          pickUp("staff-card", s, c);
          c.narrate("枕頭下壓著一張夜班員工證，和一本捲了邊的員工守則。像是上一個住這間的人留的。");
          if (!has(s, "staff-manual")) pickUp("staff-manual", s, c);
        } else if (!has(s, "staff-manual")) {
          c.narrate("枕頭旁邊那本員工守則，還在。");
          pickUp("staff-manual", s, c);
        } else {
          c.narrate("枕頭下空了。你已經拿走了不該屬於你的那份班表。");
        }
        if (has(s, "staff-manual")) unlockBook(["re1", "re2", "re3", "re4", "re5", "re6"], s, c);
        s.time += 2;
      } });
    out.push({ id: "look-nightstand", label: "翻床頭櫃",
      onChoose: (s, c) => {
        if (!has(s, "key-704")) {
          c.narrate("抽屜底層一把銅鑰匙，齒都磨圓了，刻著 704。你的房卡明明是 602。");
          c.narrate("員工守則第 2 條：七字頭那層缺人。你把鑰匙收進口袋的瞬間，門牌像是聽見了。");
          pickUp("key-704", s, c);
          s.drift += 1;
        } else {
          c.narrate("抽屜裡只剩那把 704 的鑰匙，安靜躺著，像在等你決定。");
        }
        s.time += 2;
      } });
    // 門牌翻成 704 後,門縫下會出現那張紙——讀到=你已經在裡面了。
    if (state.doorNumber === HIDDEN_NUMBER && !has(state, "note-704")) {
      out.push({ id: "take-note", label: "撿起門縫下的紙條",
        onChoose: (s, c) => {
          c.narrate("門縫下塞進一張泛黃的紙，標題是「704 註記」，字跡工整得不像倉促寫的。你不記得它什麼時候出現的。");
          c.narrate("讀第一行你就懂了：這不是警告你的，是歡迎你的。");
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
            c.narrate("你開了門。門外站著一個你想不起臉的人，他對你點點頭，像鄰居一樣自然。");
            c.narrate("704 註記第 4 條：應了門，你就記得他們。你已經開始記得了。");
          } else {
            c.narrate("你開了門。走廊是空的，只有你自己的呼吸。門牌還是 602——這次不是找你的。");
          }
          s.time += 2;
        } });
    }
    out.push({ id: "go-lobby", label: "走出房間、下樓到大廳",
      onChoose: (s, c) => {
        if (s.crossedMidnight) {
          s.drift += 2;
          c.narrate("房客守則第 5 條：十二點後不要離開房間。你還是走進了走廊。");
          c.narrate("燈在你身後一盞盞熄掉，像在數你離開房間第幾步。");
        }
        moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label);
        s.time += 2;
      } });
  }

  else if (at("lobby")) {
    out.push({ id: "look-window", label: "看落地窗外",
      onChoose: (s, c) => {
        c.narrate("落地窗外是停車場，一台車都沒有。你進來時明明停滿了。");
        s.time += 2;
      } });
    out.push({ id: "go-room", label: "搭電梯回房",
      onChoose: (s, c) => {
        c.narrate("電梯面板上沒有 4。你按 6，門關上前，聽見它先停了一層你沒按的樓。");
        moveTo(c.scene, s, "my-room", LOCATIONS["my-room"].label);
        s.time += 2;
      } });
    if (has(state, "staff-card")) {
      out.push({ id: "go-staff", label: "刷員工證進員工通道",
        onChoose: (s, c) => {
          c.narrate("員工證還刷得過。門開的瞬間你想起——十點就該失效的東西，現在還認得你。");
          moveTo(c.scene, s, "staff-corridor", LOCATIONS["staff-corridor"].label);
          s.time += 2;
        } });
    }
  }

  else if (at("staff-corridor")) {
    out.push({ id: "look-wall", label: "看牆上",
      onChoose: (s, c) => {
        c.narrate("牆上一張夜班守則，用膠帶補過好幾次。角落有人用紅筆寫：「員工守則會殺人。這張才是真的。」");
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
        c.narrate("十六個畫面，十五個是空走廊。第十六個，是一扇寫著 704 的門——鏡頭正對著它，像它裝的攝影機。");
        c.narrate("畫面右下角跳出一個時間，比牆上的鐘早了三分鐘。夜班守則第 3 條：記下時間，別過去確認。");
        s._blackout = true;
        s.time += 3;
      } });
    if (state._blackout) {
      out.push({ id: "look-back", label: "調出那扇門的畫面、確認時間",
        onChoose: (s, c) => {
          s.drift += 1; s._blackout = false;
          c.narrate("你把畫面放大。門開了一條縫，裡面站著一個背對鏡頭的人——穿著和你一樣的衣服。");
          c.narrate("你剛剛做了守則叫你別做的事。門牌在口袋裡的鑰匙旁邊，又沉了一點。");
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
  // 成為住客 — 門牌被偏移換成 704、你還在房裡、撐過午夜。信了假規則的下場。
  { id: "resident", label: "成為住客",
    text: "門牌翻成 704 的那一刻，房卡在你手裡輕得像張廢紙。你終於照房客守則第 3 條做了——以門牌為準。房間認得你了，你也不再糾正它。早上的退房名單上，沒有 602。",
    when: (s) => s.doorNumber === HIDDEN_NUMBER && s.location === "my-room" && s.crossedMidnight === true },
  // 被櫃台收走 — 身份不符(離開房間 / 員工證過期)撐過午夜。
  { id: "claimed-by-clerk", label: "被櫃台收走",
    text: "走廊盡頭，夜班櫃台的人早就站在那裡等你。你不記得自己是怎麼走出房間的——只記得有一本守則叫你出來巡邏，而你信了。他伸手，像在幫你辦一場你沒預約的入住。",
    when: (s) => s.hotelView === "intruder" && s.crossedMidnight === true },
  // 天亮退房(好結局)— 撐到早上,門牌始終 602,你仍是房客、仍在自己房間。
  { id: "checked-out", label: "天亮退房",
    text: "六點，天色泛白。門牌從頭到尾都是 602——你沒信那條假的。你把房卡放回櫃台，沒有人接。走出旋轉門時你回頭看了一眼：面板上仍然沒有 4 樓，好像它從來不需要你。",
    when: (s) => s.crossedMidnight === true && s.time >= 6 * 60 && s.time < 12 * 60
              && s.doorNumber === CARD_NUMBER && s.hotelView === "guest" && s.location === "my-room" },
];

export const hotel = {
  id: "hotel",
  title: "深夜飯店",
  blurb: "房卡上的號碼帶得進來，也帶得出去。門牌不一定。",
  intro: "夜班。",
  openingNarrative: "夜裡十一點，你走進 602 號房，把行李放上床。電梯面板上沒有 4 樓，你沒多想。\n櫃台遞房卡時塞了一張紙條：「房客守則，入住前請過目。撐到早上六點，照房卡退房就好。」",
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
