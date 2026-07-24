// Rule Horror — 深夜飯店
//
// 這間飯店電梯面板跳過 4 樓。你的房卡印著 602，那是帶得進來的號碼。
// 門牌是房間自己認的——它隨時可能不認你的房卡。
//
// 玩家拿到 4 本守則，沒有一本會告訴你「信我」或「別信我」；
// 哪一條把你往 704 推，你得自己做。

import { pickUp, moveTo, unlockRule } from "../engine.js";

const CARD_NUMBER = "602";   // 房卡上的號碼
const HIDDEN_NUMBER = "704"; // 房間自己翻出來的號碼
const DRIFT_FLIP = 3;        // 偏移累積到這裡，門牌翻

const LOCATIONS = {
  "my-room":        { label: "你的房間" },
  "lobby":          { label: "一樓大廳" },
  "staff-corridor": { label: "員工通道" },
  "monitor-room":   { label: "監控室" },
};

const ITEMS = {
  "guest-card":   { label: "房卡" },
  "key-704":      { label: "鑰匙" },
  "staff-card":   { label: "員工證" },
  "staff-manual": { label: "員工守則" },
  "shift-note":   { label: "夜班守則" },
  "note-704":     { label: "門縫下的紙" },
};

const RULEBOOKS = {
  "房客守則":  { heldBy: ["guest-card"], autoFromItem: "guest-card" },
  "員工守則":  { heldBy: ["staff-manual"] },
  "夜班守則":  { heldBy: ["shift-note"] },
  "704 註記":  { heldBy: ["note-704"] },
};

const has = (s, it) => s.heldItems.includes(it);

// ── 房客守則 ──
// 床頭那本。看起來都很正常。其中一條是飯店想讓你做的——但不會標出來。
const RULES = {
  rg1: { subject: "房客", book: "房客守則",
         text: "房卡上的號碼就是你這間的房號。退房時憑房卡。" },
  rg2: { subject: "房客", book: "房客守則",
         text: "睡覺時把房卡放在枕頭旁邊，出門也帶著。" },
  rg3: { subject: "房客", book: "房客守則",
         text: "夜裡有人敲門，先看自己的門牌再開。門牌才是房間現在認的。" },
  rg4: { subject: "房客", book: "房客守則",
         text: "十二點以後不要開電視。電視看完記得關，別再按開。" },
  rg5: { subject: "房客", book: "房客守則",
         text: "房間裡的東西跟進來時不一樣，閉眼數到十再睜開。別急著問櫃台。" },
  rg6: { subject: "房客", book: "房客守則",
         text: "早上六點聽到鈴聲就收拾行李。鈴響第二次之前到櫃台。" },

  // ── 員工守則 ──
  // 枕頭下。字面上都很正常，合在一起看會把夜班的人一步步送上某個樓層。
  re1: { subject: "員工", book: "員工守則",
         text: "員工證是夜班唯一的工作識別，請隨身攜帶。" },
  re2: { subject: "員工", book: "員工守則",
         text: "巡房路線以電梯面板為準，缺人的樓層優先。" },
  re3: { subject: "員工", book: "員工守則",
         text: "住客反映房間有異狀，親自上樓查看，不要請住客自己下來。" },
  re4: { subject: "員工", book: "員工守則",
         text: "監控畫面出現面板上沒有的樓層，記下房號通報櫃台。" },
  re5: { subject: "員工", book: "員工守則",
         text: "夜班結束前填寫交班簿，把當晚巡過的房號都寫上。" },
  re6: { subject: "員工", book: "員工守則",
         text: "看到跟自己穿一樣制服的同事，主動打個招呼。" },

  // ── 夜班守則 ──
  // 員工通道牆上，被膠帶補過很多次。寫得比較直，語氣像留給下個夜班的人。
  rn1: { subject: "夜班", book: "夜班守則",
         text: "員工守則是飯店印的。別照著做。" },
  rn2: { subject: "夜班", book: "夜班守則",
         text: "七字頭的房間不要進，不要敲，不要應。" },
  rn3: { subject: "夜班", book: "夜班守則",
         text: "監視器的時間不重要，重要的是那幾台你還沒看的。" },
  rn4: { subject: "夜班", book: "夜班守則",
         text: "有人跟你說 704 是某一層，那個人今晚就要去那一層。" },
  rn5: { subject: "夜班", book: "夜班守則",
         text: "早上六點下班。下了班，今晚的房號跟你沒關係。" },

  // ── 704 註記 ──
  // 門牌翻成 704 之後才塞進門縫。字跡不太一樣，有的是工整，有的是慌張，
  // 像是不同人寫在不同晚上。讀起來不像說明書，比較像牆上被人刻過的字。
  rf1: { subject: "704", book: "704 註記",
         text: "你還在數樓梯。" },
  rf2: { subject: "704", book: "704 註記",
         text: "房卡還在口袋裡嗎。不用找了。" },
  rf3: { subject: "704", book: "704 註記",
         text: "隔壁昨晚跟你打過招呼。你不記得他。" },
  rf4: { subject: "704", book: "704 註記",
         text: "六點會響一次鈴。鈴響之前，房間還不認你。" },
  rf5: { subject: "704", book: "704 註記",
         text: "鑰匙不用還。下個住客會找到的。" },
};

