# CLAUDE.md — 指板罗盘（Fretboard Compass）

给 AI 协作者看的项目约定。**这些约定是踩过坑换来的，改动前先读完。**

## 项目是什么

把「乐理 → 指板位置」实时映射出来的吉他学习工具。选调 → 看全指板调内音 → 选和弦 → 看所有可弹指型 → 点几个音反推和弦 → 看乐理深度建议。

技术栈：Vite 5 + React 18.3 + TypeScript 5.6 + Zustand 4.5 + Vitest 2.1。**没有 Tailwind**，样式全在 `src/index.css`，主题色走 `:root` 的 CSS 变量。

## 命令

```bash
npm run dev      # 开发服务器，5173 端口
npm test         # 106 个测试，必须全绿
npm run build    # tsc --noEmit && vite build，两边都得过
node scripts/audio-check.mjs   # 音频自激检查（headless Chrome 离线渲染，不需要 dev server）
node scripts/dom-audit.mjs     # 指板坐标核对（需要先起 5173 的 dev server）
```

改完 `src/theory/` 之后**必须**跑 `npm test`。测试红了不许收工。

`npm run build` 产出**单文件** `dist/index.html`（`vite-plugin-singlefile` 把 JS / CSS 全内联）。这是「双击就能用」的唯一形态：`file://` 下浏览器会以 CORS 拦截外部 module 和 stylesheet，所以不要把产物拆回 `assets/`，也不要删掉这个插件。

## 硬约定（违反会算错乐理）

