const catalog = require('../../utils/catalog');
Component({
  properties: { active: { type: String, value: 'home' }, settings: { type: Object, value: null } },
  data: { busy: false, tabs: catalog.settings().nav },
  observers: { settings(value) { this.setData({ tabs: value && Array.isArray(value.nav) ? value.nav : catalog.settings().nav }); } },
  methods: {
    navigate(event) {
      const page = event.currentTarget.dataset.page;
      if (!['home', 'learn', 'profile'].includes(page) || this.data.busy || page === this.data.active) return;
      this.setData({ busy: true });
      wx.redirectTo({ url: `/pages/${page}/${page}`, complete: () => this.setData({ busy: false }) });
    }
  }
});
