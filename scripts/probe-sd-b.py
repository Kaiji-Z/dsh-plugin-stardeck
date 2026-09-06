# -*- coding: utf-8 -*-
"""件B 探针：板上直接作答（talking ghost 行内答复 → 大副会话续跑）。

Phase 1（种子板 DOM）：talking 命令的聚焦页出现 .war-answer-input；填文本
→ DOM 直点「送达参谋」→ 回执行「已送达参谋会话」出现（真实 POST + 真实
followup 投递到织换真会话）。

Phase 2（实弹状态流转）：真命令（??先看方案 L1）→ 大副分诊后停在等待
（指示其不得 war_plan）→ 板 API 作答「现在呈计划」→ 轮询 plan 落地
（talking→plan 状态流转=答案真实驱动续跑）。

环境: 服务器 http://127.0.0.1:3080（smoke overlay，.smoke-state 已重播）；
token 从 ~/.dsh/warroom-plugin/server.log 读。证据落 .goal/evidence/b/。
"""
import io
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3080"
EV = Path(".goal/evidence/b")
EV.mkdir(parents=True, exist_ok=True)
WS = "C:/Users/kaiji/vibecodingKJ/temp/e2e-exam-ws"
TAG = "E2E件B考题"

CMD = (f"【星球：{WS}】{TAG}：先完成分诊（按 L1），然后明确停下等我答复——"
       "在等待期间不得调用 war_plan、不得发布任何任务，只回一句「等你答复」。"
       "??先看方案")
ANSWER = "答复：现在把完整计划呈上来（调用 war_plan），仍然不要发布任务。"


def _token() -> str:
    log = Path.home() / ".dsh" / "warroom-plugin" / "server.log"
    m = re.search(r"[?&]token=([a-zA-Z0-9_-]+)", log.read_text(encoding="utf-8", errors="ignore"))
    return m.group(1) if m else ""


def api(path: str, body=None):
    url = f"{BASE}{path}{'&' if '?' in path else '?'}token={_token()}"
    if body is None:
        with urllib.request.urlopen(url, timeout=60) as r:
            return json.loads(r.read())
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                 headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def log(*a):
    print(*a, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1720, "height": 940})
    page.on("pageerror", lambda e: log("PAGEERROR:", str(e)))
    page.goto(f"{BASE}/?token={_token()}")
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(4000)
    # 板可能自开（shell 水合延迟不定）——零尺寸挂载=板面未开，点舰桥入口开板
    # （入口点击会切换开/关，只在确实没开时点一次）。
    if (page.evaluate("() => document.querySelector('.war-dispatch')?.getBoundingClientRect().width ?? 0") or 0) == 0:
        page.locator("[data-dsh-warroom-entry]").first.click()
        page.wait_for_timeout(1500)
    page.wait_for_selector(".war-dispatch .war-card", state="attached", timeout=30000)

    # --- Phase 1：种子板 talking 命令的板上作答 --------------------------------
    board = api("/warroom/api/board")
    talking = [c for c in board["commands"] if c["status"] == "talking" and c.get("staffSessionId")]
    assert talking, "种子板应有 talking 命令（seed directive_talking ×1，经织换有真会话）"
    cmd = talking[0]
    log(f"P1 talking cmd: {cmd['commandId']} staff={cmd['staffSessionId'][:18]}…")
    # 聚焦页：调度条 DOM 直点该命令卡（全板每秒重渲染，locator click 不稳；
    # 卡面无 commandId 文本——data-pipe-cmd 属性直取）。
    page.evaluate("(cid) => { document.querySelector(`.war-dispatch [data-pipe-cmd=\"${cid}\"]`).click() }", cmd["commandId"])
    page.wait_for_selector(".war-cd-modal", timeout=10000)
    # ghost 面板默认收起——先点开任务段 ghost 卡（DOM 直点）。
    page.evaluate("() => document.querySelector('.war-cd-modal .war-tour-ghost')?.click()")
    page.wait_for_selector(".war-answer-input", timeout=10000)
    ph = page.locator(".war-answer-input").get_attribute("placeholder") or ""
    assert ("参谋" in ph) or ("大副" in ph), f"占位文案应点名参谋/大副（皮肤派生）：{ph}"
    page.screenshot(path=str(EV / "b-p1-ghost.png"))
    # React 受控 textarea：原生 setter + input 事件（rerender 下 page.fill 不稳）。
    page.evaluate("""(t) => {
      const ta = document.querySelector('.war-answer-input');
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(ta, t);
      ta.dispatchEvent(new Event('input', {bubbles: true}));
    }""", "P1 演示答复：收到，继续。")
    page.evaluate("""() => {
      const btn = [...document.querySelectorAll('.war-cd-modal button')].find(b => b.textContent.includes('送达') || b.textContent.includes('发送'));
      btn.click();
    }""")
    page.wait_for_selector(".war-answer-note.ok", timeout=20000)
    note = page.locator(".war-answer-note.ok").inner_text()
    assert "已送达" in note, f"回执行词面：{note}"
    page.screenshot(path=str(EV / "b-p1-sent.png"))
    log(f"P1 ok: 板上作答回执「{note}」（真实投递到织换会话）")

    # --- Phase 2：实弹状态流转（答案驱动 talking→plan）------------------------
    os.makedirs(WS, exist_ok=True)
    r = api("/warroom/api/commands", {"text": CMD})
    assert r.get("ok"), f"命令下达失败：{r}"
    cid = r["commandId"]
    log(f"P2 cmd: {cid} 下达，等 received+分诊落定…")
    # 第一拍：等 received（fuse 15s 内 relay 建会话送令）+ 大副第一回合落定
    # （grade 落账=war_triage 已过；precondition：plan 仍空=它按指示在等）。
    deadline = time.time() + 240
    first_turn_done = False
    while time.time() < deadline:
        b = api("/warroom/api/board")
        c = next((x for x in b["commands"] if x["commandId"] == cid), None)
        if c and c.get("staffSessionId") and c.get("grade"):
            assert c.get("plan") is None, "前置破坏：大副未等答复就呈了计划（指令未守——考题作废重跑）"
            first_turn_done = True
            break
        time.sleep(5)
    assert first_turn_done, "240s 内未等到 received+分诊（relay/LLM 链路异常）"
    log(f"P2 第一拍落定：grade={c['grade']}，plan 仍空（大副按指示在等答复）")
    # 板 API 作答（与 P1 同一端点——这里走 API 以便轮询断言）。
    r = api("/warroom/api/commands/talking", {"commandId": cid})
    assert r.get("ok"), r
    r = api("/warroom/api/commands/answer", {"commandId": cid, "text": ANSWER})
    assert r.get("ok") and r.get("delivered"), f"作答未送达：{r}"
    assert r.get("status") == "talking", f"作答后账面应为 talking：{r}"
    log("P2 答复已送达（talking 落账），轮询 plan 落地…")
    deadline = time.time() + 300
    flowed = False
    while time.time() < deadline:
        b = api("/warroom/api/board")
        c = next((x for x in b["commands"] if x["commandId"] == cid), None)
        if c and c.get("plan") is not None:
            flowed = True
            break
        time.sleep(5)
    assert flowed, "300s 内 plan 未落地（答案未驱动续跑）"
    log(f"P2 ok: talking→plan 流转（答案驱动 war_plan），plan 首行：{c['plan']['text'][:40]}…")
    # 聚焦页终态截图（plan ghost 在场）。
    try:
        page.wait_for_selector(".war-cd-modal", timeout=8000)
        page.screenshot(path=str(EV / "b-p2-plan.png"))
    except Exception:
        pass

    browser.close()
print("PROBE-B OK")
