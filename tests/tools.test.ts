import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendDirectiveEvent } from '../src/directives.ts'
import { appendEvent, loadCampaign, readEvents } from '../src/events.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import type { GoalsFace } from '../src/goals.ts'
import { closeTaskInternal, killCreditAllGreen, parseDeliverables, parseEvidence, parseWorkspaceArg, qualityOf, warTools, type SubagentsServiceFace } from '../src/tools.ts'
import type { Roster } from '../src/units.ts'
import { isAutoWorkspace, resolveWorkspaceRoot, WORKSPACE_ROOT_DIRNAME } from '../src/workspace.ts'
import type { SubmissionEvidence } from '../src/types.ts'

test('qualityOf normalizes unknown values to common', () => {
  assert.equal(qualityOf('epic'), 'epic')
  assert.equal(qualityOf(undefined), 'common')
  assert.equal(qualityOf('Epic'), 'common')
  assert.equal(qualityOf('神话'), 'common')
})

test('parseEvidence rejects self-certification without evidence', () => {
  const none = parseEvidence(undefined)
  assert.equal(none.ok, false)
  if (!none.ok) assert.match(none.reason, /没有证据/)
  const notObject = parseEvidence('全做完了')
  assert.equal(notObject.ok, false)
  if (!notObject.ok) assert.match(notObject.reason, /checks/)
})

test('parseEvidence rejects unfinished checks with the failed items named', () => {
  const partial = parseEvidence({ checks: [{ item: 'CLI 可运行', passed: true }, { item: '测试全绿', passed: false }] })
  assert.equal(partial.ok, false)
  if (!partial.ok) assert.match(partial.reason, /测试全绿/)
  if (!partial.ok) assert.match(partial.reason, /war_fail/)
})

test('parseEvidence rejects a failing test run (exit_code must be 0)', () => {
  const red = parseEvidence({ checks: [{ item: 'a', passed: true }], tests: { command: 'npm test', exit_code: 1, passed: 10, failed: 2 } })
  assert.equal(red.ok, false)
  if (!red.ok) assert.match(red.reason, /退出码 1/)
})

test('parseEvidence accepts a full green card and normalizes fields', () => {
  const ok = parseEvidence({
    checks: [{ item: 'add 可用', passed: true }, { item: 'list 可用', passed: true }],
    tests: { command: 'npm test', exit_code: 0, passed: 8, failed: 0 },
    diffstat: '2 files changed',
    files: ['cli.js', 'cli.test.js'],
  })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.evidence.checks.length, 2)
    assert.equal(ok.evidence.tests?.exitCode, 0)
    assert.deepEqual(ok.evidence.files, ['cli.js', 'cli.test.js'])
  }
})

test('v1.0 R8: evidence rides the JSON-TEXT channel (dsh drops type:json params)', () => {
  const asText = parseEvidence(JSON.stringify({
    checks: [{ item: 'add 写入', passed: true }],
    tests: { command: 'node test.ps1', exit_code: 0, passed: 19, failed: 0 },
  }))
  assert.equal(asText.ok, true)
  if (asText.ok) assert.equal(asText.evidence.tests?.passed, 19)
  const badJson = parseEvidence('not json at all')
  assert.equal(badJson.ok, false)
  if (!badJson.ok) assert.match(badJson.reason, /JSON/)
  const emptyText = parseEvidence('  ')
  assert.equal(emptyText.ok, false)
})

test('v1.0 R8: deliverables also accept the JSON-text channel', () => {
  const evidence: SubmissionEvidence = { checks: [{ item: 'a', passed: true }] }
  const parsed = parseDeliverables('[{"kind":"tests","summary":"19/19 全绿"}]', evidence, 'now')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]!.summary, '19/19 全绿')
})

