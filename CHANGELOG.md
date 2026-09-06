# Changelog

本仓库所有面向用户与开发者的显著变化都记录在此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。版本号 **v0.x.y-N**：
`v0.<里程碑>.<迭代>-<刀数>`（如 v0.18.9-6 = 第 18 里程碑、第 9 迭代、第 6 刀）。
尚未 1.0，不承诺 semver 兼容，但版本单调递增，正观感与 LookatStudy 等同好仓库一致。
package.json 落地时去 v 前缀（`0.18.9-6`，semver 预发布段承载刀数）。

记录约定：
- 每个版本一组，变化按 `Added` / `Changed` / `Fixed` / `Removed` 分组。
- 一条 = 一项用户或开发者可感的变化；纯构建胶水/内部重构折成一行 internal。
- 同头版本内的多条刀改以条目尾注（0.18.9-N）区分，不另立头。
- 验收证据（测试数 / shooter / 探针）随条目附注，是本项目的交付纪律。
- **发版门**：平时交付只在 `[Unreleased]` 积条目，版本号（package.json 与版本头）保持不动；明说「发版」时才落版本头、推进版本号。

## [Unreleased]

### Added
- **宿主会话冷清单正典化（M2-件C）：host-sessions 换 sessionQuery + 归档集扣除**——修 M1 适配的 LIVE-only 回归（冷会话在清单里消失，V17 归档核查「归档后消失」沦为假绿）。落点：适配器 sessions.list 优先走 `ctx.get('sessionQuery').listSessions()`（宿主 session-controller 同源正典面：持久层头帧扫描 + live 覆盖，不激活 agent），面缺席/扫描失败诚实回落 LIVE-only；master 的 archiveSession 只把 id 记进 registry `archivedSessionIds`（会话日志留盘），语料天然含归档会话——清单按归档集扣除（宿主侧栏同款语义，内存态零成本）。速度：全量头帧扫描本机 1872 会话暖态 ~3.5s（宿主无内存缓存），<2s 判据靠「起服预热填缓存（sessionQuery inject 触发即后台扫一轮）+ 30s TTL + 归档写路失效（归档后下一读必实扫）」——create 不失效（开机织换连建 ~19 会话逐一失效会打成实扫风暴，实测首响 6.5s；30s TTL 覆盖新会话可见性，消费面无即时需求）；epoch 守卫防在途旧扫描回填。取证：probe-sd-c1.mjs 全新 state 冷起服首响 81ms/二响 15ms、冷全量 1786（含归档扣除）、2024 老 id 在场；shoot-v17 全绿含 ⑦ A-③「3 archived sessions gone from host list」（V17 探针补 _token() 鉴权）。织换标题匹配维持诚实降级（tier-1 真号映射为可靠通道）。
- **宿主 master 适配迁移（M1-件①）：apiProxy→agents+workspaceRegistry 正典面**——master 删除了 apiproxy 整包（4f00a8b82a），插件 `ctx.inject(['apiProxy'])` 永不触发、命令永久卡死 draft（baseline cmd-20260906-101214-46eb）。迁移落点：src/index.ts 单点适配器（rpcId 信封本地包一层，七个调用点 conscriptor/relay/fuse/wake/quota/archive/weave 零改动）——sessions.create=agents.create（自铸 session-uuid 号+meta.cwd）+可选 workspace.attachSession、prompt(queue)=agent.followup（持久 next-turn 收件箱，重启重放——语义优于旧 RPC）+内置 resume 冷续（对齐旧 turnAgentFor）、rename=sessionTitle 可选服务降级、workspace.create/archiveSession=registry 直通、两个 list 面接 registry.list/agents.list（hqPicker 注册弹窗与 V17 归档核查复通；织换标题匹配诚实降级为每次新建）。实测：新命令 30s 内 received+大副会话成形、搁浅 baseline 自愈、v5-spike sessionsBound:true。
- **亲自对话信号（M1-件②）：user/message → 会话卡「你 N 前亲自入会」**——新纯模块 src/user-seen.ts（isPersonalUserMessage 判据：source.kind='user' 且非本插件 rpcId warroom-* 前缀——程序化提示不算亲自；嵌套 .data 优先）+ UserSeenTracker 内存表（重启丢=v1 定案）；同一 session/event 总线加法监听；板投影 live attempt 附带 userSeenAt（presence-only 盐——有无可翻转、时间刷新不翻，SSE revision-only 不抖）；渲染两会话位（执行列会话卡 .war-userseen 琥珀弱行 + 聚焦页 live 行尾）；词典 session.userSeenAgo ×4 皮肤。纯读投影不落账本、不动 seen 已读门槛。机测 user-seen 两测（判据形状/自滤/盐）；DOM 探针 scripts/probe-sd-m1.py 3/3（路由拦截注入前提→「你 5 分钟前亲自入会对话」词面断言）。适配器投递源带 `rpcId: warroom-relay-*` 标记（自滤依据）。v199 探针修 DOM 直点+窗口 20（重渲染竞态+活跃新令后移旧令）。verify PASS。
- **打回/重试播种钮 + 播种收官（回流自 stardeck V19.7/V19.7.2/V19.8，舰长批）**：①聚焦页任务回报段动作行新增「打回重做」（reported 链）、聚焦页任务段 failed 卡新增「重试」（V19.7.2 收敛孤本——板卡零动作钮原则不破）——备书不下令：起草器预填模板文本（「这个 <任务号> 打回重做，理由是：」）+续接自动钉本战线（重做生成同战线新一代），舰长过目可改，提交才入账；②**播种收官**（舰长批「播种后旧账自动定性」）：播种令提交成功 → 旧账经 `POST /warroom/api/tasks/close` 自动定性——判词 `seedVerdict`（纯函数）点名接续命令号让族谱可溯（「打回定性——重做令已下（cmd-x），重做由该代接续，本账就此收官」），关账失败 actNote 出声不回滚已下之令；端点走 war_close 同款完整通道（dossier+goal 结算+接力征召，`closeTaskInternal` 导出经 DashboardDeps.closeTask 接线），只接受 reported/failed 两态+verdict 非空≤500 字，面缺席如实 501——账本事件语义零新增（复用 task_closed）。词典 taskCard 增 6 键×4 皮肤。机测：seed-verdict 判词四态 + close 路由五闸（缺席/成功/缺参/超长/未知/状态）；DOM 探针 scripts/probe-sd-seed.py 2/2（打回重做→起草器预填断言；坑录：全板每秒重渲染下 Playwright actionability click 恒超时，探针须 DOM 直点）。verify PASS。

### Removed
- **任务卡处理钮全撤（对齐 stardeck V19.6/V19.6续 的卡面收敛终态）**：①任务列卡面「去验收/去下重试令」钮退役（V20 时改为路由聚焦页段，本轮照 stardeck 更彻底——点卡本体即达聚焦页对应段，卡载钮与之同靶纯属冗余）；②聚焦页链上任务面板与任务回报段的同款跳大副会话钮退役（与底部 ⌁ 任务会话跳钮同靶；该定夺位由播种钮接位，见下条）。TaskCard 摘 onHandle 参、词典 taskCard 退役 handleReview/handleReviewTitle/handleRetry/handleRetryTitle 四键×4 皮肤（EN 键形锁两侧同删）；verify 两正断针脚翻负断言（防复活）。DOM 探针 probe-sd-boardread.py 翻新 5/5（卡面零处理钮/点卡落聚焦页 report 段）。

