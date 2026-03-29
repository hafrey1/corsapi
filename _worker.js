export default {
  async fetch(request, env, ctx) {
    if (env && env.KV && typeof globalThis.KV === 'undefined') {
      globalThis.KV = env.KV
    }
    return handleRequest(request, ctx)
  }
}

// ---------------- 常量 ----------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

const EXCLUDE_HEADERS = new Set([
  'content-encoding','content-length','transfer-encoding',
  'connection','keep-alive','set-cookie','set-cookie2'
])

const JSON_SOURCES = {
  'jin18': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json',
  'jingjian': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json',
  'full': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/LunaTV-config.json'
}

const FORMAT_CONFIG = {
  '0': { proxy: false, base58: false },
  'raw': { proxy: false, base58: false },
  '1': { proxy: true, base58: false },
  'proxy': { proxy: true, base58: false },
  '2': { proxy: false, base58: true },
  'base58': { proxy: false, base58: true },
  '3': { proxy: true, base58: true },
  'proxy-base58': { proxy: true, base58: true }
}

// ---------------- 🚀 核心缓存（KV + Cache）----------------
async function getCachedJSON(url, ctx) {
  const cache = caches.default
  const cacheKey = new Request(url)

  // 1️⃣ Cache（主力）
  let res = await cache.match(cacheKey)
  if (res) return await res.json()

  // 2️⃣ KV（备用）
  if (typeof KV !== 'undefined') {
    const kv = await KV.get('CACHE_' + url)
    if (kv) {
      const data = JSON.parse(kv)

      const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      })

      ctx.waitUntil(cache.put(cacheKey, response.clone()))
      return data
    }
  }

  // 3️⃣ fetch（最少）
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Fetch failed ${response.status}`)
  const data = await response.json()

  if (typeof KV !== 'undefined') {
    ctx.waitUntil(KV.put('CACHE_' + url, JSON.stringify(data), {
      expirationTtl: 1800
    }))
  }

  const newRes = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=600'
    }
  })

  ctx.waitUntil(cache.put(cacheKey, newRes.clone()))
  return data
}

// ---------------- Base58 ----------------
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let num = 0n
  for (let b of bytes) num = (num << 8n) + BigInt(b)

  let str = ''
  while (num > 0) {
    str = BASE58[num % 58n] + str
    num /= 58n
  }
  return str
}

// ---------------- JSON 前缀处理 ----------------
function addOrReplacePrefix(obj, prefix) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(i => addOrReplacePrefix(i, prefix))

  const newObj = {}
  for (const key in obj) {
    if (key === 'api' && typeof obj[key] === 'string') {
      let api = obj[key]
      const idx = api.indexOf('?url=')
      if (idx !== -1) api = api.slice(idx + 5)
      if (!api.startsWith(prefix)) api = prefix + api
      newObj[key] = api
    } else {
      newObj[key] = addOrReplacePrefix(obj[key], prefix)
    }
  }
  return newObj
}

// ---------------- 主入口 ----------------
async function handleRequest(request, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const reqUrl = new URL(request.url)
  const pathname = reqUrl.pathname
  const target = reqUrl.searchParams.get('url')
  const format = reqUrl.searchParams.get('format')
  const prefix = reqUrl.searchParams.get('prefix')
  const source = reqUrl.searchParams.get('source')

  const origin = reqUrl.origin
  const defaultPrefix = origin + '/?url='

  if (pathname === '/health') {
    return new Response('OK')
  }

  // ---------------- 代理 ----------------
  if (target) {
    if (target.startsWith(origin)) {
      return new Response('Loop blocked', { status: 400 })
    }

    if (!/^https?:\/\//i.test(target)) {
      return new Response('Bad URL', { status: 400 })
    }

    try {
      const res = await fetch(target, {
        method: request.method,
        headers: request.headers
      })

      const headers = new Headers(CORS_HEADERS)
      for (let [k, v] of res.headers) {
        if (!EXCLUDE_HEADERS.has(k.toLowerCase())) {
          headers.set(k, v)
        }
      }

      return new Response(res.body, {
        status: res.status,
        headers
      })
    } catch {
      return new Response('Proxy Error', { status: 502 })
    }
  }

  // ---------------- JSON ----------------
  if (format !== null) {
    const config = FORMAT_CONFIG[format]
    if (!config) return new Response('Bad format', { status: 400 })

    const selected = JSON_SOURCES[source] || JSON_SOURCES.full
    const data = await getCachedJSON(selected, ctx)

    const newData = config.proxy
      ? addOrReplacePrefix(data, prefix || defaultPrefix)
      : data

    if (config.base58) {
      return new Response(base58Encode(newData), {
        headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS }
      })
    }

    return new Response(JSON.stringify(newData), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }

  // ---------------- 首页 ----------------
  return new Response(`API Proxy OK`, {
    headers: { 'Content-Type': 'text/plain' }
  })
}