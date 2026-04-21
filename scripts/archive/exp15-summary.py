"""Exp 15: Stage 1 A/B summary — baseline (?draft=true) vs default adversary loop.

Reads the 4 GoalSpec JSON files in docs/test-results/exp15/ and prints a
side-by-side comparison. Uses UTF-8 stdout to handle <= / >= in perf target
strings on Windows.
"""
import json
import sys
from pathlib import Path

# Force UTF-8 on Windows so inequalities in perf-goal strings print cleanly.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path("docs/test-results/exp15")

PROMPTS = {
    0: "chatbot for hospitals",
    1: "a tool to catch credit card fraud",
}


def load(name: str):
    p = ROOT / name
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def summarize(data):
    if not data:
        return None
    gs = data.get("goalSpec") or data
    perf = gs.get("performance_goals") or gs.get("performanceTargets") or []
    inferred = gs.get("inferred_requirements") or gs.get("inferredRequirements") or []
    constraints = gs.get("constraints") or {}
    compliance = (constraints.get("compliance") if isinstance(constraints, dict) else None) or gs.get("compliance") or []
    domain = gs.get("domain") or gs.get("primaryDomain") or "?"
    gaps = gs.get("gaps") or gs.get("clarificationGaps") or []
    conflicts = gs.get("conflicts") or []
    return {
        "domain": domain,
        "perf": perf,
        "inferred": inferred,
        "compliance": compliance,
        "gaps": gaps,
        "conflicts": conflicts,
        "latencyMs": data.get("latencyMs"),
        "rounds": data.get("adversaryRounds") or data.get("rounds"),
    }


def fmt_perf(pg):
    if isinstance(pg, dict):
        metric = pg.get("metric", "?")
        target = pg.get("target") or pg.get("value") or ""
        return f"{metric} | {target}"
    return str(pg)


def print_side(label, s):
    print(f"\n  [{label}]")
    if not s:
        print("    (no data)")
        return
    print(f"    domain:     {s['domain']}")
    print(f"    latencyMs:  {s['latencyMs']}")
    print(f"    rounds:     {s['rounds']}")
    print(f"    compliance: {s['compliance']}")
    print(f"    perf ({len(s['perf'])}):")
    for pg in s["perf"]:
        print(f"       - {fmt_perf(pg)}")
    print(f"    inferred ({len(s['inferred'])}):")
    for r in s["inferred"][:10]:
        if isinstance(r, dict):
            r = r.get("requirement") or r.get("text") or str(r)
        print(f"       - {str(r)[:120]}")
    print(f"    gaps: {len(s['gaps'])}  conflicts: {len(s['conflicts'])}")


for i, prompt in PROMPTS.items():
    print("=" * 72)
    print(f"Prompt {i}: {prompt!r}")
    print("=" * 72)
    a = summarize(load(f"prompt{i}-A-baseline.json"))
    b = summarize(load(f"prompt{i}-B-loop.json"))
    print_side("A baseline (?draft=true)", a)
    print_side("B loop (default)", b)

    if a and b:
        print("\n  DELTA (B - A):")
        print(f"    perf count:     {len(a['perf'])} -> {len(b['perf'])}")
        print(f"    inferred count: {len(a['inferred'])} -> {len(b['inferred'])}")
        ac = set(map(str, a["compliance"]))
        bc = set(map(str, b["compliance"]))
        print(f"    compliance added:   {sorted(bc - ac)}")
        print(f"    compliance dropped: {sorted(ac - bc)}")
        if a["latencyMs"] and b["latencyMs"]:
            print(f"    latency:        {a['latencyMs']}ms -> {b['latencyMs']}ms ({b['latencyMs']/a['latencyMs']:.1f}x)")
    print()