### Added
- **V19.9 可读性三件（回流自 stardeck 0ec08ea）**：①岛 ✉ 徽标分性质——计数后缀内联四类标记（军事 阅/批/答/试、平话 看/批/答/试，trek 派生随词表），悬停给全称「收件箱 N 件：待翻阅任务回报 2 · …」——「等我什么」从开浮层降为零跳；②灵动岛全局活动脉搏——`.war-island-pulse` 播「最近动静 X 前」（全板最新时间戳=命令/任务/战报/尝试取 max 的 relTime，弱于计数的 text-3 灰），与到访摘要互补（那是「你不在时变了什么」，这是「离现在多近还有生命」）；③聚焦页任务回报段未展开态结论预览——`.war-report-preview` 显示战报首句 64 字+悬停全文，预览≠翻阅（markReportSeen 仍只在点开时落，V9.12 三通道不撤）。词典 island 增 3 键、focusPage 增 1 键（×4 皮肤含 EN）。DOM 探针 scripts/probe-sd-v199.py 4/4（徽标后缀+悬停全称/脉搏 relTime/预览 trek 派生词面/零 pageerror）。verify PASS。

### Changed
- **V19.10 术语定案对齐 + 图例压缩（回流自 stardeck 5241694/4f0b428，2026-09-05 舰长定案）**：①HQ 三向分野落账——军事皮「司令部在线/返航→母舰」→「总部在线/返航→总部」、平话皮「总部亮着/返回→总部」→「HQ亮着/返回→HQ」、EN 军典 mothership→Headquarters（hqOn 保持 HQ 镜像 stardeck）；词表补 总部→星舰/军队→舰队/作战日志→舰桥日志 三条（zh+EN 同构；「作战日志」序前于「作战→执行」防派生「执行日志」，trekifyText 导出供机测锁序）。②执行者三向——军事皮 noBattle「等执行者领取」→「等指挥官领取」（stardeck 同款泄漏修平）、平话皮 4 处「执行者」→「执行 Agent」（ sqTag 干员/EN Operatives 保留，stardeck 定案后亦保留）；EN plain 全部 executor 字样（noBattle/waitingClaim/卡片题/岛计数/坞行等 14 处）手工换 execution agent——stardeck 的批量替换有误伤（"Execution agent Agent"）不照抄；EN 两皮 previewOpenFail 的 trek 词 "bridge log" 漏网修正（war→service log/plain→log，随词表 service log→bridge log）。③图例压缩三段并两段——砍「内环=最早/最老」「铭牌读数=兵数▸状态」两个自解释段（canvas 两行渲染实测正常）。取证：tests/skin.test.ts 新 V19.10 断言块（HQ 三向/执行者三向/词表序敏感/图例两段）+ copy-lang 键形锁；三皮整板+星域图例截图 .goal/evidence/audit-skins/ 肉眼复核通过。verify PASS。

### Added
- **收件箱批量定夺（批D，舰长令「逐条快览+批量批/驳」）**：岛收件箱面板的 plan 行新增复选框（悬停 title 快览计划原文全文），勾选即出批量栏「批准所选(N)/驳回所选(N)/取消选择」——写口仍是逐条 `decidePlan` 既有合法 API（客户端顺序循环，账本事件语义零改动，读投影红线不破）；部分失败给「N 条处理失败，其余已生效」提示，成功静默刷新（与 actNote 同口径）。状态与处理器在 WarView、经 `inboxBatch` props 透传 WarIsland→InboxStrip（组件无 hook 违例）。词典 inbox 增 5 键（batchApprove/batchReject/batchClear/batchSelTitle/batchFail，三皮肤+EN 键形锁过）。DOM 探针 scripts/probe-sd-batch.py 4/4：复选/批量栏/快览/恰好 2 条 plan approved 且零错误。
- **大账本性能基线回归（批C）**：`scripts/seed-bulk.py`（在演示板之上追加 N 条批量命令，五档状态分布 55/15/10/10/10，events 与 seed-playground 同格式）+ `scripts/probe-perf.py`（board API 延迟体积/冷挂载/页签切换/聚焦页四项，追加写 `.goal/evidence/perf/baseline.md`）。500 命令（522 cmd/463 task）实测：API 197-210ms/727KB、冷挂载 2.8-3.6s、页签 141-226ms、聚焦 40-53ms（对照 ~20 命令 12ms/513ms/52ms/41ms）——线性无断崖，三个月量级可用，优化阈值与首刀方案记 baseline.md。
- **雷达四态读数抽纯函数 `tacStatusWord`**（自绘制壳内联表达式升格，tests 管辖）：active/settled/idle 走词典、failed 给 ✕N（无败记兜 1）——tests/starfield3d 补四态断言（含 ✕1 兜底与 ✕N 败记数），「雷达四态测试」判据至此完整。AGENTS 坑录补 sd 回流四坑（双轴订阅成对接/探针 localStorage 先写再 reload/路由拦截 await resp.json()+线端点语义/种子板档位全 active 的断言前提）。

### Fixed
- **M1 适配器实弹补修两处（e2e 考题抓出）**：①新 agent 不带模型——首回合即死于 prompt 变量 `{{model}}` 无值（代1 卡 received 无任务成形）；修=注入 `agentDefaultModel`，create/resume 均带 `agentOptions:{provider,model}`（rc.2 旧径同源 currentSelection）。②新 agent 不带 preset 装配——工具集只剩全局插件（study/warroom）无 write/bash 核心工具，执行链「无文件落盘能力」两连败；修=composeAgent（`ctx.get('agentPresets')` 面缺席诚实降级裸组合，与 rc.2 同款兜底），meta.agentPreset+setup 双带。取证：verify:e2e 实弹两代续接链 C1-C8 全绿（C6 链档案双通道、C7b summary 引用上代 token、C8 KillCredit 自动收官）。exam-e2e.py 补 token 鉴权（新宿主 401 坑）。
- **冷恢复桥·参谋侧接线（批E，V10 R2 挂账兑现）**：patrol 巡检补上参谋侧 rescue——宿主重启时正分诊到一半的 received/talking 命令，其大副会话无活体即 `agents.resume` 续命 + `staffRescueNudgeFor` 续行提示入队（持久队列自动重放舰长已入队的答问，空队列防空转；不重做已完成的分诊）；此前 relay 只重试 draft，这类搁浅会永久卡死。plan 待批不催（等舰长定夺非搁浅）、连败 ≥2 记拒因留置、宿主无 resume 面降级只记不动作（与执行侧 rescue 同纪律）。deepen 复用父会话的会话级续接维持 V10 v1 定案（战线档案保上下文，每命令一会话征召制不破）。机测 +3，verify 315 测 PASS。决策录 DESIGN.md 批E 节。
- **critique 轮整改（双代理对抗审查 10 张全表面截图，7 真 5 误报；快照 .goal/evidence/critique-v21/）**：①×1.35 字号下命令卡底部被横滚容器裁切（.war-dispatch 定高 218px 未乘字号 → calc(218px*var(--war-fs))，坞高 RO 测量自适应不变）；②EN 图例单行溢出断字（EN mapLegend 用 ASCII `|` 不兼容 zh 侧 `｜` 两行拆分 → EN 两皮肤改 `｜` 并收短词面）；③空场水印压 HQ 图标/执行卡堆（top 38%→58%，HQ 下方净区——空场时执行卡全锚 HQ 向上堆叠）；④宿主 activity 动词「待命」等是投影数据面硬编码中文，EN 界面漏翻 → 新 copy 键 `execVerb`（zh 恒等/en 查表，未知词原样返回），四个渲染点（会话活动行/聚焦页 live 行/2D 星域驻军光点/星域桥编队）全过函数；⑤雷达铭牌读数 9px→10px；⑥EN 岛计数「Field 1」语义生硬 →「Squad 1」；⑦岛计数「等·外勤小队」段加琥珀色（等你=琥珀语义）；⑧生命条未激活段 3px 几乎不可见 → 30% 中性灰可数。误报辨析存档：星域默认 2D=V11.5 定案（雷达值班态，非 bug——3D 截图脚本已改显式切换）；侧栏重名/新会话未译=宿主壳面非插件辖区；红徽章/单行截断/生命条单标签=既有定案。
- **产物预览/打开目录守卫的插件形态适配（批2 回流勘误，真实 bug）**——workspace/file+reveal 两端点的守卫照搬了 stardeck daemon 前提「受管工作区全在 war_root 下」，但插件形态的注册星球是任意用户目录（真实部署里项目目录几乎从不在 war_root 内）→ **对已注册星球预览全 403**。修正：授权面=账本注册星球（`workspaceFileGuardError` 增 allowedAbs 参数，两路由传 `loadPlanets` resolve 集），war_root 包含只覆盖沙盒自建工作区；name 相对+不越 ws 两道闸对两类一视同仁（穿越/绝对路径拒绝实测不变）。守卫机测补注册星球直读+穿越仍拒两断言。DOM 探针（scripts/probe-sd-b2-md.py）实弹：合法星球过 ws 闸、穿越与绝对路径 body 拒绝。附带：e2e 考题工作区残留清理（run-e2e 自清理前残留）、批2 内联 DOM 取证沉淀为可复跑探针（决策带速览/任务书 md/端点守卫三断言，产物 chip 预览为种子条件断言）。

