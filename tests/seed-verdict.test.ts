import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seedVerdict } from '../src/client/views.tsx'

// V19.8 播种收官判词（回流）：点名接续命令号（族谱可溯），无号降级不空括号，账本中文正典。
test('V19.8 seedVerdict：打回/重试两态判词 + 无命令号降级', () => {
  assert.equal(
    seedVerdict('reject', 'cmd-20260905-abc'),
    '打回定性——重做令已下（cmd-20260905-abc），重做由该代接续，本账就此收官',
  )
  assert.equal(
    seedVerdict('reject', null),
    '打回定性——重做令已下，重做由该代接续，本账就此收官',
  )
  assert.equal(
    seedVerdict('retry', 'cmd-x'),
    '重试定性——重试令已下（cmd-x），接续由该代执行，本账就此收官',
  )
  assert.equal(
    seedVerdict('retry', null),
    '重试定性——重试令已下，接续由该代执行，本账就此收官',
  )
})
