const reply = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

function webUrl(value) {
  if (typeof value !== 'string' || value.length > 1500) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

async function sameSecret(input, secret) {
  if (typeof input !== 'string' || !/^\d{12,32}$/.test(input)) return false;
  const encoder = new TextEncoder();
  const digests = await Promise.all([input, secret].map(value =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const [left, right] = digests.map(value => new Uint8Array(value));
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left[index] ^ right[index];
  return diff === 0;
}

async function settings(db) {
  const [tools, music] = await db.batch([
    db.prepare('SELECT id, name, url FROM classroom_tools ORDER BY id'),
    db.prepare("SELECT value FROM site_settings WHERE key = 'bgm'")
  ]);
  return { tools: tools.results, bgm: music.results[0]?.value ?? null };
}

export async function siteSettings(request, env) {
  if (request.method === 'GET') return reply(await settings(env.DB));
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply({ error: 'origin' }, 403);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return reply({ error: 'input' }, 400);
  if (!/^\d{12,32}$/.test(env.ADMIN_CODE || '')) return reply({ error: 'setup' }, 503);

  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'input' }, 400);
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      return reply({ error: 'input' }, 413);
    }
    body += decoder.decode(value, { stream: true });
  }
  let data;
  try { data = JSON.parse(body + decoder.decode()); }
  catch { return reply({ error: 'input' }, 400); }
  if (!await sameSecret(data?.code, env.ADMIN_CODE)) return reply({ error: 'code' }, 403);

  const db = env.DB;
  const action = data.action;
  if (action === 'music') {
    const url = data.url === '' ? '' : webUrl(data.url);
    if (url === null) return reply({ error: 'input' }, 400);
    await db.prepare("INSERT INTO site_settings(key,value) VALUES ('bgm', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(url).run();
  } else if (action === 'delete' || action === 'edit') {
    if (!Number.isSafeInteger(data.id) || data.id < 1) return reply({ error: 'input' }, 400);
    let result;
    if (action === 'delete') {
      result = await db.prepare('DELETE FROM classroom_tools WHERE id = ?').bind(data.id).run();
    } else {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const url = webUrl(data.url);
      if (!name || name.length > 60 || !url) return reply({ error: 'input' }, 400);
      result = await db.prepare('UPDATE classroom_tools SET name = ?, url = ? WHERE id = ?').bind(name, url, data.id).run();
    }
    if (!result.meta.changes) return reply({ error: 'missing' }, 404);
  } else if (action === 'add') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const url = webUrl(data.url);
    if (!name || name.length > 60 || !url) return reply({ error: 'input' }, 400);
    const result = await db.prepare('INSERT INTO classroom_tools (name, url) SELECT ?, ? WHERE (SELECT COUNT(*) FROM classroom_tools) < 100').bind(name, url).run();
    if (!result.meta.changes) return reply({ error: 'limit' }, 409);
  } else {
    return reply({ error: 'input' }, 400);
  }
  return reply(await settings(db));
}
