export default {
  async fetch(request, env, ctx) {
    if (env && env.KV && typeof globalThis.KV === 'undefined') {
      globalThis.KV = env.KV
    }
    return handleRequest(request, ctx)
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const JSON_SOURCES = {
  'jin18': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json',
  'jingjian': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json',
  'full': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/LunaTV-config.json'
}

// 🚀 核心优化函数（重点！！！）
async function getCachedJSON(url, ctx) {
  const cache = caches.default
  const cacheKey = new Request(url)

  // ✅ 1. 先查 Cloudflare Cache（完全免费）
  let response = await cache.match(cacheKey)
  if (response) {
    return await response.json()
  }

  // ✅ 2. 再查 KV（减少使用）
  if (typeof KV !== 'undefined') {
    const kvData = await KV.get('CACHE_' + url)
    if (kvData) {
      const data = JSON.parse(kvData)

      const res = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      })

      ctx.waitUntil(cache.put(cacheKey, res.clone()))
      return data
    }
  }

  // ✅ 3. 最后才 fetch（最低频）
  const res = await fetch(url)
  const data = await res.json()

  // 写 KV（低频）
  if (typeof KV !== 'undefined') {
    ctx.waitUntil(
      KV.put('CACHE_' + url, JSON.stringify(data), {
        expirationTtl: 1800
      })
    )
  }

  // 写缓存（高频）
  const newResponse = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=600'
    }
  })

  ctx.waitUntil(cache.put(cacheKey, newResponse.clone()))

  return dataku
}

// 主逻辑
async function handleRequest(request, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get('format')
  const source = url.searchParams.get('source') || 'full'

  if (format !== null) {
    const data = await getCachedJSON(JSON_SOURCES[source], ctx)

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    })
  }

  return new Response('OK')
}
