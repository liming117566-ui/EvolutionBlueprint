'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mini = path.resolve(__dirname, '../miniprogram/utils');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const localTime = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();

function environment({ signedIn = true, time = localTime(2026, 11, 16) } = {}) {
  const storage = new Map(), writes = [], modules = new Map();
  let currentOrigin = 'http://127.0.0.1:3002', clock = time;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const wx = {
    getStorageSync(key) { return copy(storage.get(key)); },
    setStorageSync(key, value) { storage.set(key, copy(value)); writes.push(key); },
    getWindowInfo() { return { statusBarHeight: 24 }; },
    getMenuButtonBoundingClientRect() { return { top: 32, bottom: 64 }; }
  };
  const config = { getApiBaseUrl: () => currentOrigin, validOrigin: value => /^https?:\/\/[^/]+$/.test(value) };
  function load(name) {
    name = path.basename(name, '.js');
    if (name === 'config') return config;
    if (name === 'api' || name === 'catalog') return {};
    if (modules.has(name)) return modules.get(name).exports;
    const module = { exports: {} }; modules.set(name, module);
    const filename = path.join(mini, name + '.js');
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, wx, Date: FakeDate, console, require: load }, { filename });
    return module.exports;
  }
  const session = load('session'), helper = load('study-space');
  function signIn(id = 'user-a') { wx.setStorageSync('blueprintSessionV2', { origin: currentOrigin, token: 'test-token-' + id, user: { id }, test: true }); }
  if (signedIn) signIn();
  return {
    helper, session, storage, writes,
    signIn,
    origin(value) { currentOrigin = value; },
    time(value) { clock = value; },
    learning(value) { wx.setStorageSync(session.userKey('learning'), value); }
  };
}

test('study space: notes, visits, check-ins and goals are isolated by both service origin and user', () => {
  const env = environment(), study = env.helper;
  study.visit({ id: 'math', title: '数学' }); study.checkin(); study.addNote('用户甲的笔记'); study.write({ goal: 30 });
  const originalKey = env.session.userKey('studySpaceV1'), original = copy(study.read());

  env.signIn('user-b');
  assert.deepEqual(copy(study.read()), { visits: [], checkins: [], notes: [], goal: 15 });
  study.addNote('用户乙的笔记'); study.write({ goal: 10 });
  assert.notEqual(env.session.userKey('studySpaceV1'), originalKey);

  env.origin('http://192.168.1.8:3002');
  assert.equal(env.session.current(), null, 'a saved session for another service cannot authorize writes');
  const writeCount = env.writes.length;
  assert.equal(study.addNote('不能写进旧服务的笔记'), false);
  assert.equal(env.writes.length, writeCount);
  env.signIn('user-a');
  assert.deepEqual(copy(study.read()), { visits: [], checkins: [], notes: [], goal: 15 });
  study.addNote('另一个服务中的笔记');
  assert.notEqual(env.session.userKey('studySpaceV1'), originalKey);

  env.origin('http://127.0.0.1:3002'); env.signIn('user-a');
  assert.deepEqual(copy(study.read()), original);
  env.signIn('user-b');
  assert.equal(study.read().goal, 10);
  assert.deepEqual(copy(study.read().notes.map(note => note.text)), ['用户乙的笔记']);
});

test('study space: anonymous operations cannot persist personal data or create learning activity', () => {
  const env = environment({ signedIn: false }), study = env.helper;
  assert.equal(study.write({ goal: 30 }), false);
  assert.equal(study.checkin(), false);
  assert.equal(study.addNote('匿名笔记'), false);
  study.visit({ id: 'math', title: '数学' });
  assert.equal(env.storage.size, 0);
  assert.equal(env.writes.length, 0);
  const result = study.summary();
  assert.equal(result.activeDays, 0); assert.equal(result.weekActive, 0);
  assert.equal(result.completed, 0); assert.equal(result.notesCount, 0);
  assert.equal(result.checked, false);
});

test('study space: today check-in is idempotent and changes only when the local date advances', () => {
  const env = environment({ time: localTime(2026, 11, 16, 0) }), study = env.helper;
  assert.equal(study.summary().checked, false);
  assert.equal(study.checkin(), true); assert.equal(study.checkin(), true);
  env.time(localTime(2026, 11, 16, 23)); study.checkin();
  assert.deepEqual(copy(study.read().checkins), ['2026-11-16']);
  assert.equal(study.summary().activeDays, 1);
  assert.equal(study.summary().checked, true);
  env.time(localTime(2026, 11, 17, 0));
  assert.equal(study.summary().checked, false);
  study.checkin();
  assert.deepEqual(copy(study.read().checkins), ['2026-11-16', '2026-11-17']);
  assert.equal(study.summary().activeDays, 2);
});