### Changed
- **板面收敛：读 + 下令入口，动作归聚焦页定夺点**（舰长令「账面变更类按钮全部住在读得到上下文的地方，卡面只留导航」）——①命令卡 R5「进入对话」（markTalking 账面变更）与「改直发」（regrade 账面变更）退役：点卡即进聚焦页，答澄清走置顶决策带、改档走配置段，R4 preflight 行退为纯读提示；②任务卡处理钮「去验收/去下重试令」由直跳大副会话改路由聚焦页对应段（reported→report/failed→chain，与收件箱同映射），会话直达降级为聚焦页底部跳钮；③copy `preflight.toDirect` 四典同删（copy-lang 键形锁两侧同删自动过）、死样式清理。保留辨析：收件箱 clarify 跳会话（澄清定夺点本是对话）与聚焦页内部会话直跳不动。决策录 DESIGN.md V20 节。
- **zh 侧星域图例词面跟上 V19.5 雷达机制**（军事+平话两皮肤）：「✓凯旋 · 呼吸光点=执行中」→「虚线追踪环=执行中 · 铭牌读数=兵数▸状态」（平话「虚线环=进行中 · 名牌读数=人数▸状态」）——V19.5 回流已把 2D 雷达的扩散脉冲/驻军弧退役成旋转虚线追踪环+引线铭牌读数，EN 词典（随 stardeck 来）早已是新机制描述，zh 源串此次补齐；trek 派生随词表自动跟。

## [0.20.2] - 2026-09-04

### Added
- **stardeck 回流·批5（中英双语 i18n）** —— 自 stardeck 2026-09-02「支持多语言」定案回流：①copy.ts 新增**语言正交轴**（`LangId='zh'|'en'` / `setLang` / `langId` / `subscribeLang` 与皮肤共用监听集，`activeCopy()` 先按皮肤取典再按语言换库，localStorage `warroom-lang` 持久；`trekifyCopy` 词表参数化——EN trek=军事英典过 EN 词表，与中文侧同机制派生）；②新 `src/client/copy-en.ts`（enWarCopy/enPlainCopy 逐键英译+EN_TREK_LEXICON 词表；以本仓审计轮正典词面为锚、stardeck 参考版过滤掉本仓未回流特性键后重衍——键形机测锁死缺键/多键/叶型不符即 FAIL，不许静默回落中文；边界：i18n 只覆盖板 UI 措辞，账本与提示词资产保持中文 agent 面正典）；③设置抽屉新增「语言 / Language」段（中文/English 两选项钮，切换即时全板换库不刷新）；views 两订阅点补 `subscribeLang` 轴（ WarView/WarDockPill）。取证：tests/copy-lang.test.ts 六测（键形对齐×2/换库行为/EN trek 派生/语言键四键/正典词面不被侵蚀）；DOM 探针 5/5（EN war 标题/中文钮全板活切/persist/无 pageerror）；EN 全板截图 .goal/evidence/sd-backport/b5-en.png 肉眼复核（UI 全英、账本内容保持中文）。verify 311 测 PASS + 新针脚 warroom-lang。
- **stardeck 回流·批4（--war-fs 字体缩放）** —— 自 stardeck V19 回流：设置抽屉新「字体大小」滑杆（85%–135%，步进 0.05，实时倍率读数+重置钮，localStorage `warroom-cfg-zoom` 持久）；`--war-fs` CSS 变量基值挂 `.war-root`（views 根内联注入，React 自定义属性无空格写法）+ styles.ts 全量字号换血——155 处 font-size 与 26 处 px 行高改 `calc(Npx*var(--war-fs))`（`font-size:0` 语义技巧与无单位行高、canvas HUD `font:` 简写随 stardeck 口径保持原样），布局尺寸一律不动、文字原盒内换行适应；verify 增两针脚（基值+calc 形态）锁机制。取证：war-tokens 全套机测仍绿（令牌架构零扰动）；DOM 探针 7/7（scripts/probe-sd-b4.py：持久化读取→内联变量→计算字号 16.8px=14×1.2、滑杆拖动回写、重置）；×1.35 截图 .goal/evidence/sd-backport/b4-zoom-135.png 肉眼复核（字号全面放大、布局不变形）。verify 305 测 PASS。
- **stardeck 回流·批3（V19.5 贾维斯雷达 + 铭文防撞 + 星域空场根修 + critique 择项）** —— 自 stardeck V19/V19.5 四组回流：①**2D 雷达重绘**（新纯函数 `planCallouts` 引线铭牌摆放：出环短须→折臂→水平铭牌，侧别朝盘外+同侧 y 堆叠 minGap 防撞+越界翻侧，铭牌下挂「N▸状态」微型读数；`createConicGradient` 扫描波束随 t 旋转 clip 盘内；执行中星球改缓慢旋转虚线追踪环（波束扫过增亮）替代旧扩散脉冲；reticle 四向刻度须只在高亮时出现；驻军弧退役（读数进铭牌）；V18.2 弧排铭文退役，verify 针脚同步换新）；②**3D 铭文防撞**（新纯函数 `truncateForArc`：弧排预算内省略号截断、'…' 计入预算绝不超线；字号下限 15→20；截断名存 userData.labelName 曲率重绘同源取用；2D 星域标签新纯函数 `planetLabelCaps` 邻球间距收紧 max-width（cqw 随窗缩放）+ `.war-starfield` container-type:inline-size）；③**星域空场根修**（未注册工作区编队不再整滴丢弃：3D 挂懒建 HQ 锚位 ensureHqAnchor、执行卡锚 scene.hqScreen/tac.hqPoint、2D 挂 hqMoonPos 近地轨道；0 星球空场 HQ 信标慢呼吸+常驻水印 .war-wz-empty；编队在外而星球零注册时一次性 hqGuide toast（15s 退场+7 天冷却）引导注册）；④**critique 择项**（档位 chip 并入状态 chip 作 `war-chip-grade` 档位色后缀（title 带分诊理由）；岛计数「等你」段退役（与收件箱语义重叠，入口留给 ✉ 徽标）+「等·参谋」→「接令中」（平话「规划中」）；talking 态预检提示 hintTalking 两步语义；2D 雷达图例拆两行；浅色 HUD 墨色 #4a648a→#24405c（对天空 4.9:1）；读屏 live 区 war-sr-only 播 footStat）。词典 starfield 增 hqGuideToast/emptyWatermark、preflight 增 hintTalking（三皮肤派生随词表）。取证：planCallouts/truncateForArc/planetLabelCaps/hqMoonPos 纯函数机测；DOM 探针 9/9（scripts/probe-sd-b3.py：chip 后缀/岛计数/标签 cqw/live 区）；2D 雷达+三皮肤截图 .goal/evidence/sd-backport/ 肉眼复核通过。verify 305 测 PASS。尾注（收尾补强轮）：scripts/probe-sd-empty-click.py 10/10 闭合空场/HQ 兜底与星球点击跨页签两处 DOM 断言缺口——路由拦截 board 清空 planets：.war-wz-empty 常驻水印渲染（role=status）且 hqGuide toast 15s 退场后仍在、未注册编队执行卡不隐藏且 SVG 线星球端（x1,y1）锚在 __wz.hqScreen()（dist=0）；拦截翻任务造跨页签前提后 canvas 实点低档星球：页签 commit 到已收官页且 1.2s 复查不弹回、粘性聚焦卡钉住、.war-pipe-map g.on 管线在场（判据①③ DOM 断言补全）。
- **stardeck 回流·批2（战报可读性包：md-lite 铺面 + 产物板内预览）** —— ①新纯函数层 `src/client/report-face.ts`（零 DOM 零词典：looksLikeFilePath 路径判定含版本号假阳性收紧/splitInline 行内切词/parseMd markdown-lite 块解析「宁拙勿崩」/pinFinalMessage 随件保留），tests/report-face.test.ts 四测锁定；②dashboard 新增 `GET /warroom/api/workspace/file`（workspaceFileGuardError 双重限界守卫：ws 限 war_root 内+name 限相对路径，穿越/绝对路径/跨任务全拒；512KB 封顶+首 1KB NUL 二进制嗅探）与 `POST /warroom/api/workspace/reveal`（本机资源管理器，账本零改动）——守卫四拒/封顶/二进制机测入 dashboard-routes；③views 四位点 md 铺面：任务卡计划/任务书（路径链化到该任务工作区预览）、空链呈批计划、决策带计划原文速览（details 常驻可展开，planPeek 词典键）+ 战报正文 reportBody 渲染；④产物板内预览弹窗 ArtifactPreviewModal（md 走 reportBody、文本 pre 直出、二进制给指路）+ files 交付物逐文件可点 chip；⑤词典 focusPage 增 8 键（preview*/lootFileTitle，三皮肤派生随词表）。DOM 取证：决策带/任务卡两表面 .war-md 结构渲染通过、端点线上守卫生效（截图 .goal/evidence/sd-backport/）。verify 301 测 PASS。

