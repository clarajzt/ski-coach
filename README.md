# Ski Coach · 滑雪教练

**Live:** https://clarajzt.github.io/ski-coach/

A ski coach that runs entirely in the browser. Drop in a clip of your skiing; a pose model running on your own device measures edging, balance and rhythm, tells you what to fix first, and builds a drill plan around it. English and Chinese, light and dark, phone and desktop.

一个完全在浏览器里运行的滑雪教练。拖入一段滑行视频，姿态模型直接在你的设备上测量立刃、重心和节奏，告诉你最该先改什么，并据此生成训练计划。中英双语，深浅色，手机和桌面都适配。

No account, no server, no upload — the video never leaves the device.
无需账号、没有后端、不上传视频——视频不会离开你的设备。

## What's inside · 功能

| | English | 中文 |
|---|---|---|
| **Analyse** | On-device pose estimation (MediaPipe Pose, WASM/WebGL) with a skeleton overlay, a 7-dimension technique profile, a 1–6 level estimate and up to three prioritised findings — each with what was seen, why it matters, one feel cue, matching drills and a jump to the exact moment. | 本机姿态估计（MediaPipe Pose，WASM/WebGL），骨架叠加、七维技术画像、1–6 级水平估计，以及最多三条按优先级排序的问题——每条都包含看到了什么、为什么重要、一句体感提示、对应练习，并可跳到视频里的那一刻。 |
| **Demo skier** | A procedural skier driven by a kinematic model. Pick a level, switch faults on (back seat, banking, A-frame, rotation…), change the camera, and watch the same engine diagnose it live. | 由运动学模型驱动的模拟滑雪者。选择水平、打开各种毛病（后坐、内倒、A 字腿、甩肩…）、切换机位，同一套引擎实时给出诊断。 |
| **Plan** | A session plan built from the findings: warm-up, drill block, one cue for free skiing, re-film. 19 drills with steps, terrain and feel cues. | 根据诊断生成的上雪计划：热身、专项练习、自由滑的一句提示、再拍一段。19 个练习，含步骤、适用雪道和体感提示。 |
| **Lab** | Interactive carving physics: speed, edge angle and sidecut radius → turn radius, leg load, the lean needed to balance, and a map of where a balanced carve exists at all. | 可交互的卡宾物理：速度、立刃角、侧切半径 → 转弯半径、腿部负荷、平衡所需内倾，以及“平衡卡宾”在什么范围内成立。 |
| **Log** | Ski days, terrain mix and analysis history, stored in `localStorage`, with JSON export/import. | 滑雪日、雪道构成和分析历史，保存在 `localStorage`，支持 JSON 导出/导入。 |

## How the analysis works · 分析原理

Each sampled frame yields 33 body landmarks. `js/engine.js` turns the sequence into metrics:

- **Edging** — inclination of the feet→hips line, measured in the pelvis frame; turns are the alternating lobes of that signal, with edge changes interpolated between samples.
- **Angulation** — how much more upright the torso stays than the legs at the apex.
- **Fore-aft balance** — where the centre of mass sits relative to the ankles along the direction the skier faces.
- **Flexion** — knee angle and how much it changes through the turn.
- **Stance & legs** — stance width, knees-vs-feet separation (A-frame), wedge detection.
- **Upper body** — hand position, and whether the shoulders turn into the turn ahead of the hips.
- **Rhythm & symmetry** — spread of turn durations (median/MAD) and left-vs-right peak lean.

Every number carries a confidence that depends on the camera angle: lateral metrics need a front or rear view, fore-aft balance needs a side view. With a panning camera each metric uses only the frames whose view supports it. Clips the model could barely follow are refused rather than scored.

每一帧得到 33 个人体关键点，`js/engine.js` 把整段序列换算成上述七个维度的指标。每个数值都带有随机位变化的置信度：立刃、反弓、节奏需要正面或背后机位，前后重心需要侧面机位；镜头摇移时，每个指标只使用机位支持它的那些帧。姿态模型基本跟不住的视频会被直接拒绝，而不是给出一个分数。

These are heuristic estimates — a training aid, not a certified assessment.
以上均为启发式估计，仅作训练参考，不能替代持证教练的评估。

## Tests · 测试

The procedural skier doubles as a test rig: it commits a known fault and the engine has to find it.

```bash
npm test
```

34 tests cover fault detection for every modelled fault, level ordering, turn detection and timing, camera-view gating, left/right robustness (rear view, swapped skeleton), tracking drop-outs, the carving physics, EN/ZH string parity and drill-plan construction.

## Run locally · 本地运行

Static files, no build step.

```bash
npm run serve
```

Then open http://localhost:8877.

## Layout · 目录

```
index.html          page shell
css/style.css       styles (light + dark)
js/engine.js        pose frames → metrics, scores, findings   (pure, tested)
js/skier.js         procedural skier → pose frames             (pure, tested)
js/physics.js       carving mechanics                          (pure, tested)
js/drills.js        drill library, plan builder
js/i18n.js          all strings, EN + ZH
js/video.js         MediaPipe wrapper, frame stepping
js/render.js        canvas scene, skeleton overlay, SVG charts
js/lab.js           carving lab UI
js/app.js           wiring
vendor/mediapipe/   pose runtime + model, served from this origin
tests/              node --test
```

## Credits · 致谢

- Pose estimation: [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 0.10.14 and the Pose Landmarker (full) model, © Google, Apache License 2.0 — vendored unmodified in `vendor/mediapipe/`.
- Everything else: MIT, see `LICENSE`.
