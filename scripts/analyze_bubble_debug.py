from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOG_DIR = ROOT / "output" / "bubble-debug"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"[warn] skipped invalid JSON line {line_no}: {exc}")
                continue
            if isinstance(item, dict):
                rows.append(item)
    return rows


def labels(graph_bubbles: Any, limit: int = 18) -> str:
    if not isinstance(graph_bubbles, list):
        return "-"
    parts: list[str] = []
    for bubble in graph_bubbles[:limit]:
        if not isinstance(bubble, dict):
            continue
        label = str(bubble.get("label") or "").strip()
        state = str(bubble.get("display_state") or "").strip()
        choice = str(bubble.get("choice_affinity") or "").strip()
        count = bubble.get("count")
        if label:
            parts.append(f"{label}({choice or '-'}, {state or '-'}, c={count})")
    return ", ".join(parts) if parts else "-"


def selected_keywords(item: dict[str, Any]) -> str:
    selected = item.get("selected_keywords")
    if not isinstance(selected, list):
        selected = (item.get("extractor_route") or {}).get("selected_keywords")
    if not isinstance(selected, list):
        return "-"
    parts: list[str] = []
    for keyword in selected:
        if not isinstance(keyword, dict):
            continue
        text = str(keyword.get("text") or "").strip()
        choice = str(keyword.get("choice_affinity") or "").strip()
        count = keyword.get("count")
        support = keyword.get("support_count")
        if text:
            parts.append(f"{text}({choice or '-'}, c={count}, s={support})")
    return ", ".join(parts) if parts else "-"


def operation_summary(item: dict[str, Any]) -> str:
    rename = item.get("rename_keywords")
    merge = item.get("merge_keywords")
    remove = item.get("remove_keywords")
    affinity = item.get("affinity_updates")
    return (
        f"rename={len(rename) if isinstance(rename, list) else 0}, "
        f"merge={len(merge) if isinstance(merge, list) else 0}, "
        f"remove={len(remove) if isinstance(remove, list) else 0}, "
        f"affinity={len(affinity) if isinstance(affinity, list) else 0}"
    )


def frontend_data_summary(item: dict[str, Any]) -> tuple[str, str]:
    data = item.get("data")
    if not isinstance(data, dict):
        return "-", "-"
    counts = []
    for key in (
        "cycle",
        "graph_cycle",
        "bubbles",
        "incoming_bubbles",
        "current_bubbles",
        "graph_bubbles",
        "keyword_bubbles",
        "visual_bubbles",
    ):
        if key in data:
            counts.append(f"{key}={data.get(key)}")
    labels_data = data.get("labels")
    label_parts: list[str] = []
    if isinstance(labels_data, list):
        for row in labels_data[:18]:
            if not isinstance(row, dict):
                continue
            text = str(row.get("label") or row.get("text") or "").strip()
            state = str(row.get("state") or "").strip()
            count = row.get("count")
            if text:
                label_parts.append(f"{text}({state or '-'}, c={count})")
    return ", ".join(counts) if counts else "-", ", ".join(label_parts) if label_parts else "-"


def find_log_path(log_dir: Path, meeting_id: str | None) -> Path:
    if meeting_id:
        matches = sorted(log_dir.glob(f"*{meeting_id}*.jsonl"))
        if matches:
            return matches[-1]
        direct = log_dir / f"{meeting_id}.jsonl"
        if direct.exists():
            return direct
        raise SystemExit(f"No debug log found for meeting id: {meeting_id}")

    logs = sorted(log_dir.glob("*.jsonl"), key=lambda path: path.stat().st_mtime)
    if not logs:
        raise SystemExit(f"No debug logs found in {log_dir}")
    return logs[-1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize demo balance bubble debug JSONL logs.")
    parser.add_argument("--meeting-id", default="", help="Meeting id. If omitted, analyzes the newest log.")
    parser.add_argument("--log-dir", default=str(DEFAULT_LOG_DIR), help="Debug log directory.")
    parser.add_argument("--tail", type=int, default=12, help="Number of recent events to print.")
    args = parser.parse_args()

    log_path = find_log_path(Path(args.log_dir), args.meeting_id.strip() or None)
    rows = read_jsonl(log_path)
    if not rows:
        raise SystemExit(f"No events in {log_path}")

    counts = Counter(str(row.get("event") or "unknown") for row in rows)
    print(f"log: {log_path}")
    print(f"events: {len(rows)}")
    print("event_counts:", ", ".join(f"{key}={value}" for key, value in sorted(counts.items())))
    print()

    for item in rows[-max(1, args.tail):]:
        event = str(item.get("event") or "unknown")
        timestamp = str(item.get("timestamp") or "")
        cycle = item.get("graph_cycle")
        state_counts = item.get("state_counts") if isinstance(item.get("state_counts"), dict) else {}
        print(f"[{timestamp}] {event} cycle={cycle} state={state_counts}")
        if event.startswith("local_fast"):
            print(f"  selected: {selected_keywords(item)}")
            top = (item.get("extractor_route") or {}).get("top_candidates")
            if isinstance(top, list) and top:
                top_text = ", ".join(
                    f"{candidate.get('text')}:{candidate.get('score')}"
                    for candidate in top[:8]
                    if isinstance(candidate, dict)
                )
                print(f"  top: {top_text or '-'}")
        if event.startswith("llm_update"):
            print(f"  ops: {operation_summary(item)}")
        if event.startswith("frontend_"):
            counts, frontend_labels = frontend_data_summary(item)
            print(f"  frontend: {counts}")
            print(f"  frontend labels: {frontend_labels}")
        print(f"  bubbles: {labels(item.get('graph_bubbles'))}")
        print()


if __name__ == "__main__":
    main()
