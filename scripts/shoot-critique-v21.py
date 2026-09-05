# -*- coding: utf-8 -*-
"""critique 轮取证：当前构建全表面截图 → .goal/evidence/critique-v21/。"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3080'
OUT = Path('.goal/evidence/critique-v21')

async def open_board(pg):
    if not await pg.locator('.war-dispatch').is_visible():
        await pg.locator('[data-dsh-warroom-entry]').click()
    await pg.wait_for_selector('.war-dispatch', state='visible', timeout=25000)
    await pg.wait_for_timeout(1500)

async def shot(pg, name):
    await pg.screenshot(path=str(OUT / f'{name}.png'))
    print('shot', name)

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})

        # 三皮肤 × 列表态
        for skin, label in [('trek', 'trek'), ('war', 'war'), ('plain', 'plain')]:
            await pg.goto(BASE, wait_until='domcontentloaded')
            await pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
            await pg.evaluate(f"() => {{ localStorage.setItem('warroom-skin', '{skin}'); localStorage.setItem('warroom-lang', 'zh'); localStorage.setItem('warroom-cfg-zoom', '1'); localStorage.setItem('warroom-cfg-view', 'list') }}")
            await pg.reload(wait_until='domcontentloaded')
            await pg.wait_for_timeout(2000)
            await open_board(pg)
            await shot(pg, f'list-{label}')

        # trek 星域地图（3D）+ 2D 雷达
        await pg.evaluate("() => localStorage.setItem('warroom-skin', 'trek')")
        await pg.evaluate("() => localStorage.setItem('warroom-cfg-view', 'map')")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(3000)
        await open_board(pg)
        await pg.wait_for_timeout(2500)
        # V11.5 定案：星域挂载默认=2D 雷达值班态——3D 需显式切换后再拍
        await pg.evaluate("() => { const el = document.querySelector('[data-wz-mode=\"3d\"]'); if (el) el.click() }")
        await pg.wait_for_timeout(2500)
        await shot(pg, 'map-3d-trek')
        await pg.evaluate("() => { const el = document.querySelector('[data-wz-mode=\"cmd\"]'); if (el) el.click() }")
        await pg.wait_for_timeout(1800)
        await shot(pg, 'map-2d-trek')

        # EN：列表 + 地图
        await pg.evaluate("() => { localStorage.setItem('warroom-lang', 'en'); localStorage.setItem('warroom-cfg-view', 'list') }")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2000)
        await open_board(pg)
        await shot(pg, 'list-en')
        await pg.evaluate("() => localStorage.setItem('warroom-cfg-view', 'map')")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(3000)
        await open_board(pg)
        await pg.wait_for_timeout(2500)
        await shot(pg, 'map-en')

        # ×1.35 字号
        await pg.evaluate("() => { localStorage.setItem('warroom-lang', 'zh'); localStorage.setItem('warroom-cfg-zoom', '1.35'); localStorage.setItem('warroom-cfg-view', 'list') }")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2000)
        await open_board(pg)
        await shot(pg, 'list-zoom135')

        # 聚焦页（trek）：点第一条调度卡
        await pg.evaluate("() => { localStorage.setItem('warroom-cfg-zoom', '1') }")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2000)
        await open_board(pg)
        await pg.evaluate("() => { const c = document.querySelector('.war-dispatch .war-command-card'); if (c) c.click() }")
        await pg.wait_for_timeout(1000)
        await shot(pg, 'focus-trek')

        # 空场：路由拦截 0 星球
        ctx2 = await b.new_context(viewport={'width': 1600, 'height': 900})
        pg2 = await ctx2.new_page()
        async def strip(route):
            resp = await route.fetch()
            body = await resp.json()
            body['planets'] = []
            await route.fulfill(response=resp, json=body)
        await pg2.route('**/warroom/api/board*', strip)
        await pg2.goto(BASE, wait_until='domcontentloaded')
        await pg2.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
        await pg2.evaluate("() => { localStorage.setItem('warroom-cfg-view', 'map'); localStorage.setItem('warroom-skin', 'trek') }")
        await pg2.reload(wait_until='domcontentloaded')
        await pg2.wait_for_timeout(2500)
        await open_board(pg2)
        await pg2.wait_for_timeout(2000)
        await shot(pg2, 'map-empty')
        await ctx2.close()
        await b.close()

asyncio.run(main())
