// 自注意力配流台 · Self-Attention Proportioning Console
// 一台把 Transformer 缩放点积注意力建成真实台式仪器的图解：
//   探针滑车选择查询词 → 刻度盘读 sᵢ=q·kᵢ/√d → 推子给 softmax 权重 wᵢ（总和恒 1）
//   → 浅碟存液 ∝ ‖vᵢ‖，按 wᵢ 放液 → 汇流槽液位 ∝ Σwᵢ‖vᵢ‖ → 表盘读 ‖Σwᵢvᵢ‖
// 用法：node build.mjs [--light] [--audit]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/bytedance/.trae-cn/skills/anatomy/kit/iso-kit.mjs";
import * as G from "/Users/bytedance/.trae-cn/skills/anatomy/kit/lathe.mjs";
import * as A from "/Users/bytedance/.trae-cn/skills/anatomy/kit/audit.mjs";
import { tubePieces, tubeSvg } from "/Users/bytedance/.trae-cn/skills/anatomy/kit/tube.mjs";
import { kitScript } from "/Users/bytedance/.trae-cn/skills/anatomy/scripts/inline-kit.mjs";
import { TOKENS, QUERIES, V_NORM, V_MAX, S_MAX, OUT_MAX } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLY = process.argv.includes("--light") ? ["light"] : ["dark", "light"];

const WIDTH = 640;
const HEIGHT = 420;

// ---------- 布局（世界坐标，z 向上） ----------
const PLATE = { x: -130, y: -70, w: 260, d: 140, r: 8 }; // 底座 −12..0，底脚到 −17
const XS = [-66, -22, 22, 66]; // 四个通道的 x
const DECK = { x: -104, y: -66, w: 208, d: 78, r: 4 }; // 高台 z 14..20
const DECK_TOP = 20;
const DIAL_Y = -44, DIAL_R = 11, DIAL_Z = 30, DIAL_H = 8; // 刻度盘（面朝上）
const DIAL_TOP = DIAL_Z + DIAL_H;
const FADER = { y: -18, d: 3, z0: 20, h: 46, w: 8 }; // 推子板 y −18..−15, z 20..66
const FADER_TOP = FADER.z0 + FADER.h;
const SLOT_Z0 = 24, SLOT_TRAVEL = 35; // 推子行程
const DISH_Y = 0, DISH_Z = 22.6, DISH_H = 7.5, DISH_R = 12.6, DISH_RI = 11.4; // 浅碟
const DISH_FLOOR = DISH_Z + 2.6; // 碟内底 25.2
const TROUGH = { x: -80, y: 28, w: 164, d: 32, r: 3 }; // 汇流槽，壁 z 3..18
const TROUGH_IN = { x: -77, y: 31, w: 158, d: 26, r: 2 };
const RAIL_Y = -16, RAIL_Z = 103, RAIL_H = 5; // 高架滑轨 z 103..108
const POST_X = 124;
const OUT_DIAL = [104, 52], OUT_R = 13, OUT_Z = 10, OUT_TOP = 18; // 输出表盘
const NEEDLE_FROM = Math.PI * 0.75, NEEDLE_SPAN = Math.PI * 1.5; // 270° 扫掠

// 液位映射（真实比例）
const dishRest = V_NORM.map((v) => 0.6 + 3.6 * (v / V_MAX)); // 存液高 ∝ ‖vᵢ‖
const dishDrop = QUERIES.map((q) => q.weights.map((w) => 2.6 * w)); // 放液深 ∝ wᵢ
const MIX = QUERIES.map((q) => q.weights.reduce((s, w, i) => s + w * V_NORM[i], 0));
const troughLevel = MIX.map((m) => 1 + 10 * (m / V_MAX)); // 槽液位 ∝ Σwᵢ‖vᵢ‖

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -17, 0),
    [-POST_X - 5, RAIL_Y, 111],
    [POST_X + 5, RAIL_Y, 111],
    [XS[0] - 10, RAIL_Y, RAIL_Z],
    [XS[3] + 10, RAIL_Y, RAIL_Z],
    [XS[0], DIAL_Y, DIAL_TOP + 1],
    [XS[3], DIAL_Y, DIAL_TOP + 1],
    [OUT_DIAL[0] + OUT_R, OUT_DIAL[1], OUT_TOP],
  ],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 45, elevation: 38 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

const R = A.recorder(P);
// put：画图 + 记录真实形状
const put = (name, center, svg, shapes, extra = {}) =>
  R.put({ name, at: center, svg, shapes: shapes.map((s) => R.solid(s)), ...extra });

// ---------- 底座 ----------
function basePlate() {
  const svg = [];
  svg.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -17, 12, P)}"/>`);
  svg.push(S(k.slabOf(PLATE, -12, 12, P, 8, 1.6), { tone: "mid" }));
  svg.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  svg.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  svg.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -126, y: 63, w: 40, d: 6, r: 1 }; // 标尺条
  svg.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 4, 5, strip.y + 0.8, 0.6, [2, 3.4], P);
  svg.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  const label = { x: -82, y: 63, w: 44, d: 6, r: 1 }; // 铭牌
  svg.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "mid" }));
  svg.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P), { tone: "faint" }));
  for (const [ox, len] of [[4, 22], [4, 30], [4, 14]])
    svg.push(L(k.lineOnTop([label.x + ox, label.y + 2 + 0], [label.x + ox + len, label.y + 2], 0.8, P), { tone: "lo", free: true }));
  svg.push(D([at([label.x + 2, label.y + 3, 0.8]), at([label.x + label.w - 2, label.y + 3, 0.8])], { size: 0.45 }));
  return svg.join("");
}

