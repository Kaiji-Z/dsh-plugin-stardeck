# 探针·V19.9 可读性三件（回流自 stardeck 0ec08ea）：
# ① 岛 ✉ 徽标分性质（计数后缀 阅/批/答/试 + 悬停全称）
# ② 岛全局活动脉搏（.war-island-pulse，「最近动静 X 前」）
# ③ 聚焦页任务回报段未展开态结论预览（.war-report-preview，预览≠翻阅）
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3080/'
results = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1680, 'height': 950})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_timeout(2000)
    if pg.locator('[data-dsh-warroom-entry]').count():
        pg.locator('[data-dsh-warroom-entry]').click()
    pg.wait_for_selector('.war-dispatch', timeout=15000)

    # ① 徽标分性质
    badge = pg.locator('.war-island-badge')
    if badge.count() > 0:
        text = badge.inner_text()
        title = badge.get_attribute('title') or ''
        ok1 = ('✉' in text) and (len(text.strip()) > len('✉ N').__class__() and any(k in text for k in ('阅', '批', '答', '试', '看'))) and ('收件箱' in title and '件' in title)
        results.append(('徽标分性质（后缀+悬停全称）', ok1, f'text={text.strip()!r} title={title[:40]!r}'))
    else:
        results.append(('徽标分性质（后缀+悬停全称）', False, 'no badge (inbox empty?)'))

    # ② 全局活动脉搏
    pulse = pg.locator('.war-island-pulse')
    if pulse.count() > 0:
        pt = pulse.inner_text()
        results.append(('全局活动脉搏', ('最近动静' in pt or '最近活动' in pt) and ('前' in pt or '刚刚' in pt), f'text={pt!r}'))
    else:
        results.append(('全局活动脉搏', False, 'no .war-island-pulse'))

    # ③ 聚焦页战报预览：点调度条上含「待舰长翻阅/待舰长翻阅」生命条的已接收卡，
    # 或直接找战报列有 reported 的命令卡——用调度条第一张可点卡逐个试。
    opened = False
    for i in range(12):
        cards = pg.locator('.war-dispatch .war-card')
        if i >= cards.count():
            break
        try:
            cards.nth(i).click(timeout=5000)
        except Exception:
            continue
        pg.wait_for_timeout(700)
        if pg.locator('.war-cd-report').count() > 0:
            prev = pg.locator('.war-cd-report .war-report-preview')
            if prev.count() > 0:
                t = prev.inner_text()
                tt = prev.get_attribute('title') or ''
                ok3 = ('预览' in t or 'preview' in t.lower() or 'look' in t.lower()) and len(tt) > 0
                results.append(('战报结论预览（未展开态）', ok3, f'text={t[:36]!r} title_len={len(tt)}'))
                opened = True
                break
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(400)
    if not opened:
        results.append(('战报结论预览（未展开态）', False, 'no focus page with report preview found in first cards'))

    ok_err = len(errors) == 0
    results.append(('零 pageerror', ok_err, f'{len(errors)} errors'))
    b.close()

fails = 0
for name, ok, detail in results:
    print(f'{"PASS" if ok else "FAIL"}  {name}  — {detail}')
    if not ok:
        fails += 1
print(f'== {len(results) - fails}/{len(results)} PASS ==')
raise SystemExit(1 if fails else 0)