test('study space: supported goals persist and malformed stored goals fall back to the default', () => {
  const env = environment(), study = env.helper;
  assert.equal(study.read().goal, 15);
  for (const goal of [10, 15, 30]) {
    study.write({ goal });
    assert.equal(study.read().goal, goal);
    assert.equal(study.summary().goal, goal);
  }
  for (const goal of [0, -1, 20, 60, '15', null, {}, []]) {
    study.write({ goal });
    assert.equal(study.read().goal, 15);
    assert.equal(study.summary().goal, 15);
  }
});

test('study space: a Sunday at month boundary belongs to the preceding Monday through Sunday week', () => {
  const env = environment({ time: localTime(2026, 3, 1) }), study = env.helper;
  env.learning({
    sections: [{ sectionId: 'one', updatedAt: new Date(localTime(2026, 2, 23, 20)).toISOString() }],
    positions: [{ courseId: 'two', updatedAt: new Date(localTime(2026, 2, 28, 9)).toISOString() }], legacyChapters: []
  });
  study.checkin();
  const sunday = study.summary();
  assert.deepEqual(copy(sunday.week.map(day => day.date)), ['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepEqual(copy(sunday.week.map(day => day.number)), [23, 24, 25, 26, 27, 28, 1]);
  assert.deepEqual(copy(sunday.week.filter(day => day.today).map(day => day.label)), ['日']);
  assert.equal(sunday.weekActive, 3);
  env.time(localTime(2026, 3, 2));
  const monday = study.summary();
  assert.deepEqual(copy(monday.week.map(day => day.date)), ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
  assert.equal(monday.weekActive, 0);
  assert.equal(monday.activeDays, 3, 'last week activity remains in historical totals');
});

test('study space: activity derives from real dated records without inventing study minutes', () => {
  const env = environment({ time: localTime(2026, 11, 18) }), study = env.helper;
  const boards = [{ id: 'math', accessible: true }, { id: 'english', accessible: false }, { id: 'science', accessible: true }];
  const courses = [{ id: 'math', completed: ['chapter-1', 'chapter-2'] }, { id: 'science', completed: ['chapter-3'] }, { id: 'english' }];
  study.write({ visits: [{ id: 'math', date: '2026-11-16' }, { id: 'science', date: '2026-11-16' }], checkins: ['2026-11-17', '2026-11-17'] });
  env.learning({
    sections: [{ updatedAt: new Date(localTime(2026, 11, 18)).toISOString() }, { updatedAt: 'not-a-date' }, {}],
    positions: [{ updatedAt: new Date(localTime(2026, 11, 16)).toISOString() }, { updatedAt: new Date(localTime(2026, 11, 10)).toISOString() }], legacyChapters: []
  });
  const summary = study.summary(courses, boards);
  assert.equal(summary.activeDays, 4, 'duplicate dates across visit/check-in/progress count once');
  assert.equal(summary.weekActive, 3);
  assert.equal(summary.completed, 3);
  assert.equal(summary.unlocked, 2);
  assert.equal(summary.checked, false, 'learning activity does not fabricate an explicit check-in');
  assert.equal(summary.week.find(day => day.today).active, true);
  assert(!Object.keys(summary).some(key => /minute|duration|hours|seconds/i.test(key)), 'activity alone cannot establish study duration');
  const fresh = environment().helper.summary(courses, boards);
  assert.equal(fresh.activeDays, 0, 'course availability or chapter metadata alone is not dated activity');
  assert.equal(fresh.weekActive, 0);
});

test('study space: visits deduplicate within a day and recent boards keep stable most-recent order', () => {
  const env = environment(), study = env.helper;
  const math = { id: 'math', title: '数学' }, english = { id: 'english', title: '英语' };
  study.visit(math); study.visit(english); study.visit({ ...math, title: '更新后的数学' });
  assert.equal(study.read().visits.length, 2);
  assert.equal(study.read().visits.find(item => item.id === 'math').title, '更新后的数学');
  assert.deepEqual(copy(study.summary([], [math, english]).recentBoards.map(item => item.id)), ['math', 'english']);
  env.time(localTime(2026, 11, 17)); study.visit(english);
  assert.equal(study.read().visits.length, 3, 'the same board on another day is real additional activity');
  study.visit({ id: 'removed-board', title: '已下架的板块' });
  const before = copy(study.read()), writes = env.writes.length;
  for (let index = 0; index < 3; index++) assert.deepEqual(copy(study.summary([], [math, english]).recentBoards.map(item => item.id)), ['english', 'math']);
  assert.deepEqual(copy(study.read()), before, 'reading summaries does not reorder or mutate saved history');
  assert.equal(env.writes.length, writes);
});

test('study space: notes trim outer whitespace, reject empty input and cap individual text length', () => {
  const env = environment(), study = env.helper;
  const initialWrites = env.writes.length;
  for (const value of ['', '  \n\t ', null, undefined]) assert.equal(study.addNote(value), false);
  assert.equal(env.writes.length, initialWrites);
  assert.equal(study.addNote('  第一段\n第二段  '), true);
  assert.equal(study.read().notes[0].text, '第一段\n第二段');
  assert.equal(study.read().notes[0].date, '2026-11-16');
  env.time(localTime(2026, 11, 17));
  assert.equal(study.addNote('知'.repeat(3005)), true);
  assert.equal(study.read().notes[1].text.length, 3000);
  const result = study.summary();
  assert.equal(result.notesCount, 2);
  assert.equal(result.notes[0].date, '2026-11-17', 'presentation orders the latest note first');
  assert.equal(result.activeDays, 0, 'writing a note does not fabricate a learning visit or check-in');
  assert.equal(study.read().notes[0].text, '第一段\n第二段', 'reversing presentation does not mutate stored notes');
});

test('study space: native positions and section timestamps resolve through current course categories to recent boards', () => {
  const env = environment(), study = env.helper;
  const courses = [
    { id: 'math-course', categoryId: 'math-category', chapters: [{ id: 'math-chapter', sections: [{ id: 'math-section' }] }] },
    { id: 'english-course', categoryId: 'english-category', chapters: [{ sections: [{ id: 'english-section' }] }] },
    { id: 'science-course', categoryId: 'science-category', chapters: [{ sections: [{ id: 'science-section' }] }] },
    { id: 'removed-course', categoryId: 'removed-category', chapters: [] },
    { id: 'undated-course', categoryId: 'undated-category', chapters: [] }
  ];
  const boards = [
    { id: 'math-board', categoryIds: ['math-category'] },
    { id: 'english-board', categoryIds: ['english-category'] },
    { id: 'science-board', categoryIds: ['science-category'] },
    { id: 'undated-board', categoryIds: ['undated-category'] }
  ];
  const stamp = (day, hour) => new Date(localTime(2026, 11, day, hour)).toISOString();
  env.learning({
    positions: [
      { courseId: 'math-course', updatedAt: stamp(16, 8) },
      { courseId: 'english-course', updatedAt: stamp(16, 10) },
      { courseId: 'removed-course', updatedAt: stamp(16, 22) },
      { courseId: 'missing-course', updatedAt: stamp(16, 23) },
      { courseId: 'undated-course' },
      { courseId: 'undated-course', updatedAt: 'not-a-date' }
    ],
    // Real server section records contain no courseId; the section catalog supplies it.
    sections: [
      { sectionId: 'math-section', completed: true, updatedAt: stamp(16, 11) },
      { sectionId: 'science-section', completed: true, updatedAt: stamp(15, 23) },
      { sectionId: 'removed-section', completed: true, updatedAt: stamp(16, 23) }
    ], legacyChapters: []
  });
  const saved = copy(study.read()), writes = env.writes.length;
  assert.deepEqual(copy(study.summary(courses, boards).recentBoards.map(board => board.id)), ['math-board', 'english-board', 'science-board']);
  assert.deepEqual(copy(study.summary(courses, boards.filter(board => board.id !== 'math-board')).recentBoards.map(board => board.id)), ['english-board', 'science-board']);
  assert.deepEqual(copy(study.read()), saved, 'resolving native progress never creates synthetic visits');
  assert.equal(env.writes.length, writes);
});

test('study space: mixed recent history uses real dates and preserves date-only web visit order', () => {
  const env = environment({ time: localTime(2026, 11, 16) }), study = env.helper;
  const courses = [
    { id: 'native-a', categoryId: 'a' },
    { id: 'native-b', categoryId: 'b' },
    { id: 'native-c', categoryId: 'c' }
  ];
  const boards = [
    { id: 'web-a' }, { id: 'web-b' },
    { id: 'board-a', categoryIds: ['a'] }, { id: 'board-b', categoryIds: ['b'] }, { id: 'board-c', categoryIds: ['c'] }
  ];
  study.visit(boards[0]); study.visit(boards[1]); study.visit(boards[0]);
  env.learning({ sections: [], positions: [
    { courseId: 'native-a', updatedAt: new Date(localTime(2026, 11, 16, 9)).toISOString() },
    { courseId: 'native-b', updatedAt: new Date(localTime(2026, 11, 16, 15)).toISOString() },
    { courseId: 'native-c', updatedAt: new Date(localTime(2026, 11, 17, 1)).toISOString() }
  ], legacyChapters: [] });
  const before = copy(study.read()), writes = env.writes.length;
  for (let index = 0; index < 3; index++) assert.deepEqual(copy(study.summary(courses, boards).recentBoards.map(board => board.id)), ['board-c', 'web-a', 'web-b', 'board-b', 'board-a']);
  assert.deepEqual(copy(study.read()), before);
  assert.equal(env.writes.length, writes);
});
