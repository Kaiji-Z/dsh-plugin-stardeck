// 0.2.0-rc.2 适配探针：三端点 + token 绕过复测（node fetch，UTF-8；不 process.exit）
import { readFileSync } from 'node:fs'

const log = readFileSync('C:/Users/kaiji/.dsh/warroom-plugin/server.log', 'utf8')
const token = log.match(/token=([A-Za-z0-9_\-]+)/)?.[1]
if (!token) throw new Error('no token in server.log')
const base = 'http://127.0.0.1:3080'

async function probe(name, path, withToken = true) {
  const url = `${base}${path}${withToken ? `${path.includes('?') ? '&' : '?'}token=${token}` : ''}`
  try {
    const res = await fetch(url)
    const text = await res.text()
    let body = text
    try { body = JSON.parse(text) } catch { /* keep text */ }
    const summary = typeof body === 'object' && body !== null
      ? `commands=${JSON.stringify(body.commands?.length ?? body.commands)} keys=${Object.keys(body).slice(0, 12).join(',')}`
      : String(body).slice(0, 200)
    console.log(`[${name}] HTTP ${res.status} ${summary}`)
    return body
  } catch (err) {
    console.log(`[${name}] FETCH-FAIL ${String(err)}`)
    return null
  }
}

await probe('board', '/warroom/api/board')
await probe('board-no-token', '/warroom/api/board', false)
const spike = await probe('v5-spike', '/warroom/api/v5-spike')
if (spike && typeof spike === 'object') {
  for (const s of spike.steps ?? spike.probe ?? []) console.log(`  spike: ${typeof s === 'string' ? s : JSON.stringify(s).slice(0, 160)}`)
}
await probe('host-sessions', '/warroom/api/host-sessions')
process.exitCode = 0
