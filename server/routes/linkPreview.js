const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const auth = require('../middleware/auth');

const router = express.Router();

// In-memory cache: url -> { data, expires }
const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;   // 6 hours
const MAX_CACHE = 500;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) ||
           (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
  }
  const l = ip.toLowerCase().replace(/^::ffff:/, '');
  if (net.isIPv4(l)) return isPrivateIp(l);
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

// SSRF guard: only allow http(s) to public hosts/IPs.
async function assertPublicUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
  if (u.hostname === 'localhost' || u.hostname.endsWith('.local')) throw new Error('host');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('private');
  return u;
}

function meta(html, re1, re2) {
  return (html.match(re1)?.[1] || (re2 && html.match(re2)?.[1]) || '').trim() || null;
}

function decode(s) {
  if (!s) return s;
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
}

function extract(html, baseUrl) {
  const title = decode(
    meta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
               /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    || meta(html, /<title[^>]*>([^<]{1,300})<\/title>/i));
  const description = decode(
    meta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || meta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i));
  const siteName = decode(meta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i));
  let image = meta(html, /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i);
  if (image && !/^https?:\/\//i.test(image)) { try { image = new URL(image, baseUrl).href; } catch { image = null; } }
  return { title, description, image, siteName };
}

router.get('/', auth, async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string' || url.length > 2048) return res.status(400).json({ error: 'url required' });

  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return res.json(hit.data);

  const empty = { url, title: null, description: null, image: null, siteName: null };
  try {
    const u = await assertPublicUrl(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(u.href, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VyreBot/1.0; +https://vyre.onrender.com)', Accept: 'text/html' },
    });
    clearTimeout(timer);
    if (!(r.headers.get('content-type') || '').includes('text/html')) return res.json(empty);
    const html = (await r.text()).slice(0, 500_000);
    const data = { url, ...extract(html, r.url || u.href) };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(url, { data, expires: Date.now() + TTL });
    res.json(data);
  } catch {
    res.json(empty); // never error the client; just no preview
  }
});

module.exports = router;
