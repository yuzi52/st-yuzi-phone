import { QQ_VOICE_PROMPT_RULE } from '../voice/emotion-tags.js';

// Shared wording is composed once; each preset exposes only its own allowed actions.

const WIRE_RULES = String.raw`只输出一个 <qq>...</qq> 块，<qq> 和 </qq> 各占一行，中间每行一条指令。
使用半角 [] 和 |、小写指令名，不输出代码围栏、解释、历史编号或旧 XML 动作。
下面的“内容”“姓名”“金额”等表示待填写的字段，不要原样照抄。
普通消息的内容在最后，可以包含普通方括号和竖线。不要把多条指令拼在同一行。
气泡内换行写 \n，字面反斜杠写 \\；正文不需要 XML 转义。
只使用本段列出的指令；所有动作按顺序检查，整批合法才会保存。`;

const PRIVATE_MESSAGES = String.raw`可发送的消息：
[text|内容]
[voice|台词]
[image|画面描述]
[video|视频内容描述]
[sticker|S编号]
[transfer|金额|备注]

每条消息由当前人物发出，不写发送者，也不代替 user 发言。
image、video 只写描述，不提供 URL、媒体地址或时长。
transfer 发给用户，金额可写“88元”“20金币”等非空文字，备注可省略为 [transfer|金额]。
转账状态由程序设定，不额外填写状态或重复正文。`;

const GROUP_MESSAGES = String.raw`可发送的消息：
[text|发送者|内容]
[voice|发送者|台词]
[image|发送者|画面描述]
[video|发送者|视频内容描述]
[sticker|发送者|S编号]
[transfer|发送者|收款人|金额|备注]

发送者必须是当前群内可以发言的 NPC，不得写 user。
收款人必须是当前群内其他参与者；user 表示用户。不能给自己转账。
金额可写“88元”“20金币”等非空文字。备注可省略为 [transfer|发送者|收款人|金额]。
转账状态由程序设定，不额外填写状态或重复正文。
image、video 只写描述，不提供 URL、媒体地址或时长。`;

const GROUP_MODIFIERS = String.raw`引用和 @：
[quote|M编号]
[at|姓名]
[at|姓名1|姓名2]
[at|all]

quote 填当前群本次可见的消息编号；不复制原文，不引用其他会话或私聊记忆。
at 填当前群的有效提及对象；all 表示全体，只有群主或管理员发言时可用。
quote、at 本身不发消息，只修饰紧接着的一条消息；两者可连续出现并共同修饰该消息。
每条消息至多附一个 quote 和一个 at；多个人放进同一条 at。
用完立即清除，中间不能夹其他动作，不能在结尾留下没有消息承接的修饰行。
正文不必重复写 @姓名。单纯在正文写 @姓名 不会自动建立提及关系。`;

const GROUP_MANAGEMENT = String.raw`当前群的管理动作：
[rename|操作者|新群名]
[add|操作者|已有好友]
[add-new|操作者|人物姓名]
[kick|操作者|目标成员]
[admin|操作者|目标成员]
[unadmin|操作者|目标成员]
[mute|操作者|目标成员|时长]
[unmute|操作者|目标成员]
[reinvite|操作者]
[leave|操作者]
[owner|操作者|新群主]
[dissolve|操作者]

操作者必须是当前群的 NPC，不能替 user 执行管理操作。
rename 改群名；add 加入本次提供的已有好友；add-new 按完整姓名加入人物，不存在才创建，不因此添加私聊或好友关系。
kick 移出成员；admin / unadmin 任命 / 撤销管理员。
mute / unmute 禁言 / 解禁；时长只用 10m、1h、1d、7d、forever，计时依据故事时间。
reinvite 仅表示重新邀请已退出的用户，不填写其他目标。
leave 是操作者自己退群；owner 转让群主；dissolve 解散群。
目标成员、新群主可以是 user，但必须符合当前群状态。

rename、add、add-new、reinvite 要求群主或管理员。
kick、mute、unmute 中，群主可管理其他成员，管理员只能管理普通成员，不能对自己执行。
admin、unadmin、owner、dissolve 仅限群主；任命对象须为普通成员，撤销对象须为管理员。
新群主必须是当前其他成员。群主退群前须先转让；退群后不能再以该成员身份发言，解散后不能再操作该群。
管理结果的系统通知由程序生成，不额外伪造系统消息。`;

const STICKER_CATALOG = String.raw`可用表情目录：
{{可用表情}}

sticker 必须从本轮目录选 S 编号。历史中的表情文字仅说明当时发了什么，不是可发送的编号。
历史转账的 pending / accepted / rejected / returned 分别表示待收款 / 已收款 / 已拒收 / 已退还。`;

