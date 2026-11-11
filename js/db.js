import { cloud } from './cloud.js';

const db = () => cloud.database;

function fail(error, fallback) {
  const message = error?.message || error?.error_description || fallback || '请求失败，请稍后重试';
  const wrapped = new Error(message);
  wrapped.code = error?.code;
  wrapped.raw = error;
  throw wrapped;
}

function explain(error) {
  const code = error?.code;
  if (code === '42P01') return '数据表尚未创建，请稍后再试';
  if (code === '42501') return '没有权限操作这条记录';
  if (code === '23505') return '已存在相同的记录';
  return error?.message || '请求失败，请稍后重试';
}

/* ------------------------------- 条目 ------------------------------- */

export async function listEntries(limit = 500) {
  const { data, error } = await db()
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(error, '读取记录失败');
  return data ?? [];
}

export async function createEntry(fields) {
  const { data, error } = await db().from('entries').insert(fields).select();
  if (error) fail(error, '保存记录失败');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) fail(null, '保存未成功，请检查登录状态');
  return row;
}

export async function updateEntry(id, patch) {
  const { data, error } = await db()
    .from('entries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) fail(error, '更新记录失败');
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) fail(null, '这条记录没有更新成功，可能已不存在');
  return rows[0];
}

export async function deleteEntry(id) {
  const { data, error } = await db().from('entries').delete().eq('id', id).select();
  if (error) fail(error, '删除记录失败');
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) fail(null, '这条记录没有删除成功，可能已不存在');
  return true;
}

/* ------------------------------- 阶段总结 ------------------------------- */

export async function listSummaries(limit = 30) {
  const { data, error } = await db()
    .from('summaries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(error, '读取阶段总结失败');
  return data ?? [];
}

export async function createSummary(fields) {
  const { data, error } = await db().from('summaries').insert(fields).select();
  if (error) fail(error, '保存阶段总结失败');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) fail(null, '总结未保存成功，请检查登录状态');
  return row;
}

export async function deleteSummary(id) {
  const { data, error } = await db().from('summaries').delete().eq('id', id).select();
  if (error) fail(error, '删除阶段总结失败');
  return Array.isArray(data) ? data : [];
}

/* ------------------------------- 问答记录 ------------------------------- */

export async function listQaLogs(limit = 20) {
  const { data, error } = await db()
    .from('qa_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

export async function createQaLog(fields) {
  const { data, error } = await db().from('qa_logs').insert(fields).select();
  if (error) return null;
  return Array.isArray(data) ? data[0] : data;
}

export async function clearQaLogs() {
  const { error } = await db().from('qa_logs').delete().neq('id', 0);
  if (error) fail(error, '清空问答记录失败');
  return true;
}

export { explain };
