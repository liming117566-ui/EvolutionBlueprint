const learning = require('../../utils/learning');
const reading = require('../../utils/lesson-sections');
const catalog = require('../../utils/catalog');
Page({
  data: { course: null, chapters: [], active: 0, chapterId: '', chapterTitle: '', showCatalog: false, completed: false, sections: [], sectionActive: -1, section: null, loading: false, saving: false, error: '' },
  onLoad(options) {
    this._courseId = options.course;
    this._chapterId = options.chapter || null;
    this._sectionId = options.section || null;
    learning.authorized();
  },
  onShow() { return this.retry(); },
  onHide() {
    this._version = (this._version || 0) + 1;
    this.setData({ course: null, sections: [], section: null, chapters: [], showCatalog: false });
  },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    if (!learning.authorized()) return;
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', course: null, sections: [], section: null });
    try {
      await Promise.all([catalog.bootstrap(), require('../../utils/session').me(), learning.refresh()]);
      const course = learning.decorate(await catalog.full(this._courseId));
      if (version !== this._version) return;
      const chapterId = this._chapterId || course.active;
      if (chapterId && !course.chapters.some(c => c.id === chapterId)) throw new Error('这个章节已调整或下架，请返回课程目录');
      this.loadChapter(course, chapterId);
      wx.setNavigationBarTitle({ title: course.title });
      if (this._sectionId) {
        const id = this._sectionId; this._sectionId = null;
        this.setData({ loading: false });
        await this.openSection({ currentTarget: { dataset: { id } } });
      }
    } catch (error) { if (version === this._version) this.setData({ error: error.message, course: null, sections: [], section: null }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  loadChapter(source, chapterId) {
    const course = learning.decorate(source);
    const active = course.chapters.findIndex(ch => ch.id === chapterId);
    const chapter = course.chapters[active];
    this._chapterId = chapterId;
    const saved = chapter ? reading.progress(course, chapterId) : { completed: [] };
    const sections = chapter ? chapter.sections.map((item, index) => ({ ...item, index, done: saved.completed.includes(item.id) })) : [];
    this.setData({ course, active: Math.max(0, active), chapterId: chapterId || '', chapterTitle: chapter && chapter.title || '', chapters: learning.chapters(course), completed: course.completed.includes(chapterId), showCatalog: false, sections, sectionActive: -1, section: null });
  },
  async openSection(event) {
    if (this.data.saving || this.data.loading) return;
    const id = event.currentTarget.dataset.id;
    const source = this.data.sections.find(s => s.id === id);
    if (!source) return;
    const version = this._version;
    this.setData({ loading: true, error: '', section: null });
    try {
      // A section is never opened from static/offline content; check current entitlement again.
      const course = await catalog.full(this._courseId);
      if (version !== this._version) return;
      const chapter = course.chapters.find(c => c.id === this._chapterId);
      if (!chapter || !chapter.sections.some(s => s.id === id)) throw new Error('这个小章节已调整，请刷新目录');
      this.loadChapter(course, this._chapterId);
      await reading.remember(course.id, chapter.id, id);
      if (version !== this._version) return;
      const index = this.data.sections.findIndex(s => s.id === id);
      this.setData({ sectionActive: index, section: this.data.sections[index] }, () => wx.pageScrollTo({ selector: '#section-reader', duration: 0 }));
    } catch (error) {
      if (version === this._version) this.setData({ error: error.message, section: null, ...(error.status === 401 || error.status === 403 ? { course: null, sections: [] } : {}) });
    } finally { if (version === this._version) this.setData({ loading: false }); }
  },
  closeSection() { this.setData({ sectionActive: -1, section: null }, () => wx.pageScrollTo({ selector: '#section-directory', duration: 0 })); },
  async nextSection() {
    const { course, chapterId, section } = this.data;
    if (!section || this.data.saving || this.data.loading) return;
    const version = this._version;
    this.setData({ saving: true, error: '' });
    try {
      await reading.complete(course.id, chapterId, section.id);
      if (version !== this._version) return;
      const saved = reading.progress(course, chapterId);
      const sections = this.data.sections.map(item => ({ ...item, done: saved.completed.includes(item.id) }));
      this.setData({ sections, course: learning.decorate(course) });
      if (sections.length && sections.every(s => s.done)) {
        const next = course.chapters[this.data.active + 1];
        this.loadChapter(course, next ? next.id : chapterId);
        wx.pageScrollTo({ scrollTop: 0, duration: 0 });
        if (!next) wx.showToast({ title: '学习记录已同步', icon: 'none' });
      } else {
        const next = sections.find(s => s.index > this.data.sectionActive && !s.done) || sections.find(s => !s.done);
        this.setData({ saving: false });
        if (next) await this.openSection({ currentTarget: { dataset: { id: next.id } } });
      }
    } catch (error) {
      if (version === this._version) this.setData({ error: error.message, ...(error.status === 401 || error.status === 403 ? { course: null, sections: [], section: null } : {}) });
    } finally { if (version === this._version) this.setData({ saving: false }); }
  },
  openCatalog() { this.setData({ showCatalog: true }); },
  closeCatalog() { this.setData({ showCatalog: false }); },
  selectLesson(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.chapters.some(c => c.id === id)) return;
    this._chapterId = id;
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    return this.retry();
  },
  previewVideo() { wx.showToast({ title: '当前课程提供图文阅读', icon: 'none' }); },
  redeem() { wx.redirectTo({ url: '/pages/gate/gate?redeem=1' }); },
  goCourses() { wx.redirectTo({ url: '/pages/learn/learn' }); }
});
