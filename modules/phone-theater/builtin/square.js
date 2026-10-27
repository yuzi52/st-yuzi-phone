import { buildBuiltinTheaterNav } from './navigation.js';
// Adapted from 0813-exclusive.yuzi-beautify.json; built-in only, no workshop binding.
// pages/yuzi-theater-square/mount.js
var FIELDS = ["帖子ID", "发帖账号名", "账号标签", "帖子标题", "帖子正文", "话题/附加信息", "图片描述", "视频描述", "评论串", "互动数据", "时间文本"];
var ACTIONS = { back: "返回上一层", previousTable: "上一张表", nextTable: "下一张表", editCurrentTable: "编辑当前表" };
var BACKGROUND_KEY = "background";
var PROFILE_NAME_KEY = "name";
var PROFILE_TAG_KEY = "signature";
var AVATAR_SLOT = "protagonist-avatar";
var avatarSlot = (name) => `character-avatar-${encodeURIComponent(clean(name) || "unnamed")}`;
var icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
var clean = (value) => String(value ?? "").normalize("NFKC").trim();
var TEMPLATE = `<section class="yuzi-theater-square">${buildBuiltinTheaterNav('square', '广场表')}<main class="yuzi-theater-square-content"><section class="yuzi-theater-square-profile"><div class="yuzi-theater-square-avatar">广</div><h2 class="yuzi-theater-square-profile-name">@生活动态</h2><p class="yuzi-theater-square-profile-tag">Moments / Square</p><div class="yuzi-theater-square-stats"><span><strong id="yuzi-theater-square-post-count">0</strong>动态</span><span><strong>0</strong>带媒体动态</span><span><strong>0</strong>评论</span><span><strong>0</strong>评论人数</span></div></section><header class="yuzi-theater-square-feed-head"><h3 class="yuzi-theater-square-feed-title">动态</h3><button class="yuzi-theater-square-calendar" type="button" aria-label="动态日历" title="动态日历">${icon("M4 5h16v15H4z M8 3v4 M16 3v4 M4 9h16")}</button></header><section id="yuzi-theater-square-list"></section></main></section>`;
function records(state) {
  const map = new Map((state?.headers || []).map((header, index) => [clean(header), index]));
  return (state?.rows || []).map((row, index) => ({ index, ...Object.fromEntries(FIELDS.map((field) => [field, clean(row[map.get(field)] ?? "")])) }));
}
function splitComments(value) {
  return clean(value).split(";").map(clean).filter(Boolean);
}
function commentAuthor(value) {
  const point = value.search(/[:：]/);
  return clean(point < 0 ? value : value.slice(0, point));
}
function isPresent(value) {
  return value && !/^(none|null|无|没有)$/i.test(clean(value));
}
function initials(name) {
  const source = clean(name).split(/[\s·•_-]+/).filter(Boolean)[0] || "";
  return [...source][0] || "人";
}
function renderPost(record, comments) {
  const post = document.createElement("article");
  post.className = "yuzi-theater-square-post";
  const head = document.createElement("header");
  head.className = "yuzi-theater-square-post-head";
  const avatar = document.createElement("span");
  avatar.className = "yuzi-theater-square-mini-avatar";
  avatar.textContent = initials(record["发帖账号名"]);
  const author = document.createElement("div");
  author.className = "yuzi-theater-square-post-author";
  author.append(Object.assign(document.createElement("strong"), { textContent: record["发帖账号名"] || "未命名账号" }), Object.assign(document.createElement("span"), { textContent: record["账号标签"] || "动态" }));
  const more = document.createElement("button");
  more.className = "yuzi-theater-square-more";
  more.type = "button";
  more.setAttribute("aria-label", "更多操作");
  more.title = "更多操作";
  more.innerHTML = icon("M5 12h.01 M12 12h.01 M19 12h.01");
  head.append(avatar, author, more);
  const body = document.createElement("div");
  body.className = "yuzi-theater-square-post-body";
  if (record["帖子标题"]) body.append(Object.assign(document.createElement("h4"), { className: "yuzi-theater-square-post-title", textContent: record["帖子标题"] }));
  body.append(Object.assign(document.createElement("p"), { className: "yuzi-theater-square-post-copy", textContent: record["帖子正文"] || "暂无动态内容" }));
  if (record["话题/附加信息"]) body.append(Object.assign(document.createElement("p"), { className: "yuzi-theater-square-topic", textContent: record["话题/附加信息"].split(";").filter(Boolean).map((value) => value.startsWith("#") ? value : `#${value}`).join("  ") }));
  const media = [["image", record["图片描述"]], ["video", record["视频描述"]]].filter(([, value]) => isPresent(value));
  if (media.length) {
    const mediaBox = document.createElement("div");
    mediaBox.className = "yuzi-theater-square-media";
    mediaBox.dataset.count = String(Math.min(media.length, 3));
    media.forEach(([canvas, value]) => {
      const frame = Object.assign(document.createElement('div'), { className:'yuzi-theater-square-media-item', textContent:value });
      frame.dataset.imageCanvas=canvas; frame.dataset.recordIndex=String(record.index); mediaBox.append(frame);
    });
    body.append(mediaBox);
  }
  post.append(head, body);
  const foot = document.createElement("footer");
  foot.className = "yuzi-theater-square-post-foot";
  foot.append(Object.assign(document.createElement("time"), { textContent: record["时间文本"] || "时间未记录" }));
  const actions = document.createElement("div");
  actions.className = "yuzi-theater-square-actions";
  [["点赞", "M12 21s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7 3.5C19 16.65 12 21 12 21Z"], ["评论", "M4 5h16v11H8l-4 4Z"], ["分享", "M4 12h13 M13 6l6 6-6 6"]].forEach(([label, path]) => {
    const button = document.createElement("button");
    button.className = "yuzi-theater-square-action";
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = icon(path);
    actions.append(button);
  });
  foot.append(actions);
  post.append(foot);
  if (record["互动数据"]) {
    const likes = document.createElement("div");
    likes.className = "yuzi-theater-square-likes";
    likes.innerHTML = `${icon("M7 10v10 M4 10h3v10H4z M7 10l3-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2l-1 7a2 2 0 0 1-2 2H7")}`;
    likes.append(document.createTextNode(record["互动数据"]));
    post.append(likes);
  }
  if (comments.length) {
    const box = document.createElement("div");
    box.className = "yuzi-theater-square-comments";
    comments.forEach((comment) => {
      const match = comment.match(/^([^：:]{1,24})[：:](.*)$/s);
      const line = document.createElement("span");
      line.className = "yuzi-theater-square-comment";
      if (match) line.append(Object.assign(document.createElement("strong"), { textContent: `${match[1]}：` }), document.createTextNode(match[2]));
      else line.textContent = comment;
      box.append(line);
    });
    post.append(box);
  }
  const input = document.createElement("div");
  input.className = "yuzi-theater-square-comment-box";
  input.innerHTML = `${icon("M4 5h16v11H8l-4 4Z")}<span>说点什么吧...</span>`;
  post.append(input);
  return post;
}
export function mount(context) {
  const readLocal = (key, fallback = '') => context.profile.get(key, fallback);
  const writeLocal = (key, value) => context.profile.set(key, value);
  const removeLocal = key => context.profile.set(key, '');
  const root = context.root;
  root.innerHTML = TEMPLATE;
  const page = root.querySelector(".yuzi-theater-square");
  const list = root.querySelector("#yuzi-theater-square-list");
  const profile = root.querySelector(".yuzi-theater-square-profile");
  const profileName = root.querySelector(".yuzi-theater-square-profile-name");
  const profileTag = root.querySelector(".yuzi-theater-square-profile-tag");
  const backgroundInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
  const backgroundButton = Object.assign(document.createElement("button"), { className: "yuzi-theater-square-bg-button", type: "button", title: "导入背景图片" });
  backgroundButton.setAttribute("aria-label", "导入背景图片");
  backgroundButton.innerHTML = icon("M4 5h16v14H4z M8 13l3-3 6 6 M15 9h.01");
  const backgroundDeleteButton = Object.assign(document.createElement("button"), { className: "yuzi-theater-square-bg-delete", type: "button", title: "删除背景图片" });
  backgroundDeleteButton.setAttribute("aria-label", "删除背景图片");
  backgroundDeleteButton.innerHTML = icon("M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6");

  const avatarInput = Object.assign(document.createElement('input'), {type:'file',accept:'image/*',hidden:true});
  const avatarButton = Object.assign(document.createElement('button'), {type:'button',className:'yuzi-theater-square-avatar-import',title:'导入头像图片'});
  avatarButton.setAttribute('aria-label', '导入头像图片');
  avatarButton.innerHTML = icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0');
  const profileActions = Object.assign(document.createElement('div'), {className:'yuzi-theater-square-profile-actions'});
  profileActions.append(avatarButton, backgroundButton, backgroundDeleteButton);
  profile.append(profileActions, avatarInput, backgroundInput);
  let avatarUrl = readLocal('avatar');
  const uploadAvatar = async () => {
    try {
      const file=avatarInput.files?.[0]; if(!file) return;
      const value=await context.importImage(file); if(disposed) return;
      await writeLocal('avatar',value); if(disposed) return; avatarUrl=value; applyAvatar();
    } catch(error) { context.notify?.(error.message); }
  };
  avatarInput.addEventListener('change', uploadAvatar);
  avatarButton.addEventListener('click', () => avatarInput.click(), {signal:context.signal});
  const applyAvatar = () => {
    root.querySelectorAll(".yuzi-theater-square-avatar").forEach((avatar) => {
      avatar.style.backgroundImage = avatarUrl ? `url("${avatarUrl}")` : "";
      avatar.style.backgroundPosition = "center";
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundRepeat = "no-repeat";
      avatar.textContent = avatarUrl ? "" : initials(profileName.textContent);
    });
  };
  const hydratePostAvatars = () => root.querySelectorAll(".yuzi-theater-square-post").forEach((post) => {
    const avatar = post.querySelector(".yuzi-theater-square-mini-avatar");
    const name = clean(post.querySelector(".yuzi-theater-square-post-author strong")?.textContent);
    if (!avatar) return;
    avatar.dataset.hasImage = "false";
    avatar.style.backgroundImage = "";
    avatar.textContent = initials(name);
    if (!name) return;
    context.presetAssets.getUrl(avatarSlot(name)).then((url) => {
      if (disposed || !avatar.isConnected) return;
      avatar.dataset.hasImage = url ? "true" : "false";
      avatar.style.backgroundImage = url ? `url("${url}")` : "";
      avatar.textContent = url ? "" : initials(name);
    }).catch(() => {
    });
  });
  const refreshAvatars = () => {
    context.presetAssets.getUrl(AVATAR_SLOT).then((url) => {
      if (!disposed) {
        avatarUrl = readLocal("avatar") || url || null;
        applyAvatar();
      }
    }).catch(() => {
    });
    hydratePostAvatars();
    context.mountImages();
  };
  let disposed = false;
  page.dataset.theme = context.theme.mode;
  const hostUser = clean(context.userName || "我");
  profileName.textContent = readLocal(PROFILE_NAME_KEY, `${hostUser}的生活动态`);
  profileTag.textContent = readLocal(PROFILE_TAG_KEY, "Moments / Square");
  const applyBackground = (value) => {
    page.style.backgroundImage = value ? `url("${value}")` : "";
  };
  applyBackground(readLocal(BACKGROUND_KEY));
  const render = (state = context.getState()) => {
    if (disposed || !state) return;
    root.querySelector("#yuzi-theater-square-prev").disabled = !state.canPrevious;
    root.querySelector("#yuzi-theater-square-next").disabled = !state.canNext;
    const data = records(state);
    let commentCount = 0;
    const visitors = new Set();
    const commentsByRow = data.map((record) => {
      const comments = splitComments(record["评论串"]);
      commentCount += comments.length;
      comments.forEach((comment) => { const author = commentAuthor(comment); if (author) visitors.add(author); });
      return comments;
    });
    const statValues = [data.length, data.filter(row => isPresent(row["图片描述"]) || isPresent(row["视频描述"])).length, commentCount, visitors.size];
    root.querySelectorAll(".yuzi-theater-square-stats strong").forEach((node, index) => {
      node.textContent = String(statValues[index] || 0);
    });
    list.replaceChildren(...data.length ? data.map((record, index) => renderPost(record, commentsByRow[index])) : [Object.assign(document.createElement("p"), { className: "yuzi-theater-square-empty", textContent: "暂无动态" })]);
    applyAvatar();
    hydratePostAvatars();
  };
  const run = async (action) => {
    try {
      const result = await context.actions[action]();
      if (!result?.ok && !disposed) list.setAttribute("data-error", result?.message || `${ACTIONS[action]}失败`);
    } catch {
    }
  };
  const editText = (node, key, fallback) => {
    const value = globalThis.prompt?.("请输入显示文字", node.textContent) ?? node.textContent;
    node.textContent = clean(value) || fallback;
    void writeLocal(key, node.textContent).catch(error => context.notify?.(error.message));
  };
  const click = (event) => {
    const action = event.target.closest?.("[data-action]");
    if (action && !action.disabled) {
      void run(action.dataset.action);
      return;
    }
    if (event.target.closest?.(".yuzi-theater-square-bg-button")) {
      backgroundInput.click();
      return;
    }
    if (event.target.closest?.(".yuzi-theater-square-bg-delete")) {
      void removeLocal(BACKGROUND_KEY).catch(error => context.notify?.(error.message));
      backgroundInput.value = "";
      applyBackground("");
      return;
    }
    if (event.target.closest?.(".yuzi-theater-square-profile-name")) {
      editText(profileName, PROFILE_NAME_KEY, `${hostUser}的生活动态`);
      return;
    }
    if (event.target.closest?.(".yuzi-theater-square-profile-tag")) editText(profileTag, PROFILE_TAG_KEY, "Moments / Square");
  };
  const changeBackground = async () => {
    try { const file=backgroundInput.files?.[0]; if(!file) return;
      const value=await context.importImage(file); if(disposed) return;
      await writeLocal(BACKGROUND_KEY,value); if(!disposed) applyBackground(value);
    } catch(error) { context.notify?.(error.message); }
  };
  page.addEventListener("click", click);
  backgroundInput.addEventListener("change", changeBackground);
  const unsubscribe = context.subscribe(render);
  render();
  const avatarChange = () => refreshAvatars();
  globalThis.addEventListener?.("yuzi-character-avatar-change", avatarChange);
  globalThis.addEventListener?.("focus", avatarChange);
  refreshAvatars();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    page.removeEventListener("click", click);
    backgroundInput.removeEventListener("change", changeBackground);
    avatarInput.removeEventListener("change", uploadAvatar);
    globalThis.removeEventListener?.("yuzi-character-avatar-change", avatarChange);
    globalThis.removeEventListener?.("focus", avatarChange);
    context.signal.removeEventListener("abort", dispose);
    unsubscribe();
  };
  context.signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