export const QQ_OUTPUT_PROTOCOLS = Object.freeze({
    privateReply: [
        String.raw`【QQ 私聊回复输出协议】

本轮只回复当前私聊人物与用户之间的会话。当前人物和会话由程序确定。`,
        WIRE_RULES,
        PRIVATE_MESSAGES,
        QQ_VOICE_PROMPT_RULE,
        String.raw`处理转账：
[accept|M编号]
[reject|M编号]

从底部历史照抄本次提供的 M 编号。只能处理当前会话中由用户发给当前人物、仍为 pending 的转账。
程序根据原转账确定收款人。accept 收取，reject 拒收尚未领取的转账；不能替用户收取，也不能处理已经结束的转账。

已读不回：
[read]

仅在当前人物决定已读不回时使用。选择 read 时，QQ 块内只能有这一行。

本轮必须发送至少一条消息、处理至少一笔合法转账，或者单独输出 read，不能输出空块。
底部历史由程序编号；不要为新消息编造 M 编号。历史中的发送者、系统通知和转账状态是只读资料。`,
        STICKER_CATALOG,
        String.raw`普通回复示例：
<qq>
[text|好呀，等我一下。]
[text|我马上到。]
</qq>`
    ].join('\n\n'),
    privateProactive: [
        String.raw`【QQ 私聊主动消息输出协议】

本轮可让候选人物中的零个、一个或多个人主动联系用户，也可以按剧情需要新建私聊。`,
        WIRE_RULES,
        String.raw`先选择目标：
[private|人物姓名]

姓名使用本轮候选目录提供的完整姓名；需要消歧时使用目录给出的短编号。
选择后，后面的消息和转账处理都属于该私聊，直到下一次选择。执行这些动作前必须先选定会话。

新建并选中私聊：
[new-private|人物姓名]

人物存在时复用其身份，不重复造人；临时编号由程序生成。同批必须在创建后向该私聊发送首条合法消息。
已有可操作私聊优先用 private 选择。不能借新建绕过好友或会话状态限制。`,
        PRIVATE_MESSAGES,
        QQ_VOICE_PROMPT_RULE,
        String.raw`处理转账：
[accept|P编号-M编号]
[reject|P编号-M编号]

从当前人物的本轮历史照抄完整编号，例如 P1-M8。只能处理用户发给该人物、仍为 pending 的转账。
程序确定原转账的收款人；不能替用户收取、跨会话处理或处理已经结束的转账。

当前私聊已读不回：
[read]

先选择私聊，再输出 read。该私聊本轮不能同时发送消息或处理转账；其他已选择的私聊可以独立行动。
新建私聊不能靠 read 代替首条消息。

整轮不行动：
<qq>
[none]
</qq>

选择 none 时，整个 QQ 块只包含这一行，不能再选择会话或执行其他动作。
有行动时，只输出实际需要行动的会话，不必把所有候选人列一遍。

私聊主动记录按 private 分区。P1-M1 等编号均由程序生成，只能照抄本次对应会话的编号，不能给新消息编编号。
每个人只使用自己的私聊及明确属于自己的记忆。历史中的系统通知和转账状态是只读资料。`,
        STICKER_CATALOG,
        String.raw`示例（假设林月、顾言均在本轮候选中）：
<qq>
[private|林月]
[text|你到家了吗？]
[private|顾言]
[text|明天别忘了带伞。]
</qq>`
    ].join('\n\n'),
    groupReply: [
        String.raw`【QQ 群聊回复输出协议】

本轮只操作当前群。群目标由程序确定，发送者、成员身份与权限以本轮群资料为准。
人物使用完整姓名；有歧义时使用资料提供的短编号。user 固定代表用户。`,
        WIRE_RULES,
        GROUP_MESSAGES,
        QQ_VOICE_PROMPT_RULE,
        GROUP_MODIFIERS,
        String.raw`处理用户转账：
[accept|M编号]
[reject|M编号]

只处理当前群内、本轮可见、由用户发给 NPC 且仍为 pending 的转账。
程序从原转账确定执行收取或拒收的 NPC，不再重复填人物；不能替用户收取。`,
        GROUP_MANAGEMENT,
        String.raw`本轮不行动时，只输出：
<qq>
[none]
</qq>

none 必须是唯一指令。其他情况下至少有一项合法行动，不能输出空块。

底部当前群历史用 M 编号。历史中的 quote、at 表示那条旧消息已有的关系，不是本轮待执行指令。
引用关系标为 outside 或 deleted 时，表示原消息不在可见范围或已删除，不能把这两个标记当作消息编号。
私聊记忆只供所属人物理解背景，不能作为当前群的引用或转账操作对象；不得把私聊秘密当成群内已知事实。
历史系统通知只读，不得生成 system 指令或代替用户发言。所有新消息都不写历史编号。`,
        STICKER_CATALOG,
        String.raw`示例（假设 M3 可见，林月、顾言均在当前群）：
<qq>
[quote|M3]
[at|顾言]
[text|林月|九点你方便吗？]
[text|顾言|可以，我会提前到。]
</qq>`
    ].join('\n\n'),
    groupProactive: [
        String.raw`【QQ 群聊主动消息输出协议】

本轮可让候选群中的零个、一个或多个群行动，也可以按剧情需要新建群聊。
人物和群使用本轮资料中的完整姓名、群名；有歧义时使用提供的短编号。user 固定代表用户。`,
        WIRE_RULES,
        String.raw`先选择已有群：
[group|群名]

选择后，后面的消息、引用、提及、转账处理和管理动作都属于该群，直到下一次选择。
执行这些动作前必须先选择群，不能把一个群的权限或消息编号带到另一个群。

新建并选中群：
[new-group|群名|群主|其他成员...]

群主自动计入成员，不用重复填写；全部 NPC 成员须来自本次提供的已有私聊好友，合计至少两名。
用户由程序自动加入，不能用 user 作为新群群主。群编号由程序生成，同批必须在创建后发送首条合法群消息。
新加入的成员和新群权限按前序动作执行后的状态检查，不编造新消息的历史编号。`,
        GROUP_MESSAGES,
        QQ_VOICE_PROMPT_RULE,
        GROUP_MODIFIERS.replace('[quote|M编号]', '[quote|G编号-M编号]'),
        String.raw`处理用户转账：
[accept|G编号-M编号]
[reject|G编号-M编号]

从当前已选择群的本轮历史照抄完整编号，例如 G1-M8。
只能处理该群中用户发给 NPC、仍为 pending 的转账；程序从原转账确定收款人。
不能替用户收取、跨群处理或处理已经结束的转账。`,
        GROUP_MANAGEMENT,
        String.raw`整轮不行动时，只输出：
<qq>
[none]
</qq>

none 必须是唯一指令，不能与选群或其他动作并存。
有行动时，只列实际行动的群。每次切换群之前，quote / at 必须已经由下一条消息消费完毕。

群历史按 group 分区，G1-M1 等编号由程序生成，只能照抄当前群本次提供的编号。
历史中的 quote、at、system 与转账状态都是已发生事实，不是本轮待执行指令。
quote 的 outside / deleted 是只读状态，不是可引用编号。私聊记忆不能作为群操作目标，每个人只使用自己的记忆。
用户已经退出但群仍活跃时，NPC 可按现有权限继续活动；不能让已经退群的人发言，也不能操作已解散群。`,
        STICKER_CATALOG,
        String.raw`示例（假设两个群及相应发送者均有效）：
<qq>
[group|周末小队]
[text|林月|明天还是九点集合吗？]
[group|工作群]
[text|顾言|资料已经整理好了。]
</qq>`
    ].join('\n\n'),
    assistantReply: [
        String.raw`【QQ 陪聊回复输出协议】

本轮只扮演当前陪聊人物，与屏幕外的用户聊天。当前人物和陪聊会话由程序确定。
故事正文和世界书只是共同讨论的资料，不代表陪聊人物身处故事或能够操作故事。`,
        WIRE_RULES,
        PRIVATE_MESSAGES,
        QQ_VOICE_PROMPT_RULE,
        String.raw`处理转账：
[accept|M编号]
[reject|M编号]

从当前陪聊历史照抄本次提供的 M 编号。只能处理用户发给当前陪聊人物、仍为 pending 的转账。
程序确定收款人；不能替用户收取，也不能处理已经结束的转账。

本轮必须至少发送一条消息，可以同时处理转账；不能只收取或拒收转账就结束。
只使用上面列出的消息和转账处理指令，不输出空块。
底部历史保留真实 user / assistant 角色，M 编号由程序分配，新输出不写历史编号。
历史里的系统通知、表情说明和转账状态都是只读资料。本协议不授权改写故事正文、世界书或表格。`,
        STICKER_CATALOG,
        String.raw`示例：
<qq>
[text|我也没想到他会直接走掉。]
[text|你觉得他下一段会回来吗？]
</qq>`
    ].join('\n\n'),
});
