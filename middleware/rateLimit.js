const crypto = require('crypto')

function ipKey(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown'
}

function tokenKey(req) {
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) return 'tok:' + crypto.createHash('sha1').update(h.slice(7)).digest('hex')
  if (req.user && req.user.sub) {
    return 'usr:' + String(req.user.sub)
  }
  return null
}

function windowKey(base, ts, windowMs) {
  const w = Math.floor(ts / windowMs)
  return `${base}:${w}`
}

function makeLimiter({ windowMs, unauthLimit, authLimit }) {
  const store = new Map()
  return function limiter(req, res, next) {
    const now = Date.now()

    const ipBase = 'ip:' + ipKey(req)
    const ipKeyW = windowKey(ipBase, now, windowMs)
    const ipVal = store.get(ipKeyW) || { count: 0, start: now }
    ipVal.count += 1
    store.set(ipKeyW, ipVal)

    const tk = tokenKey(req)
    let tokVal = null
    if (tk) {
      const tokKeyW = windowKey(tk, now, windowMs)
      tokVal = store.get(tokKeyW) || { count: 0, start: now }
      tokVal.count += 1
      store.set(tokKeyW, tokVal)
    }

    const limitEffective = tk ? authLimit : unauthLimit
    const ipRemaining = Math.max(0, unauthLimit - ipVal.count)
    const tokRemaining = tk ? Math.max(0, authLimit - tokVal.count) : null
    const resetSec = Math.ceil((ipVal.start + windowMs - now) / 1000)

    res.set('X-RateLimit-Limit', String(limitEffective))
    res.set('X-RateLimit-Remaining', String(
      tk ? Math.min(ipRemaining, tokRemaining) : ipRemaining
    ))
    res.set('X-RateLimit-Reset', String(resetSec))
    res.set('X-RateLimit-IP-Remaining', String(ipRemaining))
    if (tk) res.set('X-RateLimit-Token-Remaining', String(tokRemaining))

    if (ipVal.count > unauthLimit) {
      return res.status(429).json({ error: 'rate limit exceeded (ip)' })
    }
    if (tk && tokVal.count > authLimit) {
      return res.status(429).json({ error: 'rate limit exceeded (token)' })
    }

    next()
  }
}

module.exports = { makeLimiter }
