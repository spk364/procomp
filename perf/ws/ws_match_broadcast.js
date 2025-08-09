import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { hmacSHA256 } from 'k6/crypto'
import { b64encode } from 'k6/encoding'

export const options = {
  thresholds: {
    ws_connecting: ['p(95)<500'],
  },
}

function base64UrlEncode(input) {
  const b64 = typeof input === 'string' ? b64encode(input) : b64encode(input, 'rawstd', 's')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signHS256(unsigned, secret) {
  const sigHex = hmacSHA256(secret, unsigned, 'hex')
  const bytes = sigHex.match(/.{1,2}/g).map((b) => String.fromCharCode(parseInt(b, 16))).join('')
  return base64UrlEncode(bytes)
}

function createJwt(secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub: 'user-load',
    email: 'load@procomp.app',
    aud: 'authenticated',
    role: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: __ENV.SUPABASE_URL || 'http://localhost',
    user_role: 'REFEREE',
  }
  const headerPart = base64UrlEncode(JSON.stringify(header))
  const payloadPart = base64UrlEncode(JSON.stringify(payload))
  const unsigned = `${headerPart}.${payloadPart}`
  const signature = signHS256(unsigned, secret)
  return `${unsigned}.${signature}`
}

export default function () {
  const base = __ENV.K6_WS_BASE || 'ws://localhost:8000'
  const secret = __ENV.K6_WS_SECRET || 'dev-secret'
  const token = createJwt(secret)
  const matchId = 'perf-match-1'
  const url = `${base}/api/v1/ws/match/${matchId}?token=${token}&role=referee`

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      socket.send(JSON.stringify({ type: 'PING', matchId, data: {}, timestamp: new Date().toISOString() }))
    })
    socket.on('message', function () {})
    socket.on('close', function () {})
    socket.setTimeout(function () {
      socket.close()
    }, 2000)
  })

  check(res, { 'status is 101': (r) => r && r.status === 101 })
  sleep(1)
}