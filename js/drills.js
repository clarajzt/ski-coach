// drills.js — the drill library and the logic that turns findings into a session plan.

export const DRILLS = [
  { id: 'shuffle', focus: ['backseat'], group: 'balance', lv: [2, 5], terrain: 'green',
    name: { en: 'Shuffle turns', zh: '滑步转弯' },
    how: { en: ['On an easy slope, make medium turns at moderate speed.', 'Shuffle your feet back and forth — small, quick, continuous — all the way through each turn.', "Wherever the shuffle stalls is where you fall back: slow down and repeat."],
           zh: ['在缓坡上用中等速度做中弯。', '整个转弯过程中，双脚小幅、快速、不停地前后交替滑动。', '滑步在弯的哪个位置停住，就说明你在那里后坐了：放慢再来。'] },
    feel: { en: "You can only shuffle when you're centred.", zh: '只有重心在中间，脚才滑得动。' } },
  { id: 'hops', focus: ['backseat', 'stiff'], group: 'balance', lv: [2, 5], terrain: 'green',
    name: { en: 'Hop turns', zh: '弯中小跳' },
    how: { en: ['Traverse, then start a turn.', 'Make 3–4 small two-footed hops through the turn — tips and tails leave the snow together.', 'Land softly on the whole foot, not the heel.'],
           zh: ['斜滑降起步，然后开始转弯。', '在弯中做 3–4 次双脚小跳——板头和板尾同时离雪。', '全脚掌轻轻落地，而不是脚跟。'] },
    feel: { en: "If only the tips come up, you're in the back seat.", zh: '如果只有板头抬起来，说明还在后坐。' } },
  { id: 'taillift', focus: ['backseat', 'banking'], group: 'balance', lv: [3, 6], terrain: 'blue',
    name: { en: 'Tail-lift turns', zh: '抬板尾转弯' },
    how: { en: ['In each turn, lift the tail of the inside ski a few centimetres.', 'Keep its tip on the snow the whole time.', 'Hold it from the start of the turn until the skis point across the hill.'],
           zh: ['每个弯都把内侧板的板尾抬起几厘米。', '板头始终贴在雪面上。', '从入弯一直保持到雪板横过来。'] },
    feel: { en: "Tip down means you're forward and standing on the outside ski.", zh: '板头贴雪，说明重心靠前，而且站在外侧板上。' } },
  { id: 'tray', focus: ['handsLow', 'backseat'], group: 'upper', lv: [1, 4], terrain: 'green',
    name: { en: 'Carry the tray', zh: '端托盘' },
    how: { en: ['Lay both poles across the backs of your hands, palms down, like a tray.', 'Ski easy turns without letting the poles roll off.', 'Hands stay forward, level and in sight.'],
           zh: ['双手手背朝上，把两根雪杖横放在手背上，像端托盘。', '做轻松的弯，别让雪杖滚落。', '双手保持在前、放平、留在视线里。'] },
    feel: { en: 'Hands forward pulls the whole body forward.', zh: '手在前面，整个人就跟着往前。' } },
  { id: 'outside', focus: ['banking', 'asym', 'lowEdge'], group: 'balance', lv: [3, 6], terrain: 'blue',
    name: { en: 'Outside-ski turns', zh: '外侧板单脚转弯' },
    how: { en: ['Lift the inside ski fully off the snow as you start each turn.', 'Balance on the outside ski all the way round.', 'Set it down, switch feet, repeat. Do extra sets on your weaker side.'],
           zh: ['入弯时把内侧板完全抬离雪面。', '整个弯都只靠外侧板保持平衡。', '放下、换脚、重复。弱侧多做几组。'] },
    feel: { en: 'Level shoulders make this easy; leaning in makes it impossible.', zh: '肩膀放平就很容易；往里一倒就站不住。' } },
  { id: 'poledrag', focus: ['banking'], group: 'edging', lv: [3, 6], terrain: 'blue',
    name: { en: 'Outside pole drag', zh: '外侧杖拖雪' },
    how: { en: ['Hold the poles mid-shaft, arms wide.', 'Through every turn, drag the outside pole tip on the snow.', 'Keep the inside hand high — both tips never drag at once.'],
           zh: ['握住雪杖中段，双臂打开。', '每个弯都让外侧杖尖持续拖在雪面上。', '内侧手抬高——两根杖尖不能同时拖地。'] },
    feel: { en: 'Reaching down with the outside hand tilts the shoulders the right way.', zh: '外侧手往下够，肩膀就会倾向正确的方向。' } },
  { id: 'schlopy', focus: ['banking', 'lowEdge'], group: 'edging', lv: [4, 6], terrain: 'blue',
    name: { en: 'Schlopy drill', zh: '推髋练习（Schlopy）' },
    how: { en: ['Outside hand on the outside hip, inside arm reaching forward and up the hill.', 'Push the hip into the turn with your hand as the skis tip onto edge.', 'Switch hands at every edge change.'],
           zh: ['外侧手按在外侧髋上，内侧手向前、向山上方伸出。', '雪板立刃的同时，用手把髋推向弯内。', '每次换刃时换手。'] },
    feel: { en: 'Hips move in, chest stays out over the outside ski.', zh: '髋往里走，胸口留在外侧板上方。' } },
  { id: 'javelin', focus: ['banking', 'rotation', 'aframe'], group: 'upper', lv: [4, 6], terrain: 'blue',
    name: { en: 'Javelin turns', zh: '标枪转弯' },
    how: { en: ['Lift the inside ski and cross its tip over the front of the outside ski.', 'Hold the cross through the whole turn — hips keep facing the lifted tip.', 'Uncross, change feet, turn the other way.'],
           zh: ['抬起内侧板，把板头交叉到外侧板前方上空。', '整个弯保持交叉——髋部始终朝向抬起的板头。', '收回、换脚，转向另一边。'] },
    feel: { en: 'The crossed ski locks your hips to the outside: instant angulation.', zh: '交叉的雪板把髋“锁”向弯外，反弓自然就出来了。' } },
  { id: 'frame', focus: ['rotation', 'handsLow'], group: 'upper', lv: [2, 6], terrain: 'green',
    name: { en: 'Pole picture frame', zh: '雪杖取景框' },
    how: { en: ["Hold both poles together horizontally at arm's length, like a frame.", 'Pick a target straight down the hill and keep it inside the frame.', "Make short-to-medium turns: the legs turn, the frame doesn't."],
           zh: ['双手横握两根雪杖，手臂前伸，像一个取景框。', '在山下正前方找一个目标，始终把它框在里面。', '做中小弯：腿在转，取景框不动。'] },
    feel: { en: 'Legs steer underneath a quiet upper body.', zh: '上身安静，腿在下面转。' } },
  { id: 'hockey', focus: ['rotation', 'lowEdge'], group: 'upper', lv: [2, 5], terrain: 'blue',
    name: { en: 'Hockey stops', zh: '冰球急停' },
    how: { en: ['Run straight down a short pitch.', 'Pivot both feet across the hill and set the edges to stop — chest still facing downhill.', 'Alternate sides; finish balanced, not falling uphill.'],
           zh: ['在一小段坡上直滑降。', '双脚同时横转并立刃刹停——胸口仍然朝向山下。', '左右交替；停稳时保持平衡，不往山上倒。'] },
    feel: { en: "Feet turn 90°, shoulders don't.", zh: '脚转 90°，肩膀不转。' } },
  { id: 'pivot', focus: ['rotation'], group: 'upper', lv: [4, 6], terrain: 'black',
    name: { en: 'Pivot slips', zh: '原地搓转（Pivot Slips）' },
    how: { en: ['Sideslip straight down the fall line in a narrow corridor.', 'Pivot both skis 180° underneath you, flat on the snow, and keep sideslipping.', 'Upper body faces downhill throughout; no travel across the hill.'],
           zh: ['在一条窄通道里沿滚落线横滑降。', '雪板放平，在身体下方整体搓转 180°，继续横滑。', '全程上身朝向山下；不向两侧横移。'] },
    feel: { en: 'Pure leg rotation — the separation test instructors use.', zh: '纯腿部转动——教练考核上下身分离的经典动作。' } },
  { id: 'railroad', focus: ['lowEdge', 'aframe', 'wide'], group: 'edging', lv: [3, 6], terrain: 'green',
    name: { en: 'Railroad tracks', zh: '铁轨弯' },
    how: { en: ['On a flat, quiet run, stand hip-width and let the skis run straight.', 'Roll both ankles and knees a little to one side, then the other — no steering.', 'Look back: two clean pencil lines, no smear.'],
           zh: ['在平缓、人少的雪道上，双脚与髋同宽直滑。', '两侧脚踝和膝盖同时轻轻往一边滚，再滚向另一边——不要拧板。', '回头看：雪面上应是两条干净的细线，没有搓痕。'] },
    feel: { en: 'The skis turn you; you only tip them.', zh: '是雪板带你转弯，你只负责让它立起来。' } },
  { id: 'jturn', focus: ['lowEdge', 'banking'], group: 'edging', lv: [3, 5], terrain: 'blue',
    name: { en: 'J-turns', zh: 'J 形弯' },
    how: { en: ['Point the skis down the hill and pick up a little speed.', 'Tip both skis onto edge and wait — let them carve up the hill to a stop.', 'No twisting. Repeat both ways.'],
           zh: ['板头朝山下，滑出一点速度。', '两板同时立刃，然后等——让雪板自己刻着弧线拐上山，直到停下。', '不要拧板。左右各练。'] },
    feel: { en: 'Patience: the edge does the turning.', zh: '耐心一点：转弯是板刃完成的。' } },
  { id: 'garlands', focus: ['wedge', 'lowEdge'], group: 'first', lv: [1, 3], terrain: 'green',
    name: { en: 'Garlands', zh: '花环练习' },
    how: { en: ['Traverse across the hill.', 'Let the tips drift downhill to start a turn, then steer both skis back across — never crossing the fall line.', 'String 4–5 together, then repeat facing the other way.'],
           zh: ['横向斜滑降。', '让板头朝山下溜一点开始入弯，再把两板一起转回横向——不越过滚落线。', '连做 4–5 个，再换方向。'] },
    feel: { en: 'Practise the start and finish of a turn without the scary middle.', zh: '只练入弯和出弯，跳过最吓人的中段。' } },
  { id: 'match', focus: ['wedge'], group: 'first', lv: [1, 2], terrain: 'green',
    name: { en: 'Wedge-to-parallel matching', zh: '犁式并板' },
    how: { en: ['Start each turn in a small wedge.', 'Once you feel your weight on the outside ski, lighten the inside ski and slide it parallel.', 'Match a little earlier every run until the wedge disappears.'],
           zh: ['每个弯用小犁式开始。', '感到重心压上外侧板后，把内侧板放轻、滑过来并成平行。', '每趟都并得更早一点，直到犁式消失。'] },
    feel: { en: 'The outside ski carries you; the inside ski is along for the ride.', zh: '外侧板承重，内侧板只是跟着走。' } },
  { id: 'thousand', focus: ['narrow', 'stiff', 'aframe', 'wide'], group: 'legs', lv: [3, 6], terrain: 'green',
    name: { en: 'Thousand steps', zh: '千步转弯' },
    how: { en: ['Make round medium turns.', 'Step continuously from foot to foot the whole way round — tiny, quick steps.', 'Keep stepping through the edge change.'],
           zh: ['做圆润的中弯。', '整个弯里不停地左右脚交替小碎步。', '换刃时也不要停。'] },
    feel: { en: 'Each foot works on its own; ankles and knees stay alive.', zh: '两只脚各自工作，脚踝和膝盖一直是活的。' } },
  { id: 'tallsmall', focus: ['stiff'], group: 'legs', lv: [1, 5], terrain: 'green',
    name: { en: 'Tall–small turns', zh: '高低姿转弯' },
    how: { en: ['Stand tall as you start each turn.', 'Sink smoothly — ankles, knees and hips together — to your smallest at the end of the turn.', 'Rise into the next one. Then reverse it: small at the edge change, tall at the apex.'],
           zh: ['入弯时站高。', '脚踝、膝、髋一起平顺下沉，到弯末降到最低。', '再起身进入下一个弯。然后反过来练：换刃时低，弯顶时高。'] },
    feel: { en: 'Legs are suspension, not stilts.', zh: '腿是悬挂系统，不是高跷。' } },
  { id: 'cowboy', focus: ['aframe', 'narrow'], group: 'legs', lv: [3, 6], terrain: 'green',
    name: { en: 'Cowboy turns', zh: '牛仔转弯' },
    how: { en: ['Ski with your feet wider than normal, as if riding a horse.', 'Tip both knees into each turn together — the inside knee leads.', 'Gradually bring the stance back to hip-width, keeping the shins parallel.'],
           zh: ['双脚比平时站得更宽，像骑马一样。', '每个弯两个膝盖一起往弯内倒——内侧膝盖带头。', '慢慢收回到与髋同宽，保持两条小腿平行。'] },
    feel: { en: 'Two skis, one edge angle.', zh: '两块板，同一个立刃角度。' } },
  { id: 'count', focus: ['rhythm', 'asym'], group: 'rhythm', lv: [2, 6], terrain: 'blue',
    name: { en: 'Count the beat', zh: '数拍子转弯' },
    how: { en: ['Pick a corridor about one groomer-track wide.', "Count out loud — 'one, two, three, turn' — and change edges exactly on the beat.", 'Ten turns without losing the count, then shorten the count.'],
           zh: ['选一条大约一道压雪车痕宽的通道。', '出声数——“一、二、三、转”——准确地在拍子上换刃。', '连续十个弯不乱拍，再把拍子缩短。'] },
    feel: { en: 'Same shape, same time, both ways.', zh: '左右两边：同样的弯形，同样的时间。' } },
];