function feet() {
  const out = [];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -17, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -15.4, 3.4, P, 28), { tone: "mid" }));
  }
  return out.join("");
}

// ---------- 高台（二层台面） ----------
function deck() {
  const svg = [];
  const shapes = [];
  for (const [lx, ly] of [[-96, -58], [96, -58], [-96, 4], [96, 4]]) {
    const leg = { x: lx - 4, y: ly - 4, w: 8, d: 8, r: 1.5 };
    svg.push(S(k.slabOf(leg, 0, 14, P, 4, 0.5), { tone: "mid" }));
    svg.push(D([at([lx, ly, 14])], { size: 0.45 }));
    shapes.push(A.slab(leg, 0, 14, { name: "deck.leg" }));
  }
  svg.push(S(k.slabOf(DECK, 14, 6, P, 6, 0.8), { tone: "mid", inner: L(k.sideSeam(DECK, 17, P, 6), { tone: "faint" }) }));
  shapes.push(A.slab(DECK, 14, 6, { name: "deck.top" }));
  return { svg: svg.join(""), shapes };
}

// ---------- 刻度盘（读 q·kᵢ/√d） ----------
const needleAt = (cx, cy, r, z, frac) => {
  const a = NEEDLE_FROM + frac * NEEDLE_SPAN;
  const sx = Math.sin(a), sy = -Math.cos(a);
  return k.lineOnTop([cx - sx * 2.6, cy - sy * 2.6], [cx + sx * (r - 2.8), cy + sy * (r - 2.8)], z, P);
};

