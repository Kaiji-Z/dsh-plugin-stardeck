/**
 * B1-件④ dashboard 新路由补测——V17 archive（不可逆写通道六态）、host-sessions、
 * host-workspaces（V18）、planets POST（V18）。archive 是全插件唯一不可逆宿主
 * 扇出，此前零专测。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent, loadDirectives } from '../src/directives.ts'
import { appendEvent } from '../src/events.ts'
import { dueBounties, registerDashboard, type RouteRegistry } from '../src/dashboard.ts'

function tmpStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-routes-'))
}

function fakeStore(active = true) {
  return { get: () => ({ version: 2 as const, active }), save: () => {} }
}

function postReq(url: string, body: unknown): { method: string; url: string; on(event: string, cb: (chunk?: unknown) => void): void } {
  const text = JSON.stringify(body)
  return {
    method: 'POST',
    url,
    on(event, cb) {
      if (event === 'data') queueMicrotask(() => cb(text))
      if (event === 'end') queueMicrotask(() => cb())
    },
  }
}

function makeHandler(deps: Record<string, unknown> = {}): {
  handler: (req: unknown, res: unknown) => Promise<void>
  dispose: () => void
} {
  let handler: ((req: unknown, res: unknown) => void | Promise<void>) | undefined
  const registry: RouteRegistry = { register: route => { handler = route.handler; return () => {} } }
  const dispose = registerDashboard(registry, {
    store: fakeStore() as never,
    stateDir: '',
    roster: () => ({ units: [], errors: [] }) as never,
    warRoot: '/w',
    ...deps,
  } as never)
  return { handler: (req, res) => Promise.resolve(handler!(req, res)), dispose }
}

/** C1 配套：真实捕获 send() 写入的 statusCode（旧 helper 硬编码 code:200，
 * 把「全部错误码 200 出线」的 bug 藏在测试面之下）。 */
async function call(handler: (req: unknown, res: unknown) => Promise<void>, req: unknown): Promise<{ code: number; body: any }> {
  let body = ''
  const res: { setHeader(): void; write(): boolean; end(b?: string): void; on(): void; statusCode: number } = {
    setHeader: () => {},
    write: () => true,
    end: (b?: string) => { body = b ?? '' },
    on: () => {},
    statusCode: 200,
  }
  await handler(req, res)
  return { code: res.statusCode, body: JSON.parse(body) }
}

/** seed：命令已批准挂任务 + 任务走到指定状态（claimed 才有 attempt 会话）。 */
function seedApprovedWithTask(dir: string, cmdId: string, taskId: string, taskStatus: 'published' | 'in_progress' | 'reported' | 'closed' | 'failed'): void {
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: cmdId, text: 'x' })
  appendDirectiveEvent(dir, { type: 'directive_session_opened', ts: 't1', directiveId: cmdId, staffSessionId: `staff-${cmdId}` })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't2', directiveId: cmdId, staffSessionId: `staff-${cmdId}` })
  appendEvent(dir, { type: 'task_created', ts: 't3', campaignId: taskId, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't4', campaignId: taskId, workspacePath: '/w/proj' })
  if (taskStatus === 'in_progress' || taskStatus === 'closed') {
    appendEvent(dir, { type: 'task_claimed', ts: 't5', campaignId: taskId, claimedBy: `cmdr-${taskId}`, attemptId: 'tok', attempt: 1 })
  }
  if (taskStatus === 'reported' || taskStatus === 'closed') {
    appendEvent(dir, { type: 'task_submitted', ts: 't6', campaignId: taskId, from: `cmdr-${taskId}`, report: 'r' })
  }
  if (taskStatus === 'closed') {
    appendEvent(dir, { type: 'task_closed', ts: 't7', campaignId: taskId, verdict: '通过' })
  }
  if (taskStatus === 'failed') {
    appendEvent(dir, { type: 'task_failed', ts: 't6', campaignId: taskId, reason: 'x' })
  }
  appendDirectiveEvent(dir, { type: 'directive_approved', ts: 't8', directiveId: cmdId, taskId })
}

const okArchive = async () => ({ ok: true as const })