### Fixed
- **stardeck 回流·批1（三 bug 药 + 战报纪律进正典）** —— 自 stardeck V19/V19.5 回流四件：①**war_publish commandId 改必填**（孤儿任务=哨位误判命令未发布而重复补发的根因——缺参被工具参数校验直接拒收，测试断言拒收+账本零写入）；②**composer 移到 FocusPage 之后渲染**（两弹窗同用 .war-modal-backdrop 同 z——DOM 靠后者在上，聚焦页里「下续战令」开起草器此前会被盖住）；③**星球点击聚焦改页签 commit**（此前只 applyTabPreview 瞬时预览：点击落定时 tier===shown → 预览自清 → 板面弹回原页签 → 高亮卡卸载、管线消失；改真切换+重粘 planetPreviewWs+新增 scrollFamilyIntoView 双 rAF 滚族卡入视界修复管线锚）；④**战报纪律进 relayPromptFor 两通道**（base+分诊块：「战报=给舰长的最终答复：首句直接回答任务的问题，关键发现列点，产物逐一给相对路径，不复述执行过程」——大副写进任务书验收区，外勤照此交卷）；AGENTS 坑录补执行者工具通道环境坑（zcode 无头不加载 .mcp.json/控制台 curl GBK 乱码）。verify 296 测 PASS（快照门重生成随批）。



## [0.20.1-1] - 2026-09-02

### Fixed
- **CI 发版门：预发布版本（v0.x.y-N 刀数段）npm publish 需显式 `--tag latest`** —— v0.20.1-1 是包改名后第一个走 CI OIDC 的刀版，npm 拒绝无 `--tag` 地发布 semver 预发布版（publish.yml 旧写法只发过无刀数段版本故未暴露）；publish.yml 显式钉 latest（本项目刀版即最新正式进展；无刀数段版本本就默认 latest，写显等价）。

### Added
- **文案审计轮·挂账清偿（两门实弹 + 三皮肤目检，2026-09-02）** —— ①`verify:eval` 接 LookatStudy 网关（Z_AI_*→OPENAI_* 映射）实弹 **2/2 PASS**（正向 R3 轨迹放行、负向幽灵任务回报 veto——裁判消费的正是批次5 重写后的正典用例）；②`verify:e2e` 清场实弹 **C1-C8 全绿 PASS**（真实 LLM 两代续接链：**新协议标记【星球：】全链走通**、T1 归因锁双侧命中、KillCredit 收官机制经 smoke extraFeatures 覆盖；证据 .goal/evidence/e2e/）——首跑失败暴露 exam-e2e.py `find_cmd` 抓首个同 tag 命令、板有历史 E2E 残留时 token 从旧任务找而崩：修为**恒取最新**（commandId 最大），「操场直接跑」承诺在重跑场景下成立；③新增 `scripts/shoot-skins.py` 三皮肤整板截图工具（入口开关防呆：板已开不重复点击）；playground 三步播种后 trek/war/plain 三皮肤目检通过——trek 无军事源串泄漏、war 恢复纯军事词面（批次2 正名实证）、plain「3 轮 · 2 件事」等修正生效，批次3 重构（WzStatus/入典）真实浏览器无恙（截图 .goal/evidence/audit-skins/）。

### Changed
- **文案审计轮·批次6（文档门面与现状声明对齐）** —— README：标题「作战室」→「舰桥」（与正文§舰桥/侧栏入口一致）、四段生命条「战报」→「任务回报」、角色表（贴身参谋会话→贴身对话者、按兵种…部队→按组员编制…编队）、KillCredit 行改「机械复核+舰长定夺（强制人工验收）」、「全绿自动收官」宣称同步正名、快速开始「npm（发布后）」→「0.20.1 已发布」+tgz 版本号校正、账本「三条流」→「四条流」；package.json description 重写为现役语义（captain/XO/away-team/evidence-based acceptance——随下次发版上 npm 面）；PRODUCT.md 全文正典化（舰长/大副/外勤小队、三皮肤、V16 词表定案入 Anti-references）+守护态注记；AGENTS.md：**开局必读死链修复**（.goal/SPEC.md 已不存在→改指现存 SPEC-B1/B2 两册，历史 SPEC v1-v8 注明退役）、头部「当前版本 V16/SPEC v9/README 版本史」三重过时声明校正（迭代已至 V18.x、版本史=CHANGELOG）、§6/§9 死引用落地、源码地图过时行全面校正（relay=大副·+文案已迁 prompts.ts、client 三页签、dossier/units/schedule/types/config 旧词、tests 计数 48、浏览器工具清单换现行+归档注记）、overlay 枚举补 forensic、考题残留目录更新（temp/e2e-exam-ws）、playground 节用词、两盘镜像注明；VERIFICATION.md §8.1（trace 端点已交付+四条流）/§8.3（flags 默认全开+staff-auto-close 例外）/§8.5（大副/外勤小队/去验收+SPEC 死引用落地）校正；overlays：dev/smoke/forensic 注释示例 ../dsh-plugin-warroom 死路径→stardeck（commit 82ff5de 只改绝对路径漏了三处相对路径）、dev-on.yml file:// 引用改按包名（自述规则合规）。verify PASS。

