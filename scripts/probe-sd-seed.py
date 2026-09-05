# 探针·V19.7 播种钮（回流）：聚焦页打回重做 → 起草器预填（文本+续接钉线，不自动提交）
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080/'
results = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1680, 'height': 950})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_timeout(4000)
    # 板可能自开（shell 水合延迟不定）——入口点击会切换开/关，故只在确实没开时点一次，
    # 然后一律等卡片就绪（30s 上限）。
    if pg.locator('.war-dispatch .war-card').count() == 0 and pg.locator('.war-dispatch').count() == 0:
        if pg.locator('[data-dsh-warroom-entry]').count():
            pg.locator('[data-dsh-warroom-entry]').click()
    try:
        pg.wait_for_selector('.war-dispatch .war-card', timeout=30000)
    except Exception:
        pass
    pg.wait_for_timeout(1500)
    print(f'[open] dispatch={pg.locator(".war-dispatch").count()} cards={pg.locator(".war-dispatch .war-card").count()}', flush=True)

    # 逐张调度条卡找 reported 命令 → 聚焦页 report 段 → 展开战报 → 打回重做钮
    seeded = False
    for i in range(14):
        if pg.locator('.war-modal').count():
            pg.keyboard.press('Escape')
            pg.wait_for_timeout(300)
        cards = pg.locator('.war-dispatch .war-card')
        if i >= cards.count():
            break
        # 全板每秒重渲染（relTime/island）——locator click 的 stability 等待会恒超时，
        # 必须用 DOM 直点。
        try:
            pg.evaluate("() => { const c = document.querySelectorAll('.war-dispatch .war-card')[arguments0]; if (c) c.click() }".replace('arguments0', str(i)))
        except Exception:
            continue
        pg.wait_for_timeout(700)
        if pg.locator('.war-cd-report').count() == 0:
            if pg.locator('.war-modal').count():
                pg.keyboard.press('Escape')
                pg.wait_for_timeout(350)
            continue
        if pg.locator('.war-cd-report .war-card').count():
            pg.evaluate("() => { const c = document.querySelector('.war-cd-report .war-card'); if (c) c.click() }")
            pg.wait_for_timeout(500)
        btn = pg.locator('.war-cd-report button', has_text='打回重做').first
        if btn.count():
            btn.dispatch_event('click')
            pg.wait_for_timeout(800)
            # 起草器渲染在聚焦页之后（批1 回流的 z 序修复）——全页 textarea 里找预填值。
            val = ''
            for k in range(pg.locator('textarea').count()):
                v = pg.locator('textarea').nth(k).input_value()
                if '打回重做' in v:
                    val = v
                    break
            ok = val.startswith('这个 ')
            results.append(('打回重做 → 起草器预填', ok, f'text={val[:44]!r}'))
            seeded = True
            pg.keyboard.press('Escape')
            break
        if pg.locator('.war-modal').count():
            pg.keyboard.press('Escape')
        pg.wait_for_timeout(350)
    if not seeded:
        results.append(('打回重做 → 起草器预填', False, 'no reported command with seed button found'))

    results.append(('零 pageerror', len(errors) == 0, f'{len(errors)} errors'))
    b.close()

fails = 0
for name, ok, detail in results:
    print(f'{"PASS" if ok else "FAIL"}  {name}  — {detail}')
    fails += 0 if ok else 1
print(f'== {len(results) - fails}/{len(results)} PASS ==')
raise SystemExit(1 if fails else 0)
