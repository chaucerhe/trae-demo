// 真实的小型自注意力模型：4 个词，d_k = 4，缩放点积注意力。
// 机器上每一根针、每一个推子、每一格液位都由这里的同一个模型驱动。

export const TOKENS = ["我", "爱", "机", "器"];

// 键向量 k_i（已含投影 W_k·E_i）：维度含义为 [施事, 动作, 机具·甲, 机具·乙]
export const K = [
  [2.0, 0.0, 0.0, 0.0], // 我
  [0.6, 2.0, 0.0, 0.0], // 爱
  [0.0, 0.0, 2.0, 1.2], // 机
  [0.0, 0.0, 1.2, 2.0], // 器
];

// 查询向量 q_i（已含投影 W_q·E_i），与键同空间
export const Q = K.map((row) => [...row]);

// 值向量 v_i（已含投影 W_v·E_i）
export const V = [
  [1.6, 0.0, 0.4, 0.0], // 我
  [0.4, 1.8, 0.0, 0.2], // 爱
  [0.0, 0.2, 1.9, 0.5], // 机
  [0.0, 0.0, 0.5, 1.7], // 器
];

export const D_K = 4;
export const SCALE = Math.sqrt(D_K); // √d_k = 2

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));

export const V_NORM = V.map(norm); // ‖v_i‖
export const V_MAX = Math.max(...V_NORM);

export const softmax = (scores) => {
  const top = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - top));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
};

// 查询 q 的完整一次注意力：分数、权重、输出向量及其模长
export function attend(qi) {
  const q = Q[qi];
  const scores = K.map((k) => dot(q, k) / SCALE);
  const weights = softmax(scores);
  const out = [0, 0, 0, 0].map((_, j) => weights.reduce((sum, w, i) => sum + w * V[i][j], 0));
  return { scores, weights, out, outNorm: norm(out) };
}

export const QUERIES = TOKENS.map((_, qi) => attend(qi));

// 仪表盘量程（所有查询下的分数极值）
export const S_MIN = Math.min(...QUERIES.flatMap((q) => q.scores));
export const S_MAX = Math.max(...QUERIES.flatMap((q) => q.scores));
export const OUT_MAX = Math.max(...QUERIES.map((q) => q.outNorm));
