// "深夜飯店" — first scene.
//
// Mechanics in this scene:
//   - state.time (minutes-of-day) starts at 21:00 and ticks +5 per action.
//   - Each action also bumps a per-action counter used by time-of-day triggers.
//   - Some rules "amend" the initial text instead of inserting a new one.
//   - Some inserts go between existing rules; the engine handles that.

export const hotelScene = {
  id: "hotel",
  title: "旅客守則",
  blurb: "一間沒有名字的飯店。地下室以上七層，電梯只到六樓。",
  intro:
    "您已完成入住手續。房門在您身後關上。門後貼著一份《旅客守則》。" +
    "請於閱讀後遵守所有條款。本場所時間將隨您的行為推進。",

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

  // Actions the player can take. Each advances time by 5 minutes.
  actions(state) {
    const t = state.time;
    const after = (mins) => 60 * Math.floor((t + mins) / 60) + ((t + mins) % 60);

    // If ended, no actions.
    if (state.ended) return [];

    const acts = [
      {
        id: "look-door",
        label: "看一下門後的守則，再看一眼門。",
        onChoose(s) {
          s.actions.lookDoor = (s.actions.lookDoor || 0) + 1;
          s.time = after(5);
        },
      },
      {
        id: "peek-hall",
        label: "把門打開一條縫，看走廊。",
        onChoose(s) {
          s.actions.peekHall = (s.actions.peekHall || 0) + 1;
          s.time = after(5);
        },
      },
      {
        id: "watch-tv",
        label: "坐到床邊，轉開電視。",
        onChoose(s) {
          s.actions.watchTv = (s.actions.watchTv || 0) + 1;
          s.time = after(5);
          if (s.actions.watchTv >= 2) s.tvChanged = true;
        },
      },
      {
        id: "call-front-desk",
        label: "拿起話筒，按 0 撥給櫃檯。",
        onChoose(s) {
          s.actions.callFrontDesk = true;
          s.time = after(5);
        },
      },
      {
        id: "wait-and-listen",
        label: "關燈，躺在床上，聽走廊的聲音。",
        onChoose(s) {
          s.actions.waitListen = (s.actions.waitListen || 0) + 1;
          s.time = after(10);
        },
      },
      {
        id: "try-leave",
        label: "拿起鑰匙，嘗試打開門走出去。",
        onChoose(s) {
          s.actions.tryLeave = true;
          s.time = after(5);
        },
      },
      {
        id: "check-phone-time",
        label: "看一下手機上的時間。",
        onChoose(s) {
          s.actions.checkPhone = (s.actions.checkPhone || 0) + 1;
          s.time = after(5);
        },
      },
    ];
    return acts;
  },

  // Dynamic rules.
  triggers: [
    {
      id: "shadow-after-2330",
      when: (s) => s.time >= 23 * 60 + 30 && s.actions.peekHall > 0,
      body: "23:30 之後您不會看見自己的影子。如您看見影子，請停下，並向最近的牆面行禮。",
    },
    {
      id: "key-outside",
      when: (s) => s.actions.tryLeave,
      body: "房間鑰匙是您的。如鑰匙不在掛鉤上，那麼房間不是您的。請在走廊等候您的房間認領您。",
    },
    {
      id: "tv-other-channels",
      when: (s) => s.tvChanged,
      body: "第 7 台之外不存在其他頻道。如您看見其他頻道，請記住主持人服裝的顏色，並在規則更新中回報。",
    },
    {
      id: "host-appears",
      when: (s) => s.tvChanged && s.time >= 22 * 60,
      body: "主持人會在 22:00 後出現。主持人只在您注視時存在。",
    },
    {
      id: "call-0",
      when: (s) => s.actions.callFrontDesk,
      body: "電話將由櫃檯接聽。請勿告知櫃檯您的房號。櫃檯不會重複您所說的房號。",
    },
    {
      id: "third-door",
      when: (s) => (s.actions.peekHall || 0) + (s.actions.tryLeave ? 1 : 0) >= 3,
      body: "門是您所見過的東西。如果您不記得它是哪一扇，請選一扇。選擇是您的事情。",
    },
    {
      id: "door-wont-open",
      when: (s) => s.actions.tryLeave && s.time >= 22 * 60,
      body: "房門從外面鎖上時，從裡面也無法打開。房門從外面沒有鎖上時，從裡面也無法打開。",
    },
    {
      id: "knock-three-times",
      when: (s) => (s.actions.waitListen || 0) >= 2 && s.time >= 22 * 60 + 30,
      body: "若您數到不是三下，請數第二次。",
    },
    {
      id: "shadow-self",
      when: (s) => s.actions.peekHall > 0 && s.time >= 22 * 60 + 30,
      body: "您不應該看見您的影子。您看見的是上一次您不在這裡的時候，您曾經是的那個人。",
    },
    {
      id: "checkout-passed",
      when: (s) => s.time >= 10 * 60 + 0,
      body: "退房時間不適用於您。您可以隨時離開。您也可以隨時不離開。這兩句話的意思相同。",
    },
    // amend an existing rule (rule index 0, the 22:00 one)
    {
      id: "amend-return-time",
      when: (s) => s.time >= 23 * 60,
      mode: "amend",
      target: 0,
      body: "請於 23:00 前返回房間。如無法返回，請於明早之前返回。",
    },
  ],

  // Endings.
  endings: [
    {
      id: "left",
      label: "您離開了",
      when: (s) => s.actions.tryLeave && s.time >= 22 * 60 && !s.actions.callFrontDesk,
      text: "您推開門。走廊的燈還亮著，沒有人。您走到大門，推開，走了出去。\n" +
            "您站在一片空地上。手裡握著房間鑰匙，鑰匙上沒有房號。\n" +
            "您身後沒有任何建築物。",
    },
    {
      id: "claimed",
      label: "您被認領",
      when: (s) =>
        s.actions.callFrontDesk &&
        s.tvChanged &&
        (s.actions.peekHall || 0) >= 2,
      text: "走廊盡頭多了一扇門。門上貼著同一份守則。\n" +
            "守則的標題改成您的房號加一。\n" +
            "您試著回頭，但您的房間已經不是您的房間。",
    },
    {
      id: "became",
      label: "您成為了守則",
      when: (s) =>
        s.tvChanged && s.actions.watchTv >= 3 && s.time >= 22 * 60,
      text: "電視第 7 台的主持人看著您。\n" +
            "從下一則守則起，您會以「旅客」的身份，被其他旅客讀到。\n" +
            "您不再記得自己是誰。",
    },
  ],
};