test('件④: archive 面缺席 → 501；缺 commandId → 400；未知命令 → 404', async () => {
  const dir = tmpStateDir()
  const bare = makeHandler({ stateDir: dir })
  try {
    // 面缺席优先（Stop-if 探针语义）：先于参数校验。
    const r0 = await call(bare.handler, postReq('/warroom/api/archive', { commandId: 'cmd-any' }))
    assert.equal(r0.code, 501) // C1：状态码真实出线
    assert.equal(r0.body.ok, false)
    assert.match(r0.body.error, /宿主归档通道未接入/)
  } finally {
    bare.dispose()
  }
  const wired = makeHandler({ stateDir: dir, archiveSession: okArchive })
  try {
    const r1 = await call(wired.handler, postReq('/warroom/api/archive', {}))
    assert.equal(r1.code, 400) // C1
    assert.equal(r1.body.ok, false)
    assert.match(r1.body.error, /缺少命令号/)
    const r2 = await call(wired.handler, postReq('/warroom/api/archive', { commandId: 'cmd-nope' }))
    assert.equal(r2.code, 404) // C1
    assert.equal(r2.body.ok, false)
    assert.match(r2.body.error, /不存在/)
  } finally {
    wired.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: archive 链未终局 → 400 拒绝；已归档（全覆盖）→ 400', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-live', 'task-live', 'in_progress')
    seedApprovedWithTask(dir, 'cmd-done', 'task-done', 'closed')
    // C5 更新：旧种子 sessions:[] 断言的是「已归档即拒」旧闸——新语义为「已入档
    // 会话覆盖全部相关会话才拒」，种子改为全覆盖（staff+尝试会话）以保持 400 用例。
    appendDirectiveEvent(dir, { type: 'directive_archived', ts: 't9', directiveId: 'cmd-done', sessions: ['staff-cmd-done', 'cmdr-task-done'] })
    const { handler, dispose } = makeHandler({ stateDir: dir, archiveSession: okArchive })
    try {
      const live = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-live' }))
      assert.equal(live.code, 400) // C1
      assert.equal(live.body.ok, false)
      assert.match(live.body.error, /战线未全终局/)
      const done = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-done' }))
      assert.equal(done.code, 400) // C1
      assert.equal(done.body.ok, false)
      assert.match(done.body.error, /已归档/)
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: archive 全终局 → 逐会话扇出成功落账（大副会话+尝试会话）', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-ok', 'task-ok', 'closed')
    const archived: string[] = []
    const { handler, dispose } = makeHandler({
      stateDir: dir,
      archiveSession: async sessionId => { archived.push(sessionId); return { ok: true } },
    })
    try {
      const r = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-ok' }))
      assert.equal(r.code, 200) // C1
      assert.equal(r.body.ok, true)
      assert.equal(r.body.archived, 2)
      assert.deepEqual([...archived].sort(), [`staff-cmd-ok`, `cmdr-task-ok`].sort())
      const d = loadDirectives(dir).find(x => x.id === 'cmd-ok')!
      assert.deepEqual([...d.archived!.sessions].sort(), [`staff-cmd-ok`, `cmdr-task-ok`].sort())
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: archive 部分失败如实返回；全部失败 → 502', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-p', 'task-p', 'closed')
    const { handler, dispose } = makeHandler({
      stateDir: dir,
      archiveSession: async sessionId => sessionId.startsWith('staff')
        ? { ok: true }
        : { ok: false, code: 'E_TIMEOUT', message: '超时' },
    })
    try {
      const r = await call(handler, postReq('/warroom/api/archive', { commandId: 'cmd-p' }))
      assert.equal(r.code, 200) // C1：部分失败（有成功）仍 200 如实返回
      assert.equal(r.body.ok, true)
      assert.equal(r.body.archived, 1)
      assert.equal(r.body.failed.length, 1)
      assert.equal(r.body.failed[0].code, 'E_TIMEOUT')
      // 全败分支：两个会话都失败。
      const all = makeHandler({
        stateDir: dir,
        archiveSession: async () => ({ ok: false, code: 'E_NOPE', message: 'x' }),
      })
      try {
        seedApprovedWithTask(dir, 'cmd-q', 'task-q', 'closed')
        const rq = await call(all.handler, postReq('/warroom/api/archive', { commandId: 'cmd-q' }))
        assert.equal(rq.code, 502) // C1
        assert.equal(rq.body.ok, false)
        assert.match(rq.body.error, /全部失败/)
      } finally {
        all.dispose()
      }
    } finally {
      dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: host-sessions 面缺席 501 / 提供时透出清单', async () => {
  const dir = tmpStateDir()
  const bare = makeHandler({ stateDir: dir })
  try {
    const r1 = await call(bare.handler, { method: 'GET', url: '/warroom/api/host-sessions' })
    assert.equal(r1.code, 501) // C1
    assert.equal(r1.body.ok, false)
    assert.match(r1.body.error, /未接入/)
  } finally {
    bare.dispose()
  }
  const wired = makeHandler({ stateDir: dir, listSessions: async () => ['s1', 's2'] })
  try {
    const r2 = await call(wired.handler, { method: 'GET', url: '/warroom/api/host-sessions' })
    assert.equal(r2.code, 200) // C1
    assert.equal(r2.body.ok, true)
    assert.deepEqual(r2.body.sessions, ['s1', 's2'])
  } finally {
    wired.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

/** seed：命令到 received（带大副会话）；talking=true 再落 directive_talking。 */
function seedTalkingCommand(dir: string, cmdId: string, talking: boolean): void {
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: cmdId, text: 'x' })
  appendDirectiveEvent(dir, { type: 'directive_session_opened', ts: 't1', directiveId: cmdId, staffSessionId: `staff-${cmdId}` })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't2', directiveId: cmdId, staffSessionId: `staff-${cmdId}` })
  if (talking) appendDirectiveEvent(dir, { type: 'directive_talking', ts: 't3', directiveId: cmdId })
}