const JUDGES = [
  { when: (s) => has(s, "staff-card") && s.time >= 18 * 60 && s.time < 22 * 60, identity: "staff" },
  { when: (s) => has(s, "staff-card"), identity: "intruder" },
  { when: (s) => has(s, "guest-card") && s.location === "my-room", identity: "guest" },
  { when: (s) => has(s, "guest-card"), identity: "intruder" },
];

function derive(s) {
  if (s.drift >= DRIFT_FLIP) s.doorNumber = HIDDEN_NUMBER;
  else if (s.doorNumber == null) s.doorNumber = CARD_NUMBER;
}

function unlockBook(ids, s, c) {
  ids.forEach((id) => { if (!s.unlockedRuleIds.includes(id)) unlockRule(id, s, c); });
}

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
          c.narrate(`房卡邊角磨白了，印著 ${CARD_NUMBER}。你走進這間房時櫃台遞給你的，還溫的。`);
          if (s.doorNumber !== CARD_NUMBER) {
            c.narrate("你又翻過來看了房卡一次。房卡沒變過。");
          }
          s.time += 1;
        } });
    }
    out.push({ id: "look-door", label: "看門牌",
      onChoose: (s, c) => {
        c.narrate(`門牌上寫著 ${s.doorNumber}。白底黑字，跟飯店其他房間一樣。`);
        if (s.doorNumber !== CARD_NUMBER) {
          c.narrate("你站在那裡又看了一下。房卡和門牌是兩個號碼。");
        }
        s.time += 2;
      } });
    if (has(state, "guest-card")) {
      out.push({ id: "compare", label: "對照門牌跟房卡",
        onChoose: (s, c) => {
          if (s.doorNumber === CARD_NUMBER) {
            c.narrate("房卡跟門牌都是 602，字對得很整齊。");
          } else {
            c.narrate(`房卡 ${CARD_NUMBER}，門牌 ${s.doorNumber}。兩張都沒印錯。`);
            c.narrate("今晚只能信一個。");
          }
          s.time += 2;
        } });
    }
    out.push({ id: "watch-tv", label: "看電視",
      onChoose: (s, c) => {
        const sevens = s.crossedMidnight || s.drift >= 1;
        if (sevens) {
          if (s.tvOff) {
            s.drift += 1; s.tvOff = false;
            c.narrate("電視自己跳回去了。畫面是一條你沒走過的走廊，燈一盞一盞亮著，鏡頭正對著盡頭一扇門。");
            c.narrate("你盯著看了三秒。螢幕上那扇門沒有倒影。");
          } else {
            c.narrate("你又打開電視。畫面一樣是那條走廊，門的倒影這次比較長。");
          }
          s.tvOn7 = true;
        } else {
          c.narrate("電視是雪花，只有第 4 台有聲音，半夜新聞重播。");
        }
        s.time += 3;
      } });
    if (state.tvOn7 && !state.tvOff) {
      out.push({ id: "tv-off", label: "關電視",
        onChoose: (s, c) => {
          s.tvOff = true; s.tvOn7 = false;
          c.narrate("你按掉電視。房間暗下來，只剩門牌上 704 的綠光在牆上晃了一下。");
          c.narrate("等等。");
          c.narrate("你回頭看門牌。");
          c.narrate("還是 602。剛才沒看錯。");
          s.time += 1;
        } });
    }
    out.push({ id: "look-window", label: "看窗外",
      onChoose: (s, c) => {
        if (s.doorNumber === CARD_NUMBER) {
          c.narrate("窗外是停車場，六樓往下看的高度。你記得進來時停車場滿的，現在一台車都沒有。");
        } else {
          c.narrate("窗外還是停車場，但太近了——這個高度不像六樓，也不像七樓。");
          c.narrate("你數樓層，數到一半，窗戶上的灰塵開始動。");
        }
        s.time += 3;
      } });
    out.push({ id: "look-pillow", label: "翻枕頭",
      onChoose: (s, c) => {
        if (!has(s, "staff-card")) {
          pickUp("staff-card", s, c);
          c.narrate("枕頭下壓著一張員工證，和一捲了邊的小本子。");
          c.narrate("員工證上的照片不是你的。照片裡那個人看著鏡頭，表情像剛下班。");
          if (!has(s, "staff-manual")) pickUp("staff-manual", s, c);
        } else if (!has(s, "staff-manual")) {
          pickUp("staff-manual", s, c);
          c.narrate("枕頭旁還有一本捲了邊的小本子。");
        } else {
          c.narrate("枕頭下什麼都沒有了。床單有一塊凹痕，形狀像一個人的背。");
        }
        if (has(s, "staff-manual")) unlockBook(["re1", "re2", "re3", "re4", "re5", "re6"], s, c);
        s.time += 2;
      } });
    out.push({ id: "look-nightstand", label: "翻床頭櫃",
      onChoose: (s, c) => {
        if (!has(s, "key-704")) {
          c.narrate("抽屜底層一把銅鑰匙，齒都磨圓了，上面刻著 704。");
          c.narrate("你的房卡是 602。");
          c.narrate("你把鑰匙拿起來，門牌像是咳了一下。");
          pickUp("key-704", s, c);
          s.drift += 1;
        } else {
          c.narrate("抽屜空了，只剩鑰匙擦過的痕跡。");
        }
        s.time += 2;
      } });
    if (state.doorNumber === HIDDEN_NUMBER && !has(state, "note-704")) {
      out.push({ id: "take-note", label: "撿起門縫下的紙",
        onChoose: (s, c) => {
          c.narrate("門縫下塞了一張泛黃的紙，折成四折。你不記得它什麼時候出現的。");
          c.narrate("紙上的字工整得不像倉促寫的——但有幾個字的墨比較深，像是被劃掉重寫過。");
          pickUp("note-704", s, c);
          unlockBook(["rf1", "rf2", "rf3", "rf4", "rf5"], s, c);
          s.time += 2;
        } });
    }
    if (state.crossedMidnight) {
      out.push({ id: "answer-door", label: "有人敲門——開門",
        onChoose: (s, c) => {
          if (s.doorNumber === HIDDEN_NUMBER) {
            s.drift += 2;
            c.narrate("你開了門。");
            c.narrate("門外站著一個人，對你點了一下頭，像鄰居那種點法。");
            c.narrate("你不記得他的臉。但你看著他，覺得以前見過。");
          } else {
            c.narrate("你開了門。走廊是空的，只有你自己呼吸的聲音。");
            c.narrate("門牌還是 602。");
          }
          s.time += 2;
        } });
    }
    out.push({ id: "go-lobby", label: "出門，下樓",
      onChoose: (s, c) => {
        if (s.crossedMidnight) {
          s.drift += 2;
          c.narrate("你開門，走進走廊。");
          c.narrate("走廊的燈在你身後一盞一盞熄掉。你沒回頭數。");
        }
        moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label);
        s.time += 2;
      } });
  }

  else if (at("lobby")) {
    out.push({ id: "look-window", label: "看大廳落地窗",
      onChoose: (s, c) => {
        c.narrate("落地窗外是停車場，一台車都沒有。旋轉門外的街燈還亮著，但街上看不到人。");
        c.narrate("你進來時，櫃台跟你說過今晚飯店客滿。");
        s.time += 2;
      } });
    out.push({ id: "go-room", label: "搭電梯回房",
      onChoose: (s, c) => {
        c.narrate("電梯面板上沒有 4。你按 6，門關上前，聽見它先停了一層你沒按的樓。");
        c.narrate("你沒按開門。");
        moveTo(c.scene, s, "my-room", LOCATIONS["my-room"].label);
        s.time += 2;
      } });
    if (has(state, "staff-card")) {
      out.push({ id: "go-staff", label: "刷員工證進員工通道",
        onChoose: (s, c) => {
          c.narrate("讀卡機嗶了一聲，門開。");
          c.narrate("員工證上的日期是上週的。");
          moveTo(c.scene, s, "staff-corridor", LOCATIONS["staff-corridor"].label);
          s.time += 2;
        } });
    }
  }

  else if (at("staff-corridor")) {
    out.push({ id: "look-wall", label: "看牆上",
      onChoose: (s, c) => {
        c.narrate("牆上貼了一張夜班守則，用膠帶補過很多次。");
        c.narrate("字跡有兩種——一種是印刷的，一種是後來用紅筆補的。");
        c.narrate("紅筆寫的那句，墨比較新。");
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
        c.narrate("十六個畫面，十五個是空走廊。");
        c.narrate("第十六個，是一扇門。鏡頭正對著它，像它裝的攝影機。");
        c.narrate("門牌寫 704。畫面右下角跳的時間，比牆上的鐘早三分鐘。");
        s._blackout = true;
        s.time += 3;
      } });
    if (state._blackout) {
      out.push({ id: "look-back", label: "把那一格放大",
        onChoose: (s, c) => {
          s.drift += 1; s._blackout = false;
          c.narrate("門開了一條縫。");
          c.narrate("裡面站著一個人，背對鏡頭，穿的衣服跟你身上那件一樣。");
          c.narrate("他慢慢轉過頭——");
          c.narrate("畫面跳回 15 個空走廊。");
          c.narrate("你把滑鼠移開。口袋裡那把鑰匙又沉了一下。");
          s.time += 1;
        } });
    }
    out.push({ id: "go-staff", label: "回員工通道",
      onChoose: (s, c) => { s._blackout = false; moveTo(c.scene, s, "staff-corridor", LOCATIONS["staff-corridor"].label); s.time += 2; } });
  }

  return out;
}

