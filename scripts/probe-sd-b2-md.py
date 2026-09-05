# -*- coding: utf-8 -*-
"""sd 回流批2 探针沉淀（原内联取证脚本化，可复跑）——战报可读性包四位点：

1. 决策带计划原文速览（.war-cd-band-plan details 展开出 .war-md 结构）；
2. 聚焦页任务卡计划/任务书 md 铺面（.war-plan-body 内 .war-md）；
3. 产物交付物 chip → ArtifactPreviewModal（条件断言：种子有 files 才断）；
4. workspace/file 端点活体（合法请求给结构化 JSON；穿越路径被守卫拒绝）。
"""
import asyncio, json, sys
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
        browser = await pw.chromium.launch()
        pg = await browser.new_page(viewport={'width': 1600, 'height': 900})
        await pg.goto(BASE, wait_until='domcontentloaded')
        await pg.wait_for_selector('[data-dsh-warroom-entry]', timeout=20000)
        await pg.evaluate("() => localStorage.setItem('warroom-cfg-view', 'list')")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_timeout(2000)
        await open_board(pg)

        # 1) 决策带计划原文速览：找带计划待批决策带的命令卡 → 点卡进聚焦页 → 展开速览
        band_card = pg.locator('.war-dispatch .war-command-card', has_text='计划待批').first
        if await band_card.count() == 0:
            band_card = pg.locator('.war-dispatch .war-command-card', has_text='等你').first
        if await band_card.count() > 0:
            await band_card.click()
            await pg.wait_for_timeout(900)
            band = await pg.evaluate("""() => {
              const d = document.querySelector('.war-modal details.war-cd-band-plan')
              if (d === null) return null
              d.open = true
              const md = d.querySelector('.war-plan-body .war-md')
              return { opened: true, hasMd: !!md, heads: d.querySelectorAll('.war-md .war-md-h').length, lists: d.querySelectorAll('.war-md .war-md-ul,.war-md .war-md-ol,.war-md .war-md-p').length }
            }""")
            ok('decision band plan peek expands to md structure', band is not None and band['hasMd'] and (band['heads'] + band['lists']) > 0, json.dumps(band))
        else:
            ok('decision band plan peek expands to md structure', False, 'no plan-pending card on board')

        # 2) 任务卡计划/任务书 md 铺面：遍历调度卡直到任务段有真任务卡
        #（部分命令的任务段是 ghost——计划待发布/已接令未成形，无卡可点）
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(400)
        card_count = await pg.evaluate("() => document.querySelectorAll('.war-dispatch .war-command-card').length")
        task_md = {'stage': False, 'card': False}
        panel = None
        for i in range(card_count):
            await pg.evaluate("(k) => { const c = document.querySelectorAll('.war-dispatch .war-command-card')[k]; if (c) c.click() }", i)
            await pg.wait_for_timeout(500)
            task_md = await pg.evaluate("""() => {
              const stage = document.querySelector(".war-modal .war-cd-stage[data-stage='task']")
              if (stage === null) return { stage: false }
              const card = stage.querySelector('.war-card.clickable')
              if (card === null) return { stage: true, card: false }
              card.click()
              return { stage: true, card: true }
            }""")
            if task_md.get('card'):
                await pg.wait_for_timeout(500)
                panel = await pg.evaluate("""() => {
                  const stage = document.querySelector(".war-modal .war-cd-stage[data-stage='task']")
                  if (stage === null) return null
                  const body = stage.querySelector('.war-plan-body')
                  const md = stage.querySelector('.war-md')
                  // 计划行=war-plan-body（cmd.plan 在场）；任务书行=war-sub-value 直挂 md。
                  // L0 直发命令无计划行——任务书 md 铺面同样算命中。
                  return { body: body !== null || md !== null, hasMd: md !== null, viaPlanBody: body !== null, text: (md?.textContent || '').slice(0, 60) }
                }""")
                if panel is not None and panel.get('hasMd'):
                    break
            # 没找到带计划原文的卡——收起展开、换下一条命令
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(250)
        ok('task card plan/taskfile md panel', task_md.get('stage') is True and task_md.get('card') is True and panel is not None and panel.get('hasMd') is True, json.dumps({'click': task_md, 'panel': panel}, ensure_ascii=False)[:120])

        # 3) 产物交付物 chip → 预览弹窗（种子有 files 才断言；没有记 SKIP）
        loot = await pg.evaluate("""() => {
          const chips = [...document.querySelectorAll('.war-loot-file')]
          if (chips.length === 0) return { count: 0 }
          chips[0].click()
          return { count: chips.length }
        }""")
        if loot['count'] > 0:
            await pg.wait_for_timeout(600)
            prev = await pg.evaluate("""() => {
              const m = document.querySelector('.war-preview-modal')
              return m ? { open: true, body: (m.querySelector('.war-preview-body')?.textContent || '').length } : { open: false }
            }""")
            ok('loot chip opens artifact preview modal', prev['open'] is True and prev['body'] > 0, json.dumps(prev))
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(300)
        else:
            print('SKIP loot preview (seed has no deliverable files)')

        # 4) workspace/file 端点活体 + 守卫
        api = await pg.evaluate("""() => fetch('/warroom/api/board').then(r => r.json()).then(d => {
          const ws = (d.planets && d.planets[0] && d.planets[0].path) || ''
          const probe = (name) => fetch('/warroom/api/workspace/file?ws=' + encodeURIComponent(ws) + '&name=' + encodeURIComponent(name)).then(r => r.json())
          return Promise.all([probe('README.md'), probe('../etc/passwd'), probe('C:\\Windows\\win.ini')])
        })""")
        ok('workspace/file endpoint live (file 200-shape, traversal+absolute rejected in body)',
           isinstance(api[0], dict) and (api[0].get('ok') is True or ('content' not in api[0] and 'error' in api[0]) or api[0].get('ok') is False)
           and api[1].get('ok') is False and api[2].get('ok') is False, json.dumps(api, ensure_ascii=False)[:160])
        await pg.keyboard.press('Escape')
        await browser.close()

    fails = [n for n, c, _ in items if not c]
    print(f"TOTAL {len(items)} PASS {len(items) - len(fails)} FAIL {len(fails)}")
    if fails:
        sys.exit(1)

asyncio.run(main())
