/**
 * Supabase 版 · AI 未开启
 *
 * 这个版本不含大模型能力（Supabase 不提供 LLM，且暂不接入外部 API）。
 * 这里保留原版 ai.js 的全部导出名，保证 app.js / ideas.js 不用改逻辑：
 * 所有 AI 功能被调用时抛出友好错误，各调用点已有降级处理——
 * 记录照常保存、分类/类型由用户手选、拆解面板可手动编写。
 *
 * 以后想恢复 AI：把原版 js/ai.js 拿回来，在 cloud.js 里把 llm
 * 指到你自己的 OpenAI 兼容接口（DeepSeek、智谱、Kimi 等均可），即可无缝启用。
 */

export const AI_ENABLED = false;

const KIND_LABEL = { idea: '想法', material: '资料', todo: '待办', note: '笔记' };
const CATEGORIES = ['工作', '学习', '生活', '健康', '财务', '灵感', '资料', '其他'];

export { KIND_LABEL, CATEGORIES };

const OFF = 'AI 功能未开启（本版本不含大模型，类型与分类请手动选择）';

function off() {
  throw new Error(OFF);
}

export async function ensureModel() {
  off();
}

export function modelLabel() {
  return 'AI 未开启';
}

export async function analyzeEntry() {
  off();
}

export async function extractKeyPoints() {
  off();
}

export async function breakdownIdea() {
  off();
}

export async function generateSummary() {
  off();
}

export async function answerQuestion() {
  off();
}

export async function delayRetro() {
  off();
}
