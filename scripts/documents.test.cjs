const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const express = require('express');
function loadDocuments(baseUrl = 'https://learning.example.com', authenticated = true) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/utils/documents.js'), 'utf8'), {
    module, require(name) {
      if (name === './config') return { ...require('../miniprogram/utils/config'), getApiBaseUrl: () => baseUrl };
      if (name === './session') return { headers() { if (!authenticated) throw new Error('请先登录'); return { Authorization: 'Bearer document-test-session' }; }, clear() {} };
      throw new Error(name);
    }
  });
  return module.exports;
}
const { fileTypeFromName, validateMaterial, isSafeDocumentUrl, openDocument } = loadDocuments();
const { createMaterialsRouter } = require('../server/materials');

const material = { id: 'reading-1', title: '学习资料', fileType: 'pdf', url: '/api/materials/reading-1/file', sizeBytes: 128 };
const documentUrl = 'https://learning.example.com' + material.url;
function wxMock(settings = {}) {
  const calls = [];
  const listeners = new Set();
  const mock = {
    calls, listeners,
    getAccountInfoSync: () => ({ miniProgram: { envVersion: settings.env || 'develop' } }),
    onAppShow(callback) { listeners.add(callback); },
    offAppShow(callback) { listeners.delete(callback); },
    show() { for (const callback of [...listeners]) callback(); },
    getFileSystemManager() {
      return {
        statSync: () => ({ size: settings.size === undefined ? 128 : settings.size }),
        unlink(options) { calls.push(['unlink', options.filePath]); }
      };
    },
    downloadFile(options) {
      calls.push(['download', options]);
      mock.downloadOptions = options;
      if (!settings.deferDownload) {
        if (settings.downloadError) options.fail({ errMsg: 'network failed' });
        else options.success({ statusCode: settings.statusCode || 200, tempFilePath: '/tmp/learning.pdf' });
      }
      return { abort() { calls.push(['abort']); options.fail({ errMsg: 'aborted' }); }, onProgressUpdate(callback) { mock.progress = callback; } };
    },
    openDocument(options) {
      calls.push(['open', options]);
      mock.openOptions = options;
      if (!settings.deferOpen) {
        if (settings.openError) options.fail({ errMsg: 'unsupported file' });
        else options.success({});
        if (options.complete) options.complete({});
      }
    }
  };
  return mock;
}
const count = (mock, call) => mock.calls.filter(item => item[0] === call).length;