### Fixed
- **文案审计轮·批次5（机检针脚复活 + e2e/eval 正典化 + 考古归档）** —— ①verify.mjs 两条 V16 改词时被机械扫成 trek 词而**永久空转**的负针脚复活（「开设大副部」→「开设参谋部」、「去处理 · 大副会话」→「去处理 · 参谋会话」——真退役串守卫重新上岗）；空转正针脚「去处理」删除（:267/:268 去验收/去下重试令已覆盖）+ views.tsx 四处喂饱针脚的注释残字清理；②**现行 e2e 门协议标记切正典**：exam-e2e.py 实发命令【战场：】→【星球：】（此前自称覆盖【星球：】实则只跑旧标记路径）+头部三处 v15 旧自述正名（assert-e2e.py/evidence/e2e）+「参谋接收」→「大副接收」；assert-e2e.py 判据词面（战报→任务回报、参谋侧/指挥官侧→大副侧/外勤小队侧）；③监督层 eval/tests.yaml 全文正典化（元首→舰长/参谋→大副/**从未存在过的「司令」→外勤小队**/作战室→舰桥/战报→任务回报/「参谋·」→「大副·」——git 实证 V16 后仍在编辑却未清）+eval/README 同步；④现行 shooter 词面（shoot-activity「交战报」→「交任务回报」、shoot-composer 参谋→大副、shoot-v17 断言消息）；⑤**考古层归档 scripts/archive/**（16 个：exam-v3/v4/v5/v15、assert-v5/v15/final/v4、shoot-board、probe-card、probe-v4、probe-v112(+closeup)、forensics-grade-marker-d350、shoot-grade-marker×2——死针脚/旧词/被取代的双胞胎；移前逐一核对 run-e2e/verify/run-eval/package.json 无现行引用，run-e2e.mjs 注释随改）；probe-v188 expect_front 死变量清理。verify PASS；verify:eval 与 verify:e2e 环境不具备如实 SKIP（网关未接/smoke 服未起——exam-e2e.py 改了协议标记，下轮起服后应实弹跑一次它自己的门）。
- **文案审计轮·批次4（宿主侧「前线」定名 + 军味词清账，舰长定案）** —— ①**front（外勤组员目录边界）宿主侧定名「前线」**：此前与客户端「星域=星域地图」同词双义（persona 明文定义 星域=front）——persona 7 处/units 9 处/tools 6 处/prompts 1 处/rules 1 处全部改叫前线，「战线隔离」标题随之「前线隔离」，客户端「星域=地图」独占该词；index.ts 征召兜底「新星域」→「新星球」（它指的就是星球）；②军味词随提示正典化：战况→近况（chainDigest 兜底/chain-note 父代段/persona/tools 卡题）、战役背景→任务背景、【战地直讯】→【组员直讯】+参战方→通话方（persona 纪律与 tools 投递头双侧同步改）、侦察兵「敌情」→「侦察」、chainOutcomeOf/buildChainNote「败退」→「挫败」（与客户端词表一词一面）；③行话清理：dashboard/index 错误消息去内部 API 名与裸 RPC code（「workspace.list 面缺席」→「宿主工作区清单暂不可用」、错误码后置括号、404「no such route」中文化「路由不存在」、「等大副第一轮 war_triage 入账」→「等大副完成第一轮分诊」、approve/reject 中文注义）、goals objective「disarm」→「不触发执行」、rules 拒因去英文枚举尾。快照全族重生成（commander/staff/troop/mailbox/chain/pivot/scheduler/kickoff）；词锁测试随正名同步 8 处（rules 前线冲突/chain-note 挫败/relay 近况不详/staff-plan+triage+v5-spike 路由不存在/troop-mailbox+scheduler 通话方）。verify PASS。
- **文案审计轮·批次1（错字+与现行决策矛盾的提示词/工具描述）** —— ①「任务令令起草法」双「令」系统性错字修正（skill.ts 标题与 description、prompts.ts relay 模板、persona.ts 大副条令共 4 处；快照 fixtures 5 文件 7 行随改，verify.mjs:164 针脚三方同步，起草法标题「warroom 大副」顺正名「舰桥大副」）；② rules.ts「任务任务回报」叠字 ×2；③ wake.ts 唤醒摘要删「L0 全绿自动收官已由系统判定」——与 staff-auto-close 默认 OFF（2026-09-01 舰长令：强制人工验收）正面冲突，改「回报验收由舰长定夺」；④ war_publish 描述补 L0 直发无需批准（与 staff-triage 默认 ON 自洽）、war_close_task 删不存在的「打回可重新领取」路径、war_status 状态集对齐 unitStatusLabel 实况（已收编→已撤编）；⑤ /war 激活回执重写（大副当值，删英文残句）+ /war /peace 面板描述中文化；⑥ directives 400 文案去「仗/阵地/接火」冷僻军词；⑦ dossier/rules 收官空 verdict 兜底「验收通过」（不再渲染「收官（）」）。verify PASS（快照门 4/4）。

### Changed
- **文案审计轮·批次3（客户端硬编码入典 + WzStatus 重构 + 两处行为修复）** —— ①views.tsx/warzone-scene/shell-entry/inbox 约 20 处绕过词典的硬编码迁入词典：改档 title（「舰长改档」同概念与词典「元首改档」双名归一）、下达失败/注册失败/清单缺席兜底、关闭 aria、进入对话钮、证据行「X 过/Y 败」（入典后军事「折戟」/plain「失败」）、战线 chip 代际词、时间词组（relTime/formatWait「刚刚/N 分钟前」）、分诊置信度（「置信」→「置信度」）、战线头「星球：」标签（军事源「战场：」）、侧栏入口后缀（trek=舰桥 · 战略任务栏、plain=工作台 · 跨工作区看板）——「所有文案只从 copy.ts 取」契约补全；②**WzStatus 中文词面当判别值的结构性风险清除**：类型改 'wait'|'battle'|'held' 英文枚举（views 生产点/starfield3d 消费点/休眠 demo 状态机全链），显示词经新纯函数 `wzStatusText` 词典派生并加单测钉死（词典改词不再静默失配）；③bridged 速报日志（出击/返航）入典（wzLogSortie/wzLogReturn）并修复 syncBoard 末尾整组清空把速报抹掉的顺序 bug（速报此前从未可见）；④**cancelledNote 三元错接修复**：取消原因在卡面名存实亡（布尔恒挂 is-fail、永不渲染）→ 恢复显示；⑤「未分组」星球名改绘制点查词典（换肤即时换词，plain 显示「杂项」）。verify PASS（新增 wzStatusText 钉测；浏览器目检未跑——本地无运行中的服，改动为文案路由与两处纯逻辑修复、无布局变更）。
- **文案审计轮·批次2（皮肤词典正名：军事源串回归词表源词，trek 派生逐字不变）** —— 军事词典里误写的 trek 正典词全部改回军事源词：composer 星球/战线选择器与 starfield hqPicker 整段（星球→战场、星域→战区）、星域日志/驻军行（达成→凯旋，hqRow「N 仗」→「N 次」）、archive.gate（挫败→折戟）、logReview（任务回报→战报）、图例战线环行——军事皮肤不再两套词并存，trek 皮肤输出与改前逐字一致（活跑 trekify 抽查 19 键实证）。平话皮肤清戏剧词：cmdTabs「已收官→已完成」、reportVerdict「收官结论→最终结论」、hqOff/legendFront/kbGroupAria「战线→事项线」口径、genN「N 代→N 轮」。词表补丁：新增 司令部→星舰（hqOn/hqOff 派生「星舰在线/入坞状态——星舰熄灯」，与 returnHq 星舰收敛一词一面）、战况→近况、待进攻→待出动；reportQueued 源串「开战后→出动后」免开战词条；TREK_FIXUPS 的平话词「项目」改协议中性词「工作区」（trek 地图提示不再冒出「项目」）。loading 两句「任务栏」→「作战室」（trek 派生「连接舰桥」，plain 本就「看板」——三皮肤板名归一，舰长令定案：宿主侧 21 处 LLM 协议词「任务栏」不动）。杂项去行话：图例「received 命令」、挂载弹窗「thread 会话号」、failToast「旗关」。skin.test 全绿（stale 词断言天然通过——新源值均为词表源词）。


## [0.20.1] - 2026-09-01

### Changed
- **包改名：dsh-plugin-warroom → dsh-plugin-stardeck（元首令 2026-09-01，与独立版 stardeck 家族统一）** —— npm 包名不可改，本版为**新包首发**（版本谱系承接 0.20.x，不重启）；旧包 `dsh-plugin-warroom`（0.19.0/0.20.0）原地 deprecate 立指路碑。GitHub 仓同步改名 `Kaiji-Z/dsh-plugin-stardeck`（旧链接自动重定向）。仓内 60 文件随改（package.json/RELEASE 常量/CI/overlays 插件名/commands.ts 插件源标识/styles.ts STYLE_ID/@module 注释/README/AGENTS/VERIFICATION）；本地仓库文件夹名与 CHANGELOG 历史节、DESIGN 决策录保留旧名（前者是本地路径语义，后两者是历史记录不改史）。安装侧：`dsh plugin add dsh-plugin-stardeck`。首发方式=手动 `npm publish` bootstrap（勘误：npm 没有 pending publisher 机制——那是 PyPI 的概念；包须先存在才能配 Trusted Publisher；v0.19.0 同款路径，不打 tag、CI 不跑），配好三元组后下一版起 tag→CI OIDC 接管。
- **所有回报强制人工验收（舰长令 2026-09-01）** —— `staff-auto-close` 移出默认开清单：KillCredit 证据机械全绿也不再自动收官，任务一律停在 `reported` 等舰长定夺（收件箱「等你定夺」承接）。机制保留为 opt-in（env 显式开，或新增 `config.extraFeatures` 装配层附加旗——smoke overlay 即用此法，e2e 考题 C1b/C8 继续覆盖收官机制本身）；env `!name` 仍可压掉 extra。新增 2 组旗测试锁死新默认（含 DEFAULT_ON 不含 staff-auto-close 断言）。
- **独立纪元分家：内核全面移植为 stardeck（v0.1.0），本仓转守护态（元首令 2026-09-01）** —— R0 可行性实弹先行（9/9：node:http 裸服 + MCP 领令牌→真干活→KillCredit 判绿→人工验收收官，全程零 dsh；证据 `.goal/evidence/r0-spike/`）；随后 27 模块 1:1 移植为新仓 **stardeck**（星舰甲板：agent 无关 daemon + stdio MCP 桥 + opencode 执行者适配器 + 板 UI 独立挂载；266 测 + verify 零宿主负针脚 + 实弹门 10/10）。本仓继续以 dsh 插件形态维护（bug 修复守护态，内核同名文件改动前先 diff 两仓；远期可改依赖 stardeck-core 收编消灭双维护）；README/AGENTS 已加分家指引。

### Fixed
- **CI OIDC 发版流水线首跑打通（0.20.0 发版过程修复）** —— 两坑：①CI linux 上 `pnpm install` 撞 `onnxruntime-node` 构建脚本严格审批（promptfoo optional 原生链）——`allowBuilds` 显式补 false；②测试套首次在 linux 上跑，五处 Windows 路径假设平台参数化（工作区大小写归一仅 win/darwin、越界外部路径 posix 用 `/` 绝对式——语义零改动，win 本机 292 全绿 + linux CI 全绿双验证）。流水线自此从手动发布转 release.mjs 一条命令自动发。

## [0.20.0] - 2026-09-01

本批（B1+B2，goal 驱动两轮）：后端本职六件全交付并实弹验证（板读缓存/trace 端点/
装配层测试/提示词资产化+快照门/生命周期闭环/工作区收官清理）；提示词最小充分审查
（契约修正+重写收敛，实弹全链 90 秒闭环）；验证体系三层齐装——监督层首弹实弹过门。

### Added
- **监督层首次实弹过门（B2 后置轮，2026-08-24 挂账清账）** —— 裁判 glm-5.2 接真网关（LookatStudy `.env` 的 z.ai 兼容端点映射 OPENAI_*）：`pnpm verify:eval` 2/2 PASS——正向（R3 八步真实轨迹）10/8/10 无否决（裁判对模糊时间戳/概述描述实质扣分，≥7 门实证真严）；负向（幽灵战报）一票否决四条全中。配套三修：provider `passthrough.thinking.type=disabled`（z.ai 网关 glm-5.2 默认开 thinking 吃光输出预算致判决 JSON 截断——promptfoo config 不透传任意字段必须走 passthrough）；断言双向收紧（无 `{"achieve"` 真 JSON 即 FAIL 防空输出假阳性）+ 抽取取最后段防花括号误配；R3 正向夹具战报补全五条验收逐条判定（对齐真实 war_submit evidence.checks 逐项行为；判据通过条件原样未放宽，负向用例一字未动）。坑录与首跑分数入 eval/README.md，AGENTS P1 挂账同步清账，取证 `.goal/evidence/b2-live/`。
- **提示词最小充分审查（B2，重写收敛尺度）** —— 审查正本 `.goal/SPEC-B2.md`（23 份资产逐份裁决表：18 份快照资产 + troop 五件新入册）。**契约修正×3**：分诊/计划/拆解的教学参数名 `command_id`→`commandId`（对齐 war_triage/war_plan/war_decompose schema——旧教学会被 additionalProperties:false 剥参、靠模型自纠空转）；新增契约一致性机检测试（四处 camelCase 逐字断言 + snake_case 负断言）。**重写收敛**：起草法 4292→3720（-13%，锁定针脚全保）、大副条令 2724→2558、外勤条令 3078→2913（出口协议段零触碰）；旧 18 份总量 33812→31430（**-7.1%**），单发最大注入（大副全量）6495→5920（-8.9%）。**实弹行为回归全链 90 秒闭环**：下达→分诊一次到位（L0/0.95）→发布→领取→submit 三项证据→KillCredit 全绿收官，零重试零纠偏（取证 `.goal/evidence/b2-live/`）；监督层 verify:eval 显式 SKIP（GLM 网关未接）。全量 292/292 绿。
- **板读路径 mtime 指纹缓存（B1-件③）** —— campaigns/directives/threads/planets 四路 JSONL 装载此前每次全量重读重解析（板请求、引信 tick、SSE 周期全是 O(总事件数) 磁盘读）；新 `src/fold-cache.ts` 进程内 mtime+size 指纹缓存（与 boardRevision 同判据：append 必变 size），未变更零重读、append 即失效。读计数器单测 5 例（tests/fold-cache.test.ts）；全量 252 测全绿（基线 247）。
- **命令追踪端点 `GET /warroom/api/trace?commandId=<id>`（B1-件②）** —— VERIFICATION.md §8 P2 挂账兑现：单命令全事件时间线（directive + campaign 原始事件）+ 板投影任务面（attemptLog/queueAhead/quotaPaused）+ 引信视角（待转达/定时未发）+ 征召视角（spawned 守卫、去抖拒因——「为什么还没动」机器可查）。只读调试面，板读投影红线不动；三态专测 5 例（tests/trace-endpoint.test.ts），全量 257 测全绿。
- **装配层与新路由测试补强（B1-件④）** —— 此前零覆盖的四块补齐 19 例：征召器装配层（满编门/spawn-once 守卫/孤儿会话复用/工作区占用排队/patrolNow 补征——`createConscriptor` 开测试出口、`patrolNow` 改可 await）；dashboard 新路由（**archive 不可逆写通道六态**：面缺席 501/缺参 400/未知 404/已归档 400/链未终局 400/全成落账 + 部分失败如实 + 全败 502；host-sessions、host-workspaces、planets POST）；planets 注册库纯函数；state tiny-pointer。全量 276 测全绿。
- **提示词单一资产源 + 快照门禁（B1-件①）** —— 宿主侧提示词模板正文从 relay.ts/index.ts 的散落字面量收拢进 `src/prompts.ts`（征召令 relayPromptFor/转达 pivotPromptFor/战线档案段 chainArchiveSection/外勤征召令组装 commanderOrderFor；persona/skill/chain-note 经其汇出）；`tests/prompts-snapshot.test.ts` 全文快照门——**改任何措辞必须显式再生成 fixtures 并随改动评审**（`WARROOM_UPDATE_SNAPSHOTS=1`），verify 另加源级负针脚（relay/index 长文案字面量清零）；**出口协议段（war_claim 令牌/war_submit/war_fail/war_comment/KillCredit）点名断言为不可裁剪内容**。纪律条目固化 AGENTS.md。17 份快照 fixtures；全量 279 测全绿。
- **worktree 收官清理（B1-件⑥）** —— auto+repo 分支的 linked worktree 此前只建不清（`.warroom/tasks/` 下 detached worktree 无限堆积）；现随**链归档** best-effort 释放（触发点定案=归档而非任务终态：任务产出活在 worktree 里，直接终态即删会摧毁 deliverables 与续接前情）。`workspace.ts releaseTaskWorkspace` 三道保险（物化根 tasks/ 路径范围 / linked worktree 判据 / 主仓 remove --force 失败留置），bound/instance/普通目录永不触碰；成败都落 `workspace_released` 事件（fold 投影 workspaceReleased）并随归档响应如实返回。真 git 仓实跑单测 5 例；全量 284 测全绿。
- **会话生命周期闭环（B1-件⑤）** —— 三断点补齐：①孤儿会话 GC——任务终态（收官/败局用尽）清征召器内存表，`CommanderOps.forget` 接线；②孤儿落盘 `orphans.json`（tiny-pointer 同 state.json 先例）——插件重启不再失忆、旧孤儿会话不再变永久垃圾；③**in_progress 死会话 rescue**（V10.1 挂账兑现）——90s 巡检对「claimer 无活体 agent 且未配额暂停」的搁浅任务先 `agents.resume` 续命（宿主源码考古证实：resume 存在、owner=agent 服务自持、持久队列自动重放）+ 续行提示入队（prompts.ts rescueNudgeFor，快照门覆盖）；resume 连败 ≥2 次才判死回栏（防 persistence 瞬时打嗝烧 attempt），面缺席只记拒因留置（trace 可见）。spike 报告 `.goal/evidence/b1-resume-spike.md`；生命周期单测 7 例；全量 291 测全绿（基线 247）。
- **B1 实弹验证轮（隔离 smoke 板，取证 `.goal/evidence/b1-live/`）** —— 杀服重启场景 rescue 首弹三发全中（3 条搁浅 in_progress 全部 resume 续行，二轮巡检静默零误回栏）；重派外勤经续行链真弹 **KillCredit 机械全绿自动收官**（验收 4 项全过/退出码 0/无越界）；trace 端点/SSE revision-only/征召拒因日志/终态 forget 落盘 orphans.json 全部 live 验证。实弹校准语义：宿主对已建会话保持活体 agent——「已建≠搁浅」，真正搁浅=重启后冷会话。

### Fixed
- **`pnpm install` 死于构建脚本占位符** —— d7614e4 误把 pnpm 引导的 `pnpm-workspace.yaml` 占位符（"set this to true or false"）提交入库，pnpm 11.7 安装一律 ERR_PNPM_IGNORED_BUILDS 失败、连带 `pnpm run`/verify 全挂；填成显式布尔（esbuild:true 维持，其余 false=维持从未构建的现状）后恢复。

## [0.19.0] - 2026-08-31

首次 npm 上架（手动首发，绑定 trusted publisher 后转 release.mjs 自动发版）。

### Fixed
- **浅色 3D「太阳中间一颗灰点」（元首实抓，像素取证四层剥洋葱）** —— 真因链：太阳球芯被 ACES 色调映射封顶在 ~0.9 灰白（229,229,229），而它的加法光晕在亮天上钳成纯白盘（255）且盘比球大——芯比自己的晕暗=灰点。终修：白昼隐藏晕 sprite（暖意交给 CSS 暖霞，家视图同位）；远景云漂过相机平面时投影除零把 opacity 永久污染成 NaN（不透明白云糊屏=白盘真身）——视空间前置检查+非有限跳过+中毒救回。
- **浅色天穹重做** —— 天顶 azure→天际暖白的真天穹梯度（旧 #c9e5f8→#f5faff 苍白如雾）；阳光斑弱化为暖霞（亮度压到太阳芯之下）；白晕影 .55→.3；雾色随新天际。
- **HQ 注册弹窗滚动结构** —— 旧整个弹窗滚（标题跟着清单跑）；改头部/提示定死+清单体内滚+节头 sticky（43 行清单滚到哪都知道身处哪组）。（元首实抓）

### Added
- **npm 发布机制就绪（参考 LookatStudy 同款）** —— `scripts/release.mjs` 一条命令发版（verify 门→净树门→bump→tag→push→轮询 npm；关键词双轨：milestone/major=里程碑、iteration/minor=迭代、knife/patch=刀）+ `.github/workflows/publish.yml` GitHub OIDC 可信发布（零 npm token 存储，v* tag 触发，普通 push 永不发版）。首次发布前需在 npmjs.com 预登记 pending publisher。

## [0.18.9-6] - 2026-08-30

### Changed
- **HQ 注册弹窗布局重排** —— 分组两段（已在星域 / 可注册）+ 两行行卡（星球名+操作在上、路径副行在下）+ 弹窗内滚；全套项目令牌，双主题随令牌适配。（0.18.9-4）

### Fixed
- **管线残留（元首实抓）** —— 悬停 pager 星球后，任何后续悬停（含空白处）都有管线赖着不走。根因：族系管网的 React 键用了裸 rootId，续接/拆解链一个根多条命令时撞键，生产版协调错乱把上一族的 `.on` 残留在 DOM。键改为「根：锚命令 id」；悬停同根多命令=多管同亮（族系语义不变）。（0.18.9-1）
- **管线审查整改五连（impeccable 双子代理实证）** —— ①族系去重一根一族：根坞卡缺席时画出的「穿空幽灵干线」除名；②组面板内历史卡不做锚：面板展开不再被管线垂直穿透；③沟带被面板全占时命令腿让位不画（不退化成斜线穿卡）；④任务→战报顶沟钳到列头下缘；⑤圆角弯头 rr 死代码修复（旧式恒 0——弯头自 V17 起从未渲染过）。附：定时 chip 暗色对比 4.17→≥4.5（前景下沉令牌层 `--war-sched-text`）；已归档空态渲染安神行而非空盒。probe-pipefix 8 断言 + shoot-v17 ⑧（8 paths / 0 穿卡）。（0.18.9-5）
- **浅色 3D 云二修** —— 远景云环路过画面正中时逐帧淡出（投影点距屏幕中心过近即隐身），八朝向扫描取证全净。（0.18.9-6）
- **HQ 注册弹窗「不是项目里的弹窗」（元首实抓）** —— 点击 HQ 后弹出的注册工作区面板裸渲染 `war-modal`，缺背板包装：无 fixed 定位、无遮罩、不居中，以文档流内联在星域容器里。补齐全项目统一的 背板 + 点击停传播 + 焦点圈 三件套。（0.18.9-3）

### Added
- **README 公开化 v2** —— 创作初衷成文（侧栏之痛 → 命令切入 → 星际迷航范式）+ GitHub 最佳实践结构 + docs/ 四张暗色实拍（星域/舰桥/起草器/聚焦页）。仓库公开发布：github.com/Kaiji-Z/dsh-plugin-warroom（MIT），`.goal/.impeccable/shots-v182` 过程目录转本地不入库，历史重写 362MB→1.9MB。

## [0.18.9] - 2026-08-30

### Changed
- **起草器视觉精修（impeccable 口径）** —— 区块标题收成 mini-header（上 16 下 6 呼吸节奏）；闹钟簇（模式+时刻+预览+高级）包进 well 面板读成一个单位；输入件底色一族一致；sticky 提交条与弹窗面接缝消除。

### Fixed
- **浅色 3D 四连（元首实测五条令）** —— ①云层推远景环 950-1500（结构上不可能再遮挡）+ 积云剪影贴图；②浅色铭牌白描边垫底+深墨填色（地图标签术），任何背景可读；③浅色 HQ 重制为天空旗舰（暗色星舰同轮廓同契约，白昼材质语系：实色深蓝舷窗/normal 混合软雾替代加法辉光）；④浅色状态语义升级平铺色环垫+缘环同材质双件——细管环日光不可见是旧观感根源。

## [0.18.8] - 2026-08-30

### Added
- **起草器重设计（元首五条令）** —— ①常用命令模板 5 枚（每周总结/依赖巡检/测试巡检/文档同步/代码审查）贴输入框点击即填；②星球→战线融合选择器：先选星球才展开该星球战线行，续接必随星球（结构性不可能「续接 A 星球战线发到 B 星球」）；③闹钟式定时：单次/每天/工作日/每周… 模式 chips + 原生 date/time + 下次触发预览，`buildAlarmCron` 纯函数生成 cron，高级面板保留直写；过去时刻就地报错（不拦会静默滚到明年）。

### Removed
- **最近命令** —— 分散注意，整体退役（代码/样式/词典三处根除）。

## [0.18.0 – 0.18.7] - 2026-08-29 → 2026-08-30

### Added
- **星球=真实工作区** —— 星域星球绑定宿主真实目录，HQ 点击注册已有工作区为星球；未分组沙盒合成一颗行星。
- **星域悬停/聚焦重梳（V18.2-V18.4）** —— 悬停卡只留 名/路径/状态（完整路径换行不省略）；战线列表进悬停卡；点击星球=聚焦态，悬停卡钉住成可交互窗口（战线行点击进聚焦页），聚焦期其他星球零悬停事件。
- **弧形铭文** —— 星球名恒定屏字号 12px 弧排于星球上缘，面向镜头不被遮挡；曲率动态适配星球屏半径（贴 limb 外 4px），远界放平悬上方；2D 同语言（上缘外弧+身份色分段战线环）。
- **皮肤全量跟随** —— 星域内所有卡面词表随皮肤派生（trek 运行时变换结构性保证）。

### Fixed
- **halo 覆写潜伏 bug（V18.2）** —— V17 压暗逻辑 find 首中 halo，每帧覆写状态脉动为常数，shoot 断言一直靠 bug 的常量通过；改 userData 定点定位 + lerp 时间归一。
- **铭文脱锚（V18.5 元首圈认）** —— 弧曲率原为画布常量，只有近景对位；改随星球屏半径动态重绘。
- **impeccable critique 三轮 28→33→34（V18.1）** —— 列头计数切片口径/归档空态安神/管线指路 toast/终局带二态/岛「等你」段/续接折叠/3D foot 避让/useModalLayer 焦点归还系统性修复。

## [0.17.0] - 2026-08-29

### Added
- **三页签全局切片** —— 进行中/已收官/已归档；命令归档（终局闸+原地二次确认），归档会话从宿主冷列表消失。
- **族系管网** —— 坞→任务→回报的族系连线，仅 hover 显形、随战况生长（stage 截段：未到回报的族不铺回报腿）；map 态走面板缘外 8px 定沟，卡锚缺席按 kind 寻址防「穿空幽灵干线」。
- **页签图标组** —— icon 化页签（全名在 aria），调度栏定高 218。

## [0.16.0] - 2026-08-29

### Changed
- **星际迷航语义统一（元首定案）** —— 角色 舰长—大副—外勤小队（原元首—参谋—指挥官）；舰桥/星球/任务令/任务回报/星舰/出航入坞全套词表；trek 皮肤=军事词典运行时派生（TREK_LEXICON），改一处三皮肤同步；host 侧 persona/tools/skill 同正典。英文标识符与 war_* 工具名永不动。
- **V16.1-V16.5** —— 侧栏收起只留图标；平话语系 64 处（工作台/助理/干员/任务单）；`pnpm verify:e2e` 实弹考题回归门常驻；e2e transcript 体检四修。

## [0.15.0] - 2026-08-28

### Added
- **续接闭环** —— 链档案三档注入（大副档案 1500/征召令 600/pivot 400：上代战报+产物路径+diffstat+败因），续在成果上不重做；战线命名（下达可选 ≤24 字）。
- **workspaceKind 投影** —— kind 感知战场键，auto-worktree 归未分组治误判。

### Fixed
- **实弹考题抓出三真 bug（V15.1）** —— war_publish 悬空批准死锁（工作区路由前置零写入）；引信双开竞态（tickNow×15s 撞车双参谋，fuse 在途守卫）；参谋会话绑 warRoot 工作区（宿主侧栏从幽灵变居民）。勘误：宿主冷列表是慢不是坏——起服 ≥15s 再采样。

## [0.13.0 – 0.14.0] - 2026-08-28

### Changed
- **战线范式收口（元首定案）** —— 血脉除名：**战场⊃战线⊃命令**；战线=命令的聚合绑一颗星球，续代跨战场自立新战线（origin 溯源 chip 一枚可点的事实）；聚焦页本地计代；链色绑战线；composer 显式星球选择。

## [0.12.0 – 0.12.2] - 2026-08-28

### Added
- **浅色范式：星空→天空** —— 浮空岛（王国之泪层岩+纳格兰垂坠石）/层级=任务量/达成碑/基座环+执行光柱；空中要塞 HQ。
- **语义 token 化全项目重铸** —— 三层令牌（基元/语义 `--war-*`/场景开关），war-tokens.ts 唯一色源 + 双向锁死哨兵；组件区裸色清零；critique 35/40。

## [0.11.0] - 2026-08-27

### Added
- **3D 星域战场** —— NASA 自然色星球（六原型确定性绘制）/星舰 HQ/编队相位状态机/雷达值班态；V11.5 起真实板数据驱动（星球=workspace 任务量、WAR LOG=真实事件流），demo 自驱退役。

## [0.10.0] - 2026-08-26

### Added
- **战线续接三模式** —— deepen/retry/pivot；世代徽标+族谱面包屑；星域战场视图（同心椭圆恒星系/凯旋印记/视图开关）。

## [0.9.2 – 0.9.13] - 2026-08-25 → 2026-08-26

### Added
- 定时命令真闭环（directive cron→30s tick→引信常轨）；聚焦页（一条命令的四段导览）+ 任务段 12 态状态机；任务列台账化+执行卡实时活动行（宿主 session→动词映射）；战报已阅转绿；hero 灵动岛；命令调度中心（三级布局+命令卡唯一详情入口）；`--war-*` 语义令牌双主题色彩系统（状态四档语义：蓝=机器在动/琥珀=等你/绿=善终/红=败）。

### Fixed
- 多轮 impeccable critique 闭环 23→35/40：对比度批修 5.8-6.9:1、五弹窗焦点圈、Esc 层协调器、键路死角、语义 token 回退哨兵。

## [0.7.0 – 0.9.1] - 2026-08-25

### Added
- **到访式工作流** —— 收件箱四类待发落、到访摘要（last-seen delta）、族系悬停+聚焦、夜间预检（改直发出口）、「为什么还没动」解释行、空板引导。
- **hero 灵动岛** —— 胶囊岛收编全部操作件（hover 展开+点击钉住）。
- **命令调度中心** —— 三列局势墙+底部命令调度条；命令卡=唯一详情入口。

## [0.6.0] - 2026-08-25

### Added
- 计划判定回推（pushToStaff）；双皮肤系统（军事/平话）；命令拆解成链（deps 链级同工作区）；goal 接力原子性补偿（60s 扫补）；三区看板+命令全生命周期；**flags 默认全开政策**。

## [0.5.0 参谋自动化（AFK）] - 2026-08-25

### Added
- 三档自主度 L0/L1/L2（`war_triage` + `!!直接做`/`??先看方案` 覆写）；计划态插件自建（`war_plan` 呈批+发布硬门）；goal 代管（CAS 链、指挥官 armed/参谋 disarm 红线）；KillCredit 全绿自动收官；分级推+去抖唤醒+板摘要注入；配额熔断（原地暂停恢复）。真实 LLM 全链考题达标。

## [0.4.0] - 2026-08-25

### Added
- 部队级模型路由 / 队内邮箱 / 任务图调度 / park 换手。

## [0.3.0] - 2026-08-24

### Added
- 每命令一参谋会话 relay / 纯跳转判定 / 挂载外部会话。真实 LLM 八步考题驱动。

## [0.2.0] - 2026-08-24

### Added
- 五分区悬赏板 / 命令区生命周期 / 多指挥官并行 / 履历档案 / `@new:` 新副本。

## [0.1.0 悬赏令] - 2026-08-23

### Added
- 首个可用版本：参谋起草 / KillCredit / 失败自愈 / cron / SSE 实时板。
