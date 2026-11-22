const ALLOWED_HOSTS = [
  'taobao.com',
  'alicdn.com',
  'tbcdn.cn',
  '1688.com',
  'tmall.com',
  'alibaba.com',
  'aliyuncs.com',
];
const MAX_REDIRECTS = 4;

function isAllowedUrl(value) {
  return value.protocol === 'https:'
    && !value.username
    && !value.password
    && (!value.port || value.port === '443')
    && ALLOWED_HOSTS.some((host) => value.hostname === host || value.hostname.endsWith(`.${host}`));
}

function setCorsHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
}

export default async function handler(req, res) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '*';
  setCorsHeaders(res, origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();

  let target;
  try {
    target = new URL(String(req.query?.url || ''));
  } catch {
    return res.status(400).end();
  }
  if (!isAllowedUrl(target)) return res.status(400).end();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    Referer: 'https://detail.1688.com/',
  };
  if (typeof req.headers.range === 'string') headers.Range = req.headers.range;

  let upstream;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      upstream = await fetch(target, { method: req.method, headers, redirect: 'manual' });
      if (upstream.status < 300 || upstream.status >= 400) break;
      const location = upstream.headers.get('location');
      if (!location || hop === MAX_REDIRECTS) return res.status(502).end();
      const next = new URL(location, target);
      if (!isAllowedUrl(next)) return res.status(400).end();
      target = next;
    }
  } catch {
    return res.status(502).end();
  }

  if (!upstream || upstream.status >= 400) return res.status(502).end();
  const contentType = upstream.headers.get('content-type') || '';
  if (contentType && !/^video\//i.test(contentType) && !/^application\/octet-stream$/i.test(contentType)) {
    return res.status(415).end();
  }

  res.status(upstream.status);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'private, max-age=60');
  if (req.method === 'HEAD' || !upstream.body) return res.end();
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!res.write(Buffer.from(chunk.value))) await new Promise((resolve) => res.once('drain', resolve));
    }
    res.end();
  } catch {
    res.destroy();
  }
}