function dial(i) {
  const [cx, cy] = [XS[i], DIAL_Y];
  const svg = [];
  svg.push(S(k.cylinder(cx, cy, 2.6, DECK_TOP, DIAL_Z - DECK_TOP, P, 20), { tone: "mid" })); // 表柱
  svg.push(L(k.sideArc(cx, cy, 2.6, 24, P, 12), { tone: "faint" }));
  svg.push(S(k.cylinder(cx, cy, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" })); // 表盘
  svg.push(L(k.knurl(cx, cy, DIAL_R, DIAL_TOP - 3.2, DIAL_TOP, 72, P, 0.3), { tone: "lo" }));
  svg.push(L(k.sideArc(cx, cy, DIAL_R, DIAL_TOP - 3.2, P, 40), { tone: "faint" }));
  svg.push(L(k.ring(cx, cy, DIAL_R - 2.2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(cx, cy, DIAL_R - 3, 24, 6, DIAL_TOP, [1.2, 2.6], P, NEEDLE_FROM, NEEDLE_SPAN);
  svg.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  svg.push(L(k.ring(cx, cy, 1.6, DIAL_TOP, P, 16), { tone: "mid" })); // 针毂
  // 表冠与耳板
  svg.push(S(k.slabOf({ x: cx + DIAL_R - 1, y: cy - 2.4, w: 5, d: 4.8, r: 1.2 }, DIAL_Z + 1, 4, P, 3), { tone: "mid" }));
  const frac0 = QUERIES[0].scores[i] / S_MAX;
  svg.push(`<path data-needle="${i}" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(cx, cy, DIAL_R, DIAL_TOP + 0.2, frac0)}" style="stroke-width:1.1"/>`);
  return {
    svg: svg.join(""),
    shapes: [
      A.cylinder(cx, cy, 2.6, DECK_TOP, DIAL_Z - DECK_TOP, { name: `dial${i}.post` }),
      A.cylinder(cx, cy, DIAL_R, DIAL_Z, DIAL_H, { name: `dial${i}.puck` }),
    ],
  };
}

// ---------- 推子（softmax 权重）与查询键 ----------
function fader(i) {
  const cx = XS[i], fy = FADER.y, face = fy + FADER.d; // +y 面 y=−15
  const svg = [];
  const plan = { x: cx - FADER.w / 2, y: fy, w: FADER.w, d: FADER.d, r: 1 };
  svg.push(S(k.slabOf(plan, FADER.z0, FADER.h, P, 3, 0.4), { tone: "mid" }));
  // 槽：面上的封闭细长相圆矩形（无端点）
  const slot = k.roundedPlan({ x: -1.2, y: SLOT_Z0, w: 2.4, d: 38, r: 1.2 }, 3)
    .map(([px, pz]) => at([cx + px, face, pz]));
  svg.push(L(`M${slot.map(([sx, sy]) => `${sx} ${sy}`).join("L")}Z`, { tone: "lo" }));
  svg.push(D([at([cx - 2.6, face, 22]), at([cx + 2.6, face, 22])], { size: 0.4 })); // 板脚螺钉
  // 滑块（随 wᵢ 升降）
  const sliderPlan = { x: cx - 2.8, y: face - 0.1, w: 5.6, d: 3, r: 0.8 };
  const grip1 = k.segment([cx - 1.8, face + 2.9, 25.2], [cx + 1.8, face + 2.9, 25.2], P);
  const grip2 = k.segment([cx - 1.8, face + 2.9, 26.8], [cx + 1.8, face + 2.9, 26.8], P);
  const slider = [
    S(k.slabOf(sliderPlan, 24, 4, P, 2, 0.4), { tone: "hi" }),
    L(grip1, { tone: "lo" }), L(grip2, { tone: "lo" }),
  ].join("");
  const w0 = QUERIES[0].weights[i];
  svg.push(`<g data-fader="${i}" transform="${k.translateAlong(P, [0, 0, w0 * SLOT_TRAVEL])}">${slider}</g>`);
  // 查询键（探针按下它）
  const btnZ = FADER_TOP;
  svg.push(`<g data-btn="${i}">${S(k.cylinder(cx, RAIL_Y, 2.8, btnZ, 3.5, P, 24, 0.4), { tone: "hi" })}</g>`);
  svg.push(L(k.ring(cx, RAIL_Y, 3.4, btnZ, P, 24), { tone: "lo" }));
  return {
    svg: svg.join(""),
    shapes: [
      A.slab(plan, FADER.z0, FADER.h, { name: `fader${i}.plate` }),
      A.slab({ ...sliderPlan }, 24, 4, { name: `fader${i}.slider` }),
      A.cylinder(cx, RAIL_Y, 2.8, btnZ, 3.5, { name: `fader${i}.key` }),
    ],
  };
}

// ---------- 词名标牌（台面前脸） ----------
function fascia(i) {
  const plan = { x: XS[i] - 10, y: 12, w: 20, d: 1.4, r: 0.6 };
  const svg = [];
  svg.push(S(k.slabOf(plan, 4, 16, P, 3, 0.4), { tone: "mid" }));
  svg.push(D([at([XS[i] - 7, 13.4, 18]), at([XS[i] + 7, 13.4, 18])], { size: 0.4 }));
  const m = k.sideMatrix([XS[i], 13.4], 12, P, "left");
  svg.push(k.faceTextSvg(m, TOKENS[i], { size: 7, tone: i === 0 ? "hi" : "mid", anchor: "middle" }));
  return { svg: svg.join(""), shapes: [A.slab(plan, 4, 16, { name: `fascia${i}` })] };
}

// ---------- 浅碟（值液，存液 ∝ ‖vᵢ‖） ----------
const DISH_PROFILE = [[0, 10], [1.5, 10, 1], [4, DISH_R, 1], [DISH_H, DISH_R], [DISH_H, DISH_RI + 0.4], [2.6, DISH_RI + 0.4], [2.6, 0]];
function dish(i) {
  const cx = XS[i], cy = DISH_Y;
  const F = G.frameOf([cx, cy, DISH_Z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const svg = [];
  svg.push(S(k.cylinder(cx, cy, 10, DECK_TOP, DISH_Z - DECK_TOP, P, 48), { tone: "mid" })); // 法兰座
  svg.push(L(k.ring(cx, cy, 10, DISH_Z, P, 48), { tone: "lo" }));
  const body = G.lathe(DISH_PROFILE, F, P, { fill: "facets", rims: "all" });
  svg.push(S(body, { tone: "hi" }));
  const bodyShape = A.solid(F, DISH_PROFILE, { name: `dish${i}.body` });
  // 排液出口的鞍形垫焊接在碟身上（与宿主同件绘制，管法兰再贴其面）
  const sF = G.frameAlong([cx, DISH_Y, 26.8], [0, 1, 0]);
  svg.push(S(G.saddleOf(sF, 2.8, DISH_R, 14.4, P), { tone: "mid" }));
  // 值液（初始为查询 0 放液后的液位）
  const h0 = dishRest[i] - dishDrop[0][i];
  svg.push(`<g data-dish="${i}">${S(k.cylinder(cx, cy, DISH_RI, DISH_FLOOR, h0, P, 48), { tone: "hi", className: "mx-liq" })}</g>`);
  return {
    svg: svg.join(""),
    shapes: [
      A.cylinder(cx, cy, 10, DECK_TOP, DISH_Z - DECK_TOP, { name: `dish${i}.flange` }),
      bodyShape,
      A.cylinder(cx, cy, DISH_RI, DISH_FLOOR, h0, { name: `dish${i}.liquid` }),
      { ...A.disc(sF, 11, 14.4, 2.8, { name: `dish${i}.pad`, seated: true }), cut: [bodyShape] },
    ],
  };
}

// ---------- 汇流槽 ----------
function trough() {
  const svg = [];
  const shapes = [];
  const T = TROUGH;
  svg.push(S(k.slabOf(T, 0, 3, P, 5, 0.6), { tone: "mid" })); // 槽底
  shapes.push(A.slab(T, 0, 3, { name: "trough.floor" }));
  const walls = [
    { x: T.x, y: T.y, w: T.w, d: 3, r: 1 }, // 后壁 y 28..31
    { x: T.x, y: T.y + T.d - 3, w: T.w, d: 3, r: 1 }, // 前壁 y 57..60
    { x: T.x, y: T.y + 3, w: 3, d: T.d - 6, r: 1 }, // 左壁
    { x: T.x + T.w - 3, y: T.y + 3, w: 3, d: T.d - 6, r: 1 }, // 右壁
  ];
  walls.forEach((w, idx) => {
    svg.push(S(k.slabOf(w, 3, 15, P, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(w, 6, P, 3), { tone: "faint" }) }));
    shapes.push(A.slab(w, 3, 15, { name: `trough.wall${idx}` }));
  });
  // 四角螺栓
  svg.push(D([[T.x + 4, T.y + 1.5], [T.x + T.w - 4, T.y + 1.5], [T.x + 4, T.y + T.d - 1.5], [T.x + T.w - 4, T.y + T.d - 1.5]].map(([x, y]) => at([x, y, 18])), { size: 0.5 }));
  // 混合液（初始为查询 0 的液位）
  svg.push(`<g data-trough>${S(k.slabOf(TROUGH_IN, 3, troughLevel[0], P, 4), { tone: "hi", className: "mx-liq" })}</g>`);
  shapes.push(A.slab(TROUGH_IN, 3, troughLevel[0], { name: "trough.liquid" }));
  // 液位变送器（前壁右端外侧，下移使线缆起点避开槽液面轮廓线）
  const box = { x: 72, y: 60, w: 8, d: 3.5, r: 0.8 };
  svg.push(S(k.slabOf(box, 6, 12, P, 2, 0.4), { tone: "mid" }));
  svg.push(D([at([74, 63.5, 13]), at([78, 63.5, 13])], { size: 0.4 }));
  shapes.push(A.slab(box, 6, 12, { name: "trough.tx" }));
  return { svg: svg.join(""), shapes };
}

// ---------- 排液管（浅碟 → 汇流槽后壁进口） ----------
function drain(i) {
  const cx = XS[i];
  const svg = [];
  const shapes = [];
  // 进口接头（槽后壁外侧面）
  const bF = G.frameAlong([cx, 26.4, 8], [0, 1, 0]);
  svg.push(S(G.disc(0, 1.6, 3.2, bF, P), { tone: "mid" }));
  shapes.push(A.disc(bF, 0, 1.6, 3.2, { name: `drain${i}.boss` }));
  // 管线路由：两端直管段垂直于安装面，端部切线才能保证法兰贴合
  const route = G.fillet([[cx, 14.4, 26.8], [cx, 16.8, 26.8], [cx, 21, 10], [cx, 24.4, 8], [cx, 26.4, 8]], 2.4, 7, { P, tube: 1.8 });
  const total = G.pathLength(route);
  const gaps = [[0, 2], [total - 2, total]]; // 两端法兰下各空 2
  const pieces = tubePieces(route, 1.8, P, { maxLength: 18, gaps });
  // 端法兰
  const f1 = G.frameAlong([cx, 15.4, 26.8], [0, 1, 0]); // 起点法兰（背面在垫面 14.4）
  const f2 = G.frameAlong([cx, 25.4, 8], [0, 1, 0]); // 终点法兰（正面在接头面 26.4）
  svg.push(S(G.disc(-1, 1, 2.6, f1, P), { tone: "mid" }));
  shapes.push(A.disc(f1, -1, 1, 2.6, { name: `drain${i}.fl0`, owner: `drain${i}` }));
  for (const piece of pieces) svg.push(tubeSvg(piece, { tone: "hi" }));
  // 末端法兰 + 流动指示线（虚线流动动画，opacity 由 wᵢ 驱动）
  const flowD = G.resample(route, 2.5).map((p) => at(p)).map(([x, y]) => `${x} ${y}`).join("L");
  svg.push(`<g>${S(G.disc(-1, 1, 3, f2, P), { tone: "mid" })}<path data-flow="${i}" class="iso-line" data-tone="hi" data-free="true" d="M${flowD}" style="stroke-dasharray:2.4 2.2" opacity="${(QUERIES[0].weights[i] * 1.3).toFixed(2)}"/></g>`);
  shapes.push(A.disc(f2, -1, 1, 3, { name: `drain${i}.fl1`, owner: `drain${i}` }));
  const tubes = R.route(`drain${i}`, route, 1.8, { gaps, rims: [2.6, 3] });
  return { svg: svg.join(""), shapes: [...shapes, ...tubes] };
}

// ---------- 高架滑轨与查询探针 ----------
function post(sx) {
  const px = sx * POST_X;
  const svg = [];
  svg.push(S(k.cylinder(px, RAIL_Y, 5, 0, 4, P, 28), { tone: "mid" })); // 底座环
  svg.push(S(k.cylinder(px, RAIL_Y, 3.2, 4, RAIL_Z - 4, P, 28), { tone: "mid", crease: "none" })); // 柱身，顶面平贴轨底（轨面全覆盖，重叠单向）
  svg.push(L(k.sideArc(px, RAIL_Y, 3.2, 60, P, 16), { tone: "faint" }));
  return {
    svg: svg.join(""),
    shapes: [
      A.cylinder(px, RAIL_Y, 5, 0, 4, { name: `post${sx}.base` }),
      A.cylinder(px, RAIL_Y, 3.2, 4, RAIL_Z - 4, { name: `post${sx}.rod` }),
    ],
  };
}

function rail() {
  const rail = { x: -POST_X - 5, y: RAIL_Y - 4.5, w: POST_X * 2 + 10, d: 9, r: 1 }; // 轨宽盖住柱径，端部越过柱外轮廓
  const railSvg = [];
  railSvg.push(S(k.slabOf(rail, RAIL_Z, RAIL_H, P, 3, 0.5), { tone: "mid" }));
  const ticks = k.topTicks(-116, 116, 4, 5, RAIL_Y - 4.5, RAIL_Z + RAIL_H, [1.8, 3.2], P);
  railSvg.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  for (const cx of XS) railSvg.push(L(k.lineOnTop([cx, RAIL_Y - 4.5], [cx, RAIL_Y - 1.5], RAIL_Z + RAIL_H, P), { tone: "hi" })); // 停靠位
  railSvg.push(D([at([-POST_X - 3, RAIL_Y, RAIL_Z + RAIL_H]), at([POST_X + 3, RAIL_Y, RAIL_Z + RAIL_H])], { size: 0.45 }));
  // 沉头螺钉：轨面拧入柱顶（并入 rail item，避免与 post 形成双向重叠环）
  const screws = [];
  for (const sx of [-1, 1]) {
    railSvg.push(S(k.cylinder(sx * POST_X, RAIL_Y, 2, RAIL_Z + RAIL_H, 1.3, P, 20, 0.3), { tone: "lo" }));
    railSvg.push(D([at([sx * POST_X, RAIL_Y, RAIL_Z + RAIL_H + 1.3])], { size: 0.4 }));
    screws.push(A.cylinder(sx * POST_X, RAIL_Y, 2, RAIL_Z + RAIL_H, 1.3, { name: `rail.screw${sx}` }));
  }
  return { svg: railSvg.join(""), shapes: [A.slab(rail, RAIL_Z, RAIL_H, { name: "rail" }), ...screws] };
}

function carriage() {
  // 滑车：吊块 + 贴轨舌板 + 手柄 + 探针杆（lit）
  const svg = [];
  const block = { x: -7, y: RAIL_Y - 3.5, w: 14, d: 6.5, r: 1.5 };
  const tongue = { x: -9, y: RAIL_Y - 3.5, w: 18, d: 6.5, r: 1 };
  svg.push(S(k.slabOf(tongue, RAIL_Z - 1, 1, P, 3, 0.4), { tone: "mid" }));
  svg.push(S(k.slabOf(block, RAIL_Z - 7, 6, P, 3, 0.5), { tone: "mid" }));
  svg.push(D([at([-5, RAIL_Y + 2.2, RAIL_Z - 3]), at([5, RAIL_Y + 2.2, RAIL_Z - 3])], { size: 0.4, tone: "lo" }));
  // 手柄（前脸滚花钮）
  const hF = G.frameAlong([0, RAIL_Y + 3, RAIL_Z - 4], [0, 1, 0]);
  svg.push(S(G.disc(0, 1.4, 1.6, hF, P), { tone: "mid" }));
  svg.push(S(G.disc(1.4, 3.6, 2.4, hF, P), { tone: "mid" }));
  svg.push(k.fadedSvg(G.ribsOf(hF, 1.4, 3.6, 2.4, 14, P, { fade: [0.1, 0.5] }), { tone: "lo" }));
  // 探针杆：从滑车底到键上方，随滑车移动；按压时下行 3.5
  const rodTop = RAIL_Z - 7, tipRest = 72.5;
  const rod = [
    S(k.cylinder(0, RAIL_Y, 2.4, rodTop - 3, 3, P, 20), { tone: "mid" }), // 杆顶环
    S(k.cylinder(0, RAIL_Y, 1.5, tipRest, rodTop - 3 - tipRest, P, 16), { tone: "hi", crease: "none", lit: true }), // 杆
    S(k.cylinder(0, RAIL_Y, 2.6, tipRest - 2, 2, P, 20, 0.4), { tone: "hi", lit: true }), // 触头垫
  ].join("");
  svg.push(`<g data-probe>${rod}</g>`);
  const rest = [XS[0], 0, 0]; // 记录初始停靠位（与首帧 transform 一致）
  const moved = (shape) => A.moved(shape, rest);
  return {
    svg: svg.join(""),
    shapes: [
      moved(A.slab(tongue, RAIL_Z - 1, 1, { name: "car.tongue" })),
      moved(A.slab(block, RAIL_Z - 7, 6, { name: "car.block" })),
      moved(A.cylinder(0, RAIL_Y, 2.4, rodTop - 3, 3, { name: "car.ring" })),
      moved(A.cylinder(0, RAIL_Y, 1.5, tipRest, rodTop - 3 - tipRest, { name: "car.rod" })),
      moved(A.cylinder(0, RAIL_Y, 2.6, tipRest - 2, 2, { name: "car.tip" })),
    ],
  };
}

// ---------- 输出表盘与信号线 ----------
function outDial() {
  const [cx, cy] = OUT_DIAL;
  const svg = [];
  const ped = { x: 91, y: 46, w: 26, d: 18, r: 2 };
  svg.push(S(k.slabOf(ped, 0, OUT_Z, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(ped, 4, P, 4), { tone: "faint" }) }));
  svg.push(S(k.cylinder(cx, cy, OUT_R, OUT_Z, 8, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  svg.push(L(k.knurl(cx, cy, OUT_R, OUT_TOP - 3.4, OUT_TOP, 84, P, 0.3), { tone: "lo" }));
  svg.push(L(k.sideArc(cx, cy, OUT_R, OUT_TOP - 3.4, P, 40), { tone: "faint" }));
  svg.push(L(k.ring(cx, cy, OUT_R - 2.2, OUT_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(cx, cy, OUT_R - 3, 24, 6, OUT_TOP, [1.2, 2.6], P, NEEDLE_FROM, NEEDLE_SPAN);
  svg.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  svg.push(L(k.ring(cx, cy, 1.6, OUT_TOP, P, 16), { tone: "mid" }));
  svg.push(D([at([91 + 3, 46 + 3, OUT_Z]), at([117 - 3, 46 + 3, OUT_Z]), at([91 + 3, 64 - 3, OUT_Z])], { size: 0.45 }));
  const frac0 = QUERIES[0].outNorm / OUT_MAX;
  svg.push(`<path data-needle="out" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(cx, cy, OUT_R, OUT_TOP + 0.2, frac0)}" style="stroke-width:1.1"/>`);
  return {
    svg: svg.join(""),
    shapes: [A.slab(ped, 0, OUT_Z, { name: "out.ped" }), A.cylinder(cx, cy, OUT_R, OUT_Z, 8, { name: "out.puck" })],
  };
}

function signalCable() {
  // 两端各留一段垂直于安装面的直段，端部切线才能落在变送器与表座面上
  const route = G.fillet([[76, 63.5, 7.5], [76, 66.8, 7.5], [83, 67.5, 8], [91, 67.5, 8], [95, 65.8, 8], [95, 64, 8]], 1.6, 5, { P, tube: 0.55 });
  const pieces = tubePieces(route, 0.55, P, { maxLength: 30 });
  const svg = [];
  svg.push(pieces.map((piece) => tubeSvg(piece, { tone: "mid" })).join(""));
  svg.push(D([at([76, 63.5, 7.5]), at([95, 64, 8])], { size: 1.1, tone: "mid" }));
  const tubes = R.route("cable", route, 0.55, { limp: true });
  return { svg: svg.join(""), tubes };
}

// ---------- 组装 ----------
const deckParts = deck();
put("base", [0, 0, -6], basePlate(), [
  A.slab(PLATE, -12, 12, { name: "stand.plate", ground: true }),
  A.slab({ x: -126, y: 63, w: 40, d: 6, r: 1 }, 0, 0.6, { name: "base.strip" }),
  A.slab({ x: -82, y: 63, w: 44, d: 6, r: 1 }, 0, 0.8, { name: "base.label" }),
]);
put("feet", [0, 0, -16], feet(), k.corners(PLATE, 22).flatMap(([x, y]) => [
  A.cylinder(x, y, 7, -17, 1.6, { name: "stand.flange", ground: true }),
  A.cylinder(x, y, 5.4, -15.4, 3.4, { name: "stand.foot", ground: true }),
]));
put("deck", [0, -27, 17], deckParts.svg, deckParts.shapes);
const railParts = rail();
put("rail", [0, RAIL_Y, RAIL_Z], railParts.svg, railParts.shapes);
for (const sx of [-1, 1]) {
  const po = post(sx);
  put(sx < 0 ? "postL" : "postR", [sx * POST_X, RAIL_Y, 55], po.svg, po.shapes);
}
const dishParts = [];
for (let i = 0; i < 4; i++) dishParts.push(dish(i));
for (let i = 0; i < 4; i++) {
  const d = dial(i);
  put(`dial${i}`, [XS[i], DIAL_Y, DIAL_TOP], d.svg, d.shapes);
  const f = fader(i);
  put(`fader${i}`, [XS[i], FADER.y, 40], f.svg, f.shapes);
  const fa = fascia(i);
  put(`fascia${i}`, [XS[i], 12.7, 12], fa.svg, fa.shapes);
  put(`dish${i}`, [XS[i], DISH_Y, DISH_Z + 4], dishParts[i].svg, dishParts[i].shapes);
  const dr = drain(i);
  put(`drain${i}`, [XS[i], 20, 16], dr.svg, dr.shapes, { route: `drain${i}` });
}
const tr = trough();
put("trough", [0, 44, 9], tr.svg, tr.shapes);
const od = outDial();
put("outdial", [OUT_DIAL[0], OUT_DIAL[1], OUT_TOP], od.svg, od.shapes);
const cb = signalCable();
put("cable", [86, 65, 6], cb.svg, cb.tubes, { route: "cable" });
const car = carriage();
put("carriage", [XS[0], RAIL_Y, 90], `<g data-carriage transform="${k.translateAlong(P, [XS[0], 0, 0])}">${car.svg}</g>`, car.shapes);

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "一台解释 Transformer 自注意力机制的台式仪器：探针在高架滑轨上移动并按下查询词键，四个刻度盘显示匹配分数 q·k 除以根号 d，四个推子显示 softmax 权重，浅碟与汇流槽中的液位演示值向量的加权求和，右下表盘读出输出向量的模长。",
  body: R.items.map((item) => item.svg),
});

// ---------- 运行时 ----------
const DATA = {
  P, XS, TOKENS,
  scores: QUERIES.map((q) => q.scores),
  weights: QUERIES.map((q) => q.weights),
  outNorm: QUERIES.map((q) => q.outNorm),
  S_MAX, OUT_MAX,
  dishRest, dishDrop, troughLevel,
  dials: XS.map((x) => [x, DIAL_Y, DIAL_R, DIAL_TOP]),
  outDial: [OUT_DIAL[0], OUT_DIAL[1], OUT_R, OUT_TOP],
  SLOT_TRAVEL, DISH_FLOOR, NEEDLE_FROM, NEEDLE_SPAN,
};

const live = `
const D = ${JSON.stringify(DATA)};
const P = D.P;
const stage = document.querySelector(".iso-stage");
const svgEl = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const needles = [0, 1, 2, 3].map((i) => svgEl.querySelector('[data-needle="' + i + '"]'));
const outNeedle = svgEl.querySelector('[data-needle="out"]');
const faders = [0, 1, 2, 3].map((i) => svgEl.querySelector('[data-fader="' + i + '"]'));
const buttons = [0, 1, 2, 3].map((i) => svgEl.querySelector('[data-btn="' + i + '"]'));
const dishes = [0, 1, 2, 3].map((i) => svgEl.querySelector('[data-dish="' + i + '"]'));
const flows = [0, 1, 2, 3].map((i) => svgEl.querySelector('[data-flow="' + i + '"]'));
const troughG = svgEl.querySelector("[data-trough]");
const carriageG = svgEl.querySelector("[data-carriage]");
const probeG = svgEl.querySelector("[data-probe]");
const glyphs = ${JSON.stringify(TOKENS)};
const needleAt = (cx, cy, r, z, frac) => {
  const a = D.NEEDLE_FROM + frac * D.NEEDLE_SPAN;
  const sx = Math.sin(a), sy = -Math.cos(a);
  return lineOnTop([cx - sx * 2.6, cy - sy * 2.6], [cx + sx * (r - 2.8), cy + sy * (r - 2.8)], z, P);
};
const dishSvg = (i, h) => solidSvg(cylinder(D.XS[i], 0, 11.4, D.DISH_FLOOR, Math.max(h, 0.05), P, 48), { tone: "hi", className: "mx-liq" });
const troughSvg = (h) => solidSvg(slabOf({ x: -77, y: 31, w: 158, d: 26, r: 2 }, 3, Math.max(h, 0.05), P, 4), { tone: "hi", className: "mx-liq" });

let q = 0;                      // 当前查询
let phase = "rest";             // prime（充液/槽排空）→ flow（计量放液）→ rest
let probeX = D.XS[0], press = 0;
let w = [...D.weights[0]];      // 推子当前开度
let s = [...D.scores[0]];       // 表针当前分数
let dishH = D.dishRest.map((r, i) => r - D.dishDrop[0][i]);
let troughH = D.troughLevel[0];
let outN = D.outNorm[0];
let frame = 0, last = 0, visible = false, touring = !still.matches, clock = 0, idleTimer = 0;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (x, t, dt, tau) => (still.matches ? t : x + (t - x) * (1 - Math.exp(-dt / tau)));
const settleN = (x, t, dt, tau, eps) => { const nx = ease(x, t, dt, tau); return Math.abs(nx - t) < eps ? t : nx; };

function draw() {
  carriageG.setAttribute("transform", translateAlong(P, [probeX, 0, 0]));
  probeG.setAttribute("transform", translateAlong(P, [0, 0, -3 * press]));
  for (let i = 0; i < 4; i++) {
    const [cx, cy, r, z] = D.dials[i];
    needles[i].setAttribute("d", needleAt(cx, cy, r, z + 0.2, clampN(s[i] / D.S_MAX, 0, 1)));
    faders[i].setAttribute("transform", translateAlong(P, [0, 0, w[i] * D.SLOT_TRAVEL]));
    const btnPressed = i === q ? press : 0;
    buttons[i].__p !== btnPressed && (buttons[i].innerHTML = solidSvg(cylinder(D.XS[i], ${RAIL_Y}, 2.8, ${FADER_TOP}, 3.5 - 2 * btnPressed, P, 24, 0.4), { tone: "hi", lit: btnPressed > 0.5 }), buttons[i].__p = btnPressed);
    const target = phase === "flow" || phase === "rest" ? D.dishRest[i] - D.dishDrop[q][i] : D.dishRest[i];
    const h = dishH[i];
    const markup = dishSvg(i, h);
    dishes[i].__m !== markup && (dishes[i].innerHTML = markup, dishes[i].__m = markup);
    flows[i].setAttribute("opacity", (phase === "flow" ? clampN(D.weights[q][i] * 1.3, 0, 1) : 0).toFixed(2));
  }
  outNeedle.setAttribute("d", needleAt(D.outDial[0], D.outDial[1], D.outDial[2], D.outDial[3] + 0.2, clampN(outN / D.OUT_MAX, 0, 1)));
  const tm = troughSvg(troughH);
  troughG.__m !== tm && (troughG.innerHTML = tm, troughG.__m = tm);
  const word = phase === "prime" ? "充液" : phase === "flow" ? "计量" : "就绪";
  const text = word + " · 查询「" + glyphs[q] + "」 · 权重 " + w.map((x) => x.toFixed(2)).join(" ") + " · ‖输出‖ " + outN.toFixed(2);
  if (readout.textContent !== text) readout.textContent = text;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { clock += dt; const tq = Math.floor(clock / 5.4) % 4; if (tq !== q) select(tq, true); }
  probeX = ease(probeX, D.XS[q], dt, 0.28);
  press = ease(press, Math.abs(probeX - D.XS[q]) < 1 ? 1 : 0, dt, 0.16);
  let busy = Math.abs(probeX - D.XS[q]) > 0.02 || Math.abs(press - (Math.abs(probeX - D.XS[q]) < 1 ? 1 : 0)) > 0.02;
  for (let i = 0; i < 4; i++) {
    const ns = settleN(s[i], D.scores[q][i], dt, 0.5, 0.02);
    const nw = settleN(w[i], D.weights[q][i], dt, 0.45, 0.02);
    busy = busy || ns !== s[i] || nw !== w[i];
    s[i] = ns; w[i] = nw;
  }
  // 液位两相位：prime = 碟复原、槽排空；flow = 按权重放液
  const dishTarget = (i) => (phase === "prime" ? D.dishRest[i] : D.dishRest[i] - D.dishDrop[q][i]);
  const troughTarget = phase === "prime" ? 0 : D.troughLevel[q];
  let fluidsBusy = false;
  for (let i = 0; i < 4; i++) {
    const nh = settleN(dishH[i], dishTarget(i), dt, 0.38, 0.04);
    fluidsBusy = fluidsBusy || nh !== dishH[i];
    dishH[i] = nh;
  }
  const nt = settleN(troughH, troughTarget, dt, 0.38, 0.05);
  fluidsBusy = fluidsBusy || nt !== troughH;
  troughH = nt;
  if (phase === "prime" && !fluidsBusy) phase = "flow";
  else if (phase === "flow" && !fluidsBusy) phase = "rest";
  const no = settleN(outN, phase === "prime" ? 0 : D.outNorm[q], dt, 0.45, 0.01);
  fluidsBusy = fluidsBusy || no !== outN;
  outN = no;
  draw();
  const settled = !touring && !busy && !fluidsBusy && phase === "rest";
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function select(next, fromTour) {
  next = clampN(next, 0, 3);
  if (next === q && phase !== "prime") return;
  q = next;
  phase = "prime";
  stage.setAttribute("aria-valuenow", String(q));
  stage.setAttribute("aria-valuetext", "查询词「" + glyphs[q] + "」，权重 " + D.weights[q].map((x) => x.toFixed(2)).join("、"));
  if (!fromTour) { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!still.matches) { touring = true; clock = 0; } run(); }, 3600); }
  run();
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svgEl.getBoundingClientRect();
  const share = clampN((event.clientX - box.left) / box.width, 0, 0.999);
  const seg = Math.floor(share * 4);
  // 指针映射到四个通道（按屏幕上探针行程的相对位置）
  const xs = D.XS.map((x) => iso([x, ${RAIL_Y}, ${RAIL_Z}], P)[0]);
  const px = box.left + share * box.width;
  let best = 0, bd = 1e9;
  xs.forEach((sx, i) => { const d = Math.abs(sx / svgEl.viewBox.baseVal.width * box.width + box.left - px); if (d < bd) { bd = d; best = i; } });
  if (best !== q) select(best);
});
stage.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); select(q + 1); }
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); select(q - 1); }
  else if (event.key === "Home") { event.preventDefault(); select(0); }
  else if (event.key === "End") { event.preventDefault(); select(3); }
});
draw();
`;

// 液体：图墨之染（craft.md 流体规范）——取图自身的 blue ink，按主题混合
const CSS = `
.mx-liq{mix-blend-mode:var(--mx-blend)}
.mx-liq .iso-fill{fill:var(--mx-liq);fill-opacity:.45}
.mx-liq .iso-shade{fill:var(--mx-liq);fill-opacity:.5}
.mx-liq .iso-top{fill:var(--mx-liq-top);fill-opacity:.8}
.iso{--mx-liq:#6b9bff;--mx-liq-top:#a8c1ff;--mx-blend:screen}
.iso[data-theme="light"]{--mx-liq:#3e63dd;--mx-liq-top:#6f8de8;--mx-blend:multiply}
@media (max-width:560px){.iso-plate-corner[data-corner="readout"]{font-size:9px;letter-spacing:0}}
`;

const body = `<style>${CSS}</style>` + k.plateHtml({
  fig: "图 1",
  title: "自注意力配流台",
  hint: "移动指针或按 ← → 选择查询词",
  readout: `就绪 · 查询「我」 · 权重 ${QUERIES[0].weights.map((w) => w.toFixed(2)).join(" ")} · ‖输出‖ ${QUERIES[0].outNorm.toFixed(2)}`,
  keys: [
    { mark: "lit", label: "查询探针与表针：探针按下词键，盘面读出 sᵢ = q·kᵢ/√d" },
    { mark: "raised", label: "推子开度 = softmax 权重 wᵢ，四路总和恒为 1" },
    { mark: "flat", label: "浅碟存液 ∝ ‖vᵢ‖，汇流槽液位 ∝ Σwᵢ‖vᵢ‖，表盘读 ‖Σwᵢvᵢ‖" },
  ],
  caption:
    "一台把自注意力建成实物的台式仪器。四个通道对应「我、爱、机、器」。探针选定查询词后，四个刻度盘读出匹配分数 sᵢ = q·kᵢ/√d（d = 4，故除以 2）；推子给出 softmax 权重 wᵢ，总和恒为 1。每只浅碟的存液高度正比于该词值向量的模长 ‖vᵢ‖，随后按 wᵢ 的比例经排液管放入汇流槽——槽中液位即 Σwᵢ‖vᵢ‖，右下表盘由液位变送器驱动，读出输出向量的模长 ‖Σwᵢvᵢ‖（量程 0–1.56）。注意「机」与「器」互相给出近四成的权重：语义相近的词彼此注意。真实的 Transformer 把同样的计算并行于多头、堆叠于多层。",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="选择查询词：左右方向键在我、爱、机、器之间切换" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0" aria-valuetext="查询词「我」">${svg}</div>`,
});

for (const theme of ONLY) {
  const file = theme === "light" ? "index-light.html" : "index.html";
  writeFileSync(join(HERE, file), k.pageHtml({ title: "自注意力配流台 · Self-Attention Mixer", theme, body, script: kitScript() + live }));
  console.log("wrote", file);
}

A.auditOrExit(R, P);
