import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeCopy, plainCopy, setSkin, skinId, subscribeSkin, toggleSkin, trekCopy, trekifyText, warCopy, type SkinId } from '../src/client/copy.ts'

/** 皮肤 store 是纯函数层（不引 react/node 专属 API）——node 直测；
 * localStorage 经 typeof 守卫，node 无 localStorage 时缺省星际迷航皮肤。
 * V16 词表派生：星际迷航皮肤 = 军事词典整体过 TREK_LEXICON（词典单一源）。 */

test('皮肤基础：plainCopy 与 warCopy 在关键字段上确实换词（角色扮演出口）', () => {
  assert.equal(warCopy.outcome.succeeded.label, '打赢了')
  assert.equal(plainCopy.outcome.succeeded.label, '已完成')
  assert.equal(plainCopy.outcome.reported.label, '待验收')
  assert.equal(plainCopy.taskStatus.reported, '待验收')
  assert.equal(plainCopy.taskStatus.closed, '已完成')
  // 军事词典保留旧词表（V16 词表派生的源）：任务产出/舰桥/舰长原样。
  assert.equal(warCopy.focusPage.lootLabel, '战利品')
  assert.equal(warCopy.head.title, '作战室')
  assert.equal(plainCopy.focusPage.lootLabel, '交付')
  assert.equal(plainCopy.head.title, '工作台')
})

test('V16 词表派生：trekCopy 全面换用星际迷航词（舰长/大副/外勤小队/星球/任务令/舰桥）', () => {
  assert.equal(trekCopy.head.title, '舰桥')
  assert.equal(trekCopy.focusPage.lootLabel, '任务产出')
  // 词表派生不漏角色词：任意含旧词的串都必须被换掉。
  const stale: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const w of ['元首', '参谋', '指挥官', '悬赏', '战报', '战利品', '母舰', '作战室', '战场', '作战', '战区', '折戟', '收菜', '善终', '发落', '退役']) {
        if (v.includes(w)) stale.push(`${w}: ${v.slice(0, 40)}`)
      }
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk)
  }
  walk(trekCopy)
  assert.deepEqual(stale, [], `trekCopy 仍有旧词残留: ${stale.slice(0, 5)}`)
  // 机制词不随皮肤变：工具名/战线/星域保留。
  assert.ok(JSON.stringify(trekCopy).includes('战线'))
})

test('皮肤 store：缺省 trek；切换/回切生效并通知订阅者；持久化失败不炸', () => {
  // node 无 localStorage → storedSkin 走 typeof 守卫回 'trek'。
  assert.equal(skinId(), 'trek')
  assert.equal(activeCopy(), trekCopy)
  let fired = 0
  const off = subscribeSkin(() => { fired += 1 })
  // 切到同名是幂等 no-op（不通知）。
  setSkin('trek')
  assert.equal(fired, 0)
  setSkin('war')
  assert.equal(fired, 1)
  assert.equal(skinId(), 'war')
  assert.equal(activeCopy(), warCopy)
  assert.equal(activeCopy().focusPage.lootLabel, '战利品')
  setSkin('plain')
  assert.equal(fired, 2)
  assert.equal(activeCopy().outcome.succeeded.label, '已完成')
  toggleSkin()
  assert.equal(fired, 3)
  assert.equal(skinId() satisfies SkinId, 'trek')
  off()
  setSkin('plain')
  assert.equal(fired, 3)
  // 还原缺省，避免影响同进程其他测试。
  setSkin('trek')
})

test('V16.4-R7 词汇收敛：同一概念每皮肤只有一个词面（败局=挫败/成功=圆满·完成）', () => {
  setSkin('trek')
  try {
    const c = activeCopy()
    // 败局一词面：trek 下 chip/pip/岛计数/速报 全部落「挫败」
    assert.equal(c.outcome.failed.label, '挫败')
    assert.equal(c.commandCard.pipStatus.fail, '挫败')
    assert.ok(c.island.counts({ pending: 0, waiting: 0, active: 0, failed: 2 }).includes('挫败'))
    assert.equal(c.starfield.logRetreat, '挫败')
    assert.equal(c.starfield.garrisonTitle(0, 0, 0, 3).includes('挫败'), true)
    // V16.4-R8：图例红档/事件计数词面也锁（收敛审计的漏网补锁）
    assert.ok(c.legend.rows.some(r => typeof r[1] === 'string' && (r[1] as string).includes('挫败')), 'legend red row must say 挫败 in trek')
    assert.ok(!c.legend.rows.some(r => typeof r[1] === 'string' && (r[1] as string).includes('红 = 败')), 'legend red row must not leak bare 败')
    // 成功一词面：chip=圆满（达成是星域动作语，共存但 chip 不再出现打赢了）
    assert.equal(c.outcome.succeeded.label, '圆满')
    // 执行态一词面：岛段=列头（执行中）
    assert.ok(c.island.counts({ pending: 0, waiting: 0, active: 3, failed: 0 }).includes('执行中 3'))
    assert.equal(c.columns.live.title, '执行中')
  } finally {
    setSkin('trek')
  }
})

test('V19.10 术语定案+图例压缩（自 stardeck 5241694/4f0b428 回流）：HQ/执行者三向分野、图例两段', () => {
  // HQ 三向：war=总部（原司令部/母舰修平）、plain=HQ、trek 经词表派生=星舰。
  assert.equal(warCopy.starfield.hqOn, '总部在线——战时状态，全局开关亮着')
  assert.equal(warCopy.starfield.returnHq, '返航 → 总部')
  assert.equal(trekCopy.starfield.hqOn, '星舰在线——出航状态，全局开关亮着')
  assert.equal(trekCopy.starfield.returnHq, '返航 → 星舰')
  assert.equal(plainCopy.starfield.hqOn, '干活状态中——HQ亮着')
  assert.equal(plainCopy.starfield.returnHq, '返回 → HQ')
  // 执行者三向：war=指挥官（noBattle 泄漏修平，stardeck 同款）、plain=执行 Agent。
  assert.equal(warCopy.commandBand.noBattle, '等指挥官领取')
  assert.equal(plainCopy.lifecycle.waitingClaim, '等执行 Agent 领取')
  assert.equal(plainCopy.focusPage.reportQueued, '等执行 Agent 接手，接手后这里播报进展')
  // 词表新三词：总部→星舰 / 军队→舰队；序敏感——作战日志 必须派生 舰桥日志 而非 执行日志。
  assert.equal(trekifyText('总部在线，军队出击，作战日志已写，作战继续'), '星舰在线，舰队出击，舰桥日志已写，执行继续')
  // 图例压缩（4f0b428 同款）：三段并两段，砍 内环/铭牌读数 两个自解释段。
  for (const s of [warCopy, plainCopy, trekCopy]) {
    assert.equal(s.starfield.mapLegend.split(' ｜ ').length, 2)
    assert.ok(!s.starfield.mapLegend.includes('内环'), 'legend must not mention 内环')
    assert.ok(!s.starfield.mapLegend.includes('铭牌读数') && !s.starfield.mapLegend.includes('名牌读数'), 'legend must not mention readout')
  }
})
