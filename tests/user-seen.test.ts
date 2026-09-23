import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createUserSeenTracker, isPersonalUserMessage } from '../src/user-seen.ts'

// M1-件② 亲自对话信号：user/message 且 source.kind='user' 且非本插件投递
// （rpcId warroom-* 前缀自滤）；载荷嵌套 .data 优先（V9.11 宿主形状）；
// presence-only 盐——时间刷新不翻盐（SSE revision-only 不抖）。

test('isPersonalUserMessage：嵌套/扁平两形状命中，tool 与插件投递拒收', () => {
  // 嵌套 .data（宿主正典形状）
  const nested = isPersonalUserMessage({ type: 'user/message', time: '2026-09-06T10:00:00Z', data: { source: { kind: 'user' } } })
  assert.ok(nested !== null)
  assert.equal(nested!.at, '2026-09-06T10:00:00Z')
  // 扁平退回
  assert.ok(isPersonalUserMessage({ type: 'user/message', source: { kind: 'user' } }) !== null)
  // tool-result 不是人说话
  assert.equal(isPersonalUserMessage({ type: 'user/message', data: { source: { kind: 'tool' } } }), null)
  // 本插件投递（rpcId 前缀）不是亲自对话
  assert.equal(isPersonalUserMessage({ type: 'user/message', data: { source: { kind: 'user', rpcId: 'warroom-relay-x' } } }), null)
  // 其他事件类型不碰
  assert.equal(isPersonalUserMessage({ type: 'assistant/message' }), null)
})

test('UserSeenTracker：会话级记录 + presence-only 盐 + 无记录 null', () => {
  const t = createUserSeenTracker()
  assert.equal(t.salt(), '')
  t.handle('sess-a', { type: 'user/message', time: '2026-09-06T10:00:00Z', data: { source: { kind: 'user' } } })
  assert.equal(t.seenAt('sess-a'), '2026-09-06T10:00:00Z')
  assert.equal(t.seenAt('sess-b'), null)
  assert.equal(t.salt(), 'u')
  // 时间刷新不翻盐（仍 'u'）；空 sessionId 与坏形状安全 no-op。
  t.handle('sess-a', { type: 'user/message', time: '2026-09-06T11:00:00Z', data: { source: { kind: 'user' } } })
  assert.equal(t.salt(), 'u')
  assert.equal(t.seenAt('sess-a'), '2026-09-06T11:00:00Z')
  t.handle('', { type: 'user/message', data: { source: { kind: 'user' } } })
  t.handle('sess-a', { type: 'step/start' })
  t.handle(undefined, null)
  assert.equal(t.seenAt('sess-a'), '2026-09-06T11:00:00Z')
})

test('对抗审查 A9: bySession 封顶 8192——超限按插入序剪最旧，最新保留', () => {
  const t = createUserSeenTracker()
  const msg = (at: string): unknown => ({ type: 'user/message', time: at, data: { source: { kind: 'user' } } })
  // 灌 8293 条（超限 101）：应逐出 sess-0…sess-100，末态恰 8192 条。
  for (let i = 0; i < 8293; i++) t.handle(`sess-${i}`, msg(`2026-09-06T1${i % 10}:00:00Z`))
  assert.equal(t.seenAt('sess-0'), null, '最旧条目被剪')
  assert.equal(t.seenAt('sess-100'), null, '超限 101 条全部被剪')
  assert.notEqual(t.seenAt('sess-101'), null, '剪到恰好封顶为止')
  assert.notEqual(t.seenAt('sess-8292'), null, '最新条目在表')
  assert.equal(t.salt(), 'u', '盐仍 presence-only')
})
