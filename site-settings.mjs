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

const audioLimit = 8 * 1024 * 1024;
const audioPath = '/api/site-settings?audio=';
const cleanAudio = db => db.prepare("DELETE FROM site_settings WHERE key = 'bgm_audio_type' OR key GLOB 'bgm_audio_part_*'");

async function uploadAudio(request, env) {
  if (!await sameSecret(request.headers.get('X-Admin-Code'), env.ADMIN_CODE)) return reply({ error: 'code' }, 403);
  const type = request.headers.get('Content-Type');
  if (!['audio/mpeg', 'audio/wav', 'audio/ogg'].includes(type)) return reply({ error: 'format' }, 415);
  if (!request.body) return reply({ error: 'format' }, 400);
  const reader = request.body.getReader();
  const bytes = new Uint8Array(audioLimit);
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (size + value.length > audioLimit) {
      await reader.cancel();
      return reply({ error: 'size' }, 413);
    }
    bytes.set(value, size);
    size += value.length;
  }
  const starts = (offset, value) => [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const valid = type === 'audio/mpeg' ? starts(0, 'ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    : type === 'audio/wav' ? starts(0, 'RIFF') && starts(8, 'WAVE') : starts(0, 'OggS');
  if (size < 12 || !valid) return reply({ error: 'format' }, 415);
  const db = env.DB;
  const put = db.prepare('INSERT INTO site_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const writes = [cleanAudio(db), put.bind('bgm', audioPath + crypto.randomUUID()), put.bind('bgm_audio_type', type)];
  const chunk = 512 * 1024;
  for (let start = 0; start < size; start += chunk) {
    writes.push(put.bind('bgm_audio_part_' + String(start / chunk).padStart(2, '0'), bytes.slice(start, Math.min(size, start + chunk)).buffer));
  }
  await db.batch(writes);
  return reply(await settings(db));
}

async function streamAudio(request, db) {
  const { results } = await db.prepare("SELECT key,value FROM site_settings WHERE key IN ('bgm','bgm_audio_type') OR key GLOB 'bgm_audio_part_*' ORDER BY key").all();
  if (results[0]?.key !== 'bgm' || results[0].value !== audioPath + new URL(request.url).searchParams.get('audio') || results.length < 3) {
    return new Response(null, { status: 404 });
  }
  const type = results.find(row => row.key === 'bgm_audio_type').value;
  const file = new Blob(results.filter(row => row.key.startsWith('bgm_audio_part_')).map(row => new Uint8Array(row.value)));
  const headers = new Headers({
    'Content-Type': type, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff'
  });
  const range = request.headers.get('Range');
  if (!range) {
    headers.set('Content-Length', String(file.size));
    return new Response(request.method === 'HEAD' ? null : file, { headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1] ? Number(match[1]) : Math.max(0, file.size - Number(match?.[2]));
  const end = match?.[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
  if (!match || (!match[1] && !match[2]) || !(start <= end && start < file.size)) {
    headers.set('Content-Range', 'bytes */' + file.size);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + file.size);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(request.method === 'HEAD' ? null : file.slice(start, end + 1), { status: 206, headers });
}

export async function siteSettings(request, env) {
  const params = new URL(request.url).searchParams;
  if (params.has('audio') && ['GET', 'HEAD'].includes(request.method)) return streamAudio(request, env.DB);
  if (request.method === 'GET') return reply(await settings(env.DB));
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply({ error: 'origin' }, 403);
  if (!/^\d{12,32}$/.test(env.ADMIN_CODE || '')) return reply({ error: 'setup' }, 503);
  if (params.has('upload')) return uploadAudio(request, env);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return reply({ error: 'input' }, 400);

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
    await db.batch([cleanAudio(db), db.prepare("INSERT INTO site_settings(key,value) VALUES ('bgm', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(url)]);
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
