// The built-in template uses exactly the same public contract as imported modules.
function parseTimeBar({ matches }) {
    return matches.flatMap(match => {
        const { year, month, day, hour, minute, weekday } = match.data;
        const y = Number(year), m = Number(month), d = Number(day), h = Number(hour), min = Number(minute);
        const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1] || h > 23 || min > 59) return [];
        const index = Math.floor((m + 10) % 12 / 3);
        return [{ ...match, data: { ...match.data, date: `${year} · ${month} · ${day}`, time: `${hour}:${minute}`,
            weekday, season: ['spring', 'summer', 'autumn', 'winter'][index],
            seasonName: ['春日', '夏日', '秋日', '冬日'][index], seasonMark: ['春', '夏', '秋', '冬'][index],
            theme: h >= 7 && h < 19 ? 'light' : 'dark' } }];
    });
}

function mountTimeBar({ root, data, options, signal }) {
    const card = root.querySelector('.timebar');
    card.dataset.season = data.season;
    card.dataset.motion = String(options.motion !== false);
    card.style.colorScheme = data.theme;
  function random(seed) { let value = seed; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
  function draw(card, index) {
    const canvas = card.querySelector('canvas'), ctx = canvas.getContext('2d');
    const style = getComputedStyle(card), season = card.dataset.season;
    const color = name => style.getPropertyValue('--yuzi-time-' + name).trim();
    // Resolve light-dark() through a real CSS color before passing it to Canvas.
    const swatch = document.createElement('span'); card.append(swatch);
    const resolved = name => { swatch.style.color = color(name); return getComputedStyle(swatch).color; };
    const ink = resolved('branch'), leaf = resolved('leaf'), hill = resolved('hill'), paper = resolved('paper'); swatch.remove();
    const rnd = random(934 + index * 183);
    ctx.setTransform(2,0,0,2,0,0); ctx.clearRect(0,0,420,180);
    const ellipse = (x,y,rx,ry,fill,alpha=1,angle=0) => { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2); ctx.fill(); ctx.restore(); };
    const stroke = (points,width,alpha,fill=ink) => { ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=fill; ctx.lineWidth=width; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(points[0],points[1]); ctx.bezierCurveTo(...points.slice(2)); ctx.stroke(); ctx.restore(); };
    const glow = ctx.createRadialGradient(255,65,4,255,65,97); glow.addColorStop(0, season === 'winter' ? '#ffffff90' : '#fff9d7c0'); glow.addColorStop(1,'#ffffff00'); ctx.fillStyle=glow; ctx.fillRect(130,0,250,180);
    ellipse(254,58,season==='winter'?16:23,season==='winter'?16:23,season==='winter'?'#f3f9ff':'#fff8d5',.67);
    for(let layer=0;layer<3;layer++) {
      ctx.save(); ctx.globalAlpha=.17+layer*.065; ctx.fillStyle=hill; ctx.beginPath(); ctx.moveTo(0,180);
      ctx.bezierCurveTo(55,158-layer*12,96,175-layer*20,155,153-layer*11);
      ctx.bezierCurveTo(220,113-layer*10,265,170-layer*15,323,139-layer*13);
      ctx.bezierCurveTo(370,110-layer*7,403,128-layer*10,430,115-layer*5); ctx.lineTo(430,185);ctx.closePath();ctx.fill();ctx.restore();
    }
    if(season==='winter') {
      const pine=(x,y,size,alpha)=>{
        stroke([x,y+size,x-2,y+size*.5,x+1,y+size*.2,x,y],1.8,alpha,ink);
        for(let tier=0;tier<6;tier++) {
          const yy=y+tier*size*.13,w=size*(.08+tier*.052);
          ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=leaf;ctx.beginPath();ctx.moveTo(x,yy);ctx.bezierCurveTo(x-w*.4,yy+size*.12,x-w*.5,yy+size*.21,x-w,yy+size*.25);ctx.quadraticCurveTo(x,yy+size*.19,x+w,yy+size*.25);ctx.bezierCurveTo(x+w*.5,yy+size*.2,x+w*.4,yy+size*.1,x,yy);ctx.fill();
          ctx.fillStyle='#f4f8fc';ctx.globalAlpha=alpha*.85;ctx.beginPath();ctx.moveTo(x,yy-1);ctx.lineTo(x-w*.62,yy+size*.16);ctx.quadraticCurveTo(x-w*.12,yy+size*.12,x,yy+size*.14);ctx.quadraticCurveTo(x+w*.28,yy+size*.12,x+w*.62,yy+size*.16);ctx.closePath();ctx.fill();ctx.restore();
        }
      };
      pine(170,95,48,.22); pine(204,84,59,.26); pine(233,104,39,.32);pine(294,43,105,.6);pine(351,19,135,.83);pine(399,64,92,.7);
      ctx.save();ctx.globalAlpha=.72;ctx.fillStyle=paper;ctx.beginPath();ctx.moveTo(95,173);ctx.bezierCurveTo(174,137,228,163,281,152);ctx.bezierCurveTo(341,135,374,156,430,143);ctx.lineTo(430,180);ctx.lineTo(95,180);ctx.fill();ctx.restore();
      for(let i=0;i<33;i++) ellipse(125+rnd()*288,15+rnd()*152,.5+rnd()*1.1,.5+rnd()*1.1,'#ffffff',.2+rnd()*.45);
    } else if(season==='summer') {
      // A pond and an overhanging, sunlit canopy.
      for(let i=0;i<9;i++) stroke([120+i*9,137+i*5,200,132+i*5,315,145+i*4,425,134+i*5],1,.15,leaf);
      stroke([433,-12,365,58,323,45,262,27],4,.72);
      for(let i=0;i<9;i++) {
        const x=246+i*19,y=20+Math.sin(i*.9)*17;
        stroke([x,y,x-7,y+13,x-19,y+23,x-29,y+30],1,.5);
        for(let j=0;j<7;j++) ellipse(x-28+rnd()*55,y+8+rnd()*32,5+rnd()*10,2+rnd()*4,leaf,.23+rnd()*.42,-.9+rnd()*1.7);
      }
      for(let i=0;i<6;i++) { const x=226+rnd()*177,y=140+rnd()*32;ellipse(x,y,10+rnd()*10,3+rnd()*2,leaf,.45);stroke([x-5,y,x,y-2,x+5,y,x+10,y],.7,.3,paper); }
      for(let i=0;i<4;i++) ellipse(328+(i-1.5)*3,139-Math.abs(i-1.5)*2,3,7,'#f2d8d4',.85,(i-1.5)*.25);
    } else {
      // Branch structure stays visible beneath translucent blossoms or autumn leaves.
      stroke([437,176,385,125,374,68,303,30],6,.6);
      const tips=[[257,37,354,81],[286,12,360,69],[330,58,392,112],[220,71,341,86],[368,22,397,125],[311,110,400,134]];
      for(const [tx,ty,bx,by] of tips) {
        stroke([bx,by,bx-28,by-28,tx+25,ty+5,tx,ty],2,.62);
        for(let i=0;i<(season==='spring'?28:19);i++) {
          const x=tx+(rnd()-.5)*63,y=ty+(rnd()-.5)*42;
          if(season==='spring') {
            const radius=2+rnd()*3.6;
            for(let k=0;k<5;k++) { const angle=k*Math.PI*2/5;ellipse(x+Math.cos(angle)*radius*.65,y+Math.sin(angle)*radius*.65,radius,radius*.65,i%3===0?'#e2a7b8':'#f8dce3',.45+rnd()*.4,angle); }
            ellipse(x,y,.9,.9,'#c28d84',.65);
          } else {
            ctx.save();ctx.translate(x,y);ctx.rotate(rnd()*4);ctx.globalAlpha=.4+rnd()*.5;ctx.fillStyle=i%4===0?'#ba7543':leaf;const s=5+rnd()*8;ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.3,-s*.35);ctx.lineTo(s*.8,-s*.55);ctx.lineTo(s*.6,0);ctx.lineTo(s, s*.2);ctx.lineTo(s*.3,s*.5);ctx.lineTo(0,s*.85);ctx.lineTo(-s*.25,s*.45);ctx.lineTo(-s*.9,s*.2);ctx.lineTo(-s*.55,-s*.1);ctx.lineTo(-s*.7,-s*.6);ctx.lineTo(-s*.2,-s*.35);ctx.closePath();ctx.fill();ctx.restore();
          }
        }
      }
      for(let i=0;i<16;i++) ellipse(195+rnd()*225,158+rnd()*20,1+rnd()*3,1+rnd(),season==='spring'?'#daa2b2':leaf,.35,rnd()*3);
    }
    // Fine paper-like speckles, painted once rather than animated.
    for(let i=0;i<370;i++) ellipse(rnd()*420,rnd()*180,.35,.35,ink,.04+rnd()*.06);
  }

    const index = ['spring', 'summer', 'autumn', 'winter'].indexOf(data.season);
    draw(card, index);
    if (options.motion !== false) {
        const rnd = random(323 + index), box = card.querySelector('.particles');
        const count = data.season === 'winter' ? 30 : data.season === 'summer' ? 9 : 10;
        for (let i = 0; i < count; i++) {
            const node = document.createElement('span'); node.className = 'particle';
            node.style.setProperty('--x', (31 + rnd() * 68) + '%');
            node.style.setProperty('--y', (20 + rnd() * 65) + '%');
            node.style.setProperty('--size', (data.season === 'winter' ? 1.5 + rnd() * 3 : 3 + rnd() * 4) + 'px');
            node.style.setProperty('--duration', (7 + rnd() * 12) + 's');
            node.style.setProperty('--delay', (-rnd() * 22) + 's'); box.append(node);
        }
    }
    if (data.season !== 'summer') card.querySelector('.summer-light').remove();
    let visible = true;
    const update = () => { card.dataset.active = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); });
    observer.observe(card);
    document.addEventListener('visibilitychange', update, { signal }); update();
    return () => observer.disconnect();
}

