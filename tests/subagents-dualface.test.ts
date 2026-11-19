import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendEvent, loadCampaign } from '../src/events.ts'
import { readFeatureFlags, type FeatureFlags } from '../src/flags.ts'
import { warTools, type SubagentsServiceFace } from '../src/tools.ts'
import { sandboxDeny, type Roster, type UnitSpec } from '../src/units.ts'

/** dsh 0.2.2-rc.5 subagents 面适配回归钉（2026-11-19）：
 *  ①新面 startActivation（spec 摊平+delivery 必填；persona 走 agentPreset、
 *  tool deny 走 spawn 后的 restrict 钩子）②旧面 startContinuable 原样保留
 *  ③followup→sendMessage 改名（0.2.0-rc.2 起的潜伏债，两版同形）。 */

const FLAG_ON: FeatureFlags = readFeatureFlags({ WARROOM_FEATURES: 'troop-mailbox' })

const RECON: UnitSpec = {
  name: 'recon', label: '侦察兵', description: '勘察', instructions: '你是侦察兵，先看后动。', sandboxMode: 'read-only', backend: 'in-process', source: 'builtin',
}

/** rc.5-only 假面：无 startContinuable（旧面缺席逼双面选择器走新路）。 */
function fakeRc5(): {
  face: SubagentsServiceFace
  activations: Array<{ provider: string; label: string; delivery: string; agentPreset?: string; promptText: string; maxDepth?: number }>
  sends: Array<{ targetId: string; text: string }>
} {
  const activations: Array<{ provider: string; label: string; delivery: string; agentPreset?: string; promptText: string; maxDepth?: number }> = []
  const sends: Array<{ targetId: string; text: string }> = []
  return {
    activations,
    sends,
    face: {
      async startActivation(spec) {
        activations.push({ provider: spec.provider, label: spec.label, delivery: spec.delivery, agentPreset: spec.agentPreset, promptText: spec.prompt[0]?.text ?? '', maxDepth: spec.maxDepth })
        return { childId: 'child-r5', messageId: 'm1' }
      },
      async sendMessage(_sender, targetId, content) {
        sends.push({ targetId, text: content.map(c => c.text).join(' ') })
        return {}
      },
      interrupt() {},
      async listDescendants() { return [] },
    },
  }
}

function fakeLegacy(specs: Array<Record<string, unknown>>): SubagentsServiceFace {
  return {
    async startContinuable(spec) {
      specs.push(spec as Record<string, unknown>)
      return { childId: 'child-old', messageId: 'm0' }
    },
    async sendMessage() { return {} },
    interrupt() {},
    async listDescendants() { return [] },
  }
}

function recruit(dir: string): void {
  appendEvent(dir, { type: 'task_created', ts: 't0', campaignId: 'c1', title: '双面考题', brief: 'b', acceptance: 'a', priority: 'normal' })
  appendEvent(dir, { type: 'task_published', ts: 't1', campaignId: 'c1', workspacePath: 'C:/reg/w' })
  appendEvent(dir, { type: 'task_claimed', ts: 't2', campaignId: 'c1', claimedBy: 'cmd-1', attemptId: 'tok-1', attempt: 1 })
}

type HookOverrides = { troopCompositionPreset?: (persona: string) => Promise<string | null>; restrictChildTools?: (childId: string, deny: string[]) => void }

function makeDeps(dir: string, sub: SubagentsServiceFace, hooks: HookOverrides): Parameters<typeof warTools>[0] {
  const roster: Roster = { units: [RECON], errors: [] }
  const deps = {
    store: { get: () => ({ version: 2 as const, active: true, hqSessionId: undefined }), save: () => {} },
    stateDir: dir,
    maxUnits: 4,
    maxAttempts: 3,
    roster: () => roster,
    subagents: sub,
    commander: {},
    workspace: {},
    warRoot: 'C:/reg',
    flags: FLAG_ON,
  } as Parameters<typeof warTools>[0]
  if (hooks.troopCompositionPreset !== undefined) deps.troopCompositionPreset = hooks.troopCompositionPreset
  if (hooks.restrictChildTools !== undefined) deps.restrictChildTools = hooks.restrictChildTools
  return deps
}

async function execTool(deps: Parameters<typeof warTools>[0], name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = warTools(deps).find(t => t.name === name)
  assert.ok(tool !== undefined, `tool ${name} missing`)
  return tool.execute(args, { agent: { id: 'cmd-1' }, signal: new AbortController().signal })
}

