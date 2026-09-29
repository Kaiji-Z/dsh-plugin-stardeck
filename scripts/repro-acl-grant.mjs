// 最小复现：AclWriteGrant.add 对同一工作区路径是否同样 Win32 5
// 判定 = 环境性（机器 ACL）vs 宿主版本回归
import { spawnSync } from 'node:child_process'

const harness = 'C:/Users/kaiji/vibecodingKJ/clones/deepseek-ai/deepseek-harness'
const mod = await import(`file://${harness}/packages/sandbox/sandbox-windows-acl/lib/index.js`)
  .catch(async () => import(`file://${harness}/packages/sandbox/sandbox-windows-acl/lib/index.mjs`))

const { AclWriteGrant, workspaceWriteSid } = mod
const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.log('usage: node repro-acl-grant.mjs <dir>...')
  process.exitCode = 2
}
for (const dir of targets) {
  let sid
  try { sid = workspaceWriteSid(dir) } catch (e) { console.log(`[sid-fail] ${dir}: ${String(e).slice(0, 100)}`); continue }
  const grant = AclWriteGrant.create(sid)
  try {
    grant.add(dir, true)
    console.log(`[grant-OK] ${dir} (sid ${sid})`)
    grant.dispose?.()
  } catch (e) {
    console.log(`[grant-FAIL] ${dir}: ${String(e).slice(0, 160)}`)
  }
}
