# -*- coding: utf-8 -*-
"""大账本性能回归播种器 — 在现有种子之上追加 N 条批量命令（默认 500）。

Usage: python scripts/seed-bulk.py [stateDir] [count]

Protocol 与 seed-playground 相同：停服 → seed-playground（基础演示板）→ 本脚本
追加 → 起服。只动隔离目录，绝碰默认状态目录。

状态分布（模拟三个月真实使用）：
  55% 收官闭环（created→published→claimed→submitted→closed）
  15% 失败终局（…→attempt_failed→failed）
  10% 待翻阅（submitted 止步）
  10% 在打（claimed 活体 attempt 不落终态——星域编队+执行卡压力源）
  10% 只分诊（received→triaged，无任务）
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

STATE = Path(sys.argv[1] if len(sys.argv) > 1 else ".smoke-state")
COUNT = int(sys.argv[2] if len(sys.argv) > 2 else 500)

ts = lambda mins_ago: (datetime.now(timezone.utc) - timedelta(minutes=mins_ago)).isoformat(timespec="milliseconds")

WS_POOL = [
    "D:/Users/kaiji/vibecodingKJ/projects/dsh-plugin-stardeck/.smoke-state/ws/projA",
    "D:/Users/kaiji/vibecodingKJ/projects/dsh-plugin-stardeck/.smoke-state/ws/projB/daily",
    "D:/Users/kaiji/vibecodingKJ/projects/dsh-plugin-stardeck/.smoke-state/ws/projA",
    "D:/Users/kaiji/vibecodingKJ/projects/dsh-plugin-stardeck/.smoke-state/ws/projB/daily",
]
TOPICS = ["依赖升级巡检", "README 补英文版", "测试补覆盖率", "日志降噪", "接口幂等加固", "慢查询定位", "类型收紧", "配置样例同步", "错误码正名", "缓存穿透防护"]

CAM = STATE / "campaigns"
CAM.mkdir(parents=True, exist_ok=True)

def dev(payload: dict) -> None:
    with open(STATE / "directives.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

def cev(cid: str, payload: dict) -> None:
    with open(CAM / f"{cid}.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

def attempt_id(i: int, a: int) -> str:
    return f"{i:08x}-0000-4a5b-8c6d-{a:012x}"

counts = {"closed": 0, "failed": 0, "reported": 0, "live": 0, "triaged": 0}
for i in range(COUNT):
    k = i % 10
    kind = "closed" if k < 5.5 else "failed" if k < 7 else "reported" if k < 8 else "live" if k < 9 else "triaged"
    counts[kind] += 1
    cid = f"cmd-bulk-{i:05d}"
    tid = f"bulk-{i:05d}"
    ws = WS_POOL[i % len(WS_POOL)]
    topic = TOPICS[i % len(TOPICS)]
    age = 30 + (i * 37) % 5000  # 分钟：散布 ~3.5 天
    title = f"{topic} #{i:05d}"
    sess = f"sec-bulk-{i:05d}"
    dev({"type": "directive_created", "ts": ts(age), "directiveId": cid, "text": f"{topic}：第 {i} 轮例行处理（bulk 压测种子）"})
    if kind == "triaged":
        dev({"type": "directive_received", "ts": ts(age - 1), "directiveId": cid, "staffSessionId": sess})
        dev({"type": "directive_triaged", "ts": ts(age - 2), "directiveId": cid, "grade": "L0" if i % 2 else "L1", "reason": "bulk 分诊理由占位", "confidence": 0.9})
        continue
    dev({"type": "directive_received", "ts": ts(age - 1), "directiveId": cid, "staffSessionId": sess})
    dev({"type": "directive_triaged", "ts": ts(age - 2), "directiveId": cid, "grade": "L0", "reason": "bulk 分诊理由占位", "confidence": 0.9})
    cev(tid, {"type": "task_created", "ts": ts(age - 3), "campaignId": tid, "title": title, "brief": f"背景：bulk 压测 {i}。执行指引：占位。", "acceptance": "占位验收", "priority": "normal", "publishedBy": sess})
    cev(tid, {"type": "task_published", "ts": ts(age - 3), "campaignId": tid, "workspacePath": ws, "publishedBy": sess, "workspaceKind": "bound"})
    cev(tid, {"type": "task_claimed", "ts": ts(age - 4), "campaignId": tid, "claimedBy": f"cmd-bulk-{i:05d}", "attemptId": attempt_id(i, 1), "attempt": 1})
    if kind == "live":
        continue
    report = f"任务回报：bulk #{i} 完成，验收全过。"
    cev(tid, {"type": "task_submitted", "ts": ts(age - 6), "campaignId": tid, "report": report, "from": f"cmd-bulk-{i:05d}",
              "evidence": {"checks": [{"item": "占位验收", "passed": True}], "tests": {"command": "npm test", "exitCode": 0, "passed": 3, "failed": 0}, "diffstat": "1 file changed, 10 insertions(+)"}})
    if kind == "reported":
        continue
    if kind == "closed":
        cev(tid, {"type": "task_closed", "ts": ts(age - 8), "campaignId": tid, "verdict": "通过收官"})
    else:
        cev(tid, {"type": "task_attempt_failed", "ts": ts(age - 6), "campaignId": tid, "reason": f"bulk #{i} 失败占位：依赖缺失", "from": f"cmd-bulk-{i:05d}"})
        cev(tid, {"type": "task_failed", "ts": ts(age - 6), "campaignId": tid, "reason": f"第 1 次尝试失败：bulk #{i} 失败占位（重试上限 1 已用尽）"})

print(f"bulk seeded: {COUNT} commands into {STATE} — {counts}")
