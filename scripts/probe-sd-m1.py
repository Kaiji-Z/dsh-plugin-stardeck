# 探针·M1-件② 亲自对话信号（user/message → 会话卡「你 N 前亲自入会」）：
# 前提用路由拦截构造（SPEC 认可）——拦 /warroom/api/board 给首个 live attempt
# 注入 userSeenAt（5 分钟前），断言执行会话卡渲染 .war-userseen 词面。
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta, timezone
import re

def _token():
    try:
        m = re.search(r'token=[a-zA-Z0-9_-]+', open(r'C:/Users/kaiji/.dsh/warroom-plugin/server.log', encoding='utf-8', errors='ignore').read())
        return m.group(0) if m else ''
    except Exception:
        return ''

BASE = 'http://127.0.0.1:3080/'
results = []
now_iso = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace('+00:00', 'Z')
injected = {'n': 0}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1680, 'height': 950})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    def route_board(route):
        resp = route.fetch()
        body = resp.json()
        for t in (body.get('tasks') or []):
            for a in (t.get('attemptLog') or []):
                if a.get('outcome') is None:
                    a['userSeenAt'] = now_iso
                    injected['n'] += 1
        route.fulfill(response=resp, json=body)

    pg.route('**/warroom/api/board*', route_board)
    pg.goto(BASE + ('?' + _token() if _token() else ''), wait_until='domcontentloaded')
    pg.wait_for_timeout(3000)
    if pg.locator('[data-dsh-warroom-entry]').count():
        pg.locator('[data-dsh-warroom-entry]').first.click()
    pg.wait_for_timeout(3000)

    if injected['n'] > 0:
        results.append(('live attempt 前提（路由拦截注入 userSeenAt）', True, f"injected on {injected['n']} refetches"))
    else:
        results.append(('live attempt 前提（路由拦截注入 userSeenAt）', False, 'no live attempt found in board'))

    seen = pg.locator('.war-zone.war-field .war-card .war-userseen')
    if seen.count() > 0:
        txt = seen.first.inner_text()
        ok = ('亲自入会' in txt or '自己发过消息' in txt or 'joined this session' in txt or 'messaged this session' in txt)
        results.append(('会话卡亲自对话信号词面', ok, f'text={txt!r}'))
    else:
        results.append(('会话卡亲自对话信号词面', False, 'no .war-userseen in exec column'))

    results.append(('零 pageerror', len(errors) == 0, f'{len(errors)} errors'))
    b.close()

fails = 0
for name, ok, detail in results:
    print(f'{"PASS" if ok else "FAIL"}  {name}  — {detail}')
    fails += 0 if ok else 1
print(f'== {len(results) - fails}/{len(results)} PASS ==')
raise SystemExit(1 if fails else 0)