const BY_ID = Object.fromEntries(DRILLS.map((d) => [d.id, d]));
export const drillById = (id) => BY_ID[id];

// When nothing is wrong, train toward the next level.
const NEXT_STEP = { 1: ['match', 'garlands', 'tray'], 2: ['garlands', 'hockey', 'tallsmall'], 3: ['railroad', 'jturn', 'outside'], 4: ['schlopy', 'javelin', 'poledrag'], 5: ['pivot', 'javelin', 'count'], 6: ['pivot', 'outside', 'count'] };

/** Drills that address one finding, best level-fit first. */
export function drillsFor(findingId, level) {
  const fit = (d) => (level >= d.lv[0] && level <= d.lv[1] ? 0 : Math.min(Math.abs(level - d.lv[0]), Math.abs(level - d.lv[1])));
  return DRILLS.filter((d) => d.focus.includes(findingId))
    .map((d) => ({ d, pri: fit(d) * 10 + d.focus.indexOf(findingId) }))
    .sort((a, b) => a.pri - b.pri).map((x) => x.d);
}

/**
 * Build a session plan: up to four drills, covering the top findings in order.
 * @returns [{ drill, why: findingId | null }]
 */
export function buildPlan(findingIds, level, max = 4) {
  const out = [], used = new Set();
  const take = (d, why) => { if (d && !used.has(d.id) && out.length < max) { used.add(d.id); out.push({ drill: d, why }); return true; } return false; };
  const queues = findingIds.slice(0, 3).map((id) => ({ id, list: drillsFor(id, level) }));
  // round-robin: one drill per finding first, then second choices
  for (let round = 0; round < 2; round++) {
    for (const q of queues) { while (q.list.length && !take(q.list.shift(), q.id)) { /* skip duplicates */ } }
  }
  for (const id of NEXT_STEP[level] || []) take(BY_ID[id], null);
  return out;
}