test('rc.5 面：war_deploy_unit 走 startActivation（摊平 spec+delivery=parent+agentPreset 透传）且 deny 经 restrict 钩子', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-dualface-'))
  try {
    recruit(dir)
    const fake = fakeRc5()
    const restricted: Array<{ childId: string; deny: string[] }> = []
    const out = await execTool(makeDeps(dir, fake.face, {
      troopCompositionPreset: async () => 'preset-recon',
      restrictChildTools: (childId, deny) => { restricted.push({ childId, deny }) },
    }), 'war_deploy_unit', { task_id: 'c1', unit: 'recon', front: 'src', mission: '摸清地形' }) as { childId: string }
    assert.equal(out.childId, 'child-r5')
    // spec 形状：摊平 + delivery 必填 + preset 透传 + maxDepth 沿革。
    assert.equal(fake.activations.length, 1)
    const act = fake.activations[0]!
    assert.equal(act.provider, 'spawn')
    assert.equal(act.delivery, 'parent')
    assert.equal(act.agentPreset, 'preset-recon')
    assert.equal(act.maxDepth, 2)
    // preset 在场 → persona 不拼进 prompt（briefing 原文开头）。
    assert.equal(act.promptText.startsWith('你是侦察兵'), false)
    // tool deny：rc.5 不进 spec，经钩子送达（read-only = 剥夺 delegation+write 族）。
    assert.equal(fake.activations[0]!.agentPreset, 'preset-recon')
    assert.deepEqual(restricted, [{ childId: 'child-r5', deny: sandboxDeny('read-only') }])
    assert.equal(loadCampaign(dir, 'c1').units.get('child-r5') !== undefined, true, 'unit_deployed 入账')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rc.5 面降级：preset 钩子返回 null → persona 拼进 prompt 首部；restrict 照常施加', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-dualface-'))
  try {
    recruit(dir)
    const fake = fakeRc5()
    const restricted: Array<{ childId: string; deny: string[] }> = []
    await execTool(makeDeps(dir, fake.face, {
      troopCompositionPreset: async () => null,
      restrictChildTools: (childId, deny) => { restricted.push({ childId, deny }) },
    }), 'war_deploy_unit', { task_id: 'c1', unit: 'recon', front: 'src', mission: '再看一眼' })
    const act = fake.activations[0]!
    assert.equal(act.agentPreset, undefined)
    assert.equal(act.promptText.startsWith('你是侦察兵，先看后动。'), true, 'persona 降级拼进 prompt 首部')
    assert.equal(restricted.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rc.5 面：war_orders 追加命令走 sendMessage（潜伏债修复——旧名 followup 两版宿主皆无）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-dualface-'))
  try {
    recruit(dir)
    appendEvent(dir, { type: 'unit_deployed', ts: 't3', campaignId: 'c1', childId: 'child-r5', unitName: 'recon', label: '侦察兵', mission: 'm', front: 'src', writes: false })
    const fake = fakeRc5()
    await execTool(makeDeps(dir, fake.face, {}), 'war_orders', { task_id: 'c1', child_id: 'child-r5', order: '向东推进' })
    assert.deepEqual(fake.sends, [{ targetId: 'child-r5', text: '向东推进' }])
    assert.equal(loadCampaign(dir, 'c1').units.get('child-r5')?.orders.length, 1, 'order_sent 入账')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('旧面保留：startContinuable 在场（且无 startActivation）时 spec 原样携 persona/toolFilter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warroom-dualface-'))
  try {
    recruit(dir)
    const specs: Array<Record<string, unknown>> = []
    await execTool(makeDeps(dir, fakeLegacy(specs), {}), 'war_deploy_unit', { task_id: 'c1', unit: 'recon', front: 'src', mission: '旧路也是路' })
    assert.equal(specs.length, 1)
    const request = (specs[0]! as { request: { persona?: string; toolFilter?: { deny?: string[] }; maxDepth?: number } }).request
    assert.equal(request.persona?.startsWith('你是侦察兵'), true, '旧面 persona 原样')
    assert.deepEqual(request.toolFilter?.deny, sandboxDeny('read-only'), '旧面 toolFilter 原样')
    assert.equal(request.maxDepth, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
