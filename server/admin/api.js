let csrf = '';
export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
export function clearSession() { csrf = ''; }
export async function api(path, { method = 'GET', body, signal } = {}) {
  if (!path.startsWith('/api/admin/')) throw new Error('仅允许同源管理接口');
  const headers = { Accept: 'application/json' };
  if (method !== 'GET' && method !== 'HEAD') {
    if (!csrf) throw new Error('会话尚未初始化，请刷新后重试');
    headers['X-CSRF-Token'] = csrf;
  }
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  let response;
  try { response = await fetch(path, { method, headers, body, credentials: 'same-origin', cache: 'no-store', signal }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('无法连接管理服务，请检查网络后重试。写入结果未知时，请先刷新核对，勿重复生成卡密。'); }
  let data;
  try { data = response.status === 204 ? {} : await response.json(); }
  catch { throw new ApiError('服务返回了非 JSON 响应，请检查服务状态', response.status); }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('admin-session-expired'));
    throw new ApiError(data.error || `请求失败（${response.status}）`, response.status, data.code);
  }
  if (typeof data.csrf === 'string') csrf = data.csrf;
  return data;
}
export const query = values => new URLSearchParams(Object.entries(values).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
export const endpoint = (base, id, suffix = '') => `/api/admin/${base}/${encodeURIComponent(id)}${suffix}`;