test('parseDeliverables auto-collects loot from evidence when the commander listed none', () => {
  const evidence: SubmissionEvidence = {
    checks: [{ item: 'a', passed: true }],
    tests: { command: 'npm test', exitCode: 0, passed: 6, failed: 0 },
    diffstat: '3 files changed, 41 insertions(+)',
    files: ['a.js', 'b.js', 'c.js'],
  }
  const auto = parseDeliverables(undefined, evidence, 'now')
  assert.equal(auto.length, 3)
  assert.ok(auto.some(d => d.kind === 'tests' && d.summary.includes('npm test')))
  assert.ok(auto.some(d => d.kind === 'diffstat'))
  assert.ok(auto.some(d => d.kind === 'files' && d.summary.includes('3 个文件')))
  // 显式清单优先：同 kind 不重复自动补
  const explicit = parseDeliverables([{ kind: 'tests', summary: '自报：测试过了' }], evidence, 'now')
  assert.equal(explicit.filter(d => d.kind === 'tests').length, 1)
  assert.equal(explicit[0]!.summary, '自报：测试过了')
})

test('v2.0: parseWorkspaceArg routes bound / instance / auto', () => {
  assert.deepEqual(parseWorkspaceArg('D:/proj/kaijibot'), { kind: 'bound', path: 'D:/proj/kaijibot' })
  assert.deepEqual(parseWorkspaceArg('  @new:spider  '), { kind: 'instance', slug: 'spider' })
  assert.deepEqual(parseWorkspaceArg(undefined), { kind: 'auto' })
  assert.deepEqual(parseWorkspaceArg('   '), { kind: 'auto' })
  // '@new:' without a name degrades to auto (malformed param must not block).
  assert.deepEqual(parseWorkspaceArg('@new:'), { kind: 'auto' })
})

// ─── 对抗审查修复批（2026-09-23）：B1/B3/B4/B5/B6/B9/B11 回归 ───────────────

const FLAG_OFF: FeatureFlags = readFeatureFlags({})
const FLAG_GOAL: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'staff-goal' })

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'warroom-tools-fix-'))
}

function fakeSubagents(): SubagentsServiceFace {
  return {
    async startContinuable() { return { childId: 'child-x', messageId: 'm1' } },
    async followup() { return {} },
    interrupt() {},
    async listDescendants() { return [] },
  }
}

function makeDeps(dir: string, flags: FeatureFlags, over: {
  goals?: GoalsFace
  resolveAgent?: (id: string) => unknown
  commander?: { conscript(task: unknown, signal: AbortSignal): Promise<{ spawned: true; childId: string } | { spawned: false; reason?: string }>; releaseSpawned?(taskId: string): void; forget?(taskId: string): void; relayTo?(sessionId: string, text: string): Promise<boolean> }
  subagents?: SubagentsServiceFace
  hqSessionId?: string
} = {}): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [], errors: [] }
  return {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: over.hqSessionId }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: over.subagents ?? fakeSubagents(),
    commander: over.commander ?? { conscript: async () => ({ spawned: false }) },
    workspace: {
      materialize: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }),
      materializeInstance: (warRoot: string, id: string) => ({ path: join(warRoot, id), kind: 'dir' as const }),
    },
    warRoot: join(dir, 'war'),
    flags,
    ...(over.goals !== undefined ? { goals: () => over.goals } : {}),
    ...(over.resolveAgent !== undefined ? { resolveAgent: over.resolveAgent } : {}),
  } as Parameters<typeof warTools>[0]
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>, callerId = 'sec-1'): Promise<Record<string, unknown>> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: callerId }, signal: new AbortController().signal }) as Promise<Record<string, unknown>>
}

function seedTask(dir: string, id: string, status: 'published' | 'in_progress' | 'reported' = 'published'): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: id, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: id, workspacePath: join(dir, 'ws', id) })
  if (status !== 'published') {
    appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: id, claimedBy: 'cmd-9', attemptId: `tok-${id}`, attempt: 1 })
  }
  if (status === 'reported') {
    appendEvent(dir, { type: 'task_submitted', ts: 't3', campaignId: id, report: 'r', from: 'cmd-9' })
  }
}

/** B3 用：带所属命令（staffSessionId）的任务——身份门的主战场形态。 */
function seedCommandTask(dir: string, taskId: string, commandId: string, staffSessionId: string, status: 'in_progress' | 'reported'): void {
  appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: commandId, text: '做考题' })
  appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: commandId, staffSessionId })
  appendDirectiveEvent(dir, { type: 'directive_approved', ts: 't2', directiveId: commandId, taskId })
  seedTask(dir, taskId, status)
}