1. **PitchClass 用 0–11，0 = C。** 不要引入 `{ letter, accidental }` 之类的对象表示，会传染。
2. **弦索引 0 = 6 弦（最低音 E），5 = 1 弦（最高音 e）。** 所有 `frets[]`、`midi[]`、`pcs[]` 数组都是这个顺序，长度 6。
3. **fret 0 = 空弦。** 不存在「-1 表示空弦」。
4. **`Tuning` 存绝对 MIDI，不存音高类。** 指板、音频、指型搜索共用一套坐标系；音高类判断不了「哪根弦的 C 更低」，贝斯音判断会错。
5. **变调夹只限制可弹的品，不改变音高。** `isPlayableFret(fret, capo) = fret >= capo`。这是唯一能和任意调弦正交组合的模型，别改。
6. **罗马数字的升降记号永远相对大调音级**（`MAJOR_STEPS = [0,2,4,5,7,9,11]`）。A 小调的 bVII 是 G，不是 F#。
7. **升降号拼写看调号，不看音高类。** 统一走 `keyUsesFlats()` 和 `pcName(pc, flats)`；借来的和弦一律用降号。
8. **`src/theory/` 是纯函数层，禁止 import React / store / DOM。** 它要能原样搬到 CLI 或移动端。
9. **指板方向：6 弦（低音 E）在最下面，1 弦在最上面。** 和看谱、抱琴的习惯一致。弦索引仍是 0 = 6 弦，只在渲染时翻转：`yOf(s) = TOP + (5 - s) * GAP`。加任何按 y 坐标算弦号的反向逻辑（`scripts/dom-audit.mjs` 的 `strOfY`）都要跟着翻转，否则调试输出会误导人。
10. **拨弦波形在 JS 里离线算（`renderPluck`），播放走 `AudioBufferSourceNode`。禁止改回 Web Audio 的 `DelayNode` 反馈环。** 浏览器会给**环里的** DelayNode 额外加一个渲染量子（128 采样 ≈ 2.67 ms）的延迟：低音 E2 周期 582 采样，多 128 → 偏低 255 音分；高音 E6 周期 36 采样 → 直接偏两个八度。这条是实测出来的，公式里没有。
11. **环路用整数延迟，音高靠 `playbackRate` 在环外校准。** 环内做分数延迟要插值，插值对高频有衰减、而且**每个周期衰减一次**：高音一秒过 1300 个周期，0.35%/周期就是 −80 dB/s，高音半秒就没了。现在 `renderPluck` 取整数周期 P 合成（音高 = `(fs/P)·(1+φ/2π)`，用 `loopFrequency` 二分求出），再返回 `rate = 目标频率 / 实际频率`，由 `pluckOn` 设给 `playbackRate`。
12. **反馈增益必须严格 < 1，系数一律用 `biquadCoefficients()` 自算的 RBJ 系数（线性 Q ≤ 0.707）。** **不要用 `BiquadFilterNode.Q`**——Web Audio 把 lowpass/highpass 的 Q **按 dB 解释**，Q=0.5 实测峰值 1.2015、Q=1 是 1.2533，乘上反馈就 >1，点播放直接啸叫。环路里还必须有隔直高通（低通对直流增益是 1，不掐会累到 25 倍）。改 `KS` 常量前先跑 `src/audio/__tests__/engine.test.ts`，它 import 的就是线上那份系数。
13. **所有发声都要经过 `masterBus()`**（总音量 → `DynamicsCompressor` 限幅 → 扬声器）。扫弦是 6 个音叠加，峰值必超 1.0，绕过限幅器就是削波爆音。音量存 localStorage，`setMasterVolume` 用 `setTargetAtTime` 避免拉滑块时爆点。
14. **音频改动必须在真实浏览器里用 `OfflineAudioContext` 渲染验证**，不能只靠 Node 里的公式推导——Q 的 dB 解释、渲染量子延迟、`playbackRate` 重采样这些浏览器行为，公式里根本没有。`scripts/audio-check.mjs` 会把打包后的 engine 注入 headless Chrome，**同时量音高（容差 10 音分）和逐 0.5 秒峰值（出现增长就是自激）**。
15. **测 KS 波形的基频别用自相关 / YIN。** 衰减 + 谐波丰富的信号会让自相关锁到次谐波（实测把 85.88 Hz 报成 81.6 Hz），高音段还能报出 67 Hz。统一用 Hann 窗 + 零填充 FFT（2^18）+ 抛物线插值，并且**只在期望频率 ±15% 内找峰**（全局最大峰会测到高八度）。
16. **固定音色只做「环外」后处理**（`src/audio/engine.ts` 的 `TIMBRE`，原声钢弦）：高通/低通 IIR、lowshelf 箱体、软削波、并联卷积混响。不要为了音色去改 KS 环路系数或反馈增益；正因如此 `pluckCache` 不需要按音色分键。混响是 `master → reverbSend → Convolver → wetTone → wet → limiter` 的并联支路，湿声也必须进限幅器。软削波曲线在 0 附近斜率必须是 1，否则会把衰减尾音重新放大，`audio-check` 的「峰值单调下降」会红。

## 架构约定