const ENDINGS = [
  // 門牌被房間翻成 704、還在房裡、撐過午夜。
  { id: "resident", label: "換了一張房卡",
    text: "早上六點，門牌還是 704。\n你把原本的房卡放回口袋，發現口袋裡是空的——鑰匙不知道什麼時候不見了。\n櫃台那邊遞來一張新的房卡。你沒看上面的號碼，只看到自己走進電梯。\n面板上沒有 4，但有一層是亮的。",
    when: (s) => s.doorNumber === HIDDEN_NUMBER && s.location === "my-room" && s.crossedMidnight === true },

  // 身份不是房客、撐過午夜。
  { id: "claimed-by-clerk", label: "被叫去開門",
    text: "走廊盡頭，夜班的櫃台人員已經站在那裡。\n他笑著跟你說：你的房間我們幫你換好了，請跟我來。\n你走進電梯，他沒按樓，門自己關上。\n你想起那本守則叫你出來巡邏。你還記得是哪一本，但已經想不起上面寫了什麼。",
    when: (s) => s.identity === "intruder" && s.crossedMidnight === true },

  // 撐到天亮、房牌從頭到尾是 602、還在自己房間。
  { id: "checked-out", label: "天亮退房",
    text: "六點整，房間的電話響了。\n你拿起話筒，沒有人說話，只有一聲很輕的喀。\n門牌從頭到尾都是 602。\n你把房卡交回櫃台，櫃台的人看了一眼，跟你說：歡迎下次再來。\n你走出旋轉門的時候，電梯面板的燈剛好熄掉一層。",
    when: (s) => s.crossedMidnight === true && s.time >= 6 * 60 && s.time < 23 * 60
              && s.doorNumber === CARD_NUMBER && s.identity === "guest" && s.location === "my-room" },
];

export const hotel = {
  id: "hotel",
  title: "深夜飯店",
  blurb: "房卡上的號碼帶得進來。門牌不一定。",
  intro: "夜班。",
  openingNarrative: "夜裡十一點，你走進 602 號房，行李放上床。\n電梯面板上沒有 4 樓，你沒多想。\n櫃台遞房卡時順手塞了一張紙條：房客守則，入住前請過目。撐到早上六點。",
  initialItems: ["guest-card"],
  initialUnlockedRuleIds: ["rg1", "rg2", "rg3", "rg4", "rg5", "rg6"],
  initialIdentity: "guest",
  initialLocation: "my-room",
  initialTime: 23 * 60,
  initialState: { doorNumber: CARD_NUMBER, drift: 0, tvOn7: false, tvOff: false, _blackout: false },
  rules: RULES,
  rulebooks: RULEBOOKS,
  judges: JUDGES,
  derive,
  actions,
  endings: ENDINGS,
  ui: {
    visitLabel: (n) => `第 ${n} 次入住`,
    restart: "重新入住",
  },
};

export default hotel;
