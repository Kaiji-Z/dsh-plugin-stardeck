# -*- coding: utf-8 -*-
"""板面收敛 DOM 探针（舰长令「卡面只留导航，动作归聚焦页定夺点」+ V20 对齐 stardeck V19.6续）：

1. 全板卡面零账面变更钮：.war-preflight-btn（改直发）与 .war-enter-btn（进入对话）
   计数==0（聚焦页 talking ghost 面板的进入对话回答钮不在卡面，list 视图本就不开聚焦页）。
2. 任务卡处理钮全撤（stardeck V19.6续：点卡即达）——任务列卡面 .war-btn.primary 计数==0；
   点 reported/failed 任务卡本体 → 落聚焦页（report/chain 段在场）。
"""
import asyncio, sys

import re as _re
def _token():
    try:
        m = _re.search(r'token=[a-zA-Z0-9_-]+', open(r'C:/Users/kaiji/.dsh/warroom-plugin/server.log', encoding='utf-8', errors='ignore').read())
        return m.group(0) if m else ''
    except Exception:
        return ''

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
        await pg.goto(BASE + ('?' + _token() if _token() else ''), wait_until='domcontentloaded')
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

        # V20+stardeck V19.6续：任务卡处理钮全撤（负断言）。
        n_handle = await pg.evaluate("() => document.querySelectorAll('.war-zone.war-tasks .war-card .war-btn.primary').length")
        ok('task-card faces: zero handle buttons (去验收/去下重试令 retired)', n_handle == 0, f'count={n_handle}')

        # 点卡即达聚焦页：点一张 reported/failed 任务卡本体 → 聚焦页 report/chain 段在场。
        clicked = await pg.evaluate("""() => {
          const cards = [...document.querySelectorAll('.war-zone.war-tasks .war-card')]
          const t = cards.find(c => c.querySelector('.st-reported') || c.querySelector('.st-failed'))
          if (t) { t.click(); return t.querySelector('.st-reported') ? 'report' : 'chain' }
          return null
        }""")
        if clicked is None:
            ok('reported/failed task card found on board', False, 'seed board has none in active tab')
        else:
            await pg.wait_for_timeout(900)
            modal = await pg.evaluate("""() => {
              const m = document.querySelector('.war-modal')
              return m ? { open: true, report: !!m.querySelector("[data-stage='report']"), battle: !!m.querySelector("[data-stage='battle']"), task: !!m.querySelector("[data-stage='task']") } : { open: false }
            }""")
            ok('card click lands on focus page', modal.get('open') is True, str(modal))
            ok(f'card click reaches {clicked} segment', modal.get(clicked, False) is True, str(modal))
        await browser.close()

    fails = [n for n, c, _ in items if not c]
    print(f"TOTAL {len(items)} PASS {len(items) - len(fails)} FAIL {len(fails)}")
    if fails:
        sys.exit(1)

import json
asyncio.run(main())