test('B4: killCreditAllGreen 否决「退出码 0 但 failed>0」（机械全绿须真的全绿）', () => {
  const lying: SubmissionEvidence = {
    checks: [{ item: 'a', passed: true }],
    tests: { command: 'npm test', exitCode: 0, passed: 5, failed: 3 },
  }
  const bad = killCreditAllGreen(lying, 'C:/ws')
  assert.equal(bad.green, false)
  assert.match(bad.why, /3 项失败/)
  // failed=0 照过；无 tests 维持既有「未附测试运行记录」拒。
  assert.equal(killCreditAllGreen({ ...lying, tests: { command: 'npm test', exitCode: 0, passed: 8, failed: 0 } }, 'C:/ws').green, true)
  assert.equal(killCreditAllGreen({ checks: [{ item: 'a', passed: true }] }, 'C:/ws').green, false)
})

test('B4: parseEvidence 否决「退出码 0 但有失败项」的自报', () => {
  const lying = parseEvidence({ checks: [{ item: 'a', passed: true }], tests: { command: 'npm test', exit_code: 0, passed: 5, failed: 3 } })
  assert.equal(lying.ok, false)
  if (!lying.ok) assert.match(lying.reason, /3 项失败/)
  const honest = parseEvidence({ checks: [{ item: 'a', passed: true }], tests: { command: 'npm test', exit_code: 0, passed: 8, failed: 0 } })
  assert.equal(honest.ok, true)
})

