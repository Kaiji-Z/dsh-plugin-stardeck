# -*- coding: utf-8 -*-
"""板面收敛 DOM 探针（舰长令「卡面只留导航，动作归聚焦页定夺点」）：

1. 全板卡面零账面变更钮：.war-preflight-btn（改直发）与 .war-enter-btn（进入对话）
   计数==0（聚焦页 talking ghost 面板的进入对话回答钮不在卡面，list 视图本就不开聚焦页）。
2. 任务卡「去验收」处理钮点击 → 落聚焦页 report 段（决策带所在），不再是直跳会话。
"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3080'

async def main():
    items = []
    def ok(name, cond, detail=''):
        items.append((name, bool(cond), detail))
        print(('PASS ' if cond else 'FAIL ') + name + (' | ' + detail if detail else ''))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        pg = await browser.new_page(viewport={'width': 1600, 'height': 900})
        await pg.goto(BASE, wait_until='domcontentloaded')
        await pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
        await pg.evaluate("() => { localStorage.setItem('warroom-cfg-view', 'list'); localStorage.setItem('warroom-cfg-zoom', '1') }")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2000)
        if not await pg.locator('.war-dispatch').is_visible():
            await pg.locator('[data-dsh-warroom-entry]').click()
        await pg.wait_for_selector('.war-dispatch', state='visible', timeout=25000)
        await pg.wait_for_timeout(1200)

        n_pre = await pg.evaluate("() => document.querySelectorAll('.war-preflight-btn').length")
        n_enter = await pg.evaluate("() => document.querySelectorAll('.war-enter-btn').length")
        ok('card faces: zero 改直发 buttons', n_pre == 0, f'count={n_pre}')
        ok('card faces: zero 进入对话 buttons', n_enter == 0, f'count={n_enter}')
        focus_btns = await pg.evaluate("() => document.querySelectorAll('.war-focus-btn').length")
        ok('card faces: ◎ focus (navigation) still present', focus_btns > 0, f'count={focus_btns}')

        # 任务卡处理钮：去验收（reported）/ 去下重试令（failed）→ 聚焦页对应段
        handle = pg.locator('.war-zone.war-tasks .war-card .war-btn.primary', has_text='去验收').first
        clicked = 'report'
        if await handle.count() == 0:
            handle = pg.locator('.war-zone.war-tasks .war-card .war-btn.primary', has_text='去下重试令').first
            clicked = 'battle'
        if await handle.count() == 0:
            ok('handle button present on task card', False, 'no 去验收/去下重试令 card found')
        else:
            await handle.click()
            await pg.wait_for_timeout(900)
            modal = await pg.evaluate("""() => {
              const m = document.querySelector('.war-modal')
              return m ? { open: true, report: !!m.querySelector("[data-stage='report']"), battle: !!m.querySelector("[data-stage='battle']") } : { open: false }
            }""")
            seg = modal.get(clicked, False)
            ok('handle click lands on focus page', modal['open'] is True, json.dumps(modal))
            ok(f'handle click lands on {clicked} decision segment', seg is True, json.dumps(modal))
        await browser.close()

    fails = [n for n, c, _ in items if not c]
    print(f"TOTAL {len(items)} PASS {len(items) - len(fails)} FAIL {len(fails)}")
    if fails:
        sys.exit(1)

import json
asyncio.run(main())
