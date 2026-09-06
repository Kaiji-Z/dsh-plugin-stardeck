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
