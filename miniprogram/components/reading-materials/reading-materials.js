const { getApiBaseUrl } = require('../../utils/config');
const api = require('../../utils/api');
const { validateMaterial, isSafeDocumentUrl, openDocument } = require('../../utils/documents');

function displaySize(bytes) {
  return bytes < 1024 * 1024 ? Math.max(1, Math.ceil(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

Component({
  properties: { scope: { type: String, value: 'course' }, ownerId: { type: String, value: '' } },
  data: { loading: true, materials: [], error: '', openError: '', openingId: '' },
  observers: {
    'scope, ownerId': function () { if (this._alive) this.loadMaterials(); }
  },
  lifetimes: {
    attached() { this._alive = true; this._version = this._version || 0; this.loadMaterials(); },
    detached() {
      this._alive = false;
      this._version += 1;
      if (this._request && this._request.abort) this._request.abort();
      if (this._documentOperation) this._documentOperation.cancel();
    }
  },
  pageLifetimes: {
    show() { if (this._documentOperation) this._documentOperation.notifyVisible(); }
  },
  methods: {
    loadMaterials() {
      if (!this._alive) return;
      const version = ++this._version;
      if (this._request && this._request.abort) this._request.abort();
      if (this._documentOperation) this._documentOperation.cancel();
      this._documentOperation = null;
      this._opening = false;
      this.setData({ loading: true, materials: [], error: '', openError: '', openingId: '' });
      const scope = this.properties.scope;
      const ownerId = this.properties.ownerId;
      const isCurrent = () => this._alive && version === this._version;
      const fail = error => { if (isCurrent()) this.setData({ loading: false, error }); };
      if (!['course', 'chapter', 'section'].includes(scope) || typeof ownerId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(ownerId)) {
        fail('尚未指定有效的学习资料范围'); return;
      }
      let baseUrl;
      try { baseUrl = getApiBaseUrl().replace(/\/+$/, ''); } catch (_) {}
      if (!isSafeDocumentUrl(wx, baseUrl + '/api/materials/config-check/file')) {
        fail('资料服务尚未配置：开发版需使用局域网地址，正式版需配置 HTTPS 域名'); return;
      }
      this._baseUrl = baseUrl;
      try {
        const request = api.request('/api/materials?scope=' + encodeURIComponent(scope) + '&ownerId=' + encodeURIComponent(ownerId));
        this._request = request;
        request.then(result => {
          if (!isCurrent()) return;
          const materials = result.materials;
          if (!Array.isArray(materials) || !materials.every(validateMaterial) || new Set(materials.map(item => item.id)).size !== materials.length) {
            fail('资料服务返回的数据有误，请稍后重试'); return;
          }
          this.setData({ loading: false, error: '', materials: materials.map(item => ({
            ...item, typeLabel: item.fileType === 'pdf' ? 'PDF' : 'Word', sizeLabel: displaySize(item.sizeBytes)
          })) });
        }, error => fail(error.message || '资料加载失败，请重试'));
      } catch (_) { fail('资料加载失败，请稍后重试'); }
    },
    openMaterial(event) {
      if (!this._alive || this._opening) return;
      const id = event.currentTarget.dataset.id;
      const material = this.data.materials.find(item => item.id === id);
      if (!validateMaterial(material)) return;
      const version = this._version;
      this._opening = true;
      this.setData({ openingId: id, openError: '' });
      const operation = openDocument(wx, { url: this._baseUrl + material.url, fileType: material.fileType });
      this._documentOperation = operation;
      operation.then(() => {
        if (this._alive && version === this._version) this.setData({ openError: '' });
      }, error => {
        if (this._alive && version === this._version) this.setData({ openError: error.message || '打开失败，请重试' });
      }).then(() => {
        if (this._documentOperation !== operation) return;
        this._opening = false;
        if (this._alive && version === this._version) this.setData({ openingId: '' });
      });
    }
  }
});