export const timeBarModule = {
    "name": "时间栏",
    "description": "随剧情月份切换四季，07:00–18:59 为白天，其余为夜间。",
    "prompt": {
        "default": "正文的最开头加入当前剧情的日期、时间和星期，格式为：[YYYY-MM-DD|HH：mm|星期几]\n示例：[2026-10-16|16：45|星期五]",
        "value": "正文的最开头加入当前剧情的日期、时间和星期，格式为：[YYYY-MM-DD|HH：mm|星期几]\n示例：[2026-10-16|16：45|星期五]"
    },
    "match": {
        "pattern": "\\[(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})\\|(?<hour>\\d{2})[:：](?<minute>\\d{2})\\|(?<weekday>星期[一二三四五六日天])\\]",
        "flags": "gu"
    },
    "controls": [
        {
            "id": "motion",
            "label": "动态效果",
            "description": "四季轻动态；关闭后保留插画与配色。",
            "default": true,
            "value": true
        }
    ],
    "html": "<article class=\"timebar\"><div class=\"landscape\" aria-hidden=\"true\"><canvas width=\"840\" height=\"360\"></canvas></div><div class=\"summer-light\" aria-hidden=\"true\"></div><div class=\"particles\" aria-hidden=\"true\"></div><span class=\"season-mark\" aria-hidden=\"true\">{{seasonMark}}</span><div class=\"timebar-info\"><div class=\"timebar-date\">{{date}}</div><time class=\"timebar-clock\">{{time}}</time><div class=\"timebar-footer\"><span>{{weekday}}</span><span class=\"divider\"></span><span class=\"timebar-season\">{{seasonName}}</span></div></div></article>",
    "css": ":host { display:block; width:100%; max-width:100%; container-type:inline-size; }\n* { box-sizing:border-box; }\n.timebar { font:400 14px/1.4 \"Microsoft YaHei\",\"PingFang SC\",sans-serif; text-align:left; text-indent:0; text-shadow:none; }\n.timebar { --yuzi-time-paper: light-dark(#fff4f3,#34292f); --yuzi-time-edge: light-dark(#ecd9db,#5c454e); --yuzi-time-ink: light-dark(#674451,#f1dce4); --yuzi-time-muted: light-dark(#966b78,#c49ea9); --yuzi-time-wash: light-dark(#efd4dc,#634154); --yuzi-time-particle: #d993a6; --yuzi-time-hill: light-dark(#d8d5bc,#4d5550); --yuzi-time-leaf: light-dark(#b4bba0,#7b977d); --yuzi-time-branch: light-dark(#9c7b76,#b59492); position: relative; isolation: isolate; overflow: hidden; min-height: 146px; border: 1px solid var(--yuzi-time-edge); border-radius: 18px; background: var(--yuzi-time-paper); color: var(--yuzi-time-ink); box-shadow: 0 7px 22px -16px color-mix(in srgb,var(--yuzi-time-ink) 30%,transparent); }\n.timebar[data-season='summer'] { --yuzi-time-paper: light-dark(#f0f6ec,#233730); --yuzi-time-edge: light-dark(#d6e4d1,#3b5849); --yuzi-time-ink: light-dark(#375b47,#d6ecd9); --yuzi-time-muted: light-dark(#68856b,#a0bda5); --yuzi-time-wash: light-dark(#c9dfbd,#436a49); --yuzi-time-particle: #f1dc9a; --yuzi-time-hill: light-dark(#a8c8b7,#3b6356); --yuzi-time-leaf: light-dark(#6a976c,#648e63); --yuzi-time-branch: light-dark(#7d8b66,#99aa80); }\n.timebar[data-season='autumn'] { --yuzi-time-paper: light-dark(#fff4e5,#3e3026); --yuzi-time-edge: light-dark(#e9d7bd,#65503b); --yuzi-time-ink: light-dark(#795136,#efdbc0); --yuzi-time-muted: light-dark(#a17c53,#c6a780); --yuzi-time-wash: light-dark(#ecd3a2,#88603a); --yuzi-time-particle: #c99042; --yuzi-time-hill: light-dark(#d8bd8d,#705c42); --yuzi-time-leaf: light-dark(#ce9a42,#b0833d); --yuzi-time-branch: light-dark(#9c7a52,#b49771); }\n.timebar[data-season='winter'] { --yuzi-time-paper: light-dark(#edf4fa,#202f40); --yuzi-time-edge: light-dark(#d4e1ed,#3f5268); --yuzi-time-ink: light-dark(#415d76,#e5f0fb); --yuzi-time-muted: light-dark(#738ba2,#a2b7cf); --yuzi-time-wash: light-dark(#bbd2e5,#3d5975); --yuzi-time-particle: #ffffff; --yuzi-time-hill: light-dark(#bdd0dc,#516a83); --yuzi-time-leaf: light-dark(#719197,#53777f); --yuzi-time-branch: light-dark(#748d98,#8eabb8); }\n.timebar::before { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(ellipse at 88% 0%,color-mix(in srgb,var(--yuzi-time-wash) 70%,transparent),transparent 65%); }\n.timebar::after { content: ''; position: absolute; inset: 7px; border: 1px solid color-mix(in srgb,var(--yuzi-time-edge) 50%,transparent); border-radius: 12px; pointer-events: none; }\n.timebar-info { position: relative; z-index: 3; padding: 19px 24px 18px; width: max-content; max-width: 62%; }\n.timebar-date { font-size: 12px; font-weight: 500; letter-spacing: 1.7px; color: var(--yuzi-time-muted); margin-bottom: 3px; }\n.timebar-clock { display: block; font-family: Georgia,'Times New Roman',serif; font-size: 42px; line-height: 1.1; letter-spacing: 1.2px; font-weight: 400; font-variant-numeric: tabular-nums; }\n.timebar-footer { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 11px; color: var(--yuzi-time-muted); letter-spacing: 1px; white-space: nowrap; }\n.timebar-footer .divider { width: 16px; height: 1px; background: var(--yuzi-time-edge); }\n.timebar-season { letter-spacing: 3px; }\n.landscape { position: absolute; right: 0; bottom: 0; height: 100%; width: 61%; max-width: 410px; pointer-events: none; mask-image: linear-gradient(90deg,transparent,black 23%); }\n.landscape canvas { position: absolute; right: 0; bottom: 0; width: auto; height: 100%; display: block; aspect-ratio: 7 / 3; }\n.season-mark { position: absolute; right: 21px; top: 17px; color: var(--yuzi-time-muted); font-family: 'KaiTi','STKaiti',serif; font-size: 20px; z-index: 2; opacity: .7; }\n.particles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 2; mask-image: linear-gradient(90deg,transparent 26%,black 64%); }\n.particle { position: absolute; left: var(--x); top: -20px; width: var(--size); height: var(--size); background: var(--yuzi-time-particle); opacity: 0; border-radius: 70% 15% 65% 40%; animation: yuzi-season-drift var(--duration) linear var(--delay) infinite; }\n.timebar[data-motion='false'] .particle { display: none; }\n.summer-light { position: absolute; inset: 0; background: linear-gradient(112deg,transparent 55%,#fff9d322 58%,transparent 62%,#fff9d318 67%,transparent 72%); animation: yuzi-season-light 13s ease-in-out infinite alternate; pointer-events: none; }\n.timebar[data-motion='false'] .summer-light { animation: none; }\n@keyframes yuzi-season-drift { 0% { transform: translate3d(-14px,-8px,0) rotate(0deg); opacity: 0; } 12% { opacity: .7; } 80% { opacity: .6; } 100% { transform: translate3d(32px,190px,0) rotate(190deg); opacity: 0; } }\n@keyframes yuzi-season-glimmer { 0%,100% { transform: translate(0,3px); opacity: .1; } 50% { transform: translate(-10px,-8px); opacity: .8; } }\n@keyframes yuzi-season-light { from { transform: translateX(-8px); opacity: .4; } to { transform: translateX(13px); opacity: 1; } }\n.timebar[data-active=\"false\"] .particle, .timebar[data-active=\"false\"] .summer-light { animation-play-state:paused; }\n@container (max-width:440px) { .timebar { min-height:136px; } .timebar-info { padding:19px 19px 16px; } .timebar-clock { font-size:36px; } .landscape { width:63%; opacity:.84; } .season-mark { right:16px; } }\n@media (prefers-reduced-motion:reduce) { .particle { display:none; } .summer-light { animation:none; } }",
    "assets": {},
    "guide": {
        "开始": [
            "本模块既是可运行的时间栏，也是完整作者模板。先复制此模块，再改 name；导入永远生成新副本，无须自己造 ID。",
            "使用 JSON 字符串，换行写成 \\n；正则中的反斜杠在 JSON 内要写两次。不要加入 JSON 注释，不需要构建工具或小手机源码。",
            "你可以只用 match + html + css，script 为空即可。时间栏的 script 演示日期校验、月份/时段判断和 Canvas 插画，均随此文件交付。"
        ],
        "字段": {
            "name": "设置列表显示名，同名允许共存。",
            "description": "给使用者的简短说明。",
            "prompt.default": "作者提供的默认提示词；恢复默认回到此值。",
            "prompt.value": "当前保存的提示词；仅主开关开启时追加到现有正文提示词最后。",
            "match.pattern": "JavaScript 正则表达式字符串，不写 /.../ 外壳。推荐用 (?<name>...) 命名捕获字段。和气泡一样，在设置的正文楼层范围内查找格式，跳过代码块和已有组件。",
            "match.flags": "g/i/m/s/u 的组合，宿主补 g 以逐条识别。",
            "html": "只写模块内部 HTML 片段。{{字段名}} 自动替换为转义后的 data 字段，{{asset:名称}} 引用内嵌素材。不要在这里使用 script 标签或事件属性，交互写在 script 的 mount 中。",
            "css": "仅作用于当前实例的 Shadow DOM，可用 :host、局部 class 和 keyframes；不影响正文气泡或其他模块。",
            "script": "可空。ES module 源码，可导出同步 parse(context) 与 mount(context)。不要顶层启动任务；启用才加载。",
            "assets": "可选素材映射：名称 → 完整 data URL；支持 PNG/JPEG/GIF/WebP/AVIF 和 WOFF/WOFF2/TTF/OTF。没有素材就留 {}，不要填写本机路径。",
            "controls": "可选开关数组。每项 id 唯一，以英文字母开头；label 是界面名称，default 是作者默认布尔值，value 是当前布尔值，description 可选。",
            "controls[].prompt": "可选 {default,value}，开启子开关才追加在本模块主提示词后；宿主自动提供展开、编辑、保存和恢复默认。"
        },
        "脚本接口": {
            "parse({text,matches,options})": "可选同步函数。matches 已由 match 正则提取，每项 {start,end,data}，索引以 text 的 UTF-16 位置为准，end 不包含末尾。返回同形数组；过滤无效数据返回 []，可计算额外 data 字段。不要返回 Promise。options 为当前子开关 id → 布尔值。",
            "mount({root,data,raw,options,assets,signal,onCleanup})": "可选函数，可异步。root 是已经插入正文的本实例内容容器；data 是匹配字段，raw 是匹配原文。只在 root 内找节点和绑定事件。signal 在实例失效时 abort；可返回清理函数或 onCleanup(fn) 注册清理。异步工作应检查 signal.aborted。",
            "生命周期": "不要监听整个聊天或自己替换正文。宿主共用气泡的扫描、生成完成判断、楼层数量、原文恢复、编辑/切换/关闭清理。模块错误不应写聊天数据。CSS 隔离不等于 JavaScript 沙箱；只启用可信脚本。"
        },
        "最小例子": {
            "name": "告示",
            "description": "识别 [告示|文字]",
            "prompt": {
                "default": "有告示时使用 [告示|内容] 格式。",
                "value": "有告示时使用 [告示|内容] 格式。"
            },
            "match": {
                "pattern": "\\[告示\\|(?<content>[^\\]]+)\\]",
                "flags": "gu"
            },
            "controls": [],
            "html": "<aside class=\"notice\">{{content}}</aside>",
            "css": ".notice { padding:16px; border:1px solid currentColor; border-radius:12px; white-space:pre-wrap; }",
            "script": "",
            "assets": {}
        },
        "增加开关": {
            "步骤": "向 controls 添加以下对象；展示代码用 options.comments 读取。主开关关闭时，全部提示词与识别都退出。",
            "示例": {
                "id": "comments",
                "label": "生成评论",
                "description": "开启后请求 AI 追加评论内容。",
                "default": false,
                "value": false,
                "prompt": {
                    "default": "在本模块内容中追加评论，格式由本模块识别规则约定。",
                    "value": "在本模块内容中追加评论，格式由本模块识别规则约定。"
                }
            },
            "注意": "子提示词不会自动修改正则，新增内容格式时要同步改 match/parse/html。纯展示开关不要加 prompt。第一版只支持布尔开关，不声明滑块或颜色控件。"
        },
        "时间栏规则": [
            "2–4 月春，5–7 月夏，8–10 月秋，11–1 月冬。07:00（含）至 19:00（不含）为白天，其余为夜间；仅使用匹配到的剧情时间。",
            "日期或时分无效时不替换；星期按原文显示，不自动纠正。motion 仅控制动态，不改提示词。",
            "修改配色请找 css 的 --yuzi-time-* 变量；修改图景请找 mount 中的 draw；调整昼夜请改 parse 中的 theme 判断。",
            "四季插画使用 Canvas，不需要外部图片。动画受可见性、页面后台和减少动态偏好控制。"
        ],
        "自检": [
            "先用本模块样例检查命名捕获与 HTML 占位符一致。",
            "检查关闭主开关后原文恢复；子开关只改变声明的效果与附加提示词。",
            "用窄屏、深浅时段和多个模块检查；反复启用、关闭及切换聊天不应留下定时器或事件。",
            "只有本文档说明的公开字段/参数可依赖，不调用小手机内部模块、世界书、数据库或 TTS。"
        ],
        "样例输入": [
            "[2026-03-16|09：20|星期一]",
            "[2026-06-16|14:30|星期二]",
            "[2026-10-16|16：45|星期五]",
            "[2026-12-16|19：40|星期三]",
            "[2026-12-16|06：59|星期三]",
            "[2026-12-16|07：00|星期三]"
        ]
    },
    script: `export const parse = ${parseTimeBar.toString()};\nexport const mount = ${mountTimeBar.toString()};`,
};