test('File type detection supports uppercase PDF and Word extensions only', () => {
  for (const [name, type] of [['资料.PDF', 'pdf'], ['notes.DOC', 'doc'], ['notes.DoCx', 'docx']]) assert.equal(fileTypeFromName(name), type);
  for (const name of [null, '', 'pdf', 'a.pdf.exe', 'a.exe', 'a.txt', 'a.pdf?x=1', 'a.docx#anchor', 'a.pdf\n']) assert.equal(fileTypeFromName(name), null);
});
test('Metadata requires bounded local material paths, supported types and size', () => {
  assert.equal(validateMaterial(material), true);
  for (const patch of [
    { id: '../file' }, { title: '' }, { fileType: 'exe' }, { fileType: 'PDF' },
    { url: 'https://elsewhere.example/a.pdf' }, { url: '/api/materials/another/file' },
    { url: '/api/materials/../file' }, { sizeBytes: 0 }, { sizeBytes: 20 * 1024 * 1024 + 1 }, { sizeBytes: '128' }
  ]) assert.equal(validateMaterial({ ...material, ...patch }), false, JSON.stringify(patch));
});
test('Safe URLs require API file paths; HTTP is limited to development LAN/loopback', () => {
  const api = wxMock();
  for (const url of [documentUrl, 'http://10.12.195.50:3000' + material.url, 'http://192.168.1.2' + material.url, 'http://172.16.0.1' + material.url, 'http://localhost:3000' + material.url]) assert.equal(isSafeDocumentUrl(api, url), true, url);
  for (const url of [
    'javascript:alert(1)', 'file:///tmp/a.pdf', '//example.com/a.pdf', 'http://public.example.com' + material.url,
    'http://172.32.0.1' + material.url, 'http://10.999.0.1' + material.url,
    'https://user:secret@example.com' + material.url, documentUrl + '?next=evil', documentUrl + '#x',
    'https://example.com:65536' + material.url, 'https://example.com/api/materials/../file',
    'https://example.com/api/materials/%2e%2e/file', 'https://example.com\\evil' + material.url
  ]) assert.equal(isSafeDocumentUrl(api, url), false, url);
  for (const env of ['trial', 'release']) assert.equal(isSafeDocumentUrl(wxMock({ env }), 'http://10.0.0.1' + material.url), false);
  assert.equal(isSafeDocumentUrl({}, 'http://10.0.0.1' + material.url), false);
});
test('Successful download opens with the expected type/menu and cleans only on reader return', async () => {
  const api = wxMock();
  const operation = openDocument(api, { url: documentUrl, fileType: 'PDF' });
  await operation;
  assert.equal(count(api, 'download'), 1);
  assert.equal(api.downloadOptions.header.Authorization, 'Bearer document-test-session');
  assert.equal(count(api, 'open'), 1);
  assert.equal(api.openOptions.filePath, '/tmp/learning.pdf');
  assert.equal(api.openOptions.fileType, 'pdf');
  assert.equal(api.openOptions.showMenu, true);
  assert.equal(count(api, 'unlink'), 0, 'open callbacks are not reader-close callbacks');
  api.show();
  assert.equal(count(api, 'unlink'), 1);
  assert.equal(api.listeners.size, 0);
  api.show();
  operation.notifyVisible();
  assert.equal(count(api, 'unlink'), 1);
});
test('HTTP errors never open a document and discard any temporary response', async () => {
  const api = wxMock({ statusCode: 404 });
  await assert.rejects(openDocument(api, { url: documentUrl, fileType: 'pdf' }), /下载失败/);
  assert.equal(count(api, 'open'), 0);
  assert.equal(count(api, 'unlink'), 1);
  assert.equal(api.listeners.size, 0);
});
test('OpenDocument errors clean up and reject rather than claiming success', async () => {
  const api = wxMock({ openError: true });
  await assert.rejects(openDocument(api, { url: documentUrl, fileType: 'docx' }), /无法打开/);
  assert.equal(count(api, 'unlink'), 1);
  assert.equal(api.listeners.size, 0);
});
test('Unsafe URLs and unsupported types do not start downloads', async () => {
  const api = wxMock();
  await assert.rejects(openDocument(api, { url: 'file:///etc/passwd', fileType: 'pdf' }));
  await assert.rejects(openDocument(api, { url: documentUrl, fileType: 'exe' }));
  assert.equal(count(api, 'download'), 0);
});
test('Anonymous sessions and off-origin file requests never download or receive a Bearer token', async () => {
  const api = wxMock();
  await assert.rejects(loadDocuments(documentUrl.split('/api/')[0], false).openDocument(api, { url: documentUrl, fileType: 'pdf' }), /请先登录/);
  await assert.rejects(openDocument(api, { url: 'https://evil.example.com' + material.url, fileType: 'pdf' }), /非配置 API/);
  assert.equal(count(api, 'download'), 0);
});
test('Network failure and files over the size cap fail without opening', async () => {
  for (const settings of [{ downloadError: true }, { size: 20 * 1024 * 1024 + 1 }, { size: 0 }]) {
    const api = wxMock(settings);
    await assert.rejects(openDocument(api, { url: documentUrl, fileType: 'pdf' }));
    assert.equal(count(api, 'open'), 0);
    assert.equal(api.listeners.size, 0);
  }
  const api = wxMock({ deferDownload: true });
  const operation = openDocument(api, { url: documentUrl, fileType: 'pdf' });
  api.progress({ totalBytesExpectedToWrite: 21 * 1024 * 1024 });
  await assert.rejects(operation, /20 MB/);
  assert.equal(count(api, 'abort'), 1);
  api.downloadOptions.success({ statusCode: 200, tempFilePath: '/tmp/late.pdf' });
  assert.equal(count(api, 'unlink'), 1);
  assert.equal(count(api, 'open'), 0);
});
test('Detach cancellation aborts a download and cleans late results', async () => {
  const api = wxMock({ deferDownload: true });
  const operation = openDocument(api, { url: documentUrl, fileType: 'pdf' });
  operation.cancel();
  await assert.rejects(operation, /取消/);
  assert.equal(count(api, 'abort'), 1);
  api.downloadOptions.success({ statusCode: 200, tempFilePath: '/tmp/late.pdf' });
  assert.equal(count(api, 'unlink'), 1);
  assert.equal(count(api, 'open'), 0);
});
test('Cancellation during reader handoff does not delete a file still in native use', async () => {
  const api = wxMock({ deferOpen: true });
  const operation = openDocument(api, { url: documentUrl, fileType: 'pdf' });
  operation.cancel();
  await assert.rejects(operation, /取消/);
  assert.equal(count(api, 'unlink'), 0);
  api.openOptions.success({});
  assert.equal(count(api, 'unlink'), 0);
  api.show();
  assert.equal(count(api, 'unlink'), 1);
  assert.equal(api.listeners.size, 0);
});

