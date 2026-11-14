import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const server = await createServer({
    root: fileURLToPath(templateRoot),
    configFile: fileURLToPath(new URL('../vite.blueprint.config.ts', import.meta.url)),
    server: { middlewareMode: true }, appType: 'custom'
  });
  try {
    const { default: Course } = await server.ssrLoadModule('/app/page.tsx');
    const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const html = template.replace('<div id="root"></div>', '<div id="root">' + renderToStaticMarkup(createElement(Course)) + '</div>');
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } finally { await server.close(); }
}

test("server-renders the finished Chinese mathematics course", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="zh-CN"/i);
  assert.match(html, /<title>初中数学｜零基础初中数学课程<\/title>/i);
  assert.match(html, /初中数学/);
  assert.doesNotMatch(html, /小包子学数学|class="brand-seal"/);
  assert.match(html, /数学不是比谁学得快/);
  assert.doesNotMatch(html, /奶奶/);
  assert.match(html, /从第一课开始/);
  assert.match(html, /一课只做四件事/);
  assert.match(html, /启蒙补基础/);
  assert.match(html, /七年级/);
  assert.match(html, /八年级/);
  assert.match(html, /九年级/);
  assert.match(html, /name="theme-color" content="#ffffff"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("includes the full curriculum and removes disposable starter files", async () => {
  const [page, layout, packageJson, foundation, grade8, grade9, mathVisual, visualIndex] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/curriculum/foundation-grade7.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/curriculum/grade8.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/curriculum/grade9.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/math-visual.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/visuals/index.ts", import.meta.url), "utf8"),
  ]);
  const curriculum = `${foundation}\n${grade8}\n${grade9}`;
  const lessonCount = curriculum.match(/^\s{8}id:\s*"/gm)?.length ?? 0;
  const practiceSectionCount = curriculum.match(/^\s{8}practice:/gm)?.length ?? 0;

  assert.ok(lessonCount >= 90, `expected at least 90 lessons, found ${lessonCount}`);
  assert.equal(practiceSectionCount, lessonCount);
  assert.match(curriculum, /一元一次方程/);
  assert.match(curriculum, /勾股定理/);
  assert.match(curriculum, /二次函数/);
  assert.match(curriculum, /锐角三角函数/);
  assert.match(page, /math-completed-lessons/);
  assert.match(page, /想不出来？看小提示/);
  assert.match(page, /EXAMPLE_ANGLES/);
  assert.match(page, /PRACTICE_GOALS/);
  assert.match(page, /真正学会的四个信号/);
  assert.match(page, /MathVisual/);
  assert.match(page, /播放动画/);
  assert.match(page, /先看完整图/);
  assert.match(mathVisual, /canvas/);
  assert.match(mathVisual, /prefers-reduced-motion/);
  assert.match(mathVisual, /暂停动画/);
  assert.match(visualIndex, /grade7Visuals/);
  assert.match(visualIndex, /grade8Visuals/);
  assert.match(visualIndex, /grade9Visuals/);
  assert.match(layout, /generateMetadata/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|_sites-preview/);

  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
  await access(new URL("public/og-visual-math.png", templateRoot));
});
