// "深夜飯店" — first scene.
//
// Mechanics in this scene:
//   - state.time (minutes-of-day) starts at 21:00 and ticks +5 per action.
//   - Each action also bumps a per-action counter used by time-of-day triggers.
//   - Some rules "amend" the initial text instead of inserting a new one.
//   - Some inserts go between existing rules; the engine handles that.
//   - Each action pushes a narration line via ctx.narrate; rules/triggers
//     push their own. The narrative stream IS the scene UI.

export const hotelScene = {
  id: "hotel",
  title: "旅客守則",
  blurb: "一間沒有名字的飯店。地下室以上七層，電梯只到六樓。",
  intro:
    "您已完成入住手續。房門在您身後關上。門後貼著一份《旅客守則》。" +
    "請於閱讀後遵守所有條款。本場所時間將隨您的行為推進。",
  openingNarrative:
    "您走進房間。門在您身後關上，沒有敲門聲。牆上的燈是暖黃色。" +
    "床鋪整齊。窗簾拉上。床頭櫃上有一支話筒、一台電視。" +
    "門後的守則貼得很高，您得抬頭才看得清楚。",

  initialRules: [
    "請於 22:00 前返回房間。如無法返回，請於 23:00 前返回。",
    "房間僅有一扇門。門外不應有第三道門。",
    "房間鑰匙僅能從房間內側的掛鉤取得。若您在門外看見您的鑰匙，請不要撿起。",
    "走廊的燈於 22:30 起切換為夜間模式。夜間模式下您不會看見其他旅客。",
    "夜間模式下若您聽見敲門聲，請確認敲門次數。敲門次數應為三下。",
    "房間內的電視僅可收看第 7 台。如電視顯示其他頻道，請勿變更。",
    "請勿使用房間內的電話撥打 0。0 不是分機號碼。",
    "退房時間為 10:00。如您錯過 10:00，請向櫃檯索取新的退房時間。",
  ],

  // Actions the player can take. Each advances time and pushes a narration line.
  actions(state, ctx) {
    const t = state.time;
    const a = state.actions;
    const after = (mins) => (t + mins) % (24 * 60);

    // 已結束就不再給選項
    if (state.ended) return [];

    const opts = [
      {
        id: "look-door",
        label: "看一下門後的守則，再看一眼門。",
        hint: "守則最上面那行有皺褶。門底下透著一點光。",
        onChoose(s, c) {
          s.actions.lookDoor = (s.actions.lookDoor || 0) + 1;
          s.time = after(5);
          c.narrate("您抬頭看著守則，又回頭看了一眼門。門沒有動。");
          if (s.actions.lookDoor === 1) {
            c.narrate("您注意到守則的左上角有一道淺淺的摺痕，像是被誰撕下來過。");
          }
        },
      },
      {
        id: "peek-hall",
        label: "把門打開一條縫，看走廊。",
        hint: "走廊的燈還亮著，沒有其他人。",
        onChoose(s, c) {
          s.actions.peekHall = (s.actions.peekHall || 0) + 1;
          s.time = after(5);
          if (s.actions.peekHall === 1) {
            c.narrate("您把門推開一條縫。走廊很長，左右兩端各有一盞燈，沒有人。");
            c.narrate("地上有地毯，圖案是重複的。您數到第四塊之後放棄了。");
          } else {
            c.narrate("您又開了一條縫。走廊還是一樣長。");
            c.narrate("這次您注意到您自己房門對面的牆上沒有門牌。");
          }
        },
      },
      {
        id: "watch-tv",
        label: "坐到床邊，轉開電視。",
        hint: "電視有雜訊。第 7 台正在播沒人看過的節目。",
        onChoose(s, c) {
          s.actions.watchTv = (s.actions.watchTv || 0) + 1;
          s.time = after(5);
          if (s.actions.watchTv === 1) {
            c.narrate("您坐到床邊，按下電視的電源。螢幕亮了一會兒，停在第 7 台。");
            c.narrate("節目是無聲的。一個人坐在空蕩的接待大廳，背對鏡頭。");
          } else if (s.actions.watchTv === 2) {
            s.tvChanged = true;
            c.narrate("您再看電視。第 7 台不見了。螢幕上只剩雪花與一張不動的臉。");
            c.narrate("那張臉沒有在笑。");
          } else {
            c.narrate("電視還在播。您已經不再看臉了，您在看背景裡的時鐘。");
            c.narrate("時鐘的時針在倒著走。");
          }
        },
      },
      {
        id: "call-front-desk",
        label: "拿起話筒，按 0 撥給櫃檯。",
        hint: "話筒拿起來有嘯聲。按 0 之後，對方會先說您的房號。",
        onChoose(s, c) {
          s.actions.callFrontDesk = true;
          s.time = after(5);
          c.narrate("您拿起話筒。聽見長長的嘟嘟聲。");
          c.narrate("您按了 0。線路另一頭先停頓了一下。");
          c.narrate("然後，對方用您的聲音，說出了您的房號。");
          c.narrate("您掛上話筒。手心有汗。");
        },
      },
      {
        id: "wait-and-listen",
        label: "關燈，躺在床上，聽走廊的聲音。",
        hint: "關燈之後，您能聽見更多東西。",
        onChoose(s, c) {
          s.actions.waitListen = (s.actions.waitListen || 0) + 1;
          s.time = after(10);
          if (s.actions.waitListen === 1) {
            c.narrate("您關了燈。房間變得比您以為的更大。");
            c.narrate("您聽見自己的呼吸、冰箱的壓縮機、還有遠處的電梯。");
          } else if (s.actions.waitListen === 2) {
            c.narrate("您又躺了一次。這次走廊的聲音不一樣。");
            c.narrate("有人在走。不是走過去，是走過來，又走回去，又走過來。");
            c.narrate("您分辨不出腳步聲是從哪一扇門的方向傳來的。");
          } else {
            c.narrate("您閉著眼。腳步聲停了。");
            c.narrate("然後您聽見有人敲門。");
            c.narrate("一、二、——");
          }
        },
      },
      {
        id: "try-leave",
        label: "拿起鑰匙，嘗試打開門走出去。",
        hint: "鑰匙從房間內側的掛鉤取得。如果門外有您的鑰匙，請不要撿。",
        onChoose(s, c) {
          s.actions.tryLeave = true;
          s.time = after(5);
          if (!s.tookKey) {
            s.tookKey = true;
            c.narrate("您從掛鉤上取下鑰匙。鑰匙是溫的。");
          }
          c.narrate("您把鑰匙插進鎖孔。轉了一下。");
          c.narrate("鎖沒動。您再轉一次。鎖還是沒動。");
          c.narrate("但您很清楚，鑰匙是對的。");
        },
      },
      {
        id: "check-phone-time",
        label: "看一下手機上的時間。",
        hint: "手機時間跟房間時間不一定一樣。",
        onChoose(s, c) {
          s.actions.checkPhone = (s.actions.checkPhone || 0) + 1;
          s.time = after(2);
          c.narrate("您解鎖手機。");
          c.narrate("訊號是滿格，但沒有任何一則通知。");
          c.narrate("時間是現在。但您感覺不對。");
        },
      },
    ];

    // 22:00 之後可以問守則「現在是幾點」（已經是 ctx 提供，這裡示範用 hint 動態）
    if (t >= 22 * 60) {
      // 提示燈色已切換
      const first = opts[0];
      if (!first.hint.includes("切換")) {
        first.hint = "走廊的燈色似乎比您進房時冷了一些。";
      }
    }

    // 「開門」是 commit 動作，獨立成一個 action：先試鑰匙轉不動，玩家
    // 自己決定要不要再轉一次把門打開。這樣 left 結局需要的是真的
    // 「打開」這個 beat，而不是被時間到 22:00 自動收掉。
    if (state.actions.tryLeave && !state.actions.doorOpened) {
      opts.push({
        id: "open-the-door",
        label: "再轉一次，把門打開。",
        hint: "您知道鎖是不該開的。您還是轉了。",
        onChoose(s, c) {
          s.actions.doorOpened = true;
          s.time = after(5);
          c.narrate("您再轉一次。這次鎖響了一下。");
          c.narrate("門開了。");
        },
      });
    }

    return opts;
  },

  triggers: [
    {
      id: "shadow-after-2330",
      when: (s) => s.time >= 23 * 60 + 30 && (s.actions.peekHall || 0) > 0,
      body: "若您在走廊上看見自己的影子，請不要回頭。回頭的會是別人。",
    },
    {
      id: "key-outside",
      when: (s) => !!s.actions.doorOpened,
      body: "若您打開門時，鑰匙已在門外，請記得：本房間只認領一位旅客。",
    },
    {
      id: "tv-other-channels",
      when: (s) => !!s.tvChanged,
      body: "電視第 7 台之外不存在其他頻道。若您看見其他頻道，那是第 7 台。",
    },
    {
      id: "host-appears",
      when: (s) => !!s.tvChanged && s.time >= 22 * 60,
      body: "電視裡的主持人只在被注視時存在。請於離開座位前關閉電視。",
    },
    {
      id: "call-0",
      when: (s) => !!s.actions.callFrontDesk,
      body: "若您撥 0 後，對方先說出您的房號——請掛上話筒。對方比您更熟悉您。",
    },
    {
      id: "third-door",
      when: (s) => (s.actions.peekHall || 0) + (s.actions.tryLeave ? 1 : 0) >= 3,
      body: "若您看見第三道門，選擇是您的事。但房間不會回應。",
    },
    {
      id: "door-wont-open",
      when: (s) => !!s.actions.tryLeave && s.time >= 22 * 60,
      body: "若房門從裡外都無法打開，請回到床上。您尚未辦理退房。",
    },
    {
      id: "knock-three-times",
      when: (s) => (s.actions.waitListen || 0) >= 2 && s.time >= 22 * 60 + 30,
      body: "若您聽見敲門，請再數一次。第二次才是正確的次數。",
    },
    {
      id: "shadow-self",
      when: (s) => (s.actions.peekHall || 0) > 0 && s.time >= 22 * 60 + 30,
      body: "若您在走廊上看見上一次您不在這裡時您曾經是的那個人，請不要說話。",
    },
    {
      id: "checkout-passed",
      // Only after we've actually crossed midnight. `time` is minutes-of-day
      // and 21:00 (= 1260) is already numerically > 600 (= 10:00), which
      // made the original condition fire on the first action.
      when: (s) => s.crossedMidnight && s.time >= 10 * 60,
      body: "若您錯過退房時間，請向櫃檯索取新的退房時間。新的時間與舊的時間是同一個時間。",
    },
    {
      id: "amend-return-time",
      when: (s) => s.time >= 23 * 60,
      mode: "amend",
      target: 0,
      body: "請於 22:00 前返回房間。您沒有選擇。",
    },
  ],

  endings: [
    {
      id: "left",
      label: "離開",
      when: (s) => !!s.actions.doorOpened && s.time >= 22 * 60 && !s.actions.callFrontDesk,
      text: "您推開門。門外沒有走廊。\n\n您手裡握著那把鑰匙，鑰匙上沒有房號。\n\n您身後沒有建築物。您往前走了三步，停了下來。\n\n您不知道自己是從哪裡出來的。",
    },
    {
      id: "claimed",
      label: "被認領",
      when: (s) => !!s.actions.callFrontDesk && !!s.tvChanged && (s.actions.peekHall || 0) >= 2,
      text: "走廊多了一扇門。\n\n門後的房間跟您的一模一樣。床鋪整齊。窗簾拉上。床頭櫃上有一支話筒、一台電視。\n\n房間號碼是您的房號加一。\n\n您站在門口。您已經站在門口很久了。",
    },
    {
      id: "became",
      label: "成為",
      when: (s) => !!s.tvChanged && (s.actions.watchTv || 0) >= 3 && s.time >= 22 * 60,
      text: "您關了電視。\n\n房間裡有人坐在床邊。背影是您的。\n\n您看了他很久。他回過頭。\n\n他笑著說：歡迎入住。",
    },
  ],
};