test('B5: war_publish 拒发不合法/不可满足 cron（零写入）；合法 cron 照常落 schedule', async () => {
  const dir = tmpDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-b5', text: '定时任务' })
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: 'cmd-b5', staffSessionId: 'sec-1' })
    const deps = makeDeps(dir, FLAG_OFF)
    const publish = (cron: string) => execTool(deps, 'war_publish', { title: '定时任务', brief: '任务书正文', acceptance: '验收标准一条', cron, commandId: 'cmd-b5' })
    await assert.rejects(publish('0 9 * *'), /cron 表达式不合法/, '4 段表达式拒发')
    await assert.rejects(publish('0 9 30 2 *'), /cron 表达式不合法/, '不可满足（2 月 30 日）拒发')
    // 拒发零写入：campaign 账本一笔没有（命令仍 received、可修后重发）。
    const campaigns = join(dir, 'campaigns')
    assert.equal(existsSync(campaigns) ? readdirSync(campaigns).length : 0, 0, '拒发不得留半笔账')
    const out = await publish('0 9 * * *')
    const task = loadCampaign(dir, out.taskId as string)
    assert.equal(task.schedule?.enabled, true)
    assert.equal(task.schedule?.cron, '0 9 * * *')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B6: 发布点 goal 结算前移到任何落账之前（campaign 账本在结算时仍为空）', async () => {
  const dir = tmpDir()
  try {
    appendDirectiveEvent(dir, { type: 'directive_created', ts: 't0', directiveId: 'cmd-b6', text: '做个东西' })
    appendDirectiveEvent(dir, { type: 'directive_received', ts: 't1', directiveId: 'cmd-b6', staffSessionId: 'sec-1' })
    let ledgerEmptyAtSettle: boolean | undefined
    const face: GoalsFace = {
      get: async () => {
        const campaigns = join(dir, 'campaigns')
        ledgerEmptyAtSettle = !existsSync(campaigns) || readdirSync(campaigns).length === 0
        return undefined
      },
      create: async () => { throw new Error('not under test') },
      disarm: async () => { throw new Error('not under test') },
      complete: async () => { throw new Error('not under test') },
      clear: async () => undefined,
    }
    const deps = makeDeps(dir, FLAG_GOAL, { goals: face, resolveAgent: () => ({ id: 'sec-1' }) })
    const out = await execTool(deps, 'war_publish', { title: '任务标题', brief: '背景与指引齐备的任务书', acceptance: 'npm test 退出码 0；功能可演示', commandId: 'cmd-b6' }, 'sec-1')
    assert.equal(ledgerEmptyAtSettle, true, 'goal 结算（face.get 的 await 窗口）不得发生在任何 campaign 落账之后')
    // created+published 单批落账：两条事件都完整在场，无「有 created 无 published」悬空。
    const evs = readEvents(dir, out.taskId as string)
    assert.deepEqual(evs.map(e => e.type), ['task_created', 'task_published'])
    assert.equal(loadCampaign(dir, out.taskId as string).status, 'published')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B1: war_fail 重派——先释放守卫再补征；征召未成回执如实（不谎称已派遣）', async () => {
  const dir = tmpDir()
  try {
    seedTask(dir, 'c-b1', 'in_progress')
    const ops: string[] = []
    const deps = makeDeps(dir, FLAG_OFF, {
      commander: {
        conscript: async () => { ops.push('conscript'); return { spawned: false, reason: '在役外勤小队满编（3/3），稍后由巡检补征。' } },
        releaseSpawned: id => { ops.push(`release:${id}`) },
      },
    })
    const out = await execTool(deps, 'war_fail', { task_id: 'c-b1', attempt_id: 'tok-c-b1', reason: '修不动' }, 'cmd-9')
    assert.deepEqual(ops, ['release:c-b1', 'conscript'], 'task_requeued 落账后先释放 spawn-once 守卫，再补征')
    assert.equal(loadCampaign(dir, 'c-b1').status, 'published', '已重派回任务栏')
    assert.match(out.next as string, /派遣未成/)
    assert.match(out.next as string, /满编/)
    assert.doesNotMatch(out.next as string, /并派遣新外勤小队/, '征召未成不得宣称已派遣')
    // 成功形态保留原文案。
    appendEvent(dir, { type: 'task_claimed', ts: 't4', campaignId: 'c-b1', claimedBy: 'cmd-9', attemptId: 'tok-2', attempt: 2 })
    const okDeps = makeDeps(dir, FLAG_OFF, {
      commander: {
        conscript: async () => { ops.push('conscript'); return { spawned: true, childId: 'sess-new' } },
        releaseSpawned: id => { ops.push(`release:${id}`) },
      },
    })
    const out2 = await execTool(okDeps, 'war_fail', { task_id: 'c-b1', attempt_id: 'tok-2', reason: '再修不动' }, 'cmd-9')
    assert.match(out2.next as string, /并派遣新外勤小队/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B3: war_close_task 身份门——非所属大副/HQ 拒绝；所属大副与 HQ 放行', async () => {
  const dir = tmpDir()
  try {
    seedCommandTask(dir, 'c-evil', 'cmd-evil', 'sec-own', 'reported')
    seedCommandTask(dir, 'c-own', 'cmd-own', 'sec-own', 'reported')
    seedCommandTask(dir, 'c-hq', 'cmd-hq', 'sec-own', 'reported')
    const deps = makeDeps(dir, FLAG_OFF, { hqSessionId: 'hq-1' })
    await assert.rejects(
      execTool(deps, 'war_close_task', { task_id: 'c-evil', verdict: '打回：不达标' }, 'sec-evil'),
      /大副会话或舰长（HQ）会话可记录判定/,
    )
    assert.equal(loadCampaign(dir, 'c-evil').status, 'reported', '越权收官零写入')
    await execTool(deps, 'war_close_task', { task_id: 'c-own', verdict: '打回：不达标' }, 'sec-own')
    assert.equal(loadCampaign(dir, 'c-own').status, 'closed')
    await execTool(deps, 'war_close_task', { task_id: 'c-hq', verdict: '打回：不达标' }, 'hq-1')
    assert.equal(loadCampaign(dir, 'c-hq').status, 'closed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B3: war_close_task 状态门——零汇报（in_progress）不得记「通过」；打回不受限；孤儿宽容', async () => {
  const dir = tmpDir()
  try {
    seedCommandTask(dir, 'c-ip', 'cmd-ip', 'sec-own', 'in_progress')
    seedCommandTask(dir, 'c-back', 'cmd-back', 'sec-own', 'in_progress')
    const deps = makeDeps(dir, FLAG_OFF)
    await assert.rejects(
      execTool(deps, 'war_close_task', { task_id: 'c-ip', verdict: '通过收官' }, 'sec-own'),
      /待翻阅（reported）/,
    )
    assert.equal(loadCampaign(dir, 'c-ip').status, 'in_progress', '状态门拦截零写入')
    // 非通过语义（打回）随时可终局。
    await execTool(deps, 'war_close_task', { task_id: 'c-back', verdict: '打回：不做' }, 'sec-own')
    assert.equal(loadCampaign(dir, 'c-back').status, 'closed')
    // 孤儿任务（无所属 directive，legacy/种子形态）宽容放行——staff-goal 回归
    // 同款形态（close in_progress 孤儿结算 goal）依赖此门不加追溯。
    seedTask(dir, 'c-orphan', 'in_progress')
    await execTool(deps, 'war_close_task', { task_id: 'c-orphan', verdict: '通过收官' }, 'sec-1')
    assert.equal(loadCampaign(dir, 'c-orphan').status, 'closed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B3: war_comment 舰长批注形态——非 HQ/所属大副降级为普通批注（上栏但不转达）', async () => {
  const dir = tmpDir()
  try {
    seedCommandTask(dir, 'c-cm', 'cmd-cm', 'sec-own', 'in_progress')
    const relayedTo: string[] = []
    const deps = makeDeps(dir, FLAG_OFF, {
      commander: {
        conscript: async () => ({ spawned: false }),
        relayTo: async sessionId => { relayedTo.push(sessionId); return true },
      },
    })
    // 所属大副（代笔）→ 冠【舰长批注】转达执行会话。
    const a = await execTool(deps, 'war_comment', { task_id: 'c-cm', comment: '舰长说：加快' }, 'sec-own')
    assert.deepEqual(relayedTo, ['cmd-9'])
    assert.equal(a.relayed, true)
    // 执行外勤小队本人（非大副/HQ）→ 降级：批注照常上栏，但不冠冕转达。
    const b = await execTool(deps, 'war_comment', { task_id: 'c-cm', comment: '收到批示' }, 'cmd-9')
    assert.equal(relayedTo.length, 1, '降级为普通批注：不冠【舰长批注】转达')
    assert.equal(b.relayed, undefined)
    assert.equal(loadCampaign(dir, 'c-cm').comments.length, 2, '两条批注都已上栏（降级不丢账）')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B3: war_deploy_unit 只认领取任务的外勤小队本人', async () => {
  const dir = tmpDir()
  try {
    seedTask(dir, 'c-dep', 'in_progress')
    const deps = makeDeps(dir, FLAG_OFF)
    await assert.rejects(
      execTool(deps, 'war_deploy_unit', { task_id: 'c-dep', unit: 'recon', mission: '去侦察', front: 'src' }, 'intruder'),
      /加派组员只限领取任务 .* 的外勤小队本人/,
    )
    assert.equal(loadCampaign(dir, 'c-dep').units.size, 0, '越权加派零写入')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B3: war_orders / war_recall / war_log_report——通话方放行、外人拒绝', async () => {
  const dir = tmpDir()
  try {
    seedTask(dir, 'c-ops', 'in_progress')
    appendEvent(dir, { type: 'unit_deployed', ts: 't3', campaignId: 'c-ops', childId: 'child-a', unitName: 'recon', label: '侦察兵', mission: 'm', front: 'src', writes: true })
    const deps = makeDeps(dir, FLAG_OFF)
    await assert.rejects(execTool(deps, 'war_orders', { task_id: 'c-ops', child_id: 'child-a', order: '增援' }, 'outsider'), /通话方/)
    await assert.rejects(execTool(deps, 'war_recall', { task_id: 'c-ops', child_id: 'child-a', reason: '撤' }, 'outsider'), /通话方/)
    await assert.rejects(execTool(deps, 'war_log_report', { task_id: 'c-ops', child_id: 'child-a', summary: 's' }, 'outsider'), /通话方/)
    // 外勤小队本人（claimedBy）放行：三动词都真实落账。
    await execTool(deps, 'war_orders', { task_id: 'c-ops', child_id: 'child-a', order: '增援东侧' }, 'cmd-9')
    await execTool(deps, 'war_log_report', { task_id: 'c-ops', child_id: 'child-a', summary: '东侧已清' }, 'cmd-9')
    await execTool(deps, 'war_recall', { task_id: 'c-ops', child_id: 'child-a', reason: '收队' }, 'cmd-9')
    const task = loadCampaign(dir, 'c-ops')
    assert.equal(task.units.get('child-a')?.orders.length, 1)
    assert.equal(task.units.get('child-a')?.lastReport, '东侧已清')
    assert.ok(task.units.get('child-a')?.recalled !== undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('B9: 物化根常量与守卫一致——isAutoWorkspace 双根（旧 .warroom + V18 物化根）判定', () => {
  assert.equal(WORKSPACE_ROOT_DIRNAME, 'warroom-workspaces')
  assert.ok(resolveWorkspaceRoot('', 'D:/x/.warroom').endsWith(WORKSPACE_ROOT_DIRNAME), '缺省物化根=warRoot 同级/常量段')
  assert.equal(isAutoWorkspace('D:/x/.warroom/tasks/t1', 'D:/x/.warroom'), true, '旧根之下的 auto 工作区仍守')
  assert.equal(isAutoWorkspace('D:/x/warroom-workspaces/tasks/t1', 'D:/x/.warroom'), true, 'V18 物化根之下的 auto 工作区（旧守卫漏判的形态）')
  assert.equal(isAutoWorkspace('D:/x/warroom-workspaces/instances/t1-slug', 'D:/x/.warroom'), true)
  assert.equal(isAutoWorkspace('D:/x/warroom-workspaces-2/t', 'D:/x/.warroom'), false, '相近名不是物化根（段边界）')
  assert.equal(isAutoWorkspace('D:/proj/kaijibot', 'D:/x/.warroom'), false, 'bound 工作区不误伤')
  // 配置了物化根 → 只认配置根 + 旧根。
  assert.equal(isAutoWorkspace('E:/ws/tasks/t1', 'D:/x/.warroom', 'E:/ws'), true)
  assert.equal(isAutoWorkspace('D:/x/warroom-workspaces/tasks/t1', 'D:/x/.warroom', 'E:/ws'), false, '配置搬家后旧缺省根不再是物化根')
})

test('B11: 非通过判定收官停用定时任务令（enabled=false）；通过判定照常', async () => {
  const dir = tmpDir()
  try {
    const seed = (id: string): void => {
      appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: id, title: 'x', brief: 'b', acceptance: 'a', priority: 'normal' })
      appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: id, workspacePath: join(dir, 'war', id) })
      appendEvent(dir, { type: 'task_scheduled', ts: 't2', campaignId: id, cron: '0 9 * * *', enabled: true })
      appendEvent(dir, { type: 'task_claimed', ts: 't3', campaignId: id, claimedBy: 'cmd-9', attemptId: `tok-${id}`, attempt: 1 })
      appendEvent(dir, { type: 'task_submitted', ts: 't4', campaignId: id, report: 'r', from: 'cmd-9' })
    }
    seed('c-sched')
    seed('c-pass')
    const deps = makeDeps(dir, FLAG_OFF)
    await closeTaskInternal(deps, 'c-sched', '打回：未达验收', new AbortController().signal)
    const back = loadCampaign(dir, 'c-sched')
    assert.equal(back.status, 'closed')
    assert.equal(back.schedule?.enabled, false, '打回收官即停摆后续轮次')
    assert.equal(back.schedule?.cron, '0 9 * * *', '停用不改 cron 本体')
    await closeTaskInternal(deps, 'c-pass', '通过收官', new AbortController().signal)
    const passed = loadCampaign(dir, 'c-pass')
    assert.equal(passed.status, 'closed')
    assert.equal(passed.schedule?.enabled, true, '通过判定不停摆（质量过关，轮次照常）')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
