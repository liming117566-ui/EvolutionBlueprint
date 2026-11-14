const config = require('./config');
const session = require('./session');
const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const TYPES = ['pdf', 'doc', 'docx'];
const ID = /^[A-Za-z0-9_-]{1,100}$/;

function fileTypeFromName(name) {
  if (typeof name !== 'string' || /[?#\x00-\x1f]/.test(name)) return null;
  const match = /\.([a-z]+)$/i.exec(name);
  const type = match && match[1].toLowerCase();
  return TYPES.indexOf(type) >= 0 ? type : null;
}

// Catalog responses only identify files on this API, never remote URLs.
function validateMaterial(material) {
  return Boolean(material && typeof material === 'object' &&
    typeof material.id === 'string' && ID.test(material.id) &&
    typeof material.title === 'string' && material.title.trim() && material.title.length <= 200 &&
    TYPES.indexOf(material.fileType) >= 0 &&
    material.url === '/api/materials/' + material.id + '/file' &&
    Number.isSafeInteger(material.sizeBytes) && material.sizeBytes > 0 && material.sizeBytes <= MAX_SIZE_BYTES);
}

function isSafeDocumentUrl(api, url) {
  if (typeof url !== 'string' || /[\s\\\x00-\x1f\x7f]/.test(url)) return false;
  const match = /^(https?):\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(\/api\/materials\/[A-Za-z0-9_-]{1,100}\/file)$/.exec(url);
  if (!match || (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535))) return false;
  const host = match[2].toLowerCase();
  if (!host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return false;
  if (match[1] === 'https') return true;
  let develop = false;
  try { develop = api.getAccountInfoSync().miniProgram.envVersion === 'develop'; } catch (_) {}
  if (!develop) return false;
  if (host === 'localhost') return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || !host.split('.').every(part => /^(0|[1-9][0-9]{0,2})$/.test(part)) || octets.some(n => n > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
}

function openDocument(api, options) {
  let cancel = function () {};
  let notifyVisible = function () {};
  const promise = new Promise((resolve, reject) => {
    const type = options && typeof options.fileType === 'string' ? options.fileType.toLowerCase() : '';
    if (!options || !isSafeDocumentUrl(api, options.url) || TYPES.indexOf(type) < 0) {
      reject(new Error('文档地址或文件类型不安全')); return;
    }
    const origin = config.getApiBaseUrl(api);
    if (!config.validOrigin(origin, api) || !options.url.startsWith(origin + '/api/materials/')) {
      reject(new Error('拒绝向非配置 API 发送登录凭据')); return;
    }
    let header;
    try { header = session.headers(options.url); }
    catch (error) { reject(error); return; }
    // onAppShow survives component detach while the native reader owns the file.
    if (!api || typeof api.downloadFile !== 'function' || typeof api.openDocument !== 'function' ||
        typeof api.onAppShow !== 'function' || typeof api.offAppShow !== 'function' || typeof api.getFileSystemManager !== 'function') {
      reject(new Error('当前微信版本不支持文档阅读，请升级后重试')); return;
    }
    let fs;
    try { fs = api.getFileSystemManager(); } catch (_) { reject(new Error('无法访问临时文件')); return; }
    if (!fs || typeof fs.unlink !== 'function') { reject(new Error('无法清理临时文件')); return; }
    let task;
    let filePath;
    let phase = 'download';
    let cancelled = false;
    let settled = false;
    let listening = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve();
    };
    const removeListener = () => {
      if (!listening) return;
      listening = false;
      try { api.offAppShow(onReturn); } catch (_) {}
    };
    const unlink = (target) => {
      if (!target) return;
      try { fs.unlink({ filePath: target, fail() {} }); } catch (_) {}
    };
    const cleanup = () => {
      const target = filePath;
      filePath = null;
      phase = 'done';
      removeListener();
      unlink(target);
    };
    const fail = (message) => { cleanup(); finish(new Error(message)); };
    function onReturn() {
      if (phase === 'reader') cleanup();
    }
    notifyVisible = onReturn;
    cancel = () => {
      cancelled = true;
      if (phase === 'download') {
        cleanup();
        try { if (task && task.abort) task.abort(); } catch (_) {}
      }
      // Never unlink during openDocument handoff or while the native reader is active.
      finish(new Error('文档打开已取消'));
    };
    try {
      api.onAppShow(onReturn);
      listening = true;
      task = api.downloadFile({
        url: options.url,
        header,
        timeout: 60000,
        success(result) {
          if (cancelled || phase === 'done') { unlink(result.tempFilePath); return; }
          filePath = result.tempFilePath;
          try {
            if (session.headers(options.url).Authorization !== header.Authorization) { fail('账号已切换，请重新打开资料'); return; }
          } catch (_) { fail('登录已失效，请重新登录'); return; }
          if (result.statusCode !== 200 || typeof filePath !== 'string' || !filePath) {
            if (result.statusCode === 401) session.clear();
            fail(result.statusCode === 401 ? '登录已失效，请重新登录' : result.statusCode === 403 ? '当前账号已无此资料权限，请联系课程提供方' : '下载失败，请稍后重试'); return;
          }
          try {
            if (typeof fs.statSync === 'function') {
              const stat = fs.statSync(filePath);
              if (!stat || stat.size <= 0 || stat.size > MAX_SIZE_BYTES) { fail('文件为空或超过 20 MB'); return; }
            }
            phase = 'opening';
            api.openDocument({
              filePath,
              fileType: type,
              showMenu: true,
              success() { phase = 'reader'; finish(); },
              fail() { fail('无法打开文档，请重试或检查文件是否损坏'); }
              // complete means handoff finished, NOT reader closed. Cleanup on return.
            });
          } catch (_) { fail('无法打开文档，请稍后重试'); }
        },
        fail() { if (!cancelled) fail('下载失败，请检查网络与下载域名配置'); }
      });
      if (task && typeof task.onProgressUpdate === 'function') {
        task.onProgressUpdate(progress => {
          if (phase === 'download' && (progress.totalBytesWritten > MAX_SIZE_BYTES || progress.totalBytesExpectedToWrite > MAX_SIZE_BYTES)) {
            fail('文件超过 20 MB');
            try { task.abort(); } catch (_) {}
          }
        });
      }
    } catch (_) { fail('下载失败，请稍后重试'); }
  });
  promise.cancel = () => cancel();
  // Native document return can also surface as a page show in some WeChat versions.
  promise.notifyVisible = () => notifyVisible();
  return promise;
}

module.exports = { fileTypeFromName, validateMaterial, isSafeDocumentUrl, openDocument };
