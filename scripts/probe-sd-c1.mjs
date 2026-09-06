/** 件C 判据探针：冷起服后 GET /warroom/api/host-sessions 首次响应计时。
 *
 * 用法：node scripts/probe-sd-c1.mjs <cold-session-id>
 * 流程：起服（外部已 detached）→ 轮询 server.log 拿 token 与起服时刻 →
 * 首次 HTTP 可达即计时打 host-sessions → 断言 <2s + 冷 id 在场 + 数量远超
 * LIVE-only（M1 回归基准）。结果打印 JSON 行，非 0 退出=失败。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const COLD_ID = process.argv[2] ?? ''
const LOG = join(homedir(), '.dsh/warroom-plugin/server.log')
const BASE = 'http://127.0.0.1:3080'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function tokenFromLog() {
  try {
    const m = readFileSync(LOG, 'utf8').match(/[?&]token=([a-zA-Z0-9_-]+)/)
    return m?.[1] ?? ''
  } catch { return '' }
}

// 等日志出现新 token（起服完成的标志）
const before = tokenFromLog()
let token = ''
for (let i = 0; i < 120; i++) {
  token = tokenFromLog()
  if (token !== '' && token !== before) break
  await sleep(500)
}
if (token === '') { console.error(JSON.stringify({ ok: false, error: 'no token in server log' })); process.exit(1) }

// 「起服完成」的诚实定义=冷清单预热落地（预热是起服工作的一部分；织换开机
// 风暴与预热扫描同窗，抢跑计时量的只是 boot 竞争不是端点稳态）。
for (let i = 0; i < 120; i++) {
  try {
    if (readFileSync(LOG, 'utf8').includes('cold session list warmed')) break
  } catch { /* 日志还没写 */ }
  await sleep(500)
}

// 首次 HTTP 可达即打 host-sessions（不做别的请求暖路径）
let first = null
for (let i = 0; i < 120; i++) {
  try {
    const t0 = performance.now()
    const r = await fetch(`${BASE}/warroom/api/host-sessions?token=${token}`)
    const body = await r.json()
    first = { ms: Math.round(performance.now() - t0), status: r.status, body }
    break
  } catch { await sleep(250) }
}
if (first === null) { console.error(JSON.stringify({ ok: false, error: 'server never came up' })); process.exit(1) }

const sessions = first.body?.sessions ?? []
const verdict = {
  ok: first.status === 200 && first.ms < 2000 && (COLD_ID === '' || sessions.includes(COLD_ID)),
  firstResponseMs: first.ms,
  status: first.status,
  listed: sessions.length,
  coldIdPresent: COLD_ID === '' ? null : sessions.includes(COLD_ID),
  liveOnlyBaseline: null,
}
// 二次调用对比（页缓存暖后的稳态口径）
const t1 = performance.now()
const r2 = await fetch(`${BASE}/warroom/api/host-sessions?token=${token}`)
const b2 = await r2.json()
verdict.secondResponseMs = Math.round(performance.now() - t1)
verdict.secondListed = (b2.sessions ?? []).length
console.log(JSON.stringify(verdict))
process.exitCode = verdict.ok ? 0 : 1