function component(settings = {}) {
  let definition;
  const api = wxMock(settings);
  const requests = [];
  api.request = options => { const task = { abort() { task.aborted = true; } }; requests.push({ options, task }); return task; };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/components/reading-materials/reading-materials.js'), 'utf8'), {
    Component(value) { definition = value; }, wx: api,
    require(name) {
      const baseUrl = settings.baseUrl === undefined ? 'https://learning.example.com' : settings.baseUrl;
      if (name === '../../utils/config') return { getApiBaseUrl: () => baseUrl };
      if (name === '../../utils/api') return { request(route) {
        let success, failure;
        const task = api.request({ url: baseUrl + route, header: { Authorization: 'Bearer document-test-session' },
          success(response) { if (response.statusCode === 200) success(response.data); else failure(new Error('资料加载失败')); },
          fail() { failure(new Error('网络中断')); }
        });
        return { abort: () => task.abort(), then(resolve, reject) { success = resolve; failure = reject; } };
      } };
      if (name === '../../utils/documents') return loadDocuments(baseUrl);
      throw new Error(name);
    }
  });
  const instance = {
    ...definition.methods,
    data: { ...definition.data }, properties: { scope: 'course', ownerId: 'focus' }, updates: 0,
    setData(value) { this.updates++; Object.assign(this.data, value); }
  };
  definition.lifetimes.attached.call(instance);
  return { definition, instance, api, requests };
}
test('Component distinguishes errors/empty results and retries', () => {
  const { instance, requests } = component();
  assert.equal(instance.data.loading, true);
  requests[0].options.success({ statusCode: 500, data: {} });
  assert.ok(instance.data.error);
  assert.equal(instance.data.loading, false);
  instance.loadMaterials();
  requests[1].options.success({ statusCode: 200, data: { materials: [] } });
  assert.equal(instance.data.error, '');
  assert.equal(instance.data.materials.length, 0);
  instance.loadMaterials();
  requests[2].options.success({ statusCode: 200, data: { materials: [{ ...material, url: 'https://evil.example/a.pdf' }] } });
  assert.ok(instance.data.error);
});
test('Owner changes invalidate stale responses and detached components never call setData', () => {
  const { definition, instance, requests } = component();
  instance.properties.ownerId = 'new-owner';
  definition.observers['scope, ownerId'].call(instance);
  assert.equal(requests[0].task.aborted, true);
  assert.match(requests[1].options.url, /ownerId=new-owner/);
  requests[0].options.success({ statusCode: 200, data: { materials: [material] } });
  assert.equal(instance.data.materials.length, 0);
  requests[1].options.success({ statusCode: 200, data: { materials: [] } });
  definition.lifetimes.detached.call(instance);
  const updates = instance.updates;
  requests[1].options.fail({});
  requests[1].options.success({ statusCode: 200, data: { materials: [material] } });
  assert.equal(instance.updates, updates);
});
test('Reattaching a component does not revive requests from its earlier attachment', () => {
  const { definition, instance, requests } = component();
  definition.lifetimes.detached.call(instance);
  definition.lifetimes.attached.call(instance);
  requests[0].options.success({ statusCode: 200, data: { materials: [material] } });
  assert.equal(instance.data.materials.length, 0);
  assert.equal(instance.data.loading, true);
  requests[1].options.success({ statusCode: 200, data: { materials: [] } });
  assert.equal(instance.data.loading, false);
});
test('Component prevents duplicate opens and preserves reader files across detach', async () => {
  const { definition, instance, requests, api } = component({ deferDownload: true });
  requests[0].options.success({ statusCode: 200, data: { materials: [material] } });
  const event = { currentTarget: { dataset: { id: material.id } } };
  instance.openMaterial(event);
  instance.openMaterial(event);
  assert.equal(count(api, 'download'), 1);
  api.downloadOptions.success({ statusCode: 200, tempFilePath: '/tmp/learning.pdf' });
  await Promise.resolve();
  await Promise.resolve();
  definition.lifetimes.detached.call(instance);
  const updates = instance.updates;
  assert.equal(count(api, 'unlink'), 0);
  api.show();
  assert.equal(count(api, 'unlink'), 1);
  await Promise.resolve();
  assert.equal(instance.updates, updates);
});
test('Component rejects unconfigured API instead of requesting or pretending empty', () => {
  const { instance, requests } = component({ baseUrl: '' });
  assert.equal(requests.length, 0);
  assert.match(instance.data.error, /尚未配置/);
});

