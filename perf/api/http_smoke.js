import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  vus: 5,
  duration: '10s',
}

export default function () {
  const base = __ENV.K6_HTTP_BASE || 'http://localhost:8000'
  const res = http.get(`${base}/health`)
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body has healthy': (r) => r.body && r.body.includes('healthy'),
  })
  sleep(1)
}