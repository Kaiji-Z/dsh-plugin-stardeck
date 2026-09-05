# -*- coding: utf-8 -*-
"""批D 探针：收件箱批量定夺（plan 行复选→批量栏→逐条 decidePlan 顺序写）。"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3080'

async def open_board(pg):
    if not await pg.locator('.war-dispatch').is_visible():
        await pg.locator('[data-dsh-warroom-entry]').click()
    await pg.wait_for_selector('.war-dispatch', state='visible', timeout=25000)
    await pg.wait_for_timeout(1200)

async def main():
    items = []
    def ok(name, cond, detail=''):
        items.append((name, bool(cond), detail))
        print(('PASS ' if cond else 'FAIL ') + name + (' | ' + detail if detail else ''))

    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        await pg.goto(BASE, wait_until='domcontentloaded')
        await pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
        await pg.evaluate("() => localStorage.setItem('warroom-cfg-view', 'list')")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2000)
        await open_board(pg)

        pending0 = await pg.evaluate("() => fetch('/warroom/api/board').then(r => r.json()).then(d => d.commands.filter(c => c.plan && c.plan.status === 'pending').length)")
        # 钉开岛面板
        await pg.evaluate("() => { const el = document.querySelector('.war-island-badge'); if (el) el.click() }")
        await pg.wait_for_timeout(800)
        sels = await pg.evaluate("() => document.querySelectorAll('.war-inbox-sel').length")
        ok('plan rows show checkboxes', sels >= 2, f'count={sels}')
        if sels < 2:
            await b.close(); sys.exit(1)
        await pg.evaluate("() => { [...document.querySelectorAll('.war-inbox-sel')].slice(0, 2).forEach(x => x.click()) }")
        await pg.wait_for_timeout(500)
        bar = await pg.evaluate("""() => { const bar = document.querySelector('.war-inbox-batch'); return bar ? { text: bar.textContent, n: bar.querySelectorAll('button').length } : null }""")
        ok('batch bar appears (3 buttons, count=2)', bar is not None and bar['n'] == 3 and '(2)' in bar['text'], str(bar))
        tip = await pg.evaluate("() => { const t = document.querySelector('.war-inbox-text[title]'); return t ? t.getAttribute('title').slice(0, 20) : null }")
        ok('plan text hover peek', tip is not None and len(tip) > 5, repr(tip))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.war-inbox-batch button')].find(x => x.textContent.includes('批准')); if (b) b.click() }")
        await pg.wait_for_timeout(3000)
        after = await pg.evaluate("""() => fetch('/warroom/api/board').then(r => r.json()).then(d => ({
          pending: d.commands.filter(c => c.plan && c.plan.status === 'pending').length,
          approved: d.commands.filter(c => c.plan && c.plan.status === 'approved').length,
          err: document.querySelector('.war-actionerr') ? document.querySelector('.war-actionerr').textContent : null,
        }))""")
        ok('batch approve wrote exactly 2 plan approvals', pending0 - after['pending'] == 2 and after['err'] is None, f'pending {pending0}->{after["pending"]}, approved={after["approved"]}, err={after["err"]}')
        await b.close()

    fails = [n for n, c, _ in items if not c]
    print(f"TOTAL {len(items)} PASS {len(items) - len(fails)} FAIL {len(fails)}")
    if fails:
        sys.exit(1)

asyncio.run(main())
