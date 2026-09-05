# -*- coding: utf-8 -*-
"""大账本性能基线探针 — 对当前 :3080 板量四项：

  1. board API 延迟与体积（fold 全量投影）
  2. 冷挂载：goto → .war-dispatch 可见（fetch+投影+首渲染）
  3. 页签切换：点「已收官」→ 卡面集合变化（全量重切片+重渲）
  4. 聚焦页打开：点调度卡 → 弹窗可见

Usage: python scripts/probe-perf.py [标签]
结果追加到 .goal/evidence/perf/baseline.md。
"""
import asyncio, json, statistics, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:3080'
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'run'
OUT = Path('.goal/evidence/perf/baseline.md')

async def main():
    rows = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})

        # 1) board API 延迟（5 次取样取中位）
        api_ms, api_bytes = [], 0
        for _ in range(5):
            t0 = time.perf_counter()
            resp = await pg.request.get(BASE + '/warroom/api/board')
            body = await resp.body()
            api_ms.append((time.perf_counter() - t0) * 1000)
            api_bytes = len(body)
        api_med = statistics.median(api_ms)
        rows.append(('board API 中位延迟 ms（5 取样）', f'{api_med:.0f}', f'body {api_bytes/1024:.0f} KB'))
        counts = json.loads(await (await pg.request.get(BASE + '/warroom/api/board')).text())
        rows.append(('账面规模', f"cmd={len(counts.get('commands', []))} task={len(counts.get('tasks', []))}", ''))

        # 2) 冷挂载
        await pg.goto(BASE, wait_until='domcontentloaded')
        await pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=30000)
        await pg.evaluate("() => { localStorage.setItem('warroom-cfg-view', 'list'); localStorage.setItem('warroom-cfg-zoom', '1') }")
        t0 = time.perf_counter()
        await pg.reload(wait_until='domcontentloaded')
        if not await pg.locator('.war-dispatch').is_visible():
            await pg.locator('[data-dsh-warroom-entry]').click()
        await pg.wait_for_selector('.war-dispatch .war-card', state='visible', timeout=60000)
        mount_ms = (time.perf_counter() - t0) * 1000
        rows.append(('冷挂载到首屏卡可见 ms', f'{mount_ms:.0f}', ''))

        # 3) 页签切换（点已收官 → 该页签卡面出现）
        t0 = time.perf_counter()
        await pg.evaluate("""() => { const t = [...document.querySelectorAll('.war-cmdtab')].find(x => (x.getAttribute('aria-label') || '').includes('收官') || (x.getAttribute('aria-label') || '').includes('Settled')); if (t) t.click() }""")
        await pg.wait_for_function("""() => { const el = document.querySelector('.war-cmdtab.on'); return el && /收官|Settled/.test(el.getAttribute('aria-label') || '') }""", timeout=30000)
        tab_ms = (time.perf_counter() - t0) * 1000
        rows.append(('页签切到已收官 ms', f'{tab_ms:.0f}', ''))

        # 4) 聚焦页打开
        t0 = time.perf_counter()
        await pg.evaluate("() => { const c = document.querySelector('.war-dispatch .war-command-card'); if (c) c.click() }")
        await pg.wait_for_selector('.war-modal .war-cd-stage', timeout=30000)
        focus_ms = (time.perf_counter() - t0) * 1000
        rows.append(('聚焦页打开 ms', f'{focus_ms:.0f}', ''))

        await b.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'a', encoding='utf-8') as f:
        f.write(f"\n## run: {LABEL} — {time.strftime('%Y-%m-%d %H:%M')}\n")
        for name, val, note in rows:
            f.write(f'- {name}: **{val}** {note}\n')
    for name, val, note in rows:
        print(f'{name}: {val} {note}')

asyncio.run(main())