test('件B: answer 面缺席 → 501；缺参/超长 → 400；未知命令 → 404', async () => {
  const dir = tmpStateDir()
  const bare = makeHandler({ stateDir: dir })
  try {
    const r0 = await call(bare.handler, postReq('/warroom/api/commands/answer', { commandId: 'c', text: 't' }))
    assert.equal(r0.code, 501) // C1
    assert.equal(r0.body.ok, false)
    assert.match(r0.body.error, /未接入/)
  } finally {
    bare.dispose()
  }
  const wired = makeHandler({ stateDir: dir, answerStaff: async () => ({ ok: true }) })
  try {
    const r1 = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: '', text: 't' }))
    assert.equal(r1.code, 400) // C1
    assert.equal(r1.body.ok, false)
    assert.match(r1.body.error, /缺少/)
    const r2 = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: 'nope', text: 't' }))
    assert.equal(r2.code, 404) // C1
    assert.equal(r2.body.ok, false)
    assert.match(r2.body.error, /不存在/)
    const r3 = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: 'c', text: 'x'.repeat(2001) }))
    assert.equal(r3.code, 400) // C1
    assert.equal(r3.body.ok, false)
    assert.match(r3.body.error, /2000/)
  } finally {
    wired.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件B: answer received 态作答 → 翻 talking + 送达原文；talking 态不重复落账', async () => {
  const dir = tmpStateDir()
  try {
    seedTalkingCommand(dir, 'cmd-a', false)
    const delivered: Array<{ sessionId: string; text: string }> = []
    const wired = makeHandler({
      stateDir: dir,
      answerStaff: async (sessionId: string, text: string) => { delivered.push({ sessionId, text }); return { ok: true } },
    })
    try {
      const r = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: 'cmd-a', text: '就这么办' }))
      assert.equal(r.code, 200) // C1
      assert.equal(r.body.ok, true)
      assert.equal(r.body.delivered, true)
      assert.equal(r.body.status, 'talking')
      // 送达的是原文与该命令的大副会话（无包装——作答即用户亲言）。
      assert.deepEqual(delivered, [{ sessionId: 'staff-cmd-a', text: '就这么办' }])
      // 账面翻 talking；talking 态再答不重复落 directive_talking。
      assert.equal(loadDirectives(dir).find(d => d.id === 'cmd-a')?.status, 'talking')
      const r2 = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: 'cmd-a', text: '补一句' }))
      assert.equal(r2.body.ok, true)
      assert.equal(r2.body.status, 'talking')
      const talkingEvents = loadDirectives(dir) // fold 态仍 talking 即可；事件计数走文件行
      assert.ok(talkingEvents !== null)
      const { readFileSync } = await import('node:fs')
      const lines = readFileSync(join(dir, 'directives.jsonl'), 'utf8').trim().split('\n')
      assert.equal(lines.filter(l => l.includes('"directive_talking"')).length, 1)
      assert.equal(delivered.length, 2)
    } finally {
      wired.dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件B: answer 终态 → 400；无大副会话 → 409；送达失败 → 502', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-done', 'task-done', 'closed')
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-bare', text: 'x' })
    const wired = makeHandler({ stateDir: dir, answerStaff: async () => ({ ok: false, message: '宿主通道断' }) })
    try {
      const r1 = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: 'cmd-done', text: 't' }))
      assert.equal(r1.code, 400) // C1
      assert.equal(r1.body.ok, false)
      assert.match(r1.body.error, /无需作答/)
      const r2 = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: 'cmd-bare', text: 't' }))
      assert.equal(r2.code, 409) // C1
      assert.equal(r2.body.ok, false)
      assert.match(r2.body.error, /尚无大副会话/)
      seedTalkingCommand(dir, 'cmd-c', true)
      const r3 = await call(wired.handler, postReq('/warroom/api/commands/answer', { commandId: 'cmd-c', text: 't' }))
      assert.equal(r3.code, 502) // C1
      assert.equal(r3.body.ok, false)
      assert.match(r3.body.error, /未送达/)
    } finally {
      wired.dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: host-workspaces 面缺席 501 / 提供时映射 sessionCount', async () => {
  const dir = tmpStateDir()
  const bare = makeHandler({ stateDir: dir })
  try {
    const r1 = await call(bare.handler, { method: 'GET', url: '/warroom/api/host-workspaces' })
    assert.equal(r1.code, 501) // C1
    assert.equal(r1.body.ok, false)
  } finally {
    bare.dispose()
  }
  const wired = makeHandler({
    stateDir: dir,
    listWorkspaces: async () => [
      { workspaceId: 'w1', path: 'D:/proj/a', title: 'A', sessionCount: 0 },
      { workspaceId: 'w2', path: 'D:/proj/b', title: 'B', sessionCount: 0 },
    ],
  })
  try {
    const r2 = await call(wired.handler, { method: 'GET', url: '/warroom/api/host-workspaces' })
    assert.equal(r2.code, 200) // C1
    assert.equal(r2.body.ok, true)
    assert.equal(r2.body.workspaces.length, 2)
    assert.equal(r2.body.workspaces[0].workspaceId, 'w1')
  } finally {
    wired.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('件④: planets POST 空/假路径 400，真目录注册 200', async () => {
  const dir = tmpStateDir()
  const realDir = mkdtempSync(join(tmpdir(), 'warroom-planet-real-'))
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    const r1 = await call(handler, postReq('/warroom/api/planets', { path: '   ' }))
    assert.equal(r1.code, 400) // C1
    assert.equal(r1.body.ok, false)
    assert.match(r1.body.error, /缺少工作区路径/)
    const r2 = await call(handler, postReq('/warroom/api/planets', { path: 'D:/definitely/not/a/dir' }))
    assert.equal(r2.code, 400) // C1
    assert.equal(r2.body.ok, false)
    assert.match(r2.body.error, /不是真实目录/)
    const r3 = await call(handler, postReq('/warroom/api/planets', { path: realDir, title: '实验星' }))
    assert.equal(r3.code, 200) // C1
    assert.equal(r3.body.ok, true)
    assert.equal(r3.body.planets.length, 1)
    assert.equal(r3.body.planets[0].title, '实验星')
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
    rmSync(realDir, { recursive: true, force: true })
  }
})

test('V19 回流·workspace/file+reveal 只读端点：守卫四拒/封顶/二进制嗅探/直读', async () => {
  const warRoot = mkdtempSync(join(tmpdir(), 'warroom-wsroot-'))
  const ws = join(warRoot, 'task-a')
  mkdirSync(ws, { recursive: true })
  mkdirSync(join(warRoot, 'state'), { recursive: true })
  writeFileSync(join(ws, 'ok.md'), '# 标题\n\n正文一段。', 'utf8')
  writeFileSync(join(ws, 'bin.dat'), Buffer.concat([Buffer.alloc(10), Buffer.from([0]), Buffer.from('rest')]))
  writeFileSync(join(ws, 'big.log'), 'x'.repeat(512 * 1024 + 1), 'utf8')
  const outside = mkdtempSync(join(tmpdir(), 'warroom-outside-'))
  const outside2 = mkdtempSync(join(tmpdir(), 'warroom-outside2-'))
  const h = makeHandler({ warRoot, stateDir: join(warRoot, 'state') })
  try {
    const get = (wsQ: string, nameQ: string): Promise<{ code: number; body: any }> =>
      call(h.handler, { method: 'GET', url: `/warroom/api/workspace/file?ws=${encodeURIComponent(wsQ)}&name=${encodeURIComponent(nameQ)}` })
    const ok = await get(ws, 'ok.md')
    assert.equal(ok.code, 200) // C1：状态码真实出线（旧「code 恒 200」注释作废）
    assert.equal(ok.body.ok, true)
    assert.equal(ok.body.binary, false)
    assert.match(ok.body.content, /# 标题/)
    // 守卫四拒：穿越/绝对路径/ws 越界/缺参（C1 后按真实语义码断言）。
    const trav = await get(ws, '../x.md')
    assert.equal(trav.code, 403)
    assert.equal(trav.body.ok, false)
    assert.match(trav.body.error, /穿越/)
    const abs = await get(ws, 'C:/x.md')
    assert.equal(abs.code, 403)
    assert.equal(abs.body.ok, false)
    assert.match(abs.body.error, /穿越/)
    const out = await get(outside, 'ok.md')
    assert.equal(out.code, 403)
    assert.equal(out.body.ok, false)
    assert.match(out.body.error, /war_root/)
    const missing = await get(ws, 'absent.md')
    assert.equal(missing.code, 404)
    assert.equal(missing.body.ok, false)
    assert.match(missing.body.error, /不存在/)
    // 封顶：>512KB。
    const big = await get(ws, 'big.log')
    assert.equal(big.code, 413)
    assert.equal(big.body.ok, false)
    assert.match(big.body.error, /512KB/)
    // 二进制嗅探：首 1KB 含 NUL → binary=true 且 content 空。
    const bin = await get(ws, 'bin.dat')
    assert.equal(bin.code, 200)
    assert.equal(bin.body.binary, true)
    assert.equal(bin.body.content, '')
    // 插件形态适配（2026-09-05）：注册星球=账本授权面——war_root 外的真实目录
    // 经 POST /planets 注册后可读；name 相对+不越 ws 的闸对注册星球照旧生效。
    writeFileSync(join(outside, 'reg.md'), '# 注册星产物\n', 'utf8')
    const reg = await call(h.handler, postReq('/warroom/api/planets', { path: outside, title: '外域星' }))
    assert.equal(reg.body.ok, true)
    const regFile = await get(outside, 'reg.md')
    assert.equal(regFile.code, 200)
    assert.equal(regFile.body.ok, true)
    assert.match(regFile.body.content, /注册星产物/)
    const regTrav = await get(outside, '../x.md')
    assert.equal(regTrav.code, 403)
    assert.equal(regTrav.body.ok, false)
    assert.match(regTrav.body.error, /穿越/)
    // reveal 守卫：ws 越界拒（不真开资源管理器——只测拒绝面）。
    let revBody = ''
    const revRes = { setHeader: () => {}, write: () => true, end: (b?: string) => { revBody = b ?? '' }, on: () => {}, statusCode: 200 }
    // outside 已注册（上方适配测试）——reveal 拒绝面改用未注册目录，别真开资源管理器。
    await h.handler(postReq('/warroom/api/workspace/reveal', { ws: outside2, name: '' }), revRes)
    const revOut = { code: revRes.statusCode, body: JSON.parse(revBody) }
    assert.equal(revOut.code, 403) // C1
    assert.equal(revOut.body.ok, false)
    assert.match(revOut.body.error, /war_root/)
  } finally {
    h.dispose()
    rmSync(warRoot, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('V19.8 播种收官路由：reported 可定性收官、面缺席拒、状态/参数闸', async () => {
  // 面缺席优先（与 archive 同款诚实降级）。
  const dir0 = tmpStateDir()
  const bare = makeHandler({ stateDir: dir0 })
  try {
    const r0 = await call(bare.handler, postReq('/warroom/api/tasks/close', { taskId: 'task-x', verdict: 'v' }))
    assert.equal(r0.code, 501) // C1
    assert.equal(r0.body.ok, false)
    assert.match(r0.body.error, /收官通道未接入/)
  } finally {
    bare.dispose()
  }
  // wired：reported 任务定性收官成功，closeTask 收到 (taskId, verdict)。
  const dir = tmpStateDir()
  const closes: Array<[string, string]> = []
  const h = makeHandler({ stateDir: dir, closeTask: (taskId: string, verdict: string) => { closes.push([taskId, verdict]) } })
  try {
    seedApprovedWithTask(dir, 'cmd-seed', 'task-seed', 'reported')
    const okr = await call(h.handler, postReq('/warroom/api/tasks/close', { taskId: 'task-seed', verdict: '打回定性——重做令已下，重做由该代接续，本账就此收官' }))
    assert.equal(okr.code, 200) // C1
    assert.equal(okr.body.ok, true)
    assert.deepEqual(closes, [['task-seed', '打回定性——重做令已下，重做由该代接续，本账就此收官']])
    // 参数闸：缺 verdict → 400；超长 verdict → 400。
    const rv = await call(h.handler, postReq('/warroom/api/tasks/close', { taskId: 'task-seed' }))
    assert.equal(rv.code, 400) // C1
    assert.match(rv.body.error, /缺少 taskId 或 verdict/)
    const rl = await call(h.handler, postReq('/warroom/api/tasks/close', { taskId: 'task-seed', verdict: 'x'.repeat(501) }))
    assert.equal(rl.code, 400) // C1
    assert.match(rl.body.error, /超长/)
    // 未知任务 → 404。
    const rn = await call(h.handler, postReq('/warroom/api/tasks/close', { taskId: 'task-nope', verdict: 'v' }))
    assert.equal(rn.code, 404) // C1
    assert.match(rn.body.error, /不存在/)
    // 状态闸：published 不可收官（播种定性只对 reported/failed）。
    seedApprovedWithTask(dir, 'cmd-seed2', 'task-seed2', 'published')
    const rs = await call(h.handler, postReq('/warroom/api/tasks/close', { taskId: 'task-seed2', verdict: 'v' }))
    assert.equal(rs.code, 409) // C1
    assert.match(rs.body.error, /不可收官/)
    assert.equal(closes.length, 1)
  } finally {
    h.dispose()
    rmSync(dir, { recursive: true, force: true })
    rmSync(dir0, { recursive: true, force: true })
  }
})

// ── 对抗审查修复批次（2026-09-23）：HTTP API 面簇 C2/C3/C4/C5/C9/C10/C11 ──────

/** 直发原始文本体（非 JSON.stringify——C2/C3 坏体用例）。 */
function rawPostReq(url: string, raw: string): { method: string; url: string; on(event: string, cb: (chunk?: unknown) => void): void } {
  return {
    method: 'POST',
    url,
    on(event, cb) {
      if (event === 'data') queueMicrotask(() => cb(raw))
      if (event === 'end') queueMicrotask(() => cb())
    },
  }
}

/** 中途断线的 POST：data 后发 error（无 end）——C2 断线不挂起用例。 */
function brokenPostReq(url: string, raw: string): { method: string; url: string; on(event: string, cb: (chunk?: unknown) => void): void } {
  return {
    method: 'POST',
    url,
    on(event, cb) {
      if (event === 'data') queueMicrotask(() => cb(raw))
      if (event === 'error') queueMicrotask(() => cb())
    },
  }
}

test('C2: 请求体超 64KB → 413；error 流断线 → 正常响应不挂起', async () => {
  const dir = tmpStateDir()
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    // 超限：单 chunk > 64KB → 立即停止累积按 413 拒（C1 后状态码真实出线）。
    const over = await call(handler, rawPostReq('/warroom/api/commands', `{"text":"${'x'.repeat(64 * 1024)}"}`))
    assert.equal(over.code, 413)
    assert.equal(over.body.ok, false)
    assert.match(over.body.error, /64KB/)
    // 中途断线（error 流，无 end）：handler 必须响应而非永久挂起（2s 竞速护栏）。
    const raced = await Promise.race([
      call(handler, brokenPostReq('/warroom/api/commands', '{"text":"half')),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('handler 挂起：error 流未 resolve')), 2000)),
    ])
    assert.equal(raced.code, 400) // 断线收到空体 → C3 干净文案（非 V8 原文 500）
    assert.match(raced.body.error, /不是合法 JSON/)
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('C3: 坏 JSON body → 400 且文案干净（不回显 V8 原文）', async () => {
  const dir = tmpStateDir()
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    const r = await call(handler, rawPostReq('/warroom/api/commands', '{"text": '))
    assert.equal(r.code, 400)
    assert.equal(r.body.ok, false)
    assert.match(r.body.error, /不是合法 JSON/)
    assert.ok(!r.body.error.includes('Unexpected end of JSON input'), '不得回显 V8 SyntaxError 原文')
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('C4: 未知路由超长 pathname → 404 且错误消息截断（不整段反射入参）', async () => {
  const dir = tmpStateDir()
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    const long = 'a'.repeat(10000)
    const r = await call(handler, { method: 'GET', url: `/warroom/${long}` })
    assert.equal(r.code, 404)
    assert.equal(r.body.ok, false)
    assert.ok(r.body.error.length < 300, `错误消息应受 bound（实际 ${r.body.error.length} 字符）`)
    assert.ok(!r.body.error.includes('a'.repeat(200)), '不得包含完整原文')
    assert.match(r.body.error, /路由不存在/)
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('C5: archive 部分失败 → 第二次调用补齐缺失会话；全覆盖后第三次 400', async () => {
  const dir = tmpStateDir()
  try {
    seedApprovedWithTask(dir, 'cmd-r', 'task-r', 'closed')
    const calls: string[] = []
    const mk = (failFor: (s: string) => boolean) => async (sessionId: string) => {
      calls.push(sessionId)
      return failFor(sessionId) ? { ok: false as const, code: 'E_TIMEOUT', message: '超时' } : { ok: true as const }
    }
    // 第一次：cmdr 尝试会话「超时」失败（超时≠宿主失败，可能账实分离）→ 落档只含 staff。
    const h1 = makeHandler({ stateDir: dir, archiveSession: mk(s => s.startsWith('cmdr')) })
    try {
      const r1 = await call(h1.handler, postReq('/warroom/api/archive', { commandId: 'cmd-r' }))
      assert.equal(r1.code, 200)
      assert.equal(r1.body.archived, 1)
      const after1 = loadDirectives(dir).find(d => d.id === 'cmd-r')!.archived!
      assert.deepEqual([...after1.sessions], ['staff-cmd-r'])
    } finally {
      h1.dispose()
    }
    // 第二次：重入不被「已归档」堵死——只补归档缺失的 cmdr 会话，账面合并既往+新成功。
    const h2 = makeHandler({ stateDir: dir, archiveSession: mk(() => false) })
    try {
      const callsBefore = calls.length
      const r2 = await call(h2.handler, postReq('/warroom/api/archive', { commandId: 'cmd-r' }))
      assert.equal(r2.code, 200)
      assert.equal(r2.body.archived, 1)
      assert.deepEqual(calls.slice(callsBefore), ['cmdr-task-r'], '只扇出缺失会话，不重打已入档会话')
      const after2 = loadDirectives(dir).find(d => d.id === 'cmd-r')!.archived!
      assert.deepEqual([...after2.sessions].sort(), ['cmdr-task-r', 'staff-cmd-r'].sort())
    } finally {
      h2.dispose()
    }
    // 第三次：全覆盖 → 400 已归档（幂等终点）。
    const h3 = makeHandler({ stateDir: dir, archiveSession: mk(() => false) })
    try {
      const r3 = await call(h3.handler, postReq('/warroom/api/archive', { commandId: 'cmd-r' }))
      assert.equal(r3.code, 400)
      assert.match(r3.body.error, /已归档/)
    } finally {
      h3.dispose()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('C9: commands cron 不可满足（2 月 30 日）→ 400；4 段表达式仍 400', async () => {
  const dir = tmpStateDir()
  const { handler, dispose } = makeHandler({ stateDir: dir })
  try {
    const bad = await call(handler, postReq('/warroom/api/commands', { text: 'x', cron: '0 9 30 2 *' }))
    assert.equal(bad.code, 400)
    assert.equal(bad.body.ok, false)
    assert.match(bad.body.error, /无触发时机/)
    // 既有「4 段表达式→400」用例兼容：assertCronUsable 内部先 parseCron。
    const seg = await call(handler, postReq('/warroom/api/commands', { text: 'x', cron: '0 9 * *' }))
    assert.equal(seg.code, 400)
    assert.match(seg.body.error, /5 段/)
  } finally {
    dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('C10: dueBounties 跳过 enabled:false 的停用任务令', () => {
  const dir = tmpStateDir()
  try {
    const seed = (id: string, enabled: boolean): void => {
      appendEvent(dir, { type: 'task_created', ts: '2020-01-01T00:00:00Z', campaignId: id, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
      appendEvent(dir, { type: 'task_published', ts: '2020-01-01T00:00:00Z', campaignId: id, workspacePath: '/w' })
      appendEvent(dir, { type: 'task_scheduled', ts: '2020-01-01T00:00:00Z', campaignId: id, cron: '* * * * *', enabled })
    }
    seed('bounty-off', false)
    seed('bounty-on', true)
    const due = dueBounties(dir, Date.now())
    assert.ok(due.some(d => d.taskId === 'bounty-on'), '启用中的到点任务令照常 due')
    assert.ok(!due.some(d => d.taskId === 'bounty-off'), 'enabled:false 的停用任务令永不 due')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('C11: workspace/file 注册星球路径大小写不一致 → 放行（Windows FS 不区分大小写）', async () => {
  if (process.platform !== 'win32') return // 大小写不敏感断言只在 Windows FS 语义下成立
  const warRoot = mkdtempSync(join(tmpdir(), 'warroom-ci-root-'))
  const planetHome = mkdtempSync(join(tmpdir(), 'warroom-ci-planet-')) // 星球在 war_root 外——专测 allowedAbs 面
  const planet = join(planetHome, 'planet')
  mkdirSync(planet, { recursive: true })
  const state = join(warRoot, 'state')
  mkdirSync(state, { recursive: true })
  writeFileSync(join(planet, 'note.md'), '# ok', 'utf8')
  const h = makeHandler({ warRoot, stateDir: state })
  try {
    const reg = await call(h.handler, postReq('/warroom/api/planets', { path: planet }))
    assert.equal(reg.code, 200)
    assert.equal(reg.body.ok, true)
    // 大小写变体（翻转首个字母）：Windows 下同一目录，旧精确比较误 403。
    const flipped = planet.charAt(0) === planet.charAt(0).toLowerCase()
      ? planet.charAt(0).toUpperCase() + planet.slice(1)
      : planet.charAt(0).toLowerCase() + planet.slice(1)
    const r = await call(h.handler, { method: 'GET', url: `/warroom/api/workspace/file?ws=${encodeURIComponent(flipped)}&name=note.md` })
    assert.equal(r.code, 200)
    assert.equal(r.body.ok, true)
    assert.match(r.body.content, /# ok/)
  } finally {
    h.dispose()
    rmSync(warRoot, { recursive: true, force: true })
    rmSync(planetHome, { recursive: true, force: true })
  }
})