- **`buildModel(input)` 是唯一的派生入口**（`src/theory/model.ts`）。UI 组件不自己算乐理，只渲染 model。加新功能时先想清楚输入是什么 state，然后加到 `ModelInput` / `FretModel` 里。
- **进行卡片：点击 = 试听 + 设为当前和弦，悬停 1 秒 = 从卡片正下方弹出替换层**（`ChordSwapPopover`）。悬停计时器要在 click 里取消——触屏 tap 也会先触发 `mouseenter`，不取消的话 1 秒后会莫名弹层。
- **store 只存「用户选了什么」**：调、音阶、调弦、变调夹、当前和弦、进行、已按的音。任何能从这些推导出来的东西都不进 store。
- **进行的替换存相对级数的偏移**：`progressionOverrides[index] = { rootOffset, typeId }`，不存绝对根音——整个进行必须跟着换调移调，存绝对音高换调就会停在老地方。`chooseProgression` 换进行时清空所有 overrides（索引全失效）。`ResolvedChord.baseTypeId` 是进行默认类型，「还原」时连同 `setChord(baseRootPc, baseTypeId)` 一起拉回，否则指板还亮着旧和弦。
- **自建进行（`customSteps`）存绝对根音**，非 null 时优先于 `progressionId`，换调不跟着移调——那是用户从五度圈点名的音。从库里进行第一次拖入时，把当前 `resolvedProgression` 固化下来当底稿并**清空 overrides**（替换已经烘进绝对根音里了）；之后的自建插入 / 删除必须用 `shiftOverridesAfterInsert/Remove` 平移 override 索引，否则替换会跟错卡片。
- **保存进行存的是「眼下听得见的和弦」**（`chords.map(...)` 的绝对根音 + 类型），不是 `customSteps` 底稿——手动替换已经烘进 resolved 里，存底稿会把替换丢掉。列表落 localStorage（`fret-compass-saved-progressions`），载入后是自建进行，换调不跟着移调。
- **已保存进行可以覆盖或另存**：`savedProgressionId` 记录手上这条来自哪个条目；`saveProgression(name, steps, overwriteId?)` 传 id 时原地更新（保留 id / createdAt），不传就新增，并返回 `{ id, name, overwritten }`。`loadSavedProgression` 设置来源 id，`chooseProgression` / `beginCustom` 清空，删除当前条目时只清来源 id、不删指板上的内容。UI 在编辑态同时给「覆盖原进行」和「另存为新进行」。**别把编辑后的保存一律做成新增**，否则库会被副本淹没。
- **每和弦的播放把位按卡片索引存**（`progressionVoicings[index]`，值是 `positionsFor()` 的下标，null = 默认紧凑声位）。插入/删除用 `shiftIndexedAfterInsert/Remove` 平移；替换和还原必须清掉该级数的把位，否则形状和声音对不上。
- **五度圈内圈 = 外圈的关系小调**，第 i 格 `mod(majorPc + 9, 12)`（C → Am）。内圈点击/拖拽默认 m7，外圈默认属七；`isMinorChordType()` 按三音判断，别用 typeId 字符串猜。
- **五度圈拖拽用 pointer 事件**（`CircleOfFifths` 只管画，`ProgressionBar` 管落点）：超过 6px 才算拖，落点索引由卡片 DOM 的中点算，不靠 DOM 顺序。占位槽 `.prog-drop-slot` 从 0 宽度长到 104px，插到两张卡中间时后面的卡片被挤开的动画就来自这里。
- **进行播放按 AudioContext 绝对时间排程**（`useProgressionPlayer`）：`setInterval` 只负责「往前看 0.3 秒把该响的音排进去」，当前小节由 `now()` 反算，不用 `setTimeout` 累加拍子。改速度 / 拍号时已经排出去的小节撤不回来，所以直接重新起拍。
- **级数显示以当前和弦的根音为 1**：有和弦时走 `chordDegrees`，只给和弦内音标级数（G7 → G=1、B=3、D=5、F=b7），其余调内音退成小圆点；颜色用 `intervalClass(mod(pc - chordRoot))` 按和弦功能上色，不再套调内级数。级数模式下「音阶音」图层禁用；没有当前和弦时整块指板不标任何级数。
- **「和弦音」在两种显示模式下含义不同**：音名模式关掉它只是取消和弦高亮——功能色、白圈、选中把位圈和指型框消失，调内音名保留并变成中性灰（只要「音阶音」还开着）；级数模式关掉它则整块指板不画任何音。`notesVisible = displayMode === 'degree' ? showChord : showScale || showChord`，别把两种模式都写成「关了就全空」。
- **清除当前和弦时 `clearChord` 会同时把 `showChord` / `showBoxes` 设为 false**：没和弦就没有高亮可谈，图层自动取消，音名模式落到全灰的调内音名。
- 指型搜索有模块级缓存（`voicingCache`，键为 `root:typeId:tuningId:capo`），400 条时清空。改缓存策略前先量性能。
- 组件测试用 `react-dom/server` 的 `renderToString`，**不装 jsdom**。新增页签时给 `AnalysisPanel` 传 `initialTab` 以便覆盖。

