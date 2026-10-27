import { escapeHtml } from '../../utils/dom-escape.js';
const escapeRecord = record => Object.fromEntries(Object.entries(record).map(([key,value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]));
// pages/yuzi-theater-live/mount.js
var FIELDS = ["直播间名", "领衔阵容", "阵容标签", "直播标题", "剧情舞台概述", "对手戏看点", "粉丝团挂牌", "剧情弹幕串", "推角弹幕串", "对线弹幕串", "观看/互动数据", "时间文本"];
var clean = (value) => String(value ?? "").normalize("NFKC").trim();
var split = (value) => clean(value).split(/[;；]/).map(clean).filter(Boolean);
var initials = (value) => [...clean(value)][0] || "播";
var icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
var TEMPLATE = `<section class="yuzi-theater-live"><div class="yuzi-theater-live-scene" data-image-canvas="background" data-record-index="0"><div class="yuzi-theater-live-stage-figure"></div></div><div class="yuzi-theater-live-ui"><div id="yuzi-theater-live-room"></div></div></section>`;
var ENHANCEMENT_STYLE = ``;
var TITLE_MARQUEE_STYLE = ``;
var LIVE_LAYOUT_STYLE = '';
function records(state) {
  const map = new Map((state?.headers || []).map((header, index) => [clean(header), index]));
  return (state?.rows || []).slice(0, 1).map((row) => Object.fromEntries(FIELDS.map((field) => [field, clean(row[map.get(field)] ?? "")])));
}
function parseBarrage(value, kind) {
  return split(value).map((item) => {
    const point = item.search(/[:：]/);
    return { kind, author: point < 0 ? "观众" : clean(item.slice(0, point)) || "观众", body: point < 0 ? item : clean(item.slice(point + 1)) || "..." };
  });
}
function formatAudience(value) {
  return split(value)[0] || "—";
}
function roomMarkup(record, messages) {
  const chat = messages.slice(0, 6).map((message) => chatMarkup(message)).join("") || '<p class="yuzi-theater-live-empty-barrage">暂无弹幕</p>';
  record = escapeRecord(record);
  return `<header class="yuzi-theater-live-topbar"><div class="yuzi-theater-live-host"><span class="yuzi-theater-live-avatar">${initials(record["直播间名"])}</span><span class="yuzi-theater-live-host-copy"><strong>${record["直播间名"] || "实时片场"}</strong><span>本场点赞 ${split(record["观看/互动数据"])[1] || "—"}</span></span><button class="yuzi-theater-live-follow" data-yuzi-theater-live-action="follow" type="button">关注</button></div><div class="yuzi-theater-live-audience"><span class="yuzi-theater-live-viewer-avatar">热</span><span class="yuzi-theater-live-viewer-avatar">粉</span><span class="yuzi-theater-live-viewer-avatar">新</span><span class="yuzi-theater-live-count">${formatAudience(record["观看/互动数据"])}</span><button class="yuzi-theater-live-close" data-action="back" type="button" aria-label="关闭">${icon("M6 6l12 12 M18 6L6 18")}</button></div></header><section class="yuzi-theater-live-title-panel"><h1>${record["直播标题"] || record["直播间名"] || "直播进行中"}</h1><p>${record["剧情舞台概述"] || record["对手戏看点"] || "正在直播"}</p><span class="yuzi-theater-live-badge">${record["粉丝团挂牌"] || record["阵容标签"] || "直播公告"}</span></section><section class="yuzi-theater-live-chat-wrap"><div id="yuzi-theater-live-chat-list" class="yuzi-theater-live-chat-list">${chat}</div></section><button class="yuzi-theater-live-pause" data-barrage-toggle data-paused="false" type="button" aria-label="暂停弹幕">${icon("M9 5v14 M15 5v14")}</button><span class="yuzi-theater-live-pause-label" data-pause-label>暂停弹幕</span><footer class="yuzi-theater-live-actionbar"><input class="yuzi-theater-live-input" type="text" placeholder="说点什么..." aria-label="说点什么"><button class="yuzi-theater-live-action" data-yuzi-theater-live-action="emoji" type="button" aria-label="表情">${icon("M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z")}</button><button class="yuzi-theater-live-action" data-yuzi-theater-live-action="like" type="button" aria-label="点赞">${icon("M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z")}</button><button class="yuzi-theater-live-action" data-yuzi-theater-live-action="gift" type="button" aria-label="礼物">${icon("M20 12v9H4v-9 M2 7h20v5H2z M12 7v14 M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z")}</button><button class="yuzi-theater-live-action" data-yuzi-theater-live-action="share" type="button" aria-label="分享">${icon("M12 3v12 M7 8l5-5 5 5 M5 12v8h14v-8")}</button></footer>`;
}
function chatMarkup(message) {
  message = escapeRecord(message);
  return `<div class="yuzi-theater-live-chat-line" data-kind="${message.kind}"><span class="yuzi-theater-live-chat-author">${message.author}：</span><span>${message.body}</span></div>`;
}
export function mount(context) {
  const root = context.root;
  root.innerHTML = TEMPLATE + ENHANCEMENT_STYLE + TITLE_MARQUEE_STYLE + LIVE_LAYOUT_STYLE;
  const page = root.querySelector(".yuzi-theater-live");
  const room = root.querySelector("#yuzi-theater-live-room");
  let disposed = false;
  let paused = false;
  let messages = [];
  let cursor = 0;
  let timer = 0;
  const stopRotation = () => {
    if (timer) globalThis.clearInterval(timer);
    timer = 0;
  };
  const rotate = () => {
    if (paused || !messages.length) return;
    const list = root.querySelector("#yuzi-theater-live-chat-list");
    if (!list) return;
    const line = document.createElement("div");
    line.className = "yuzi-theater-live-chat-line";
    line.dataset.kind = messages[cursor].kind;
    line.innerHTML = chatMarkup(messages[cursor]).replace(/^<div[^>]*>|<\/div>$/g, "");
    const previousTop = list.firstElementChild?.getBoundingClientRect().top;
    list.append(line);
    while (list.children.length > 30) list.firstElementChild?.remove();
    const currentTop = list.firstElementChild?.getBoundingClientRect().top;
    if (Number.isFinite(previousTop) && Number.isFinite(currentTop) && list.animate && !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      list.animate([{ transform: `translateY(${previousTop - currentTop}px)` }, { transform: "translateY(0)" }], { duration: 420, easing: "cubic-bezier(.22,.8,.35,1)" });
    }
    cursor = (cursor + 1) % messages.length;
    const viewport = root.querySelector(".yuzi-theater-live-chat-wrap");
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  };
  const startRotation = () => {
    stopRotation();
    if (!paused && !document.hidden && context.isVisible?.() !== false) timer = globalThis.setInterval(rotate, 1800);
  };
  const render = (state = context.getState()) => {
    if (disposed || !state) return;
    const record = records(state)[0];
    if (!record) {
      room.innerHTML = '<p class="yuzi-theater-live-empty">暂无直播间内容</p>';
      messages = [];
      stopRotation();
      return;
    }
    messages = [...parseBarrage(record["剧情弹幕串"], "plot"), ...parseBarrage(record["推角弹幕串"], "stan"), ...parseBarrage(record["对线弹幕串"], "clash")];

    cursor = Math.min(6, messages.length) % messages.length;
    room.innerHTML = roomMarkup(record, messages);
    const roomName = root.querySelector(".yuzi-theater-live-host-copy strong");
    if (roomName) {
      const text = escapeHtml(roomName.textContent);
      roomName.innerHTML = `<span class="yuzi-theater-live-room-track"><span class="yuzi-theater-live-room-text">${text}</span><span class="yuzi-theater-live-room-text" aria-hidden="true">${text}</span></span>`;
    }
    const summary = root.querySelector(".yuzi-theater-live-title-panel p");
    if (summary) {
      summary.className = "yuzi-theater-live-stage-summary";
      room.append(summary);
    }
    const heartLayer = document.createElement("div");
    heartLayer.className = "yuzi-theater-live-heart-layer";
    heartLayer.setAttribute("aria-hidden", "true");
    room.append(heartLayer);
    const gift = root.querySelector('[data-yuzi-theater-live-action="gift"]');
    const share = root.querySelector('[data-yuzi-theater-live-action="share"]');
    const emoji = root.querySelector('[data-yuzi-theater-live-action="emoji"]');
    if (gift) {
      gift.dataset.tableAction = "previousTable";
      gift.setAttribute("aria-label", "上一张表");
    }
    if (share) {
      share.dataset.tableAction = "nextTable";
      share.setAttribute("aria-label", "下一张表");
    }
    if (emoji) {
      emoji.dataset.tableAction = "editCurrentTable";
      emoji.setAttribute("aria-label", "编辑当前表");
    }
    startRotation();
    context.mountImages();
  };
  const click = (event) => {
    const action = event.target.closest?.("[data-action]");
    if (action && !action.disabled) {
      void context.actions[action.dataset.action]?.();
      return;
    }
    const toggle = event.target.closest?.("[data-barrage-toggle]");
    if (toggle) {
      paused = !paused;
      toggle.dataset.paused = String(paused);
      toggle.setAttribute("aria-label", paused ? "继续弹幕" : "暂停弹幕");
      toggle.innerHTML = paused ? icon("M8 5v14l11-7Z") : icon("M9 5v14 M15 5v14");
      const label = root.querySelector("[data-pause-label]");
      if (label) label.textContent = paused ? "继续弹幕" : "暂停弹幕";
      root.querySelector("#yuzi-theater-live-chat-list")?.classList.toggle("is-paused", paused);
      if (paused) stopRotation();
      else startRotation();
      return;
    }
    const local = event.target.closest?.("[data-yuzi-theater-live-action]");
    if (local) {
      if (local.dataset.tableAction) {
        void context.actions[local.dataset.tableAction]?.();
        return;
      }
      local.classList.toggle("is-active");
      if (local.dataset.liveAction === "follow") local.textContent = local.classList.contains("is-active") ? "已关注" : "关注";
      if (local.dataset.liveAction === "like") {
        const layer = root.querySelector(".yuzi-theater-live-heart-layer");
        for (let index = 0; index < 5; index += 1) {
          const heart = document.createElement("span");
          heart.className = `yuzi-theater-live-float-heart v${index}`;
          heart.textContent = "♥";
          heart.addEventListener("animationend", () => heart.remove(), { once: true });
          layer?.append(heart);
        }
      }
    }
  };
  page.addEventListener("click", click);
  const unsubscribe = context.subscribe(render);
  render();
  const visibilityChanged = () => { stopRotation(); if(!disposed) startRotation(); };
  document.addEventListener('visibilitychange', visibilityChanged);
  const unsubscribeActivity = context.subscribeActivity?.(visibilityChanged);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopRotation();
    document.removeEventListener('visibilitychange', visibilityChanged);
    unsubscribeActivity?.();
    page.removeEventListener("click", click);
    context.signal.removeEventListener("abort", dispose);
    unsubscribe();
  };
  context.signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