function get(server, route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port: server.address().port, path: route }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
  });
}
async function fixture(t) {
  // Windows TEMP can use an 8.3 alias; compare containment using canonical fixture paths.
  const dir = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'blueprint-materials-')));
  const filesDir = path.join(dir, 'files');
  const catalogPath = path.join(dir, 'catalog.json');
  await fs.promises.mkdir(filesDir);
  await fs.promises.writeFile(catalogPath, '[]');
  const app = express();
  app.use('/api/materials', createMaterialsRouter({ filesDir, catalogPath }));
  const server = await new Promise(resolve => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fs.promises.rm(dir, { recursive: true, force: true });
  });
  return { dir, filesDir, server, catalogPath,
    writeCatalog: entries => fs.promises.writeFile(catalogPath, JSON.stringify(entries)) };
}
const entry = (id, file, extra = {}) => ({ id, scope: 'course', ownerId: 'focus', title: '学习资料 ' + id, file, ...extra });
const listRoute = '/api/materials?scope=course&ownerId=focus';
const signatures = {
  PDF: Buffer.from('%PDF-1.7\nfixture'),
  DOC: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]),
  DOCX: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0])
};

test('Router lists only matching local materials and serves all three case-insensitive types', async t => {
  const f = await fixture(t);
  const entries = [];
  for (const [ext, content] of Object.entries(signatures)) {
    const id = ext.toLowerCase();
    await fs.promises.writeFile(path.join(f.filesDir, '资料.' + ext), content);
    entries.push(entry(id, '资料.' + ext));
  }
  entries.push(entry('topic-only', '资料.PDF', { scope: 'topic', ownerId: 'topic-id' }));
  await f.writeCatalog(entries);
  const response = await get(f.server, listRoute);
  assert.equal(response.status, 200);
  const materials = JSON.parse(response.body).materials;
  assert.equal(materials.length, 3);
  for (const value of materials) {
    assert.equal(validateMaterial(value), true);
    const file = await get(f.server, value.url);
    assert.equal(file.status, 200);
    assert.deepEqual(file.body, signatures[value.fileType.toUpperCase()]);
    assert.equal(file.headers['content-length'], String(value.sizeBytes));
    assert.equal(file.headers['x-content-type-options'], 'nosniff');
    assert.match(file.headers['content-disposition'], /^attachment;/);
  }
  const topic = await get(f.server, '/api/materials?scope=topic&ownerId=topic-id');
  assert.equal(JSON.parse(topic.body).materials[0].id, 'topic-only');
  assert.deepEqual(JSON.parse((await get(f.server, '/api/materials?scope=topic&ownerId=focus')).body), { materials: [] });
});
test('Router rejects bad queries and returns errors for broken catalogs, not empty lists', async t => {
  const f = await fixture(t);
  for (const route of ['/api/materials', '/api/materials?scope=lesson&ownerId=focus', '/api/materials?scope=course&ownerId=', '/api/materials?scope=course&ownerId[]=focus']) assert.equal((await get(f.server, route)).status, 400);
  assert.deepEqual(JSON.parse((await get(f.server, listRoute)).body), { materials: [] });
  await fs.promises.writeFile(f.catalogPath, '{ broken JSON');
  assert.equal((await get(f.server, listRoute)).status, 500);
  assert.equal((await get(f.server, '/api/materials/missing/file')).status, 500);
});
test('Missing, oversized, traversal, executable, invalid signature and duplicate files stay private', async t => {
  const f = await fixture(t);
  await fs.promises.writeFile(path.join(f.filesDir, 'valid.pdf'), signatures.PDF);
  await fs.promises.writeFile(path.join(f.dir, 'outside.pdf'), signatures.PDF);
  await fs.promises.writeFile(path.join(f.filesDir, 'bad.pdf'), 'MZnot-a-document');
  await fs.promises.writeFile(path.join(f.filesDir, 'payload.exe'), signatures.PDF);
  const oversized = await fs.promises.open(path.join(f.filesDir, 'large.pdf'), 'w');
  await oversized.truncate(20 * 1024 * 1024 + 1);
  await oversized.close();
  const unsafe = [entry('missing', 'missing.pdf'), entry('traversal', '../outside.pdf'), entry('backslash', '..\\outside.pdf'), entry('remote', 'https://example.com/a.pdf'), entry('exe', 'payload.exe'), entry('bad', 'bad.pdf'), entry('large', 'large.pdf'), entry('duplicate', 'valid.pdf'), entry('duplicate', 'valid.pdf')];
  await f.writeCatalog(unsafe);
  assert.deepEqual(JSON.parse((await get(f.server, listRoute)).body), { materials: [] });
  for (const value of unsafe) assert.equal((await get(f.server, '/api/materials/' + value.id + '/file')).status, 404, value.id);
  assert.equal((await get(f.server, '/api/materials/%2e%2e%2foutside/file')).status, 404);
  await f.writeCatalog([entry('removed', 'valid.pdf')]);
  assert.equal(JSON.parse((await get(f.server, listRoute)).body).materials.length, 1);
  await fs.promises.unlink(path.join(f.filesDir, 'valid.pdf'));
  assert.equal((await get(f.server, '/api/materials/removed/file')).status, 404);
});
test('Symlink files outside the configured directory are not listed or served', async t => {
  const f = await fixture(t);
  const outside = path.join(f.dir, 'outside.pdf');
  await fs.promises.writeFile(outside, signatures.PDF);
  try { await fs.promises.symlink(outside, path.join(f.filesDir, 'link.pdf'), 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('OS does not permit creating file symlinks'); return; }
    throw error;
  }
  await f.writeCatalog([entry('link', 'link.pdf')]);
  assert.deepEqual(JSON.parse((await get(f.server, listRoute)).body), { materials: [] });
  assert.equal((await get(f.server, '/api/materials/link/file')).status, 404);
});