## 代码风格

- **中文注释，英文标识符。** 注释写「为什么」，不写「做了什么」。
- 不动格式、不重排 import、不顺手重构无关代码。一次只改一件事。
- 不引入新依赖前先问。

## 已踩过的坑（别再踩）

| 坑 | 症状 | 修法 |
|----|------|------|
| 指型跨度初值传 0 | `×35553` 这种低音弦闷音的指型被当成跨度 5 误杀 | 用 ±∞ 起手，叶子上算真实跨度 |
| 把位去重只判严格重叠 | 8 品横按旁边又冒出一个框，视觉糊成一团 | 品区相接时再看按压位置是否重合 ≥2 处 |
| CAGED 模板套非标准调弦 | DADGAD / FACGCE 算出错音 | 用通用搜索（`findVoicings`），CAGED 只当验收参考 |
| `identify` 的 required 检查里写了 `break` | 只校验了第一个必选音程 | 去掉 `break` |
| 导音线直接用进行里的三和弦 |「7 音」那行永远是「—」 | `asSeventhChord()` 升成七和弦 |
| `scale.minorish` 是 `boolean \| undefined` | `tsc` 报 TS2322 | 显式 `!!scale.minorish` |
| KS 低通用 `BiquadFilterNode` + `Q` | 点播放就啸叫，振幅每半秒涨 5 个数量级 | Web Audio 的 lowpass/highpass Q 按 **dB** 解释；自算 RBJ 系数，见硬约定 12 |
| 用 Node 公式"证明"音频没问题 | 单元测试全绿，浏览器里照样啸叫 | 音频必须用 `OfflineAudioContext` 在真实浏览器里渲染测峰值和音高 |
| 在 Web Audio 里搭 KS 反馈环（DelayNode） | 整个音阶偏低 255 音分，高音低两个八度 | 环里的 DelayNode 多算一个渲染量子（128 采样）；改成 JS 离线合成 + `AudioBufferSourceNode`，见硬约定 10 |
| 环内做分数延迟（线性插值） | 低音略偏低、高音半秒就没了 | 插值每周期衰减一次高频；改整数延迟 + `playbackRate` 环外校准，见硬约定 11 |
| 用自相关 / YIN 测 KS 的基频 | 85.88 Hz 报成 81.6 Hz，高音报成 67 Hz | 用 Hann 窗 + 零填充 FFT + 抛物线插值，且只在期望 ±15% 内找峰，见硬约定 15 |
| 试听和弦写死 `48 + 音程` | 进行里点 G 和弦，听到的是 C 和弦，指板却高亮 G | 一律走 `closeVoicingMidis(rootPc, type)`，别再手写 48 |
| 反馈增益写死 0.96 | 低音拖 2 秒、高音一出声就没了 | 按频率反推 `feedbackFor(freq)`，由目标 T60 算每周期保留多少 |
| 清理定时器用 `(t + duration)` 当延时 | AudioContext 时间被当成墙上时钟，节点几分钟不释放 | 减掉 `context.currentTime`，并 clamp 到 ≥200 ms |
| 按弦号 min/max 算把位框上下界 | 指板翻转后框会跑到屏幕外或高度为负 | 翻转后直接取 `yOf()` 结果的 min/max |
| 图例色点只写 CSS `fill` | 图例圆点一直透明，圈里的音却有颜色 | 图例是 HTML `<span>`，`fill` 对 HTML 无效；`.note--*` 必须同时声明 `background` |
| 调内「其他音」配色太亮 | 指板上 24 个灰点压过 4 个和弦音，看不出和弦形状 | 数量最多的类别必须贴近底色（`--other: #5f584d`），靠标签提亮而不是靠填充 |
| 暗底配灰字 | 整体发闷、小字看不清 | 背景可以暗，文字必须亮：`--text` 接近暖白，`--muted`/`--dim` 只做层级、不做「省电」 |
| 进行替换存绝对根音 | 从 C 换到 G，替换过的和弦还停在 C 调的位置 | 存 `rootOffset` 相对偏移，`resolveProgression` 里 `mod(baseRootPc + offset)` |
| 还原只清 override 不同步当前和弦 | 卡片回到 G7，和弦面板/指板还亮着 C#7b9 | `setChord(baseRootPc, baseTypeId)`，`baseTypeId` 由 `resolveProgression` 一并给出 |
| 插入自建和弦后不平移 override 索引 | 原来第 3 张卡的替换跑到了新插入的卡上 | `shiftOverridesAfterInsert/Remove`，删除时被删位置的 override 直接丢掉 |
| 先 `setActiveStep` 再 `setChord` | 刚插入 / 刚联动到的卡片不亮，`activeStep` 被 `setChord` 清成 null | store 的 `setChord` 会清 `activeStep`，要反过来：先 `setChord` 再 `setActiveStep` |
| 播放用 `setTimeout` 累加拍子 | 主线程一卡，节拍越走越漂 | 绝对时间排进 AudioContext，`setInterval` 只做 look-ahead 泵，见架构约定 |
| 拖拽落点用 DOM 顺序猜 | 插到错误的两张卡之间，或者右边溢出时插到末尾 | 用 `getBoundingClientRect()` 的中点算插入索引，并把行外 26px 也算作有效落点 |
| 弹层按视口高度往上顶 | 展开后盖住和弦卡本身，「正下方」的约定就没了 | 空间不够时压矮弹层（inline `maxHeight`）让内容内部滚，footer 用 `position: sticky` 钉住，应用按钮永远够得着 |
| 合成 `MouseEvent` 测悬停 | React 的 enter/leave 要对 `relatedTarget`，合成事件经常不触发 | 用 CDP `Input.dispatchMouseEvent` 发真实鼠标移动，等真实计时器到点再截图 |
| 把位选择区放在弹层最底部 | 600px 的滚动容器把它裁到视口外，鼠标移过去点到的其实是页面，弹层当场关掉 | 播放把位放在弹层最前面，选完再改和弦；测试里先确认 chip 在弹层 rect 内 |
| 自建进行保存 `customSteps` | 手动替换过的和弦在保存/载入后全变回底稿 | `doSave` 一律存 `chords.map(...)`，把 override 烘进绝对根音 |
| 编辑已保存进行后点保存一律新建 | 库里全是「进行 副本 副本」，原条目永远不更新 | 记 `savedProgressionId`，覆盖走同一 id 并保留 `createdAt`；另存才生成新 id |
| 音色后处理改到 KS 环路里 | 音高/衰减跟着变，缓存还要按音色分键 | 固定音色只做环外滤波/削波/混响，见硬约定 16 |
| 级数按调内音级算 | 选 G7 后 G 显示成 5、B 显示成 7，整块指板还是 C 大调的颜色 | 级数相对当前和弦根音，只标和弦内音，颜色按和弦功能 |
| 把「关和弦音」当成所有模式的清空开关 | 音名模式下取消和弦高亮，调内音名也跟着消失，指板全空 | 音名模式保留灰色调内音；只有级数模式才清空。指型框、把位圈随和弦高亮隐藏 |

## 视觉验收

改了指板渲染，别只看截图——用 CDP（headless Chrome）把 SVG 元素坐标导出来核对。例如和弦音白圈的坐标集必须和 `chord.pcs` 完全对应，这比肉眼看图可靠得多。

```bash
node scripts/dom-audit.mjs      # 需要先在 5173 起 dev server
```

它会打印：把位框的品区范围、每个框的指法、所有和弦音白圈换算成的「弦/品」，以及 SVG 实际显示尺寸。当前快照存在 `docs/shots/`。
