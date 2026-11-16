(async () => {
  const ticket = location.pathname.split('/').pop();
  let response = await fetch('/web-session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) });
  if (response.status === 401) response = await fetch('/web-access/' + encodeURIComponent(ticket) + '/resume', { method: 'POST', credentials: 'same-origin' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '网页访问已失效，请返回小程序重试');
  // Retire former public offline caches before opening entitled content.
  // Local notes/progress in localStorage are preserved.
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(registration => /^\/(english|math|junior-math)\//.test(new URL(registration.scope).pathname)).map(registration => registration.unregister()));
    }
    if ('caches' in window) await Promise.all((await caches.keys()).filter(name => /^(english-atlas-|blueprint-cnm-pwa-)/.test(name)).map(name => caches.delete(name)));
  } catch (_) { /* No offline cache exists in unsupported browsers. */ }
  const target = result.destination;
  if (/^\/(english\/|math\/|junior-math\/|modules\/[A-Za-z0-9_-]+\/|websites\/[A-Za-z0-9_-]+\/)/.test(target || '')) location.replace(target);
})().catch(error => { document.body.textContent = error.message || '学习页面无法打开，请返回小程序重试'; });
