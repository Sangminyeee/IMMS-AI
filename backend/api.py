from __future__ import annotations

import json
import math
import os
import platform
import queue
import re
import tempfile
import threading
import time
import importlib.util
import copy
import hmac
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from supabase import Client, create_client

from llm_client import get_client
from security_utils import extract_client_ip, is_ip_allowed, parse_ip_whitelist

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT / "gateway" / ".env", override=False)
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "turbo").strip() or "turbo"
WHISPER_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "ko").strip() or "ko"
GEMINI_DEFAULT_MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite").strip() or "gemini-3.1-flash-lite"
GEMINI_FAST_MODEL_NAME = os.environ.get("GEMINI_FAST_MODEL", "gemini-3.1-flash-lite").strip() or GEMINI_DEFAULT_MODEL_NAME
GEMINI_FAST_STAGE_NAMES = tuple(
    stage.strip()
    for stage in os.environ.get(
        "GEMINI_FAST_STAGES",
        "stt.transcript_refine,stt.flow_summary,canvas_ideation_keyword_extract,canvas_ideation_bubble_graph_update",
    ).split(",")
    if stage.strip()
)
GEMINI_FORCE_DEFAULT_STAGE_NAMES = {
    "canvas_demo_balance_problem_summary",
    "canvas_demo_balance_summary_document",
    "canvas_demo_balance_summary_conclusion",
}
GEMINI_FAST_STAGE_PREFIXES = tuple(
    prefix.strip()
    for prefix in os.environ.get("GEMINI_FAST_STAGE_PREFIXES", "").split(",")
    if prefix.strip()
)
GEMINI_DEFAULT_THINKING_LEVEL = os.environ.get("GEMINI_THINKING_LEVEL", "").strip()
GEMINI_FAST_THINKING_LEVEL = os.environ.get("GEMINI_FAST_THINKING_LEVEL", "low").strip() or "low"
SUMMARY_INTERVAL = 4
SUMMARY_POINT_TARGET_LEN = None
REALTIME_MIN_SHIFT_SPAN = 6
LLM_IO_LOG_MAX = 160
LLM_IO_PREVIEW_MAX = 6000
PROBLEM_TAXONOMY_RAW_CONTEXT_CHAR_BUDGET = 2200
PROBLEM_TAXONOMY_CHUNK_CHAR_BUDGET = 2800
PROBLEM_TAXONOMY_CHUNK_MAX_ROWS = 18
PROBLEM_TAXONOMY_SUMMARY_TRIGGER_CHARS = 2200
PROBLEM_TAXONOMY_PROMPT_RAW_ROW_LIMIT = 18
PROBLEM_TAXONOMY_PROMPT_RAW_TEXT_CHARS = 280
PROBLEM_TAXONOMY_CHUNK_SUMMARY_BATCH_SIZE = 10
PROBLEM_TAXONOMY_CHUNK_SUMMARY_CONTEXT_CHAR_BUDGET = 2200
PROBLEM_TAXONOMY_CHUNK_SUMMARY_MAX_ITEMS = 2
PROBLEM_TAXONOMY_OVERVIEW_TRIGGER_CHUNKS = 12
PROBLEM_TAXONOMY_OVERVIEW_CONTEXT_CHAR_BUDGET = 1800
PROBLEM_TAXONOMY_OUTLINE_MAX_DEPTH = 2
CANVAS_IDEA_FAILURE_RETRY_DELAY_SECONDS = 60
CANVAS_IDEA_COMPACTION_MIN_VISIBLE = 6
CANVAS_IDEA_COMPACTION_MAX_MERGES_PER_JOB = 4
CANVAS_TOPIC_CLUSTER_MAX_PASSES_PER_JOB = 3
RUNTIME_SHARED_STATE_TABLE = "meeting_runtime_states"
RUNTIME_USER_STATE_TABLE = "meeting_user_states"
IP_WHITELIST = parse_ip_whitelist(os.environ.get("IP_WHITELIST"))

_SUPABASE_CLIENT: Client | None = None
_SUPABASE_CLIENT_INITIALIZED = False
_SUPABASE_CLIENT_LOCK = threading.Lock()
_SUPABASE_REQUEST_LOCK = threading.Lock()
_RUNTIME_DB_DISABLED_TABLES: set[str] = set()
_RUNTIME_DB_LOGGED_ERRORS: dict[str, float] = {}
_RUNTIME_DB_STATE_LOCK = threading.Lock()
_LOCAL_KIWI_EXTRACTOR: Any = None
_LOCAL_KIWI_EXTRACTOR_ATTEMPTED = False
_LOCAL_KIWI_EXTRACTOR_LOCK = threading.Lock()
_LOCAL_KIWI_WARNING_LOGGED = False

STOPWORDS = {
    "그냥",
    "이제",
    "저기",
    "그게",
    "그거",
    "이거",
    "저거",
    "그리고",
    "하지만",
    "그러면",
    "그래서",
    "또는",
    "이번",
    "그런",
    "이런",
    "저런",
    "정도",
    "부분",
    "관련",
    "대해서",
    "안건",
    "회의",
    "논의",
    "말씀",
    "의견",
    "지금",
    "오늘",
    "내일",
    "이번주",
    "다음주",
    "정말",
    "진짜",
    "아주",
    "거의",
    "일단",
    "맞아요",
    "맞습니다",
    "있습니다",
    "없습니다",
    "한다",
    "했다",
    "하고",
    "해서",
    "하면",
    "하며",
    "이면",
    "이면은",
    "the",
    "and",
    "that",
    "this",
    "with",
    "from",
    "about",
    "저는",
    "저희",
    "저도",
    "제가",
    "그렇죠",
    "거예요",
    "거죠",
    "이게",
    "그게",
    "어떤",
    "그러니까",
    "근데",
    "같아요",
    "같고",
    "있고",
    "있다",
    "하는",
    "하게",
    "되어",
    "그렇게",
    "이렇게",
    "많이",
    "하나",
    "계속",
    "아니라",
    "보니까",
    "나온",
    "있습니다",
    "합니다",
    "겁니다",
    "수도",
    "때문에",
    "가지고",
    "laughing",
    "감사합니다",
    "포인트",
    "처음",
    "틀에서",
    "party",
    "name",
    "있는",
    "되는",
    "번째",
    "우리가",
    "굉장히",
    "아마",
    "거",
    "것",
    "수",
    "등",
    "이런식",
    "그런식",
    "해당",
    "관련된",
    "통해",
    "기반",
    "위해",
    "정리",
    "내용",
    "사항",
    "부분은",
    "부분이",
    "부분을",
    "정도는",
    "다음으로",
    "그리고요",
    "그러고",
    "아니면",
    "진행",
    "완료",
    "중인",
    "그니까",
    "보면",
    "어떻게",
    "좋은",
    "바로",
    "그러니",
    "그런데",
    "company",
    "companies",
    "thing",
    "things",
}

DECISION_PAT = re.compile(r"(결정|확정|합의|채택|의결|하기로|정리하면|정하자)")
ACTION_PAT = re.compile(r"(담당|까지|하겠습니다|진행하겠습니다|준비하겠습니다|검토하겠습니다|공유하겠습니다|작성하겠습니다)")
DUE_PAT = re.compile(r"(\d{4}-\d{2}-\d{2}|\d{1,2}월\s*\d{1,2}일|오늘|내일|이번주|다음주|월요일|화요일|수요일|목요일|금요일|토요일|일요일)")
TRANSITION_PAT = re.compile(r"(다음|한편|반면|이제|정리하면|다시|또 하나|두 번째|세 번째|마지막으로)")
LEADING_TIMESTAMP_RE = re.compile(
    r"^\s*\[?\s*(?:"
    r"\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?"
    r"|\d{1,2}:\d{2}(?::\d{2})?"
    r")\s*\]?\s*"
)


def _now_ts() -> str:
    return time.strftime("%H:%M:%S")


def _safe_text(raw: Any, fallback: str = "") -> str:
    s = str(raw or "").strip()
    return s if s else fallback


_BUBBLE_DEBUG_LOG_DIR = ROOT / "output" / "bubble-debug"
_BUBBLE_DEBUG_LOG_LOCK = threading.Lock()
_BUBBLE_DEBUG_LOG_MAX_BUBBLES = 80
_DEMO_BUBBLE_LLM_LOG_DIR = ROOT / "output" / "demo-bubble-llm"
_DEMO_BUBBLE_LLM_LOG_LOCK = threading.Lock()
DEMO_BALANCE_GATE_ENTER_DELAY_MS = 0
DEMO_BALANCE_GATE_STEP_DELAY_MS = 340


def _bubble_debug_safe_meeting_id(meeting_id: Any) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", _safe_text(meeting_id))
    return safe[:120] or "unknown"


def _bubble_debug_compact_rows(rows: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for row in rows[-limit:]:
        compact.append(
            {
                "id": _safe_text(row.get("id"))[:80],
                "speaker": _safe_text(row.get("speaker"))[:40],
                "text": _strip_leading_timestamp(row.get("text"))[:180],
                "timestamp": _safe_text(row.get("timestamp"))[:60],
            }
        )
    return compact


def _bubble_debug_compact_bubbles(graph: dict[str, Any], limit: int = _BUBBLE_DEBUG_LOG_MAX_BUBBLES) -> list[dict[str, Any]]:
    bubbles = graph.get("bubbles") if isinstance(graph, dict) else []
    if not isinstance(bubbles, list):
        return []
    compact: list[dict[str, Any]] = []
    for bubble in bubbles[:limit]:
        if not isinstance(bubble, dict):
            continue
        compact.append(
            {
                "id": _safe_text(bubble.get("id"))[:80],
                "label": _safe_text(bubble.get("label"))[:80],
                "canonical_label": _safe_text(bubble.get("canonical_label"))[:80],
                "aliases": [_safe_text(value)[:80] for value in (bubble.get("aliases") or [])[:8]],
                "count": _safe_nonnegative_int(bubble.get("count"), 0),
                "display_state": _safe_text(bubble.get("display_state")),
                "lifecycle_state": _safe_text(bubble.get("lifecycle_state")),
                "choice_affinity": _safe_text(bubble.get("choice_affinity")),
                "affinity_score": _safe_float(bubble.get("affinity_score"), 0.0),
                "emphasis": _safe_text(bubble.get("emphasis")),
                "anchor_id": _safe_text(bubble.get("anchor_id")),
                "orbit_center_id": _safe_text(bubble.get("orbit_center_id")),
                "orbit_ring": _safe_nonnegative_int(bubble.get("orbit_ring"), 0),
                "orbit_slot_index": _safe_nonnegative_int(bubble.get("orbit_slot_index"), 0),
                "orbit_order_key": _safe_float(bubble.get("orbit_order_key"), 0.0),
                "orbit_angle": _safe_float(bubble.get("orbit_angle"), 0.0),
                "orbit_radius": _safe_float(bubble.get("orbit_radius"), 0.0),
                "motion_reason": _safe_text(bubble.get("motion_reason")),
                "motion_direction": _safe_text(bubble.get("motion_direction")),
                "motion_plan_id": _safe_text(bubble.get("motion_plan_id")),
                "from_slot_index": _safe_nonnegative_int(bubble.get("from_slot_index"), 0),
                "to_slot_index": _safe_nonnegative_int(bubble.get("to_slot_index"), 0),
                "move_cost": round(_safe_float(bubble.get("move_cost"), 0.0), 2),
                "move_angle_delta": round(_safe_float(bubble.get("move_angle_delta"), 0.0), 4),
                "arc_cost": round(_safe_float(bubble.get("arc_cost"), 0.0), 2),
                "radius_cost": round(_safe_float(bubble.get("radius_cost"), 0.0), 2),
                "gate_blocked": bool(bubble.get("gate_blocked")),
                "enter_sequence": _safe_nonnegative_int(bubble.get("enter_sequence"), 0),
                "enter_delay_ms": _safe_nonnegative_int(bubble.get("enter_delay_ms"), 0),
                "gate_angle": _safe_float(bubble.get("gate_angle"), 0.0),
                "durable": bool(bubble.get("durable")),
                "x": _safe_float(bubble.get("x"), 0.0),
                "y": _safe_float(bubble.get("y"), 0.0),
                "size": _safe_float(bubble.get("size"), 0.0),
            }
        )
    return compact


def _write_bubble_debug_event(meeting_id: Any, event: str, payload: dict[str, Any]) -> None:
    if os.environ.get("BUBBLE_DEBUG_FILE_LOG", "1").strip().lower() in {"0", "false", "no", "off"}:
        return
    record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event": _safe_text(event),
        "meeting_id": _safe_text(meeting_id),
        **payload,
    }
    path = _BUBBLE_DEBUG_LOG_DIR / f"{_bubble_debug_safe_meeting_id(meeting_id)}.jsonl"
    try:
        with _BUBBLE_DEBUG_LOG_LOCK:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False, default=str, separators=(",", ":")) + "\n")
    except Exception as exc:
        print(
            "[Bubble][debug-log] write failed",
            {"meeting_id": _safe_text(meeting_id), "event": _safe_text(event), "error": repr(exc)},
            flush=True,
        )


def _write_demo_bubble_llm_event(meeting_id: Any, event: str, payload: dict[str, Any]) -> None:
    if os.environ.get("DEMO_BUBBLE_LLM_FILE_LOG", "1").strip().lower() in {"0", "false", "no", "off"}:
        return
    record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event": _safe_text(event),
        "meeting_id": _safe_text(meeting_id),
        **payload,
    }
    path = _DEMO_BUBBLE_LLM_LOG_DIR / f"{_bubble_debug_safe_meeting_id(meeting_id)}.jsonl"
    try:
        with _DEMO_BUBBLE_LLM_LOG_LOCK:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False, default=str, separators=(",", ":")) + "\n")
    except Exception as exc:
        print(
            "[DemoBubbleLLM][file-log] write failed",
            {"meeting_id": _safe_text(meeting_id), "event": _safe_text(event), "error": repr(exc)},
            flush=True,
        )


def _bubble_debug_compact_directives(parsed: Any, *, limit: int = 8) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        return {}

    def _compact_list(*keys: str) -> list[Any]:
        raw: Any = []
        for key in keys:
            value = parsed.get(key)
            if value:
                raw = value
                break
        if not isinstance(raw, list):
            return []
        compact: list[Any] = []
        for item in raw[:limit]:
            if isinstance(item, dict):
                compact.append(
                    {
                        _safe_text(key)[:40]: _truncate_text(_safe_text(value), 120)
                        for key, value in item.items()
                        if _safe_text(key)
                    }
                )
            else:
                compact.append(_truncate_text(_safe_text(item), 120))
        return compact

    return {
        "rename_keywords": _compact_list("rename_keywords", "renames", "rename", "correct_keywords"),
        "merge_keywords": _compact_list("merge_keywords", "merges", "merge"),
        "remove_keywords": _compact_list("remove_keywords", "delete_keywords", "archive_keywords"),
        "affinity_updates": _compact_list("affinity_updates", "affinityUpdates", "move_keywords", "moveKeywords"),
        "refine": _compact_list("refine", "refined_transcripts", "refinedTranscripts"),
        "primary_keywords": _compact_list("primary_keywords", "primaryKeywords", "important_keywords", "importantKeywords"),
    }


def _safe_nonnegative_int(raw: Any, fallback: int = 0) -> int:
    try:
        value = int(float(raw))
    except (TypeError, ValueError):
        return fallback
    return max(0, value)


def _safe_float(raw: Any, fallback: float = 0) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(value):
        return fallback
    return value


def _strip_leading_timestamp(raw: Any) -> str:
    return LEADING_TIMESTAMP_RE.sub("", _safe_text(raw)).strip()


def _boolify(raw: Any, default: bool) -> bool:
    if raw is None:
        return default
    s = str(raw).strip().lower()
    if s in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if s in {"0", "false", "f", "no", "n", "off"}:
        return False
    return default


def _sec_to_ts(raw: Any) -> str:
    try:
        sec = max(0, float(raw))
    except Exception:
        return _now_ts()
    total = int(sec)
    hh = (total // 3600) % 24
    mm = (total % 3600) // 60
    ss = total % 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}"


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z0-9가-힣]{2,}", _safe_text(text).lower()))


def _topic_far_enough(current_title: str, new_title: str) -> bool:
    cur = _tokens(current_title)
    nxt = _tokens(new_title)
    if not cur or not nxt:
        return _safe_text(current_title) != _safe_text(new_title)
    inter = len(cur & nxt)
    union = len(cur | nxt)
    sim = inter / union if union > 0 else 0.0
    return sim < 0.4


def _keyword_tokens(text: str) -> list[str]:
    out: list[str] = []
    for raw_tok in re.findall(r"[A-Za-z0-9가-힣]{2,}", _safe_text(text).lower()):
        tok = _normalize_keyword_token(raw_tok)
        if tok.isdigit():
            continue
        if tok in STOPWORDS:
            continue
        if re.fullmatch(r"name\d+", tok):
            continue
        if tok.startswith("name") or tok.startswith("party"):
            continue
        out.append(tok)
    return out


def _text_similarity(a: str, b: str) -> float:
    ta = set(_keyword_tokens(a))
    tb = set(_keyword_tokens(b))
    if not ta or not tb:
        return 0.0
    union = len(ta | tb)
    return (len(ta & tb) / union) if union else 0.0


def _normalize_agenda_state(raw: Any) -> str:
    s = _safe_text(raw, "PROPOSED").upper()
    if s in {"ACTIVE", "CLOSING", "CLOSED", "PROPOSED"}:
        return s
    return "PROPOSED"


def _normalize_flow_type(raw: Any) -> str:
    s = _safe_text(raw, "discussion").lower()
    if s in {"discussion", "decision", "action-planning"}:
        return s
    return "discussion"


def _normalize_canvas_stage(raw: Any) -> str:
    s = _safe_text(raw, "ideation").lower()
    if s in {"ideation", "problem-definition", "solution"}:
        return s
    return "ideation"


def _utc_iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _env_first(*keys: str) -> str:
    for key in keys:
        value = _safe_text(os.environ.get(key))
        if value:
            return value
    return ""


def _get_supabase_service_client() -> Client | None:
    global _SUPABASE_CLIENT, _SUPABASE_CLIENT_INITIALIZED

    with _SUPABASE_CLIENT_LOCK:
        if _SUPABASE_CLIENT_INITIALIZED:
            return _SUPABASE_CLIENT

        _SUPABASE_CLIENT_INITIALIZED = True
        supabase_url = _env_first("SUPABASE_URL", "supabase_url", "NEXT_PUBLIC_SUPABASE_URL")
        supabase_service_role_key = _env_first(
            "SUPABASE_SERVICE_ROLE_KEY",
            "supabase_service_role_key",
        )
        if not supabase_url or not supabase_service_role_key:
            return None

        try:
            _SUPABASE_CLIENT = create_client(supabase_url, supabase_service_role_key)
        except Exception as exc:
            print(f"❌ Failed to initialize Supabase client: {exc}")
            _SUPABASE_CLIENT = None
        return _SUPABASE_CLIENT


def _runtime_db_table_is_disabled(table_name: str) -> bool:
    with _RUNTIME_DB_STATE_LOCK:
        return table_name in _RUNTIME_DB_DISABLED_TABLES


def _log_runtime_db_error(key: str, message: str, cooldown_sec: float = 10.0) -> None:
    now = time.time()
    with _RUNTIME_DB_STATE_LOCK:
        last_logged_at = _RUNTIME_DB_LOGGED_ERRORS.get(key, 0.0)
        if now - last_logged_at < cooldown_sec:
            return
        _RUNTIME_DB_LOGGED_ERRORS[key] = now
    print(message)


def _handle_runtime_db_exception(table_name: str, action: str, exc: Exception) -> None:
    raw = str(exc)
    if "PGRST205" in raw and table_name in raw:
        with _RUNTIME_DB_STATE_LOCK:
            _RUNTIME_DB_DISABLED_TABLES.add(table_name)
        _log_runtime_db_error(
            f"{table_name}:missing",
            f"⚠️ Supabase 테이블 `{table_name}` 이 없어 runtime DB 저장을 비활성화합니다. "
            "supabase_schema.sql 적용 후 backend를 재시작하세요.",
            cooldown_sec=3600.0,
        )
        return

    _log_runtime_db_error(
        f"{table_name}:{action}:{raw}",
        f"❌ Failed to {action} using Supabase table `{table_name}`: {raw}",
        cooldown_sec=15.0,
    )


def _normalize_canvas_demo_config(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "enabled": False,
            "mode": "normal",
            "option_a": "",
            "option_b": "",
            "option_a_keyword": "",
            "option_b_keyword": "",
            "instruction": "",
        }

    mode = _safe_text(raw.get("mode"), "normal").lower()
    option_a = _truncate_text(_safe_text(raw.get("option_a") or raw.get("optionA")), 120)
    option_b = _truncate_text(_safe_text(raw.get("option_b") or raw.get("optionB")), 120)
    option_a_keyword = _truncate_text(
        _safe_text(raw.get("option_a_keyword") or raw.get("optionAKeyword") or option_a),
        80,
    )
    option_b_keyword = _truncate_text(
        _safe_text(raw.get("option_b_keyword") or raw.get("optionBKeyword") or option_b),
        80,
    )
    enabled = bool(raw.get("enabled")) or mode == "demo_balance"
    if mode != "demo_balance" or not enabled or not option_a or not option_b:
        return {
            "enabled": False,
            "mode": "normal",
            "option_a": "",
            "option_b": "",
            "option_a_keyword": "",
            "option_b_keyword": "",
            "instruction": "",
        }

    return {
        "enabled": True,
        "mode": "demo_balance",
        "option_a": option_a,
        "option_b": option_b,
        "option_a_keyword": option_a_keyword or option_a,
        "option_b_keyword": option_b_keyword or option_b,
        "instruction": _truncate_text(
            _safe_text(raw.get("instruction"), "발화할 때 A 또는 B를 먼저 말하고 이유를 설명해 주세요."),
            180,
        ),
    }


def _is_demo_balance_config(raw: Any) -> bool:
    config = _normalize_canvas_demo_config(raw)
    return bool(config.get("enabled")) and config.get("mode") == "demo_balance"


def _normalize_demo_balance_main_opinions(raw: Any) -> dict[str, list[dict[str, Any]]]:
    source = raw if isinstance(raw, dict) else {}
    output: dict[str, list[dict[str, Any]]] = {"a": [], "b": []}
    for choice, aliases in {
        "a": ("a", "option_a", "optionA", "option_a_opinions", "optionAOpinions"),
        "b": ("b", "option_b", "optionB", "option_b_opinions", "optionBOpinions"),
    }.items():
        raw_items: Any = []
        for key in aliases:
            if isinstance(source.get(key), list):
                raw_items = source.get(key)
                break
        normalized_items: list[dict[str, Any]] = []
        for index, item in enumerate(raw_items or []):
            if isinstance(item, str):
                text = _safe_text(item)
                title = text
                keywords: list[str] = []
                evidence_ids: list[str] = []
            elif isinstance(item, dict):
                text = _safe_text(item.get("text") or item.get("body") or item.get("summary") or item.get("reason_summary"))
                title = _safe_text(item.get("title") or item.get("label") or text)
                keywords = _dedup_preserve(
                    [_truncate_text(_safe_text(keyword), 40) for keyword in (item.get("keywords") or []) if _safe_text(keyword)],
                    limit=6,
                )
                evidence_ids = _dedup_preserve(
                    [
                        _safe_text(utterance_id)
                        for utterance_id in (
                            item.get("evidence_utterance_ids")
                            or item.get("evidenceUtteranceIds")
                            or item.get("utterance_ids")
                            or item.get("utteranceIds")
                            or []
                        )
                        if _safe_text(utterance_id)
                    ],
                    limit=40,
                )
            else:
                continue
            if not text and not title:
                continue
            normalized_items.append(
                {
                    "id": _safe_text(item.get("id")) if isinstance(item, dict) else f"demo-main-{choice}-{index + 1}",
                    "title": _truncate_text(title or text, 80),
                    "text": _truncate_text(text or title, 220),
                    "keywords": keywords,
                    "evidence_utterance_ids": evidence_ids,
                }
            )
            if len(normalized_items) >= 8:
                break
        output[choice] = normalized_items
    return output


DEMO_BALANCE_CARD_FILLER_WORDS = {
    "아니",
    "근데",
    "그냥",
    "너무",
    "약간",
    "진짜",
    "뭐",
    "그쵸",
    "그렇죠",
    "때문",
    "때문에",
    "음",
    "어",
    "저는",
    "제가",
}


def _demo_balance_clean_card_phrase(raw: Any) -> str:
    text = re.sub(r"\s+", " ", _safe_text(raw)).strip()
    if not text:
        return ""
    text = re.sub(r"[\"'“”‘’`]", "", text)
    text = re.sub(r"\b([ABab])\s*(선택|고름|고를게|갈게|쪽|번)?\b", "", text).strip()
    words = [word for word in text.split(" ") if word]
    compact_words: list[str] = []
    previous = ""
    for word in words:
        normalized = re.sub(r"[^\w가-힣]", "", word).lower()
        if not normalized or normalized in DEMO_BALANCE_CARD_FILLER_WORDS:
            continue
        if normalized == previous:
            continue
        compact_words.append(word.strip(" ,.!?;:·"))
        previous = normalized
    compact = " ".join(word for word in compact_words if word)
    compact = re.sub(r"\s+", " ", compact).strip(" ,.!?;:·")
    return _truncate_text(compact, 96)


def _demo_balance_choice_option_label(choice: str, demo_config: dict[str, Any]) -> str:
    normalized_choice = _safe_text(choice).lower()
    if normalized_choice == "a":
        return _safe_text(demo_config.get("option_a"), "A")
    if normalized_choice == "b":
        return _safe_text(demo_config.get("option_b"), "B")
    return ""


def _demo_balance_card_summary_text(raw: Any, choice: str = "", demo_config: dict[str, Any] | None = None) -> str:
    normalized_demo_config = _normalize_canvas_demo_config(demo_config or {})
    compact = _demo_balance_clean_card_phrase(raw)
    if not compact:
        return "선택 근거를 짧게 정리할 추가 발화가 필요합니다."
    option_label = _demo_balance_choice_option_label(choice, normalized_demo_config)
    if option_label:
        return _truncate_text(f"{option_label}을 선택한 근거로 {compact}을 중심으로 의견이 정리되었습니다.", 180)
    return _truncate_text(f"{compact}을 중심으로 의견이 정리되었습니다.", 180)


def _demo_balance_card_summary_title(
    raw: Any,
    choice: str = "",
    demo_config: dict[str, Any] | None = None,
    index: int = 1,
) -> str:
    option_label = _demo_balance_choice_option_label(choice, _normalize_canvas_demo_config(demo_config or {}))
    if option_label:
        return _truncate_text(f"{option_label} 선택 근거 {max(1, index)}", 56)
    compact = _demo_balance_clean_card_phrase(raw)
    return _truncate_text(compact or f"대표 의견 {max(1, index)}", 56)


def _demo_balance_text_needs_card_summarization(raw: Any) -> bool:
    text = _safe_text(raw)
    if len(text) > 90:
        return True
    normalized = re.sub(r"[^\w가-힣\s]", " ", text).lower()
    words = [word for word in normalized.split() if word]
    if any(word in DEMO_BALANCE_CARD_FILLER_WORDS for word in words):
        return True
    return any(words[index] == words[index - 1] for index in range(1, len(words)))


def _sanitize_demo_balance_main_opinion_cards(
    main_opinions: dict[str, list[dict[str, Any]]],
    demo_config: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    sanitized: dict[str, list[dict[str, Any]]] = {"a": [], "b": []}
    for choice in ("a", "b"):
        for index, item in enumerate(main_opinions.get(choice) or [], start=1):
            if not isinstance(item, dict):
                continue
            raw_text = _safe_text(item.get("text") or item.get("title"))
            raw_title = _safe_text(item.get("title"))
            next_text = (
                _demo_balance_card_summary_text(raw_text, choice, demo_config)
                if _demo_balance_text_needs_card_summarization(raw_text)
                else _truncate_text(raw_text, 220)
            )
            next_title = raw_title
            if not next_title or next_title == raw_text or len(next_title) > 42 or _demo_balance_text_needs_card_summarization(next_title):
                next_title = _demo_balance_card_summary_title(raw_text, choice, demo_config, index)
            sanitized[choice].append(
                {
                    **item,
                    "title": _truncate_text(next_title, 80),
                    "text": _truncate_text(next_text, 220),
                }
            )
    return sanitized


def _build_demo_balance_main_opinions_from_opinions(
    opinions: list[dict[str, Any]],
    *,
    limit_per_choice: int = 6,
    demo_config: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    output: dict[str, list[dict[str, Any]]] = {"a": [], "b": []}
    normalized_demo_config = _normalize_canvas_demo_config(demo_config or {})
    for choice in ("a", "b"):
        seen_texts: set[str] = set()
        for opinion in opinions:
            if not opinion.get("valid") or opinion.get("choice") != choice:
                continue
            text = _safe_text(opinion.get("text") or opinion.get("reason_summary"))
            if not text:
                continue
            summary_text = _demo_balance_card_summary_text(text, choice, normalized_demo_config)
            text_key = _safe_text(re.sub(r"\s+", " ", summary_text).lower())
            if text_key in seen_texts:
                continue
            seen_texts.add(text_key)
            output[choice].append(
                {
                    "id": f"demo-main-{choice}-{len(output[choice]) + 1}",
                    "title": _demo_balance_card_summary_title(text, choice, normalized_demo_config, len(output[choice]) + 1),
                    "text": _truncate_text(summary_text, 220),
                    "keywords": opinion.get("keywords") if isinstance(opinion.get("keywords"), list) else [],
                    "evidence_utterance_ids": [_safe_text(opinion.get("utterance_id"))],
                }
            )
            if len(output[choice]) >= limit_per_choice:
                break
    return output


def _normalize_canvas_demo_balance_classification(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "version": 1,
            "mode": "demo_balance",
            "option_a": "",
            "option_b": "",
            "classified_at": "",
            "source_signature": "",
            "valid_a_count": 0,
            "valid_b_count": 0,
            "unclassified_count": 0,
            "opinions": [],
            "summary": {},
            "main_opinions": {"a": [], "b": []},
        }

    opinions: list[dict[str, Any]] = []
    for index, item in enumerate(raw.get("opinions") or []):
        if not isinstance(item, dict):
            continue
        choice = _safe_text(item.get("choice")).lower()
        if choice not in {"a", "b"}:
            choice = "unclassified"
        utterance_id = _safe_text(item.get("utterance_id") or item.get("utteranceId") or item.get("id"))
        valid = choice in {"a", "b"} and item.get("valid") is not False
        confidence = max(0.0, min(1.0, _safe_float(item.get("confidence"), 0.0)))
        opinions.append(
            {
                "id": _safe_text(item.get("id")) or f"demo-opinion-{index + 1}",
                "utterance_id": utterance_id,
                "choice": choice if valid else "unclassified",
                "valid": valid,
                "confidence": confidence,
                "reason_summary": _truncate_text(_safe_text(item.get("reason_summary") or item.get("reasonSummary")), 260),
                "keywords": _dedup_preserve(
                    [_truncate_text(_safe_text(keyword), 40) for keyword in (item.get("keywords") or []) if _safe_text(keyword)],
                    limit=8,
                ),
                "text": _truncate_text(_safe_text(item.get("text")), 360),
            }
        )

    valid_a_count = sum(1 for item in opinions if item.get("valid") and item.get("choice") == "a")
    valid_b_count = sum(1 for item in opinions if item.get("valid") and item.get("choice") == "b")
    unclassified_count = sum(1 for item in opinions if not item.get("valid") or item.get("choice") not in {"a", "b"})
    summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    return {
        "version": _safe_nonnegative_int(raw.get("version"), 1) or 1,
        "mode": "demo_balance",
        "option_a": _truncate_text(_safe_text(raw.get("option_a") or raw.get("optionA")), 120),
        "option_b": _truncate_text(_safe_text(raw.get("option_b") or raw.get("optionB")), 120),
        "classified_at": _safe_text(raw.get("classified_at") or raw.get("classifiedAt")),
        "source_signature": _safe_text(raw.get("source_signature") or raw.get("sourceSignature")),
        "valid_a_count": valid_a_count,
        "valid_b_count": valid_b_count,
        "unclassified_count": unclassified_count,
        "opinions": opinions,
        "summary": {
            "option_a_summary": _truncate_text(_safe_text(summary.get("option_a_summary") or summary.get("optionASummary")), 420),
            "option_b_summary": _truncate_text(_safe_text(summary.get("option_b_summary") or summary.get("optionBSummary")), 420),
            "unclassified_summary": _truncate_text(_safe_text(summary.get("unclassified_summary") or summary.get("unclassifiedSummary")), 420),
        },
        "main_opinions": _normalize_demo_balance_main_opinions(
            raw.get("main_opinions") or raw.get("mainOpinions") or {}
        ),
    }


def _workspace_payload_from_runtime_workspace(workspace: dict[str, Any]) -> dict[str, Any]:
    demo_config = _normalize_canvas_demo_config(workspace.get("demo_config"))
    ideation_bubble_graph = _normalize_canvas_ideation_bubble_graph(
        workspace.get("ideation_bubble_graph")
    )
    _ensure_demo_balance_anchor_bubbles(ideation_bubble_graph, demo_config)
    return {
        "meeting_goal": _safe_text(workspace.get("meeting_goal")),
        "meeting_goal_context": _safe_text(workspace.get("meeting_goal_context")),
        "demo_config": demo_config,
        "demo_balance_classification": _normalize_canvas_demo_balance_classification(workspace.get("demo_balance_classification")),
        "stage": _normalize_canvas_stage(workspace.get("stage")),
        "agenda_overrides": _normalize_canvas_agenda_overrides(workspace.get("agenda_overrides")),
        "canvas_items": copy.deepcopy(workspace.get("canvas_items") or []),
        "custom_groups": copy.deepcopy(workspace.get("custom_groups") or []),
        "problem_groups": copy.deepcopy(workspace.get("problem_groups") or []),
        "problem_structure": _normalize_canvas_problem_structure_state(workspace.get("problem_structure")),
        "solution_topics": copy.deepcopy(workspace.get("solution_topics") or []),
        "final_solution_summary": _normalize_canvas_final_solution_summary(
            workspace.get("final_solution_summary")
        ),
        "node_positions": _normalize_canvas_node_positions(workspace.get("node_positions") or {}),
        "artifact_generation": _normalize_canvas_artifact_generation(
            workspace.get("artifact_generation") or {}
        ),
        "ideation_bubble_graph": ideation_bubble_graph,
        "idea_create_stack": _safe_nonnegative_int(workspace.get("idea_create_stack")),
        "idea_processed_utterance_ids": [
            _safe_text(item)
            for item in (workspace.get("idea_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "problem_processed_utterance_ids": [
            _safe_text(item)
            for item in (workspace.get("problem_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "imported_state": copy.deepcopy(workspace.get("imported_state"))
        if isinstance(workspace.get("imported_state"), dict)
        else None,
        "final_report_share_token": _safe_text(workspace.get("final_report_share_token")),
        "final_report_share_created_at": _safe_text(workspace.get("final_report_share_created_at")),
        "saved_at": _safe_text(workspace.get("saved_at")),
    }


def _workspace_from_storage_row(meeting_id: str, row: dict[str, Any]) -> dict[str, Any]:
    shared_state = row.get("shared_state")
    if not isinstance(shared_state, dict):
        shared_state = {}
    llm_cache = row.get("llm_cache")
    if not isinstance(llm_cache, dict):
        llm_cache = {}

    return {
        "meeting_id": _safe_text(meeting_id),
        "meeting_goal": _safe_text(shared_state.get("meeting_goal")),
        "meeting_goal_context": _safe_text(shared_state.get("meeting_goal_context")),
        "demo_config": _normalize_canvas_demo_config(shared_state.get("demo_config")),
        "demo_balance_classification": _normalize_canvas_demo_balance_classification(shared_state.get("demo_balance_classification")),
        "stage": _normalize_canvas_stage(shared_state.get("stage")),
        "agenda_overrides": _normalize_canvas_agenda_overrides(shared_state.get("agenda_overrides")),
        "canvas_items": copy.deepcopy(shared_state.get("canvas_items") or []),
        "custom_groups": copy.deepcopy(shared_state.get("custom_groups") or []),
        "problem_groups": copy.deepcopy(shared_state.get("problem_groups") or []),
        "problem_structure": _normalize_canvas_problem_structure_state(shared_state.get("problem_structure")),
        "solution_topics": copy.deepcopy(shared_state.get("solution_topics") or []),
        "final_solution_summary": _normalize_canvas_final_solution_summary(
            shared_state.get("final_solution_summary")
        ),
        "node_positions": _normalize_canvas_node_positions(shared_state.get("node_positions") or {}),
        "artifact_generation": _normalize_canvas_artifact_generation(
            shared_state.get("artifact_generation") or {}
        ),
        "ideation_bubble_graph": _normalize_canvas_ideation_bubble_graph(
            shared_state.get("ideation_bubble_graph")
        ),
        "idea_create_stack": _safe_nonnegative_int(shared_state.get("idea_create_stack")),
        "idea_processed_utterance_ids": [
            _safe_text(item)
            for item in (shared_state.get("idea_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "problem_processed_utterance_ids": [
            _safe_text(item)
            for item in (shared_state.get("problem_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "imported_state": copy.deepcopy(shared_state.get("imported_state"))
        if isinstance(shared_state.get("imported_state"), dict)
        else None,
        "final_report_share_token": _safe_text(shared_state.get("final_report_share_token")),
        "final_report_share_created_at": _safe_text(shared_state.get("final_report_share_created_at")),
        "saved_at": _safe_text(shared_state.get("saved_at") or row.get("updated_at")),
        "llm_cache": copy.deepcopy(llm_cache),
    }


def _normalize_canvas_problem_structure_state(raw: Any) -> dict[str, Any]:
    if hasattr(raw, "model_dump"):
        try:
            raw = raw.model_dump()
        except Exception:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}

    phase = _safe_text(raw.get("phase"), "explore")
    if phase not in {"explore", "structure"}:
        phase = "explore"
    method = _normalize_problem_structure_method(raw.get("method"))
    mode = _safe_text(raw.get("mode"))
    if mode not in {"", "manual", "ai"}:
        mode = ""

    nodes: list[dict[str, Any]] = []
    valid_node_ids: set[str] = set()
    for index, node in enumerate(raw.get("nodes") or []):
        if hasattr(node, "model_dump"):
            try:
                node = node.model_dump()
            except Exception:
                node = {}
        if not isinstance(node, dict):
            continue
        node_id = _safe_text(node.get("id")) or f"structure-node-{index + 1}"
        title = _safe_text(node.get("title"))
        body = _safe_text(node.get("body"))
        if not title and not body:
            continue
        payload = {
            "id": node_id,
            "source_group_id": _safe_text(node.get("source_group_id") or node.get("sourceGroupId")),
            "title": title or "문제정의 노드",
            "body": body,
            "status": _safe_text(node.get("status"), "draft"),
            "depth": _safe_nonnegative_int(node.get("depth")),
        }
        nodes.append(payload)
        valid_node_ids.add(node_id)
        if len(nodes) >= 120:
            break

    groups: list[dict[str, Any]] = []
    used_group_ids: set[str] = set()
    for index, group in enumerate(raw.get("groups") or []):
        if hasattr(group, "model_dump"):
            try:
                group = group.model_dump()
            except Exception:
                group = {}
        if not isinstance(group, dict):
            continue
        group_id_base = _safe_text(group.get("id")) or f"structure-group-{index + 1}"
        group_id = group_id_base
        suffix = 2
        while group_id in used_group_ids:
            group_id = f"{group_id_base}-{suffix}"
            suffix += 1
        node_ids = [
            _safe_text(item)
            for item in (group.get("node_ids") or group.get("nodeIds") or [])
            if _safe_text(item) and (not valid_node_ids or _safe_text(item) in valid_node_ids)
        ][:120]
        title = _safe_text(group.get("title"))
        if not title and not node_ids:
            continue
        created_by = _safe_text(group.get("created_by") or group.get("createdBy"), "user")
        if created_by not in {"ai", "user"}:
            created_by = "user"
        status = _safe_text(group.get("status"), "draft")
        if status not in {"draft", "review", "final"}:
            status = "draft"
        used_group_ids.add(group_id)
        groups.append(
            {
                "id": group_id,
                "title": title or f"구조화 그룹 {index + 1}",
                "node_ids": node_ids,
                "rationale": _safe_text(group.get("rationale")),
                "status": status,
                "created_by": created_by,
            }
        )
        if len(groups) >= 80:
            break

    if not nodes and not groups:
        phase = "explore"

    return {
        "phase": phase,
        "method": method,
        "mode": mode,
        "revision": _safe_nonnegative_int(raw.get("revision")),
        "source_generation_id": _safe_text(raw.get("source_generation_id") or raw.get("sourceGenerationId")),
        "based_on_transcript_revision": _safe_nonnegative_int(
            raw.get("based_on_transcript_revision") or raw.get("basedOnTranscriptRevision")
        ),
        "updated_at": _safe_text(raw.get("updated_at") or raw.get("updatedAt")),
        "nodes": nodes,
        "groups": groups,
    }


def _normalize_canvas_workspace_problem_groups(
    groups: list[CanvasWorkspaceProblemGroupInput] | None,
) -> list[dict[str, Any]]:
    return [
        {
            "group_id": _safe_text(group.group_id),
            "parent_group_id": _safe_text(group.parent_group_id),
            "depth": _safe_nonnegative_int(group.depth),
            "topic": _safe_text(group.topic),
            "insight_lens": _safe_text(group.insight_lens),
            "insight_user_edited": bool(group.insight_user_edited),
            "keywords": [_safe_text(item) for item in (group.keywords or []) if _safe_text(item)],
            "agenda_ids": [_safe_text(item) for item in (group.agenda_ids or []) if _safe_text(item)],
            "agenda_titles": [_safe_text(item) for item in (group.agenda_titles or []) if _safe_text(item)],
            "ideas": [
                {
                    "id": _safe_text(idea.id),
                    "kind": _safe_text(idea.kind, "note"),
                    "title": _safe_text(idea.title),
                    "body": _safe_text(idea.body),
                }
                for idea in (group.ideas or [])
                if _safe_text(idea.id) or _safe_text(idea.title) or _safe_text(idea.body)
            ],
            "discussion_items": [
                {
                    "id": _safe_text(item.id),
                    "parent_group_id": _safe_text(item.parent_group_id or group.group_id),
                    "target_node_id": _safe_text(item.target_node_id),
                    "target_node_label": _safe_text(item.target_node_label),
                    "target_node_kind": _safe_text(item.target_node_kind),
                    "title": _safe_text(item.title),
                    "body": _safe_text(item.body),
                    "keywords": [_safe_text(value) for value in (item.keywords or []) if _safe_text(value)][:8],
                    "key_evidence": [_safe_text(value) for value in (item.key_evidence or []) if _safe_text(value)][:8],
                    "refined_utterances": [
                        {
                            "utterance_id": _safe_text(value.utterance_id),
                            "speaker": _safe_text(value.speaker, "참가자"),
                            "text": _safe_text(value.text),
                            "timestamp": _safe_text(value.timestamp),
                        }
                        for value in (item.refined_utterances or [])
                        if _safe_text(value.text)
                    ],
                    "evidence_utterance_ids": [
                        _safe_text(value) for value in (item.evidence_utterance_ids or []) if _safe_text(value)
                    ][:400],
                    "ignored_utterance_ids": [
                        _safe_text(value) for value in (item.ignored_utterance_ids or []) if _safe_text(value)
                    ][:400],
                    "ai_pending": bool(item.ai_pending),
                    "ai_generated": bool(item.ai_generated),
                    "user_edited": bool(item.user_edited),
                    "created_by": _safe_text(item.created_by),
                    "created_at": _safe_text(item.created_at),
                }
                for item in (group.discussion_items or [])
                if _safe_text(item.id) or _safe_text(item.title) or _safe_text(item.body)
            ],
            "linked_group_ids": [
                _safe_text(item)
                for item in (group.linked_group_ids or [])
                if _safe_text(item) and _safe_text(item) != _safe_text(group.group_id)
            ],
            "evidence_utterance_ids": [
                _safe_text(item) for item in (group.evidence_utterance_ids or []) if _safe_text(item)
            ][:400],
            "source_summary_items": [
                _safe_text(item) for item in (group.source_summary_items or []) if _safe_text(item)
            ],
            "conclusion": _safe_text(group.conclusion),
            "conclusion_user_edited": bool(group.conclusion_user_edited),
            "status": _safe_text(group.status, "draft"),
            "source_signature": _safe_text(group.source_signature),
            "source_agenda_signatures": {
                _safe_text(key): _safe_text(value)
                for key, value in (group.source_agenda_signatures or {}).items()
                if _safe_text(key) and _safe_text(value)
            },
        }
        for group in (groups or [])
        if _safe_text(group.group_id) and _safe_text(group.topic)
    ]


def _normalize_canvas_workspace_solution_topics(
    topics: list[CanvasWorkspaceSolutionTopicInput] | None,
) -> list[dict[str, Any]]:
    return [
        {
            "group_id": _safe_text(topic.group_id),
            "topic_no": int(topic.topic_no or 0),
            "topic": _safe_text(topic.topic),
            "conclusion": _safe_text(topic.conclusion),
            "ideas": [_safe_text(item) for item in (topic.ideas or []) if _safe_text(item)],
            "status": _safe_text(topic.status, "draft"),
            "problem_topic": _safe_text(topic.problem_topic),
            "problem_insight": _safe_text(topic.problem_insight),
            "problem_conclusion": _safe_text(topic.problem_conclusion),
            "problem_keywords": [_safe_text(item) for item in (topic.problem_keywords or []) if _safe_text(item)],
            "agenda_titles": [_safe_text(item) for item in (topic.agenda_titles or []) if _safe_text(item)],
            "ai_suggestions": [
                {
                    "id": _safe_text(item.get("id")),
                    "text": _safe_text(item.get("text")),
                    "status": _safe_text(item.get("status"), "draft"),
                }
                for item in (topic.ai_suggestions or [])
                if isinstance(item, dict) and (_safe_text(item.get("id")) or _safe_text(item.get("text")))
            ],
            "notes": [
                {
                    "id": _safe_text(item.get("id")),
                    "text": _safe_text(item.get("text")),
                    "source": _safe_text(item.get("source"), "user"),
                    "source_ai_id": _safe_text(item.get("source_ai_id")),
                    "is_final_candidate": bool(item.get("is_final_candidate")),
                    "final_comment": _safe_text(item.get("final_comment")),
                }
                for item in (topic.notes or [])
                if isinstance(item, dict) and (_safe_text(item.get("id")) or _safe_text(item.get("text")))
            ],
        }
        for topic in (topics or [])
        if _safe_text(topic.group_id) and _safe_text(topic.topic)
    ]


def _normalize_canvas_final_solution_summary(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "final_count": 0,
            "topics": [],
            "items": [],
            "markdown": "",
            "document_blocks": [],
            "document_status": "empty",
            "revision": 0,
            "source_generation_id": "",
            "based_on_transcript_revision": 0,
            "updated_at": "",
            "sections": [],
            "structured": {
                "meeting_overview": "",
                "attendee_summary": "",
                "key_summary": "",
                "idea_groups": [],
                "discussion_flows": [],
                "flow_sections": [],
                "pending_items": [],
                "conclusion": {"title": "", "summary": "", "groups": []},
            },
        }

    def normalize_item(item: Any) -> dict[str, Any] | None:
        if not isinstance(item, dict):
            return None
        note_text = _safe_text(item.get("note_text") or item.get("text"))
        note_id = _safe_text(item.get("note_id") or item.get("id"))
        topic_id = _safe_text(item.get("topic_id") or item.get("topicId"))
        if not note_text and not note_id:
            return None
        return {
            "id": _safe_text(item.get("id") or f"{topic_id}::{note_id}"),
            "topic_id": topic_id,
            "topic_no": _safe_nonnegative_int(item.get("topic_no") or item.get("topicNo")),
            "topic_title": _safe_text(item.get("topic_title") or item.get("topicTitle")),
            "problem_topic": _safe_text(item.get("problem_topic") or item.get("problemTopic")),
            "problem_conclusion": _safe_text(item.get("problem_conclusion") or item.get("problemConclusion")),
            "solution_conclusion": _safe_text(item.get("solution_conclusion") or item.get("solutionConclusion")),
            "note_id": note_id,
            "note_text": note_text,
            "final_comment": _safe_text(item.get("final_comment") or item.get("finalComment")),
            "source": _safe_text(item.get("source"), "user"),
            "source_ai_id": _safe_text(item.get("source_ai_id") or item.get("sourceAiId")),
            "agenda_titles": [
                _safe_text(value)
                for value in (item.get("agenda_titles") or item.get("agendaTitles") or [])
                if _safe_text(value)
            ][:30],
        }

    topics: list[dict[str, Any]] = []
    flat_items: list[dict[str, Any]] = []
    for topic in raw.get("topics") or []:
        if not isinstance(topic, dict):
            continue
        final_notes = [
            normalized
            for normalized in (normalize_item(item) for item in (topic.get("final_notes") or topic.get("finalNotes") or []))
            if normalized
        ]
        topic_id = _safe_text(topic.get("topic_id") or topic.get("topicId"))
        topic_payload = {
            "topic_id": topic_id,
            "topic_no": _safe_nonnegative_int(topic.get("topic_no") or topic.get("topicNo")),
            "topic_title": _safe_text(topic.get("topic_title") or topic.get("topicTitle")),
            "problem_topic": _safe_text(topic.get("problem_topic") or topic.get("problemTopic")),
            "solution_conclusion": _safe_text(topic.get("solution_conclusion") or topic.get("solutionConclusion")),
            "final_notes": final_notes,
        }
        if final_notes or topic_payload["topic_title"]:
            topics.append(topic_payload)
            flat_items.extend(final_notes)

    explicit_items = [
        normalized
        for normalized in (normalize_item(item) for item in (raw.get("items") or []))
        if normalized
    ]
    items = explicit_items or flat_items
    sections: list[dict[str, Any]] = []
    for section in raw.get("sections") or []:
        if not isinstance(section, dict):
            continue
        title = _safe_text(section.get("title"))
        group_id = _safe_text(section.get("group_id") or section.get("groupId"))
        if not title and not group_id:
            continue
        status = _safe_text(section.get("status"), "draft")
        if status not in {"draft", "review", "final"}:
            status = "draft"
        evidence: list[dict[str, str]] = []
        for item in section.get("evidence") or []:
            if not isinstance(item, dict):
                continue
            text = _safe_text(item.get("text") or item.get("quote"))
            if not text:
                continue
            evidence.append(
                {
                    "utterance_id": _safe_text(item.get("utterance_id") or item.get("utteranceId") or item.get("id")),
                    "speaker": _safe_text(item.get("speaker"), "참가자"),
                    "timestamp": _safe_text(item.get("timestamp")),
                    "text": text,
                }
            )
            if len(evidence) >= 8:
                break
        sections.append(
            {
                "group_id": group_id,
                "title": title or "요약 그룹",
                "status": status,
                "status_label": _safe_text(section.get("status_label") or section.get("statusLabel"), "검토 중" if status == "review" else "확정" if status == "final" else "초안"),
                "rationale": _safe_text(section.get("rationale")),
                "node_titles": [
                    _safe_text(value)
                    for value in (section.get("node_titles") or section.get("nodeTitles") or [])
                    if _safe_text(value)
                ][:40],
                "evidence": evidence,
            }
        )
        if len(sections) >= 40:
            break

    raw_markdown = _safe_text(raw.get("markdown"))
    document_status = _safe_text(raw.get("document_status") or raw.get("documentStatus"), "ready" if raw_markdown else "empty")
    if document_status not in {"empty", "ready", "edited"}:
        document_status = "ready" if raw_markdown else "empty"
    revision = _safe_nonnegative_int(raw.get("revision"))
    source_generation_id = _safe_text(raw.get("source_generation_id") or raw.get("sourceGenerationId"))
    based_on_transcript_revision = _safe_nonnegative_int(
        raw.get("based_on_transcript_revision") or raw.get("basedOnTranscriptRevision")
    )
    updated_at = _safe_text(raw.get("updated_at") or raw.get("updatedAt"))
    structured_fallback = {
        "meeting_overview": "",
        "attendee_summary": "",
        "key_summary": "",
        "idea_groups": [
            {
                "group_id": section.get("group_id", ""),
                "title": section.get("title", "주요 아이디어"),
                "items": section.get("node_titles", []),
            }
            for section in sections
        ],
        "discussion_flows": [
            {
                "group_id": section.get("group_id", ""),
                "title": section.get("title", "논의 흐름"),
                "opinions": [
                    {"label": f"{chr(65 + index)} 의견", "text": item.get("text", "")}
                    for index, item in enumerate(section.get("evidence", [])[:2])
                    if isinstance(item, dict) and _safe_text(item.get("text"))
                ],
                "conclusion": _safe_text(section.get("rationale")),
            }
            for section in sections
        ],
        "flow_sections": [
            {
                "section_id": f"flow-{index + 1}",
                "group_id": section.get("group_id", ""),
                "title": section.get("title", "논의 흐름"),
                "time_range": "",
                "trigger": _safe_text(section.get("rationale")),
                "narrative": " ".join(_safe_text(value) for value in (section.get("node_titles") or [])[:3] if _safe_text(value)),
                "key_points": section.get("node_titles", [])[:6],
                "opinions": [
                    {"label": f"{chr(65 + item_index)} 의견", "text": item.get("text", "")}
                    for item_index, item in enumerate(section.get("evidence", [])[:2])
                    if isinstance(item, dict) and _safe_text(item.get("text"))
                ],
                "settlement": _safe_text(section.get("rationale")),
                "open_questions": [] if section.get("status") == "final" else [_safe_text(section.get("title", "추가 확인"))],
            }
            for index, section in enumerate(sections)
        ],
        "pending_items": [],
        "conclusion": {
            "title": "",
            "summary": "",
            "groups": [
                {
                    "group_id": section.get("group_id", ""),
                    "title": section.get("title", "정리 항목"),
                    "status": section.get("status", "draft"),
                    "status_label": section.get("status_label", ""),
                    "bullets": section.get("node_titles", []),
                }
                for section in sections
            ],
        },
    }

    structured = _normalize_summary_structured_document(
        raw.get("structured") or raw.get("structured_summary") or raw.get("structuredSummary"),
        structured_fallback,
    )
    document_blocks = _normalize_summary_document_blocks(
        raw.get("document_blocks") or raw.get("documentBlocks"),
        structured,
        raw_markdown,
    )
    markdown = raw_markdown or _summary_document_blocks_to_markdown(document_blocks)
    if document_status == "empty" and (markdown or document_blocks):
        document_status = "ready"

    return {
        "final_count": max(len(items), len(sections)),
        "topics": topics,
        "items": items,
        "markdown": markdown,
        "document_blocks": document_blocks,
        "document_status": document_status,
        "revision": revision,
        "source_generation_id": source_generation_id,
        "based_on_transcript_revision": based_on_transcript_revision,
        "updated_at": updated_at,
        "generated_at": _safe_text(raw.get("generated_at") or raw.get("generatedAt")),
        "used_llm": bool(raw.get("used_llm") or raw.get("usedLlm")),
        "warning": _safe_text(raw.get("warning")),
        "source_signature": _safe_text(raw.get("source_signature") or raw.get("sourceSignature")),
        "sections": sections,
        "structured": structured,
    }


def _normalize_refined_utterances(
    raw_rows: Any,
    limit: int = 120,
    allowed_ids: set[str] | None = None,
    min_relevance_score: float | None = None,
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()

    for idx, raw in enumerate(raw_rows or []):
        if isinstance(raw, dict):
            utterance_id = _safe_text(raw.get("utterance_id") or raw.get("utteranceId") or raw.get("id"))
            speaker = _safe_text(raw.get("speaker"), "참가자")
            text = _strip_leading_timestamp(_safe_text(raw.get("text") or raw.get("refined_text") or raw.get("refinedText")))
            timestamp = _safe_text(raw.get("timestamp"))
            raw_score = raw.get("relevanceScore") or raw.get("relevance_score")
        else:
            utterance_id = _safe_text(
                getattr(raw, "utterance_id", "") or getattr(raw, "utteranceId", "") or getattr(raw, "id", "")
            )
            speaker = _safe_text(getattr(raw, "speaker", ""), "참가자")
            text = _strip_leading_timestamp(
                _safe_text(
                    getattr(raw, "text", "")
                    or getattr(raw, "refined_text", "")
                    or getattr(raw, "refinedText", "")
                )
            )
            timestamp = _safe_text(getattr(raw, "timestamp", ""))
            raw_score = getattr(raw, "relevanceScore", None) or getattr(raw, "relevance_score", None)

        if allowed_ids is not None and (not utterance_id or utterance_id not in allowed_ids):
            continue
        if min_relevance_score is not None:
            try:
                relevance_score = float(raw_score)
            except (TypeError, ValueError):
                relevance_score = 0.0
            if relevance_score < min_relevance_score:
                continue

        text = _to_summary_point(
            re.sub(r"\s+", " ", text).strip().strip(" .,!?:;/|"),
            max_len=72,
        )
        if not text:
            continue
        utterance_id = utterance_id or f"refined-{idx}"
        key = utterance_id or f"{speaker}:{text}"
        if key in seen:
            continue
        seen.add(key)
        normalized.append(
            {
                "utterance_id": utterance_id,
                "speaker": speaker,
                "text": text,
                "timestamp": timestamp,
            }
        )
        if len(normalized) >= limit:
            break

    return normalized


def _normalize_canvas_merged_children(raw_children: Any, limit: int = 80, depth: int = 0) -> list[dict[str, Any]]:
    if depth >= 4:
        return []

    normalized: list[dict[str, Any]] = []
    for raw in raw_children or []:
        if not isinstance(raw, dict):
            continue
        child_id = _safe_text(raw.get("id"))
        title = _safe_text(raw.get("title"))
        body = _safe_text(raw.get("body") or raw.get("summary"))
        if not child_id and not (title or body):
            continue
        child = {
            "id": child_id,
            "agenda_id": _safe_text(raw.get("agenda_id")),
            "point_id": _safe_text(raw.get("point_id")),
            "kind": _safe_text(raw.get("kind"), "note"),
            "status": _safe_text(raw.get("status"), "discussion"),
            "title": title,
            "body": body,
            "keywords": [_safe_text(keyword) for keyword in (raw.get("keywords") or []) if _safe_text(keyword)][:8],
            "key_evidence": [_safe_text(value) for value in (raw.get("key_evidence") or []) if _safe_text(value)][:8],
            "refined_utterances": _normalize_refined_utterances(raw.get("refined_utterances") or [], limit=40),
            "evidence_utterance_ids": [
                _safe_text(value) for value in (raw.get("evidence_utterance_ids") or []) if _safe_text(value)
            ][:400],
            "ignored_utterance_ids": [
                _safe_text(value) for value in (raw.get("ignored_utterance_ids") or []) if _safe_text(value)
            ][:400],
            "merged_children": _normalize_canvas_merged_children(raw.get("merged_children") or [], limit=40, depth=depth + 1),
            "compacted_from_ids": [
                _safe_text(value) for value in (raw.get("compacted_from_ids") or []) if _safe_text(value)
            ][:400],
            "compaction_level": _safe_nonnegative_int(raw.get("compaction_level")),
            "ai_generated": bool(raw.get("ai_generated")),
            "user_edited": bool(raw.get("user_edited")),
        }
        normalized.append(child)
        if len(normalized) >= limit:
            break

    return normalized


def _normalize_canvas_ideation_suggestions(raw_suggestions: Any, limit: int = 8) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for index, raw in enumerate(raw_suggestions or []):
        if hasattr(raw, "model_dump"):
            item = raw.model_dump()
        elif isinstance(raw, dict):
            item = raw
        else:
            continue
        text = _safe_text(item.get("text"))
        if not text:
            continue
        status = _safe_text(item.get("status"), "draft")
        if status not in {"draft", "selected", "dismissed"}:
            status = "draft"
        suggestion_id = _safe_text(item.get("id")) or f"ideation-suggestion-{index + 1}"
        normalized.append({
            "id": suggestion_id,
            "text": text,
            "status": status,
        })
        if len(normalized) >= limit:
            break
    return normalized


def _normalize_canvas_workspace_items(
    items: list[CanvasWorkspaceCanvasItemInput] | None,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for item in (items or []):
        item_id = _safe_text(item.id)
        if not item_id or not (_safe_text(item.title) or _safe_text(item.body)):
            continue

        payload: dict[str, Any] = {
            "id": item_id,
            "agenda_id": _safe_text(item.agenda_id),
            "point_id": _safe_text(item.point_id),
            "kind": _safe_text(item.kind, "note"),
            "status": _safe_text(item.status, "discussion"),
            "title": _safe_text(item.title),
            "body": _safe_text(item.body),
            "keywords": [_safe_text(keyword) for keyword in (item.keywords or []) if _safe_text(keyword)][:8],
            "key_evidence": [_safe_text(value) for value in (item.key_evidence or []) if _safe_text(value)][:6],
            "refined_utterances": _normalize_refined_utterances(item.refined_utterances),
            "evidence_utterance_ids": [_safe_text(value) for value in (item.evidence_utterance_ids or []) if _safe_text(value)][:400],
            "ignored_utterance_ids": [_safe_text(value) for value in (item.ignored_utterance_ids or []) if _safe_text(value)][:400],
            "merged_children": _normalize_canvas_merged_children(item.merged_children),
            "compacted_from_ids": [_safe_text(value) for value in (item.compacted_from_ids or []) if _safe_text(value)][:400],
            "compaction_level": _safe_nonnegative_int(item.compaction_level),
            "parent_topic_id": _safe_text(item.parent_topic_id),
            "parent_topic_source": _safe_text(item.parent_topic_source)
            if _safe_text(item.parent_topic_source) in {"ai", "user"}
            else "",
            "parent_topic_locked": bool(item.parent_topic_locked),
            "child_item_ids": [_safe_text(value) for value in (item.child_item_ids or []) if _safe_text(value)][:400],
            "topic_collapsed": bool(item.topic_collapsed),
            "created_by": _safe_text(item.created_by) if _safe_text(item.created_by) in {"ai", "user"} else "",
            "manual_position": False,
            "ai_generated": bool(item.ai_generated),
            "user_edited": bool(item.user_edited),
            "ai_pending": bool(getattr(item, "ai_pending", False)),
            "ai_suggestions": _normalize_canvas_ideation_suggestions(item.ai_suggestions),
        }

        normalized.append(payload)

    return normalized


def _normalize_canvas_custom_groups(groups: Any) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for group in (groups or []):
        if hasattr(group, "model_dump"):
            raw_group = group.model_dump()
        elif isinstance(group, dict):
            raw_group = group
        else:
            continue

        group_id = _safe_text(raw_group.get("id"))
        title = _safe_text(raw_group.get("title"))
        if not group_id or not title:
            continue

        normalized.append(
            {
                "id": group_id,
                "title": title,
                "description": _safe_text(raw_group.get("description")),
                "keywords": [
                    _safe_text(keyword)
                    for keyword in (raw_group.get("keywords") or [])
                    if _safe_text(keyword)
                ][:8],
                "color": _safe_text(raw_group.get("color")),
                "created_by": _safe_text(raw_group.get("created_by")),
                "created_at": _safe_text(raw_group.get("created_at")),
            }
        )

    return normalized


def _normalize_canvas_agenda_overrides(
    overrides: Any,
) -> dict[str, dict[str, Any]]:
    normalized: dict[str, dict[str, Any]] = {}
    if not isinstance(overrides, dict):
        return normalized

    for raw_agenda_id, raw_override in overrides.items():
        agenda_id = _safe_text(raw_agenda_id)
        if not agenda_id or not isinstance(raw_override, dict):
            continue

        title = _safe_text(raw_override.get("title"))
        keywords = [_safe_text(item) for item in (raw_override.get("keywords") or []) if _safe_text(item)]
        summary_bullets = [
            _safe_text(item) for item in (raw_override.get("summaryBullets") or []) if _safe_text(item)
        ]

        if title or keywords or summary_bullets:
            normalized[agenda_id] = {
                "title": title,
                "keywords": keywords,
                "summaryBullets": summary_bullets,
            }

    return normalized


def _normalize_canvas_local_state(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    shared_sync_enabled = _boolify(payload.get("shared_sync_enabled"), True)
    normalized: dict[str, Any] = {
        "shared_sync_enabled": shared_sync_enabled,
        "meeting_goal": _safe_text(payload.get("meeting_goal")),
        "meeting_goal_context": _safe_text(payload.get("meeting_goal_context")),
        "demo_config": _normalize_canvas_demo_config(payload.get("demo_config")),
        "demo_balance_classification": _normalize_canvas_demo_balance_classification(payload.get("demo_balance_classification")),
        "agenda_overrides": _normalize_canvas_agenda_overrides(payload.get("agenda_overrides")),
        "canvas_items": copy.deepcopy(payload.get("canvas_items") or []),
        "custom_groups": _normalize_canvas_custom_groups(payload.get("custom_groups") or []),
    }

    if not shared_sync_enabled:
        normalized["stage"] = _normalize_canvas_stage(payload.get("stage"))
        normalized["problem_groups"] = copy.deepcopy(payload.get("problem_groups") or [])
        normalized["problem_structure"] = _normalize_canvas_problem_structure_state(payload.get("problem_structure"))
        normalized["solution_topics"] = copy.deepcopy(payload.get("solution_topics") or [])
        normalized["final_solution_summary"] = _normalize_canvas_final_solution_summary(
            payload.get("final_solution_summary")
        )
        normalized["node_positions"] = _normalize_canvas_node_positions(payload.get("node_positions") or {})
        normalized["artifact_generation"] = _normalize_canvas_artifact_generation(
            payload.get("artifact_generation") or {}
        )
        normalized["imported_state"] = (
            copy.deepcopy(payload.get("imported_state"))
            if isinstance(payload.get("imported_state"), dict)
            else None
        )
        normalized["import_override_active"] = bool(payload.get("import_override_active"))

    return normalized


def _clone_runtime_workspace_state(meeting_id: str, source: dict[str, Any], saved_at: str) -> dict[str, Any]:
    return {
        "meeting_id": _safe_text(meeting_id),
        "meeting_goal": _safe_text(source.get("meeting_goal")),
        "meeting_goal_context": _safe_text(source.get("meeting_goal_context")),
        "demo_config": _normalize_canvas_demo_config(source.get("demo_config")),
        "demo_balance_classification": _normalize_canvas_demo_balance_classification(source.get("demo_balance_classification")),
        "stage": _normalize_canvas_stage(source.get("stage")),
        "agenda_overrides": _normalize_canvas_agenda_overrides(source.get("agenda_overrides")),
        "canvas_items": copy.deepcopy(source.get("canvas_items") or []),
        "custom_groups": _normalize_canvas_custom_groups(source.get("custom_groups") or []),
        "problem_groups": copy.deepcopy(source.get("problem_groups") or []),
        "problem_structure": _normalize_canvas_problem_structure_state(source.get("problem_structure")),
        "solution_topics": copy.deepcopy(source.get("solution_topics") or []),
        "final_solution_summary": _normalize_canvas_final_solution_summary(source.get("final_solution_summary")),
        "node_positions": _normalize_canvas_node_positions(source.get("node_positions") or {}),
        "artifact_generation": _normalize_canvas_artifact_generation(source.get("artifact_generation") or {}),
        "ideation_bubble_graph": _normalize_canvas_ideation_bubble_graph(source.get("ideation_bubble_graph")),
        "idea_create_stack": _safe_nonnegative_int(source.get("idea_create_stack")),
        "idea_processed_utterance_ids": [
            _safe_text(item)
            for item in (source.get("idea_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "problem_processed_utterance_ids": [
            _safe_text(item)
            for item in (source.get("problem_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "imported_state": copy.deepcopy(source.get("imported_state"))
        if isinstance(source.get("imported_state"), dict)
        else None,
        "final_report_share_token": _safe_text(source.get("final_report_share_token")),
        "final_report_share_created_at": _safe_text(source.get("final_report_share_created_at")),
        "saved_at": _safe_text(saved_at),
        "llm_cache": copy.deepcopy(source.get("llm_cache") or {})
        if isinstance(source.get("llm_cache"), dict)
        else {},
    }


def _canvas_workspace_response(workspace: dict[str, Any]) -> dict[str, Any]:
    demo_config = _normalize_canvas_demo_config(workspace.get("demo_config"))
    ideation_bubble_graph = _normalize_canvas_ideation_bubble_graph(
        workspace.get("ideation_bubble_graph")
    )
    _ensure_demo_balance_anchor_bubbles(ideation_bubble_graph, demo_config)
    _ensure_ideation_bubble_graph_server_layout(ideation_bubble_graph)
    return {
        "ok": True,
        "meeting_id": _safe_text(workspace.get("meeting_id")),
        "meeting_goal": _safe_text(workspace.get("meeting_goal")),
        "meeting_goal_context": _safe_text(workspace.get("meeting_goal_context")),
        "demo_config": demo_config,
        "demo_balance_classification": _normalize_canvas_demo_balance_classification(workspace.get("demo_balance_classification")),
        "stage": _normalize_canvas_stage(workspace.get("stage")),
        "agenda_overrides": _normalize_canvas_agenda_overrides(workspace.get("agenda_overrides")),
        "canvas_items": copy.deepcopy(workspace.get("canvas_items") or []),
        "custom_groups": _normalize_canvas_custom_groups(workspace.get("custom_groups") or []),
        "problem_groups": copy.deepcopy(workspace.get("problem_groups") or []),
        "problem_structure": _normalize_canvas_problem_structure_state(workspace.get("problem_structure")),
        "solution_topics": copy.deepcopy(workspace.get("solution_topics") or []),
        "final_solution_summary": _normalize_canvas_final_solution_summary(
            workspace.get("final_solution_summary")
        ),
        "node_positions": _normalize_canvas_node_positions(workspace.get("node_positions") or {}),
        "artifact_generation": _normalize_canvas_artifact_generation(
            workspace.get("artifact_generation") or {}
        ),
        "ideation_bubble_graph": ideation_bubble_graph,
        "idea_create_stack": _safe_nonnegative_int(workspace.get("idea_create_stack")),
        "idea_processed_utterance_ids": [
            _safe_text(item)
            for item in (workspace.get("idea_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "problem_processed_utterance_ids": [
            _safe_text(item)
            for item in (workspace.get("problem_processed_utterance_ids") or [])
            if _safe_text(item)
        ][:1000],
        "imported_state": copy.deepcopy(workspace.get("imported_state"))
        if isinstance(workspace.get("imported_state"), dict)
        else None,
        "saved_at": _safe_text(workspace.get("saved_at")),
    }


def _canvas_final_report_has_content(summary: dict[str, Any]) -> bool:
    normalized = _normalize_canvas_final_solution_summary(summary)
    return bool(
        _safe_text(normalized.get("markdown")).strip()
        or int(normalized.get("final_count") or 0) > 0
        or normalized.get("document_blocks")
        or normalized.get("sections")
    )


def _load_canvas_workspace_from_db(meeting_id: str) -> dict[str, Any] | None:
    client = _get_supabase_service_client()
    normalized_meeting_id = _safe_text(meeting_id)
    if client is None or not normalized_meeting_id:
        return None
    if _runtime_db_table_is_disabled(RUNTIME_SHARED_STATE_TABLE):
        return None

    try:
        with _SUPABASE_REQUEST_LOCK:
            response = (
                client.table(RUNTIME_SHARED_STATE_TABLE)
                .select("meeting_id,shared_state,llm_cache,updated_at")
                .eq("meeting_id", normalized_meeting_id)
                .limit(1)
                .execute()
            )
        rows = response.data or []
        if not rows:
            return None
        first_row = rows[0] if isinstance(rows[0], dict) else {}
        if not isinstance(first_row, dict):
            return None
        return _workspace_from_storage_row(normalized_meeting_id, first_row)
    except Exception as exc:
        _handle_runtime_db_exception(RUNTIME_SHARED_STATE_TABLE, "load", exc)
        return None


def _save_canvas_workspace_to_db(meeting_id: str, workspace: dict[str, Any]) -> bool:
    client = _get_supabase_service_client()
    normalized_meeting_id = _safe_text(meeting_id)
    if client is None or not normalized_meeting_id:
        return False
    if _runtime_db_table_is_disabled(RUNTIME_SHARED_STATE_TABLE):
        return False

    try:
        with _SUPABASE_REQUEST_LOCK:
            client.table(RUNTIME_SHARED_STATE_TABLE).upsert(
                {
                    "meeting_id": normalized_meeting_id,
                    "shared_state": _workspace_payload_from_runtime_workspace(workspace),
                    "llm_cache": copy.deepcopy(workspace.get("llm_cache") or {}),
                    "updated_at": _utc_iso_now(),
                },
                on_conflict="meeting_id",
            ).execute()
        return True
    except Exception as exc:
        _handle_runtime_db_exception(RUNTIME_SHARED_STATE_TABLE, "save", exc)
        return False


def _load_canvas_personal_notes_from_db(
    meeting_id: str,
    user_id: str,
) -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None]:
    client = _get_supabase_service_client()
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_user_id = _safe_text(user_id)
    if client is None or not normalized_meeting_id or not normalized_user_id:
        return None, None
    if _runtime_db_table_is_disabled(RUNTIME_USER_STATE_TABLE):
        return None, None

    try:
        with _SUPABASE_REQUEST_LOCK:
            response = (
                client.table(RUNTIME_USER_STATE_TABLE)
                .select("meeting_id,user_id,personal_state,updated_at")
                .eq("meeting_id", normalized_meeting_id)
                .eq("user_id", normalized_user_id)
                .limit(1)
                .execute()
            )
        rows = response.data or []
        if not rows:
            return None, None
        first_row = rows[0] if isinstance(rows[0], dict) else {}
        if not isinstance(first_row, dict):
            return None, None
        personal_state = first_row.get("personal_state")
        if not isinstance(personal_state, dict):
            personal_state = {}
        notes = personal_state.get("personal_notes")
        if not isinstance(notes, list):
            notes = []
        local_canvas_state = personal_state.get("local_canvas_state")
        if not isinstance(local_canvas_state, dict):
            local_canvas_state = None
        return (
            copy.deepcopy([item for item in notes if isinstance(item, dict)]),
            copy.deepcopy(local_canvas_state) if isinstance(local_canvas_state, dict) else None,
        )
    except Exception as exc:
        _handle_runtime_db_exception(RUNTIME_USER_STATE_TABLE, "load", exc)
        return None, None


def _save_canvas_personal_notes_to_db(
    meeting_id: str,
    user_id: str,
    personal_notes: list[dict[str, Any]],
    local_canvas_state: dict[str, Any] | None = None,
) -> bool:
    client = _get_supabase_service_client()
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_user_id = _safe_text(user_id)
    if client is None or not normalized_meeting_id or not normalized_user_id:
        return False
    if _runtime_db_table_is_disabled(RUNTIME_USER_STATE_TABLE):
        return False

    try:
        with _SUPABASE_REQUEST_LOCK:
            client.table(RUNTIME_USER_STATE_TABLE).upsert(
                {
                    "meeting_id": normalized_meeting_id,
                    "user_id": normalized_user_id,
                    "personal_state": {
                        "personal_notes": copy.deepcopy(personal_notes or []),
                        "local_canvas_state": copy.deepcopy(local_canvas_state)
                        if isinstance(local_canvas_state, dict)
                        else {},
                    },
                    "updated_at": _utc_iso_now(),
                },
                on_conflict="meeting_id,user_id",
            ).execute()
        return True
    except Exception as exc:
        _handle_runtime_db_exception(RUNTIME_USER_STATE_TABLE, "save", exc)
        return False


def _warm_canvas_workspace_cache(rt: "RuntimeStore", meeting_id: str) -> dict[str, Any]:
    normalized_meeting_id = _safe_text(meeting_id)
    if not normalized_meeting_id:
        return {}

    with rt.lock:
        cached = copy.deepcopy(rt.canvas_workspace_by_meeting.get(normalized_meeting_id) or {})
        if cached:
            return cached

    loaded = _load_canvas_workspace_from_db(normalized_meeting_id)
    if loaded:
        with rt.lock:
            rt.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(loaded)
        return copy.deepcopy(loaded)

    with rt.lock:
        return copy.deepcopy(_ensure_canvas_workspace_entry(rt, normalized_meeting_id))


def _payload_to_primitive(payload: Any) -> Any:
    if hasattr(payload, "model_dump"):
        try:
            return payload.model_dump()
        except Exception:
            pass
    if hasattr(payload, "dict"):
        try:
            return payload.dict()
        except Exception:
            pass
    return payload


def _canvas_llm_signature(payload: Any) -> str:
    return json.dumps(
        _payload_to_primitive(payload),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _ensure_canvas_workspace_entry(rt: "RuntimeStore", meeting_id: str) -> dict[str, Any]:
    normalized_meeting_id = _safe_text(meeting_id)
    if not normalized_meeting_id:
        return {}

    workspace = rt.canvas_workspace_by_meeting.get(normalized_meeting_id)
    if not isinstance(workspace, dict):
        workspace = {}
    workspace.setdefault("meeting_id", normalized_meeting_id)
    workspace.setdefault("meeting_goal", "")
    workspace.setdefault("meeting_goal_context", "")
    workspace.setdefault("demo_config", _normalize_canvas_demo_config({}))
    workspace.setdefault("demo_balance_classification", _normalize_canvas_demo_balance_classification({}))
    workspace.setdefault("stage", "ideation")
    workspace.setdefault("agenda_overrides", {})
    workspace.setdefault("canvas_items", [])
    workspace.setdefault("custom_groups", [])
    workspace.setdefault("problem_groups", [])
    workspace.setdefault("problem_structure", _normalize_canvas_problem_structure_state({}))
    workspace.setdefault("solution_topics", [])
    workspace.setdefault("final_solution_summary", _normalize_canvas_final_solution_summary({}))
    workspace.setdefault("node_positions", {})
    workspace.setdefault("artifact_generation", {})
    workspace.setdefault("ideation_bubble_graph", _normalize_canvas_ideation_bubble_graph({}))
    workspace.setdefault("idea_create_stack", 0)
    workspace.setdefault("idea_processed_utterance_ids", [])
    workspace.setdefault("imported_state", None)
    workspace.setdefault("final_report_share_token", "")
    workspace.setdefault("final_report_share_created_at", "")
    workspace.setdefault("saved_at", "")
    workspace.setdefault("llm_cache", {})
    rt.canvas_workspace_by_meeting[normalized_meeting_id] = workspace
    return workspace


def _get_canvas_llm_cached_result(
    rt: "RuntimeStore",
    meeting_id: str,
    cache_key: str,
    signature: str,
) -> dict[str, Any] | None:
    workspace = _ensure_canvas_workspace_entry(rt, meeting_id)
    if not workspace:
        return None
    llm_cache = workspace.get("llm_cache")
    if not isinstance(llm_cache, dict):
        return None
    cached = llm_cache.get(cache_key)
    if not isinstance(cached, dict):
        return None
    if _safe_text(cached.get("signature")) != _safe_text(signature):
        return None
    result = cached.get("result")
    if not isinstance(result, dict):
        return None
    return copy.deepcopy(result)


def _set_canvas_llm_cached_result(
    rt: "RuntimeStore",
    meeting_id: str,
    cache_key: str,
    signature: str,
    result: dict[str, Any],
) -> None:
    workspace = _ensure_canvas_workspace_entry(rt, meeting_id)
    if not workspace:
        return
    llm_cache = workspace.get("llm_cache")
    if not isinstance(llm_cache, dict):
        llm_cache = {}
        workspace["llm_cache"] = llm_cache
    llm_cache[cache_key] = {
        "signature": _safe_text(signature),
        "generated_at": _now_ts(),
        "result": copy.deepcopy(result),
    }


def _reset_canvas_llm_cache_entries(
    rt: "RuntimeStore",
    meeting_id: str,
    workspace: dict[str, Any],
    prefixes: list[str] | None,
) -> list[str]:
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_prefixes = [_safe_text(prefix) for prefix in prefixes or [] if _safe_text(prefix)]
    if not normalized_meeting_id or not normalized_prefixes:
        return []

    llm_cache = workspace.get("llm_cache")
    if not isinstance(llm_cache, dict):
        llm_cache = {}
        workspace["llm_cache"] = llm_cache

    def _matches(key: str) -> bool:
        return any(key == prefix or key.startswith(prefix) for prefix in normalized_prefixes)

    removed_keys: list[str] = []
    for key in list(llm_cache.keys()):
        normalized_key = _safe_text(key)
        if _matches(normalized_key):
            llm_cache.pop(key, None)
            removed_keys.append(normalized_key)

    meeting_entries = rt.canvas_llm_inflight_by_meeting.get(normalized_meeting_id)
    if isinstance(meeting_entries, dict):
        for key in list(meeting_entries.keys()):
            normalized_key = _safe_text(key)
            if not _matches(normalized_key):
                continue
            inflight = meeting_entries.pop(key, None)
            if isinstance(inflight, dict) and isinstance(inflight.get("event"), threading.Event):
                inflight["error"] = "LLM cache reset"
                inflight["event"].set()
            removed_keys.append(normalized_key)
        if not meeting_entries:
            rt.canvas_llm_inflight_by_meeting.pop(normalized_meeting_id, None)

    return _dedup_preserve(removed_keys, limit=100)


def _get_canvas_llm_inflight_entry(
    rt: "RuntimeStore",
    meeting_id: str,
    cache_key: str,
) -> dict[str, Any] | None:
    meeting_entries = rt.canvas_llm_inflight_by_meeting.get(_safe_text(meeting_id))
    if not isinstance(meeting_entries, dict):
        return None
    entry = meeting_entries.get(_safe_text(cache_key))
    return entry if isinstance(entry, dict) else None


def _get_canvas_llm_request_lock(
    rt: "RuntimeStore",
    meeting_id: str,
    cache_key: str,
) -> threading.Lock:
    lock_key = f"{_safe_text(meeting_id)}:{_safe_text(cache_key)}"
    if not lock_key.strip(":"):
        lock_key = "global"
    with rt.lock:
        request_lock = rt.canvas_llm_request_locks_by_key.get(lock_key)
        if request_lock is None:
            request_lock = threading.Lock()
            rt.canvas_llm_request_locks_by_key[lock_key] = request_lock
        return request_lock


def _run_canvas_llm_cached_request(
    rt: "RuntimeStore",
    meeting_id: str,
    cache_key: str,
    signature: str,
    compute: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_cache_key = _safe_text(cache_key)
    normalized_signature = _safe_text(signature)
    if normalized_signature:
        normalized_signature = _canvas_llm_signature(
            {
                "source_signature": normalized_signature,
                "llm_route": _llm_cache_route_salt(),
            }
        )
    if not normalized_meeting_id or not normalized_cache_key or not normalized_signature:
        return compute()

    _warm_canvas_workspace_cache(rt, normalized_meeting_id)

    while True:
        wait_event: threading.Event | None = None
        wait_error = ""
        should_compute = False

        with rt.lock:
            cached = _get_canvas_llm_cached_result(
                rt,
                normalized_meeting_id,
                normalized_cache_key,
                normalized_signature,
            )
            if cached:
                return cached

            meeting_entries = rt.canvas_llm_inflight_by_meeting.setdefault(normalized_meeting_id, {})
            inflight = meeting_entries.get(normalized_cache_key)
            if (
                isinstance(inflight, dict)
                and _safe_text(inflight.get("signature")) == normalized_signature
                and isinstance(inflight.get("event"), threading.Event)
            ):
                wait_event = inflight["event"]
                wait_error = _safe_text(inflight.get("error"))
            else:
                wait_event = threading.Event()
                meeting_entries[normalized_cache_key] = {
                    "signature": normalized_signature,
                    "event": wait_event,
                    "error": "",
                }
                should_compute = True

        if not should_compute and wait_event is not None:
            wait_event.wait(timeout=90.0)
            with rt.lock:
                cached = _get_canvas_llm_cached_result(
                    rt,
                    normalized_meeting_id,
                    normalized_cache_key,
                    normalized_signature,
                )
                if cached:
                    return cached

                inflight = _get_canvas_llm_inflight_entry(rt, normalized_meeting_id, normalized_cache_key)
                if (
                    isinstance(inflight, dict)
                    and _safe_text(inflight.get("signature")) == normalized_signature
                    and isinstance(inflight.get("event"), threading.Event)
                    and not inflight["event"].is_set()
                ):
                    continue
                wait_error = _safe_text((inflight or {}).get("error"), wait_error)

            if wait_error:
                raise RuntimeError(wait_error)
            continue

        request_lock = _get_canvas_llm_request_lock(rt, normalized_meeting_id, normalized_cache_key)
        try:
            with request_lock:
                result = compute()
        except Exception as exc:
            with rt.lock:
                meeting_entries = rt.canvas_llm_inflight_by_meeting.get(normalized_meeting_id) or {}
                inflight = meeting_entries.pop(normalized_cache_key, None)
                if isinstance(inflight, dict) and isinstance(inflight.get("event"), threading.Event):
                    inflight["error"] = str(exc)
                    inflight["event"].set()
                if not meeting_entries:
                    rt.canvas_llm_inflight_by_meeting.pop(normalized_meeting_id, None)
            raise

        workspace_snapshot: dict[str, Any] | None = None
        with rt.lock:
            meeting_entries = rt.canvas_llm_inflight_by_meeting.get(normalized_meeting_id) or {}
            inflight = meeting_entries.get(normalized_cache_key)
            should_cache_result = (
                isinstance(inflight, dict)
                and _safe_text(inflight.get("signature")) == normalized_signature
                and inflight.get("event") is wait_event
                and not (isinstance(result, dict) and result.get("ok") is False)
            )
            if should_cache_result:
                meeting_entries.pop(normalized_cache_key, None)
                _set_canvas_llm_cached_result(
                    rt,
                    normalized_meeting_id,
                    normalized_cache_key,
                    normalized_signature,
                    result,
                )
            workspace_snapshot = copy.deepcopy(
                _ensure_canvas_workspace_entry(rt, normalized_meeting_id),
            )
            if isinstance(inflight, dict) and isinstance(inflight.get("event"), threading.Event):
                inflight["event"].set()
            if not meeting_entries:
                rt.canvas_llm_inflight_by_meeting.pop(normalized_meeting_id, None)
        if workspace_snapshot:
            _save_canvas_workspace_to_db(normalized_meeting_id, workspace_snapshot)
        return copy.deepcopy(result)


def _doc_freq(rows: list[dict[str, Any]]) -> Counter[str]:
    cnt: Counter[str] = Counter()
    for row in rows:
        seen = set(_keyword_tokens(_strip_leading_timestamp(row.get("text"))))
        for tok in seen:
            cnt[tok] += 1
    return cnt


def _top_keywords_from_rows(
    rows: list[dict[str, Any]],
    meeting_goal: str = "",
    limit: int = 6,
    global_doc_freq: Counter[str] | None = None,
    global_turn_count: int = 0,
) -> list[str]:
    banned = _tokens(meeting_goal)
    cnt: Counter[str] = Counter()
    for row in rows:
        text = _strip_leading_timestamp(row.get("text"))
        for tok in _keyword_tokens(text):
            if tok in banned:
                continue
            if global_doc_freq and global_turn_count > 0:
                if global_doc_freq.get(tok, 0) >= max(20, int(global_turn_count * 0.25)):
                    continue
            cnt[tok] += 1
    return [k for k, _ in cnt.most_common(limit)]


TITLE_NOISE_TOKENS = {
    "있는",
    "되는",
    "번째",
    "우리가",
    "굉장히",
    "아마",
    "내용",
    "부분",
    "정리",
    "사항",
    "진행",
    "완료",
    "중인",
    "관련",
    "논의",
    "이슈",
    "그니까",
    "보면",
    "어떻게",
    "좋은",
    "바로",
    "company",
    "companies",
    "thing",
    "things",
}

TITLE_TOKEN_MAP = {
    "company": "기업",
    "companies": "기업",
    "investment": "투자",
    "investments": "투자",
    "market": "시장",
    "economy": "경제",
    "policy": "정책",
    "startup": "스타트업",
    "startups": "스타트업",
}


def _normalize_keyword_token(raw_tok: str) -> str:
    tok = _safe_text(raw_tok).lower()
    if not tok:
        return ""
    tok = TITLE_TOKEN_MAP.get(tok, tok)
    # 조사/어미로 인한 파편화를 줄인다.
    for suf in ("으로", "에서", "에게", "처럼", "까지", "부터", "하고", "랑", "와", "과", "을", "를", "은", "는", "이", "가", "도", "로", "에"):
        if len(tok) > 2 and tok.endswith(suf):
            tok = tok[: -len(suf)]
            break
    return tok


def _is_title_keyword_noise(tok: str) -> bool:
    t = _normalize_keyword_token(tok)
    if not t:
        return True
    if t in STOPWORDS or t in TITLE_NOISE_TOKENS:
        return True
    if len(t) < 2:
        return True
    if re.fullmatch(r".*(하는|되는|있는|같은|보는|보면|좋은)$", t):
        return True
    if re.fullmatch(r"\d+", t):
        return True
    if re.fullmatch(r"(name|party)\d*", t):
        return True
    return False


def _usable_title_keywords(keywords: list[str] | None, meeting_goal: str) -> list[str]:
    goal_tokens = _tokens(meeting_goal)
    out: list[str] = []
    seen: set[str] = set()
    for raw in keywords or []:
        tok = _normalize_keyword_token(raw)
        if not tok or tok in seen:
            continue
        if tok in goal_tokens:
            continue
        if _is_title_keyword_noise(tok):
            continue
        seen.add(tok)
        out.append(tok)
    return out


def _is_low_quality_title(title: str, meeting_goal: str) -> bool:
    txt = _strip_leading_timestamp(title)
    if not txt:
        return True
    goal = _safe_text(meeting_goal)
    if goal and txt == goal:
        return True
    toks = [_normalize_keyword_token(t) for t in re.findall(r"[A-Za-z0-9가-힣]{2,}", txt.lower())]
    toks = [t for t in toks if t]
    meaningful = [t for t in toks if not _is_title_keyword_noise(t) and t not in _tokens(goal)]
    if not meaningful:
        return True
    ratio = len(meaningful) / max(1, len(toks))
    if ratio < 0.35:
        return True
    if len(txt) < 6:
        return True
    if "·" in txt or "|" in txt:
        return True
    if re.search(r"^안건\s*\d+", txt):
        return True
    if re.search(r"(관련\s*\S*\s*논의|핵심\s*쟁점|중심\s*논의|세부\s*쟁점)", txt):
        return True
    if re.search(r"\b(논의|이슈|쟁점)\s*$", txt) and len(meaningful) < 2:
        return True
    return False


def _clean_agenda_title(raw_title: Any, meeting_goal: str = "", keywords: list[str] | None = None) -> str:
    title = _strip_leading_timestamp(raw_title)
    title = re.sub(r"^[0-9]+[.)]\s*", "", title).strip(" -:|")
    title = re.sub(r"\s+", " ", title)
    if (not title) or _is_low_quality_title(title, meeting_goal):
        return ""
    return _safe_text(title[:80], "")


def _split_ts_prefix(line: str) -> tuple[str, str]:
    txt = _safe_text(line)
    m = re.match(
        r"^\[\s*((?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)|(?:\d{2}:\d{2}(?::\d{2})?))\s*\]\s*(.*)$",
        txt,
    )
    if m:
        return _safe_text(m.group(1)), _safe_text(m.group(2))
    return "", txt


def _to_summary_point(text: str, max_len: int | None = SUMMARY_POINT_TARGET_LEN) -> str:
    s = _strip_leading_timestamp(text)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^(음|어|네|예|일단|그리고|근데|그니까|그러니까)\s+", "", s)
    s = re.sub(r"^(저는|제가|저희는|저희가)\s+", "", s)
    s = re.sub(r"(입니다|합니다|했어요|했습니다|같아요|같습니다)\s*$", "", s)
    s = s.strip(" .,!?:;")
    if max_len and max_len > 0 and len(s) > max_len:
        s = s[:max_len].rstrip()
    return _safe_text(s)


def _normalize_summary_item_lines(lines: list[str]) -> list[str]:
    out: list[str] = []
    for raw in lines:
        ts, body = _split_ts_prefix(raw)
        summary = _to_summary_point(body)
        if not summary:
            continue
        out.append(f"[{ts}] {summary}" if ts else summary)
    return _dedup_preserve(out, limit=20)


def _extractive_title_from_candidates(candidates: list[str], meeting_goal: str) -> str:
    cleaned = [_to_summary_point(_safe_text(c), max_len=None) for c in candidates if _safe_text(c).strip()]
    cleaned = [_safe_text(c).strip(" ,;:/") for c in cleaned if _safe_text(c).strip(" ,;:/")]
    if not cleaned:
        return ""
    cleaned = _dedup_preserve(cleaned, limit=40)

    goal_tokens = _tokens(meeting_goal)
    doc_freq: Counter[str] = Counter()
    sent_tokens: list[list[str]] = []
    for sent in cleaned:
        toks = [t for t in _keyword_tokens(sent) if t not in goal_tokens and not _is_title_keyword_noise(t)]
        uniq = list(dict.fromkeys(toks))
        sent_tokens.append(uniq)
        for tok in uniq:
            doc_freq[tok] += 1

    if not doc_freq:
        return cleaned[0]

    top_tokens = {tok for tok, _ in doc_freq.most_common(4)}
    ranked: list[tuple[float, str, list[str]]] = []
    for sent, toks in zip(cleaned, sent_tokens):
        if not toks:
            score = min(len(sent), 60) / 120.0
        else:
            coverage = sum(doc_freq[t] for t in toks)
            density = coverage / max(1, len(toks))
            top_hits = sum(1 for t in toks if t in top_tokens)
            score = density + (top_hits * 0.9) + (min(len(sent), 60) / 120.0)
        if _is_low_quality_title(sent, meeting_goal):
            score -= 1.5
        ranked.append((score, sent, toks))

    ranked.sort(key=lambda x: x[0], reverse=True)
    primary = ranked[0][1] if ranked else cleaned[0]
    primary_tokens = set(ranked[0][2]) if ranked else set()

    secondary = ""
    for _, sent, toks in ranked[1:]:
        if not sent:
            continue
        sim = _text_similarity(primary, sent)
        overlap = len(primary_tokens & set(toks))
        # 동일 문장 반복을 피하고, 다른 포인트를 한 줄에 결합하기 위한 보조 문장 선택
        if sim < 0.82 and overlap < max(2, len(primary_tokens)):
            secondary = sent
            break

    def _compact_clause(text: str, max_len: int = 36) -> str:
        s = _strip_leading_timestamp(text)
        s = re.sub(r"\s+", " ", s).strip(" ,;:/")
        s = re.sub(r"^(그리고|또|또한|다만|하지만|근데|그래서)\s+", "", s)
        s = re.split(r"\s*(?:;|/|·)\s*", s)[0]
        s = re.split(r"\s+(?:그리고|근데|하지만|다만)\s+", s)[0]
        if len(s) > max_len:
            s = s[:max_len].rstrip()
        return _safe_text(s)

    p = _compact_clause(primary)
    s = _compact_clause(secondary) if secondary else ""

    if p and s and p != s:
        merged = f"{p}, {s}"
    else:
        merged = p or s or primary

    merged = _safe_text(merged).strip(" ,;:/")
    if _is_low_quality_title(merged, meeting_goal):
        # 최후 폴백: 빈약한 한 문장 대신 상위 핵심어를 추출해 문장형으로 보정
        top_list = [tok for tok, _ in doc_freq.most_common(3)]
        if top_list:
            merged = f"{' '.join(top_list)}에 대한 논의"
    return _safe_text(merged)


def _finalize_agenda_title(
    raw_title: Any,
    meeting_goal: str,
    keywords: list[str],
    summary_items: list[str],
    key_utterances: list[str] | None = None,
) -> str:
    # 요구사항: 안건 구간 전체를 관통하는 상위 논지를 한 문장으로 요약해 제목으로 사용한다.
    candidates: list[str] = []

    for item in summary_items or []:
        _, body = _split_ts_prefix(item)
        sentence = _to_summary_point(body, max_len=None)
        if sentence:
            candidates.append(sentence)

    for item in key_utterances or []:
        _, body = _split_ts_prefix(item)
        sentence = _to_summary_point(body, max_len=None)
        if sentence:
            candidates.append(sentence)

    raw_clean = _to_summary_point(_safe_text(raw_title), max_len=None)
    if raw_clean and not _is_low_quality_title(raw_clean, meeting_goal):
        return _safe_text(raw_clean[:80], "주요 논의 요약")

    if raw_clean:
        candidates.append(raw_clean)

    best = _extractive_title_from_candidates(candidates, meeting_goal)
    if not best:
        best = raw_clean

    return _safe_text(best.strip(), "")


def _extract_json(raw: str) -> dict[str, Any]:
    txt = _safe_text(raw)
    if txt.startswith("```"):
        txt = txt.strip("`")
        if txt.lower().startswith("json"):
            txt = txt[4:].strip()
    try:
        data = json.loads(txt)
        return data if isinstance(data, dict) else {}
    except Exception:
        pass
    l = txt.find("{")
    r = txt.rfind("}")
    if l >= 0 and r > l:
        try:
            data = json.loads(txt[l : r + 1])
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def _looks_like_meeting_payload(payload: dict[str, Any]) -> tuple[bool, str]:
    if not isinstance(payload, dict):
        return False, "JSON 최상위가 객체(dict)가 아닙니다."
    if "utterance" not in payload:
        return False, "필수 키 `utterance`가 없습니다."
    utterance = payload.get("utterance")
    if not isinstance(utterance, list):
        return False, "`utterance`는 배열(list)이어야 합니다."
    if len(utterance) == 0:
        return False, "`utterance`가 비어 있습니다."
    return True, ""


def _speaker_profile_label(age: Any, occupation: Any, role: Any, fallback_id: str) -> str:
    parts = [_safe_text(age), _safe_text(occupation), _safe_text(role)]
    label = " ".join([p for p in parts if p]).strip()
    return label if label else _safe_text(fallback_id, "화자")


def _parse_meeting_json_payload(payload: dict[str, Any]) -> tuple[str | None, list[dict[str, str]]]:
    metadata = payload.get("metadata") or {}
    meeting_goal = _safe_text(metadata.get("topic"))

    speaker_map: dict[str, str] = {}
    for spk in payload.get("speaker") or []:
        if not isinstance(spk, dict):
            continue
        sid = _safe_text(spk.get("id"))
        if not sid:
            continue
        speaker_map[sid] = _speaker_profile_label(spk.get("age"), spk.get("occupation"), spk.get("role"), sid)

    rows = []
    for utt in payload.get("utterance") or []:
        if not isinstance(utt, dict):
            continue
        text = _safe_text(utt.get("original_form")) or _safe_text(utt.get("form"))
        if not text:
            continue
        sid = _safe_text(utt.get("speaker_id"))
        speaker = speaker_map.get(sid) or _safe_text(sid, "화자")
        timestamp = _sec_to_ts(utt.get("start"))
        rows.append(
            {
                "speaker": speaker,
                "text": text,
                "timestamp": timestamp,
            }
        )

    rows.sort(key=lambda x: x.get("timestamp", ""))
    return (meeting_goal if meeting_goal else None), rows


class ConfigInput(BaseModel):
    meeting_goal: str = ""
    window_size: int = Field(default=12, ge=4, le=80)


class UtteranceInput(BaseModel):
    speaker: str = "화자"
    text: str
    timestamp: str | None = None


class ImportDirInput(BaseModel):
    folder: str = "dataset/economy"
    recursive: bool = True
    reset_state: bool = True
    auto_tick: bool = True
    max_files: int = Field(default=500, ge=1, le=2000)


class ReplayStepInput(BaseModel):
    lines: int = Field(default=1, ge=1, le=100)
    auto_analyze: bool = True


class SttFlowSummaryTurnInput(BaseModel):
    speaker: str = "화자"
    text: str = ""
    timestamp: str | None = None


class SttFlowSummaryInput(BaseModel):
    meeting_id: str = ""
    turns: list[SttFlowSummaryTurnInput] = Field(default_factory=list, min_length=1, max_length=6)
    max_chars: int = Field(default=30, ge=8, le=60)


class SttTranscriptRefineInput(BaseModel):
    raw_text: str = ""
    meeting_goal: str = ""
    meeting_goal_context: str = ""
    context_pack: dict[str, Any] = Field(default_factory=dict)


class CanvasPlacementConfirmInput(BaseModel):
    tool: str = "note"
    ui_x: float = 0.0
    ui_y: float = 0.0
    flow_x: float = 0.0
    flow_y: float = 0.0
    agenda_id: str = ""
    point_id: str = ""
    title: str = ""
    body: str = ""


class ProblemDefinitionAgendaInput(BaseModel):
    agenda_id: str
    title: str
    keywords: list[str] = Field(default_factory=list)
    summary_bullets: list[str] = Field(default_factory=list)


class ProblemDefinitionIdeaInput(BaseModel):
    id: str
    agenda_id: str
    kind: str = "note"
    title: str = ""
    body: str = ""


class ProblemDefinitionGenerateInput(BaseModel):
    meeting_id: str = ""
    topic: str = ""
    agendas: list[ProblemDefinitionAgendaInput] = Field(default_factory=list)
    ideas: list[ProblemDefinitionIdeaInput] = Field(default_factory=list)


class ProblemTaxonomyUtteranceInput(BaseModel):
    id: str = ""
    speaker: str = "참가자"
    text: str = ""
    timestamp: str = ""


class ProblemTaxonomyExistingGroupInput(BaseModel):
    group_id: str = ""
    parent_group_id: str = ""
    depth: int = 0
    topic: str = ""
    evidence_utterance_ids: list[str] = Field(default_factory=list)
    source_summary_items: list[str] = Field(default_factory=list)


class ProblemTaxonomyGenerateInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    demo_config: dict[str, Any] = Field(default_factory=dict)
    debug_nonce: str = ""
    refresh_chunk_summaries: bool = False
    parent_group_id: str = ""
    parent_topic: str = ""
    parent_depth: int = Field(default=-1, ge=-1, le=8)
    parent_evidence_utterance_ids: list[str] = Field(default_factory=list)
    existing_group_ids: list[str] = Field(default_factory=list)
    existing_groups: list[ProblemTaxonomyExistingGroupInput] = Field(default_factory=list)
    utterances: list[ProblemTaxonomyUtteranceInput] = Field(default_factory=list, max_length=300)
    max_groups: int = Field(default=6, ge=1, le=12)


class ProblemConclusionIdeaInput(BaseModel):
    id: str = ""
    kind: str = "note"
    title: str = ""
    body: str = ""


class ProblemConclusionGroupInput(BaseModel):
    group_id: str = ""
    topic: str = ""
    insight_lens: str = ""
    agenda_titles: list[str] = Field(default_factory=list)
    source_summary_items: list[str] = Field(default_factory=list)
    ideas: list[ProblemConclusionIdeaInput] = Field(default_factory=list)


class ProblemConclusionGenerateInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    group: ProblemConclusionGroupInput


class ProblemGroupingRationaleChildInput(BaseModel):
    group_id: str = ""
    topic: str = ""
    insight_lens: str = ""
    conclusion: str = ""


class ProblemGroupingRationaleGroupInput(BaseModel):
    group_id: str = ""
    topic: str = ""
    insight_lens: str = ""
    conclusion: str = ""
    agenda_titles: list[str] = Field(default_factory=list)
    source_summary_items: list[str] = Field(default_factory=list)
    evidence_utterance_ids: list[str] = Field(default_factory=list)
    ideas: list[ProblemConclusionIdeaInput] = Field(default_factory=list)


class ProblemGroupingRationaleGenerateInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    group: ProblemGroupingRationaleGroupInput
    child_groups: list[ProblemGroupingRationaleChildInput] = Field(default_factory=list, max_length=24)
    utterances: list[ProblemTaxonomyUtteranceInput] = Field(default_factory=list, max_length=300)


class ProblemStructureNodeInput(BaseModel):
    id: str = ""
    title: str = ""
    body: str = ""
    status: str = "draft"
    depth: int = Field(default=0, ge=0, le=8)


class ProblemStructureExistingGroupInput(BaseModel):
    id: str = ""
    title: str = ""
    node_ids: list[str] = Field(default_factory=list)
    rationale: str = ""


class ProblemStructureGenerateInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    method: str = "affinity"
    nodes: list[ProblemStructureNodeInput] = Field(default_factory=list, max_length=80)
    existing_groups: list[ProblemStructureExistingGroupInput] = Field(default_factory=list, max_length=40)
    max_groups: int = Field(default=6, ge=1, le=12)


class MeetingGoalGenerateInput(BaseModel):
    meeting_id: str = ""
    topic: str = ""


class CanvasIdeaAssimilationUtteranceInput(BaseModel):
    id: str = ""
    speaker: str = ""
    text: str = ""
    timestamp: str = ""


class CanvasRefinedUtteranceInput(BaseModel):
    utterance_id: str = ""
    speaker: str = ""
    text: str = ""
    timestamp: str = ""


class CanvasIdeaAssimilationIdeaInput(BaseModel):
    id: str = ""
    title: str = ""
    summary: str = ""
    keywords: list[str] = Field(default_factory=list)
    key_evidence: list[str] = Field(default_factory=list)
    refined_utterances: list[CanvasRefinedUtteranceInput] = Field(default_factory=list)
    evidence_utterance_ids: list[str] = Field(default_factory=list)
    user_edited: bool = False


class CanvasIdeaAssimilationInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    selected_agenda_id: str = ""
    context_utterances: list[CanvasIdeaAssimilationUtteranceInput] = Field(default_factory=list)
    target_utterances: list[CanvasIdeaAssimilationUtteranceInput] = Field(default_factory=list)
    existing_ideas: list[CanvasIdeaAssimilationIdeaInput] = Field(default_factory=list)


class SummaryDocumentNodeInput(BaseModel):
    id: str = ""
    source_group_id: str = ""
    title: str = ""
    body: str = ""
    status: str = "draft"
    depth: int = Field(default=0, ge=0, le=8)


class SummaryDocumentGroupInput(BaseModel):
    id: str = ""
    title: str = ""
    node_ids: list[str] = Field(default_factory=list)
    rationale: str = ""
    status: str = "draft"
    created_by: str = "user"


class SummaryDocumentGenerateInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    refresh_chunk_summaries: bool = False
    demo_config: dict[str, Any] = Field(default_factory=dict)
    demo_balance_classification: dict[str, Any] = Field(default_factory=dict)
    groups: list[SummaryDocumentGroupInput] = Field(default_factory=list, max_length=40)
    nodes: list[SummaryDocumentNodeInput] = Field(default_factory=list, max_length=120)


class SummaryConclusionGenerateInput(SummaryDocumentGenerateInput):
    current_summary: dict[str, Any] = Field(default_factory=dict)
    regenerate_nonce: str = ""


class CanvasQuickAskInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    stage: str = "ideation"
    question: str = Field(default="", max_length=2000)
    context: dict[str, Any] = Field(default_factory=dict)


class IdeationExistingKeywordInput(BaseModel):
    id: str = ""
    text: str = ""
    canonical_label: str = ""
    aliases: list[str] = Field(default_factory=list)
    evidence_utterance_ids: list[str] = Field(default_factory=list)
    count: int = 1
    related: list[str] = Field(default_factory=list)
    kind: str = "topic"
    importance: float = 0.65
    relevance: float = 1.0
    off_topic: bool = False
    anchor: str = ""
    choice_affinity: str = ""
    affinity_score: float = 0.0
    needs_affinity_review: bool = False


class IdeationKeywordExtractInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    meeting_goal: str = ""
    meeting_goal_context: str = ""
    demo_config: dict[str, Any] = Field(default_factory=dict)
    utterances: list[ProblemTaxonomyUtteranceInput] = Field(default_factory=list, max_length=180)
    context_cache: str = Field(default="", max_length=20000)
    context_utterances: list[ProblemTaxonomyUtteranceInput] = Field(default_factory=list, max_length=180)
    existing_keywords: list[IdeationExistingKeywordInput] = Field(default_factory=list, max_length=40)
    max_keywords: int = Field(default=18, ge=1, le=30)


class IdeationBubbleGraphUpdateInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    meeting_goal: str = ""
    meeting_goal_context: str = ""
    demo_config: dict[str, Any] = Field(default_factory=dict)
    utterances: list[ProblemTaxonomyUtteranceInput] = Field(default_factory=list, max_length=180)
    context_cache: str = Field(default="", max_length=20000)
    max_keywords: int = Field(default=3, ge=1, le=8)
    update_mode: str = Field(default="", max_length=32)


class IdeationSuggestionTopicInput(BaseModel):
    id: str = ""
    title: str = ""
    body: str = ""
    keywords: list[str] = Field(default_factory=list)


class IdeationSuggestionChildInput(BaseModel):
    id: str = ""
    kind: str = "note"
    title: str = ""
    body: str = ""
    keywords: list[str] = Field(default_factory=list)


class IdeationSuggestionGenerateInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    topic: IdeationSuggestionTopicInput = Field(default_factory=IdeationSuggestionTopicInput)
    child_items: list[IdeationSuggestionChildInput] = Field(default_factory=list)


class CanvasIdeationSuggestionInput(BaseModel):
    id: str = ""
    text: str = ""
    status: str = "draft"


class CanvasWorkspaceIdeaInput(BaseModel):
    id: str = ""
    kind: str = "note"
    title: str = ""
    body: str = ""


class CanvasProblemDiscussionInput(BaseModel):
    id: str = ""
    parent_group_id: str = ""
    target_node_id: str = ""
    target_node_label: str = ""
    target_node_kind: str = ""
    title: str = ""
    body: str = ""
    keywords: list[str] = Field(default_factory=list)
    key_evidence: list[str] = Field(default_factory=list)
    refined_utterances: list[CanvasRefinedUtteranceInput] = Field(default_factory=list)
    evidence_utterance_ids: list[str] = Field(default_factory=list)
    ignored_utterance_ids: list[str] = Field(default_factory=list)
    ai_pending: bool = False
    ai_generated: bool = False
    user_edited: bool = False
    created_by: str = ""
    created_at: str = ""


class CanvasWorkspaceCanvasItemInput(BaseModel):
    id: str = ""
    agenda_id: str = ""
    point_id: str = ""
    kind: str = "note"
    status: str = "discussion"
    title: str = ""
    body: str = ""
    keywords: list[str] = Field(default_factory=list)
    key_evidence: list[str] = Field(default_factory=list)
    refined_utterances: list[CanvasRefinedUtteranceInput] = Field(default_factory=list)
    evidence_utterance_ids: list[str] = Field(default_factory=list)
    ignored_utterance_ids: list[str] = Field(default_factory=list)
    merged_children: list[dict[str, Any]] = Field(default_factory=list)
    compacted_from_ids: list[str] = Field(default_factory=list)
    compaction_level: int = 0
    parent_topic_id: str = ""
    parent_topic_source: str = ""
    parent_topic_locked: bool = False
    child_item_ids: list[str] = Field(default_factory=list)
    topic_collapsed: bool = False
    created_by: str = ""
    manual_position: bool = False
    ai_generated: bool = False
    user_edited: bool = False
    ai_pending: bool = False
    ai_suggestions: list[CanvasIdeationSuggestionInput] = Field(default_factory=list)
    x: float | None = None
    y: float | None = None


class CanvasIdeaAssimilationWorkspaceStartInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    selected_agenda_id: str = ""
    context_utterances: list[CanvasIdeaAssimilationUtteranceInput] = Field(default_factory=list)
    target_utterances: list[CanvasIdeaAssimilationUtteranceInput] = Field(default_factory=list)


class CanvasTopicSummaryWorkspaceStartInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    topic_item_id: str = ""


class CanvasProblemDiscussionWorkspaceStartInput(BaseModel):
    meeting_id: str = ""
    meeting_topic: str = ""
    selected_group_id: str = ""
    context_utterances: list[CanvasIdeaAssimilationUtteranceInput] = Field(default_factory=list)
    target_utterances: list[CanvasIdeaAssimilationUtteranceInput] = Field(default_factory=list)


class CanvasCustomGroupInput(BaseModel):
    id: str = ""
    title: str = ""
    description: str = ""
    keywords: list[str] = Field(default_factory=list)
    color: str = ""
    created_by: str = ""
    created_at: str = ""


class CanvasPersonalNoteInput(BaseModel):
    id: str = ""
    project_id: str = ""
    agenda_id: str = ""
    linked_canvas_item_id: str = ""
    linked_canvas_item_title: str = ""
    kind: str = "note"
    title: str = ""
    body: str = ""


class CanvasNodePositionInput(BaseModel):
    x: float = 0
    y: float = 0


class CanvasWorkspaceProblemGroupInput(BaseModel):
    group_id: str = ""
    parent_group_id: str = ""
    depth: int = 0
    topic: str = ""
    insight_lens: str = ""
    insight_user_edited: bool = False
    keywords: list[str] = Field(default_factory=list)
    agenda_ids: list[str] = Field(default_factory=list)
    agenda_titles: list[str] = Field(default_factory=list)
    ideas: list[CanvasWorkspaceIdeaInput] = Field(default_factory=list)
    discussion_items: list[CanvasProblemDiscussionInput] = Field(default_factory=list)
    linked_group_ids: list[str] = Field(default_factory=list)
    evidence_utterance_ids: list[str] = Field(default_factory=list)
    source_summary_items: list[str] = Field(default_factory=list)
    conclusion: str = ""
    conclusion_user_edited: bool = False
    status: str = "draft"
    source_signature: str = ""
    source_agenda_signatures: dict[str, str] = Field(default_factory=dict)


class CanvasWorkspaceSolutionTopicInput(BaseModel):
    group_id: str = ""
    topic_no: int = 0
    topic: str = ""
    conclusion: str = ""
    ideas: list[str] = Field(default_factory=list)
    status: str = "draft"
    problem_topic: str = ""
    problem_insight: str = ""
    problem_conclusion: str = ""
    problem_keywords: list[str] = Field(default_factory=list)
    agenda_titles: list[str] = Field(default_factory=list)
    ai_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    notes: list[dict[str, Any]] = Field(default_factory=list)


class CanvasWorkspaceProblemStructureNodeInput(BaseModel):
    id: str = ""
    source_group_id: str = ""
    title: str = ""
    body: str = ""
    status: str = "draft"
    depth: int = Field(default=0, ge=0, le=8)


class CanvasWorkspaceProblemStructureGroupInput(BaseModel):
    id: str = ""
    title: str = ""
    node_ids: list[str] = Field(default_factory=list)
    rationale: str = ""
    status: str = "draft"
    created_by: str = "user"


class CanvasWorkspaceProblemStructureInput(BaseModel):
    phase: str = "explore"
    method: str = "affinity"
    mode: str = ""
    revision: int = 0
    source_generation_id: str = ""
    based_on_transcript_revision: int = 0
    updated_at: str = ""
    nodes: list[CanvasWorkspaceProblemStructureNodeInput] = Field(default_factory=list)
    groups: list[CanvasWorkspaceProblemStructureGroupInput] = Field(default_factory=list)


class CanvasArtifactGenerationEntryInput(BaseModel):
    artifact_key: str = ""
    status: str = "idle"
    generation_id: str = ""
    started_by: str = ""
    started_at: str = ""
    updated_at: str = ""
    finished_at: str = ""
    error: str = ""
    phase: str = ""
    detail: str = ""
    retryable: bool = False
    version: int = 0
    input_transcript_revision: int = 0


class CanvasWorkspaceStateInput(BaseModel):
    meeting_id: str = ""
    meeting_goal: str = ""
    meeting_goal_context: str = ""
    demo_config: dict[str, Any] = Field(default_factory=dict)
    demo_balance_classification: dict[str, Any] = Field(default_factory=dict)
    stage: str = "ideation"
    agenda_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)
    canvas_items: list[CanvasWorkspaceCanvasItemInput] = Field(default_factory=list)
    custom_groups: list[CanvasCustomGroupInput] = Field(default_factory=list)
    problem_groups: list[CanvasWorkspaceProblemGroupInput] = Field(default_factory=list)
    problem_structure: CanvasWorkspaceProblemStructureInput = Field(default_factory=CanvasWorkspaceProblemStructureInput)
    solution_topics: list[CanvasWorkspaceSolutionTopicInput] = Field(default_factory=list)
    final_solution_summary: dict[str, Any] = Field(default_factory=dict)
    node_positions: dict[str, dict[str, CanvasNodePositionInput]] = Field(default_factory=dict)
    artifact_generation: dict[str, CanvasArtifactGenerationEntryInput] = Field(default_factory=dict)
    ideation_bubble_graph: dict[str, Any] = Field(default_factory=dict)
    imported_state: dict[str, Any] | None = None


class CanvasWorkspacePatchInput(BaseModel):
    meeting_id: str = ""
    meeting_goal: str | None = None
    meeting_goal_context: str | None = None
    demo_config: dict[str, Any] | None = None
    demo_balance_classification: dict[str, Any] | None = None
    stage: str | None = None
    agenda_overrides: dict[str, dict[str, Any]] | None = None
    canvas_items: list[CanvasWorkspaceCanvasItemInput] | None = None
    custom_groups: list[CanvasCustomGroupInput] | None = None
    problem_groups: list[CanvasWorkspaceProblemGroupInput] | None = None
    problem_structure: CanvasWorkspaceProblemStructureInput | None = None
    solution_topics: list[CanvasWorkspaceSolutionTopicInput] | None = None
    final_solution_summary: dict[str, Any] | None = None
    node_positions: dict[str, dict[str, CanvasNodePositionInput]] | None = None
    artifact_generation: dict[str, CanvasArtifactGenerationEntryInput] | None = None
    ideation_bubble_graph: dict[str, Any] | None = None
    imported_state: dict[str, Any] | None = None
    llm_cache_reset_prefixes: list[str] | None = None


class CanvasMeetingRoomResetInput(BaseModel):
    meeting_id: str = ""
    user_id: str = ""


class CanvasBubbleDebugLogInput(BaseModel):
    meeting_id: str = ""
    user_id: str = ""
    event: str = ""
    data: dict[str, Any] = Field(default_factory=dict)


class CanvasArtifactGenerationStartInput(BaseModel):
    meeting_id: str = ""
    artifact_key: str = ""
    user_id: str = ""
    force: bool = False
    phase: str = ""
    detail: str = ""
    retryable: bool = False


class CanvasArtifactGenerationFinishInput(BaseModel):
    meeting_id: str = ""
    artifact_key: str = ""
    user_id: str = ""
    generation_id: str = ""
    status: str = "ready"
    error: str = ""
    phase: str = ""
    detail: str = ""
    retryable: bool = False
    problem_structure: CanvasWorkspaceProblemStructureInput | None = None


class CanvasFinalReportShareInput(BaseModel):
    meeting_id: str = ""
    regenerate: bool = False


class CanvasPersonalNotesStateInput(BaseModel):
    meeting_id: str = ""
    user_id: str = ""
    personal_notes: list[CanvasPersonalNoteInput] = Field(default_factory=list)
    local_canvas_state: dict[str, Any] | None = None


@dataclass
class RuntimeStore:
    lock: threading.Lock = field(default_factory=threading.Lock)
    llm_io_lock: threading.Lock = field(default_factory=threading.Lock)
    canvas_llm_request_lock: threading.Lock = field(default_factory=threading.Lock)
    canvas_llm_request_locks_by_key: dict[str, threading.Lock] = field(default_factory=dict)
    meeting_goal: str = ""
    window_size: int = 12
    transcript: list[dict[str, str]] = field(default_factory=list)
    agenda_outcomes: list[dict[str, Any]] = field(default_factory=list)
    llm_enabled: bool = False
    llm_connect_retry_after_monotonic: float = 0.0
    llm_connect_retry_note: str = ""
    last_analyzed_count: int = 0
    agenda_seq: int = 0
    stt_chunk_seq: int = 0
    used_local_fallback: bool = False
    last_analysis_warning: str = ""
    last_tick_mode: str = "windowed"
    last_title_refine_attempts: int = 0
    last_title_refine_success: int = 0
    last_llm_parsed_json: dict[str, Any] = field(default_factory=dict)
    last_llm_parsed_at: str = ""
    replay_rows: list[dict[str, str]] = field(default_factory=list)
    replay_index: int = 0
    replay_source: str = ""
    replay_loaded_at: str = ""
    analysis_task_seq: int = 0
    analysis_queued: int = 0
    analysis_inflight: bool = False
    analysis_last_enqueued_at: str = ""
    analysis_last_started_at: str = ""
    analysis_last_done_at: str = ""
    analysis_last_error: str = ""
    analysis_last_enqueued_id: int = 0
    analysis_last_started_id: int = 0
    analysis_last_done_id: int = 0
    analysis_generation: int = 0
    transcript_version: int = 0
    analysis_next_windowed_target: int = SUMMARY_INTERVAL
    llm_io_seq: int = 0
    llm_io_logs: list[dict[str, Any]] = field(default_factory=list)
    canvas_last_placement: dict[str, Any] = field(default_factory=dict)
    canvas_workspace_by_meeting: dict[str, dict[str, Any]] = field(default_factory=dict)
    canvas_artifact_generation_locks_by_meeting: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    canvas_llm_inflight_by_meeting: dict[str, dict[str, Any]] = field(default_factory=dict)
    canvas_idea_jobs_by_meeting: dict[str, dict[str, Any]] = field(default_factory=dict)
    canvas_problem_jobs_by_meeting: dict[str, dict[str, Any]] = field(default_factory=dict)
    canvas_personal_notes_by_meeting_user: dict[str, dict[str, list[dict[str, Any]]]] = field(default_factory=dict)
    canvas_local_state_by_meeting_user: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)

    def reset(self) -> None:
        self.meeting_goal = ""
        self.window_size = 12
        self.transcript = []
        self.agenda_outcomes = []
        self.llm_enabled = False
        self.llm_connect_retry_after_monotonic = 0.0
        self.llm_connect_retry_note = ""
        self.last_analyzed_count = 0
        self.agenda_seq = 0
        self.stt_chunk_seq = 0
        self.used_local_fallback = False
        self.last_analysis_warning = ""
        self.last_tick_mode = "windowed"
        self.last_title_refine_attempts = 0
        self.last_title_refine_success = 0
        self.last_llm_parsed_json = {}
        self.last_llm_parsed_at = ""
        self.replay_rows = []
        self.replay_index = 0
        self.replay_source = ""
        self.replay_loaded_at = ""
        self.analysis_task_seq = 0
        self.analysis_queued = 0
        self.analysis_inflight = False
        self.analysis_last_enqueued_at = ""
        self.analysis_last_started_at = ""
        self.analysis_last_done_at = ""
        self.analysis_last_error = ""
        self.analysis_last_enqueued_id = 0
        self.analysis_last_started_id = 0
        self.analysis_last_done_id = 0
        self.analysis_generation += 1
        self.transcript_version = 0
        self.analysis_next_windowed_target = SUMMARY_INTERVAL
        self.llm_io_seq = 0
        self.llm_io_logs = []
        self.canvas_last_placement = {}
        self.canvas_workspace_by_meeting = {}
        self.canvas_artifact_generation_locks_by_meeting = {}
        self.canvas_llm_request_locks_by_key = {}
        self.canvas_llm_inflight_by_meeting = {}
        self.canvas_idea_jobs_by_meeting = {}
        self.canvas_problem_jobs_by_meeting = {}
        self.canvas_personal_notes_by_meeting_user = {}
        self.canvas_local_state_by_meeting_user = {}

RT = RuntimeStore()
ANALYSIS_QUEUE: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=2048)
ANALYSIS_WORKER_STARTED = False


def _analysis_worker_status(rt: RuntimeStore) -> dict[str, Any]:
    observed_waiting = max(0, int(ANALYSIS_QUEUE.qsize()))
    observed_total = observed_waiting + (1 if rt.analysis_inflight else 0)
    logical_total = int(max(0, rt.analysis_queued))
    display_total = max(logical_total, observed_total)
    return {
        "inflight": bool(rt.analysis_inflight),
        "queued": int(display_total),
        "queued_logical": int(logical_total),
        "queued_observed": int(observed_total),
        "last_enqueued_id": int(rt.analysis_last_enqueued_id),
        "last_started_id": int(rt.analysis_last_started_id),
        "last_done_id": int(rt.analysis_last_done_id),
        "last_enqueued_at": _safe_text(rt.analysis_last_enqueued_at),
        "last_started_at": _safe_text(rt.analysis_last_started_at),
        "last_done_at": _safe_text(rt.analysis_last_done_at),
        "last_error": _safe_text(rt.analysis_last_error),
    }


def _truncate_text(raw: Any, limit: int = LLM_IO_PREVIEW_MAX) -> str:
    s = _safe_text(raw)
    if len(s) <= limit:
        return s
    return _safe_text(s[: max(0, limit - 1)] + "…")


def _append_llm_io_log(rt: RuntimeStore, direction: str, stage: str, payload: Any, meta: dict[str, Any] | None = None) -> None:
    with rt.llm_io_lock:
        rt.llm_io_seq += 1
        preview = _truncate_text(payload)
        entry = {
            "seq": int(rt.llm_io_seq),
            "at": _now_ts(),
            "direction": _safe_text(direction),
            "stage": _safe_text(stage),
            "payload": preview,
            "meta": dict(meta or {}),
        }
        rt.llm_io_logs.append(entry)
        if len(rt.llm_io_logs) > LLM_IO_LOG_MAX:
            rt.llm_io_logs = rt.llm_io_logs[-LLM_IO_LOG_MAX:]


def _stage_uses_fast_llm(stage: str) -> bool:
    normalized_stage = _safe_text(stage)
    if normalized_stage in GEMINI_FORCE_DEFAULT_STAGE_NAMES:
        return False
    return normalized_stage in GEMINI_FAST_STAGE_NAMES or any(
        normalized_stage.startswith(prefix) for prefix in GEMINI_FAST_STAGE_PREFIXES
    )


def _llm_route_for_stage(stage: str) -> tuple[str, str]:
    if _stage_uses_fast_llm(stage):
        return GEMINI_FAST_MODEL_NAME, GEMINI_FAST_THINKING_LEVEL
    return GEMINI_DEFAULT_MODEL_NAME, GEMINI_DEFAULT_THINKING_LEVEL


def _llm_cache_route_salt() -> dict[str, Any]:
    return {
        "default_model": GEMINI_DEFAULT_MODEL_NAME,
        "fast_model": GEMINI_FAST_MODEL_NAME,
        "fast_stages": list(GEMINI_FAST_STAGE_NAMES),
        "force_default_stages": sorted(GEMINI_FORCE_DEFAULT_STAGE_NAMES),
        "fast_stage_prefixes": list(GEMINI_FAST_STAGE_PREFIXES),
        "default_thinking_level": GEMINI_DEFAULT_THINKING_LEVEL,
        "fast_thinking_level": GEMINI_FAST_THINKING_LEVEL,
    }


def _is_llm_temporarily_unavailable_error(exc: Exception) -> bool:
    text = _safe_text(exc).lower()
    return "503" in text or "unavailable" in text or "high demand" in text


def _demo_llm_retryable_warning(action_label: str, exc: Exception | None = None) -> str:
    if exc is not None and _is_llm_temporarily_unavailable_error(exc):
        return f"{action_label} 모델 응답이 지연되었습니다. 잠시 후 다시 생성해 주세요."
    return f"{action_label} 생성에 실패했습니다. 다시 생성 버튼으로 재시도해 주세요."


def _build_llm_error_payload(
    *,
    stage: str,
    error_type: str,
    error_preview: Any,
    client: Any = None,
    elapsed_ms: int | None = None,
) -> dict[str, Any]:
    route_model, route_thinking_level = _llm_route_for_stage(stage)
    diagnostics: dict[str, Any] = {}
    if client is not None and hasattr(client, "status"):
        try:
            status_payload = client.status()
            diagnostics = status_payload if isinstance(status_payload, dict) else {}
        except Exception:
            diagnostics = {}
    preview = _safe_text(error_preview or diagnostics.get("last_error"))
    status = _safe_nonnegative_int(diagnostics.get("last_http_status"), 0)
    if status <= 0:
        match = re.search(r"\bHTTP\s+(\d{3})\b", preview, flags=re.IGNORECASE)
        if match:
            status = _safe_nonnegative_int(match.group(1), 0)
    return {
        "stage": _safe_text(stage),
        "model": _safe_text(diagnostics.get("last_model") or route_model),
        "thinking_level": _safe_text(route_thinking_level),
        "http_status": status,
        "error_type": _safe_text(error_type),
        "error_preview": _truncate_text(preview, 700),
        "elapsed_ms": elapsed_ms,
    }


def _call_llm_json(
    rt: RuntimeStore,
    client: Any,
    prompt: str,
    stage: str,
    temperature: float,
    max_tokens: int,
    allow_default_model_retry: bool = False,
) -> dict[str, Any]:
    model_name, thinking_level = _llm_route_for_stage(stage)
    used_model_name = model_name
    _append_llm_io_log(
        rt,
        direction="request",
        stage=stage,
        payload=prompt,
        meta={
            "temperature": temperature,
            "max_tokens": max_tokens,
            "prompt_chars": len(prompt),
            "model": model_name,
            "thinking_level": thinking_level,
        },
    )
    try:
        parsed = client.generate_json(
            prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            model_override=model_name,
            thinking_level=thinking_level,
        )
    except Exception as exc:
        _append_llm_io_log(rt, direction="error", stage=stage, payload=str(exc), meta={"model": model_name})
        if (
            allow_default_model_retry
            and model_name != GEMINI_DEFAULT_MODEL_NAME
            and _is_llm_temporarily_unavailable_error(exc)
        ):
            retry_started_at = time.perf_counter()
            print(
                "[LLM default model retry]",
                {
                    "stage": stage,
                    "reason": _truncate_text(str(exc), 280),
                    "first_model": model_name,
                    "fallback_model": GEMINI_DEFAULT_MODEL_NAME,
                    "prompt_chars": len(prompt),
                    "max_tokens": max_tokens,
                },
            )
            _append_llm_io_log(
                rt,
                direction="request",
                stage=f"{stage}.default_retry",
                payload=prompt,
                meta={
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "prompt_chars": len(prompt),
                    "model": GEMINI_DEFAULT_MODEL_NAME,
                    "thinking_level": GEMINI_DEFAULT_THINKING_LEVEL,
                    "fallback_from": model_name,
                },
            )
            try:
                parsed = client.generate_json(
                    prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    model_override=GEMINI_DEFAULT_MODEL_NAME,
                    thinking_level=GEMINI_DEFAULT_THINKING_LEVEL,
                )
                used_model_name = GEMINI_DEFAULT_MODEL_NAME
                print(
                    "[LLM default model retry success]",
                    {
                        "stage": stage,
                        "first_model": model_name,
                        "fallback_model": GEMINI_DEFAULT_MODEL_NAME,
                        "elapsed_ms": int((time.perf_counter() - retry_started_at) * 1000),
                    },
                )
            except Exception as retry_exc:
                _append_llm_io_log(
                    rt,
                    direction="error",
                    stage=f"{stage}.default_retry",
                    payload=str(retry_exc),
                    meta={"model": GEMINI_DEFAULT_MODEL_NAME, "fallback_from": model_name},
                )
                print(
                    "[LLM default model retry failed]",
                    {
                        "stage": stage,
                        "first_model": model_name,
                        "fallback_model": GEMINI_DEFAULT_MODEL_NAME,
                        "elapsed_ms": int((time.perf_counter() - retry_started_at) * 1000),
                        "error": _truncate_text(str(retry_exc), 420),
                    },
                )
                raise retry_exc
        else:
            raise
    try:
        payload = json.dumps(parsed, ensure_ascii=False)
    except Exception:
        payload = str(parsed)
    _append_llm_io_log(rt, direction="response", stage=stage, payload=payload, meta={"model": used_model_name})
    return parsed


def _md_text(raw: Any) -> str:
    return re.sub(r"\s+", " ", _safe_text(raw)).strip()


def _build_problem_definition_groups_local(payload: ProblemDefinitionGenerateInput) -> list[dict[str, Any]]:
    agendas = payload.agendas or []
    ideas = payload.ideas or []
    if not agendas:
        return []

    groups: list[dict[str, Any]] = []
    for agenda in agendas:
        agenda_keywords = [
            tok
            for tok in (
                [_normalize_keyword_token(x) for x in (agenda.keywords or [])]
                + _keyword_tokens(agenda.title)
            )
            if tok and not _is_title_keyword_noise(tok)
        ]
        dedup_keywords = list(dict.fromkeys(agenda_keywords))

        best_group_idx = -1
        best_score = 0
        for idx, group in enumerate(groups):
            overlap = len(set(dedup_keywords) & set(group.get("keywords") or []))
            if overlap > best_score:
                best_score = overlap
                best_group_idx = idx

        if best_group_idx < 0 or best_score == 0:
            groups.append(
                {
                    "group_id": f"problem-group-{len(groups) + 1}",
                    "topic": _safe_text(dedup_keywords[0] if dedup_keywords else agenda.title, agenda.title),
                    "keywords": dedup_keywords[:8],
                    "agenda_ids": [_safe_text(agenda.agenda_id)],
                    "agenda_titles": [_safe_text(agenda.title)],
                    "source_summary_items": [_safe_text(x) for x in (agenda.summary_bullets or []) if _safe_text(x)],
                }
            )
            continue

        group = groups[best_group_idx]
        group["agenda_ids"].append(_safe_text(agenda.agenda_id))
        group["agenda_titles"].append(_safe_text(agenda.title))
        group["keywords"] = list(dict.fromkeys([*(group.get("keywords") or []), *dedup_keywords]))[:8]
        group["source_summary_items"] = [
            *(group.get("source_summary_items") or []),
            *[_safe_text(x) for x in (agenda.summary_bullets or []) if _safe_text(x)],
        ][:12]

    idea_by_agenda: dict[str, list[dict[str, Any]]] = {}
    for idea in ideas:
        agenda_id = _safe_text(idea.agenda_id)
        if not agenda_id:
            continue
        idea_by_agenda.setdefault(agenda_id, []).append(
            {
                "id": _safe_text(idea.id),
                "kind": _safe_text(idea.kind, "note"),
                "title": _safe_text(idea.title),
                "body": _safe_text(idea.body),
            }
        )

    out: list[dict[str, Any]] = []
    for idx, group in enumerate(groups, start=1):
        linked_ideas: list[dict[str, Any]] = []
        for agenda_id in group.get("agenda_ids") or []:
            linked_ideas.extend(idea_by_agenda.get(_safe_text(agenda_id), []))

        topic = _safe_text(group.get("topic"), f"주제 {idx}")
        summaries = [_safe_text(x) for x in (group.get("source_summary_items") or []) if _safe_text(x)]
        out.append(
            {
                "group_id": _safe_text(group.get("group_id"), f"problem-group-{idx}"),
                "topic": _normalize_problem_topic_label(topic, f"주제 {idx}"),
                "insight_lens": "공통 행동과 니즈를 묶어 해석",
                "keywords": [_safe_text(x) for x in (group.get("keywords") or []) if _safe_text(x)][:6],
                "agenda_ids": [_safe_text(x) for x in (group.get("agenda_ids") or []) if _safe_text(x)],
                "agenda_titles": [_safe_text(x) for x in (group.get("agenda_titles") or []) if _safe_text(x)],
                "ideas": linked_ideas[:24],
                "source_summary_items": summaries[:8],
                "conclusion": _to_summary_point(summaries[0], max_len=None) if summaries else f"{_safe_text(topic)} 방향 구체화",
            }
        )
    return out


def _normalize_problem_topic_label(raw: Any, fallback: str = "주제") -> str:
    text = _strip_leading_timestamp(raw) or _safe_text(fallback, "주제")
    parts = re.findall(r"[A-Za-z0-9가-힣]+", text)
    cleaned: list[str] = []
    for part in parts:
        tok = _safe_text(part)
        if not tok:
            continue
        lowered = tok.lower()
        if lowered in STOPWORDS or _is_title_keyword_noise(tok):
            continue
        cleaned.append(tok)
        if len(cleaned) >= 2:
            break
    if cleaned:
        return " ".join(cleaned)
    return _safe_text(fallback, "주제")


def _normalize_problem_summary_label(raw: Any, fallback: str = "분류", max_len: int = 34) -> str:
    text = _to_summary_point(_safe_text(raw), max_len=None)
    if not text:
        text = _to_summary_point(_safe_text(fallback, "분류"), max_len=None)
    text = re.sub(r"^(음|어|아|그|저|네|예|일단|그리고|근데|그러니까|그니까)\s+", "", text).strip()
    text = re.sub(r"\s+", " ", text).strip(" .,!?:;\"'“”‘’")

    destination_match = re.search(r"([A-Za-z0-9가-힣]{2,})(?:으로|로)\s*가는?\s*건?\s*어때", text)
    if destination_match:
        text = f"목적지 {destination_match.group(1)} 설정"
    elif re.search(r"역사|수업|학습|배울", text) and re.search(r"유용|쉽|좋|배울|알기", text):
        text = "역사적 지식을 배우는데 유용"
    elif re.search(r"교통|이동|버스|지하철|편의", text):
        text = "교통의 편의성"
    elif re.search(r"근처", text) and re.search(r"살|거주", text):
        text = "근처에 살음"
    elif re.search(r"근처", text) and re.search(r"밥|먹", text):
        text = "근처에서 밥을 많이 먹어봄"
    elif re.search(r"식당|밥|먹", text) and re.search(r"많|괜찮|좋|근처", text):
        text = "괜찮은 식당이 많음"

    text = re.sub(r"(하면 좋겠다는 의견|라는 의견|이라는 의견|라고 봄|라고 판단됨)$", "", text).strip()
    if len(text) > max_len:
        split_parts = [
            part.strip(" ,;:/")
            for part in re.split(r"\s*(?:그리고|하지만|그래서|왜냐하면|아무래도|때문에|인데|인데요)\s*", text)
            if part.strip(" ,;:/")
        ]
        if split_parts:
            text = split_parts[0]
    if len(text) > max_len:
        text = text[:max_len].rstrip()
    return _safe_text(text, _safe_text(fallback, "분류"))


def _problem_taxonomy_conclusion_key(raw: Any) -> str:
    text = _safe_text(raw).lower()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[^\w가-힣]", "", text)
    text = re.sub(
        r"(이라는|라는)?(의견|논의|내용|근거|쟁점|포인트)(이다|임|입니다|이었다|였습니다)?$",
        "",
        text,
    )
    text = re.sub(
        r"(으로|로)?(제시|언급|확인|정리|요약)(됨|됐다|되었다|된다|되었습니다|됐습니다|됐다)$",
        "",
        text,
    )
    text = re.sub(r"(볼수있다|보인다|보입니다|판단된다|판단됩니다)$", "", text)
    return text


def _normalize_problem_taxonomy_conclusion(raw: Any, topic: Any = "", fallback: Any = "") -> str:
    topic_text = _normalize_problem_summary_label(topic, "", max_len=34)
    text = _normalize_problem_summary_label(raw, fallback or topic_text or "결론", max_len=96)
    text = re.sub(r"\s+", " ", text).strip(" .,!?:;\"'“”‘’")
    text = re.sub(r"(이라는|라는)?\s*(의견|논의|내용)$", "", text).strip()
    text = re.sub(r"(으로|로)?\s*(정리됨|정리됐다|요약됨|요약됐다|확인됨|확인됐다)$", "", text).strip()

    text_key = _problem_taxonomy_conclusion_key(text)
    topic_key = _problem_taxonomy_conclusion_key(topic_text)
    if not text_key or (topic_key and text_key == topic_key):
        return ""
    return text


def _dedupe_problem_taxonomy_conclusions(groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_keys: set[str] = set()
    for group in groups:
        topic = group.get("topic", "")
        source_items = group.get("source_summary_items") if isinstance(group.get("source_summary_items"), list) else []
        candidates = [
            group.get("conclusion"),
            group.get("insight_lens"),
            *source_items,
        ]
        conclusion = ""
        for candidate in candidates:
            normalized = _normalize_problem_taxonomy_conclusion(candidate, topic)
            key = _problem_taxonomy_conclusion_key(normalized)
            if not normalized or not key or key in seen_keys:
                continue
            conclusion = normalized
            seen_keys.add(key)
            break
        group["conclusion"] = conclusion
        group["conclusion_user_edited"] = False
    return groups


def _problem_taxonomy_root_payload(payload: ProblemTaxonomyGenerateInput) -> ProblemTaxonomyGenerateInput:
    data = _payload_to_primitive(payload)
    if not isinstance(data, dict):
        data = {}
    try:
        max_groups = max(6, int(data.get("max_groups") or 6))
    except (TypeError, ValueError):
        max_groups = 6
    data.update(
        {
            "parent_group_id": "",
            "parent_topic": "",
            "parent_depth": -1,
            "parent_evidence_utterance_ids": [],
            "existing_group_ids": [],
            "existing_groups": [],
            "max_groups": max_groups,
        }
    )
    return ProblemTaxonomyGenerateInput(**data)


def _stable_short_id(raw: Any) -> str:
    text = _safe_text(raw)
    value = 2166136261
    for ch in text:
        value ^= ord(ch)
        value = (value * 16777619) & 0xFFFFFFFF
    return format(value, "x")[:8]


def _problem_taxonomy_utterance_dict(item: ProblemTaxonomyUtteranceInput) -> dict[str, str]:
    return {
        "id": _safe_text(item.id) or f"utterance-{_stable_short_id(item.text)}",
        "speaker": _safe_text(item.speaker, "참가자"),
        "text": _strip_leading_timestamp(item.text),
        "timestamp": _safe_text(item.timestamp),
    }


def _problem_taxonomy_utterance_row(raw: Any) -> dict[str, str]:
    if isinstance(raw, ProblemTaxonomyUtteranceInput):
        return _problem_taxonomy_utterance_dict(raw)
    if isinstance(raw, dict):
        text = _strip_leading_timestamp(raw.get("text"))
        return {
            "id": _safe_text(raw.get("id")) or f"utterance-{_stable_short_id(text)}",
            "speaker": _safe_text(raw.get("speaker"), "참가자"),
            "text": text,
            "timestamp": _safe_text(raw.get("timestamp")),
        }
    text = _strip_leading_timestamp(raw)
    return {
        "id": f"utterance-{_stable_short_id(text)}",
        "speaker": "참가자",
        "text": text,
        "timestamp": "",
    }


def _normalize_problem_taxonomy_utterance_rows(raw_items: Any) -> list[dict[str, str]]:
    if not isinstance(raw_items, list):
        return []
    rows = [_problem_taxonomy_utterance_row(item) for item in raw_items]
    return [row for row in rows if _safe_text(row.get("text"))]


def _get_problem_taxonomy_utterance_snapshot(rt: RuntimeStore, meeting_id: str) -> list[dict[str, str]]:
    normalized_meeting_id = _safe_text(meeting_id)
    if not normalized_meeting_id:
        return []
    workspace = _ensure_canvas_workspace_entry(rt, normalized_meeting_id)
    llm_cache = workspace.get("llm_cache") if isinstance(workspace, dict) else {}
    if not isinstance(llm_cache, dict):
        return []
    cached = llm_cache.get("problem_taxonomy_utterance_snapshot")
    if not isinstance(cached, dict):
        return []
    result = cached.get("result")
    utterances = result.get("utterances") if isinstance(result, dict) else []
    return _normalize_problem_taxonomy_utterance_rows(utterances)


def _set_problem_taxonomy_utterance_snapshot(rt: RuntimeStore, meeting_id: str, rows: list[dict[str, str]]) -> None:
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_rows = _normalize_problem_taxonomy_utterance_rows(rows)
    if not normalized_meeting_id or not normalized_rows:
        return
    workspace = _ensure_canvas_workspace_entry(rt, normalized_meeting_id)
    llm_cache = workspace.get("llm_cache")
    if not isinstance(llm_cache, dict):
        llm_cache = {}
        workspace["llm_cache"] = llm_cache
    llm_cache["problem_taxonomy_utterance_snapshot"] = {
        "signature": _canvas_llm_signature(normalized_rows),
        "generated_at": _now_ts(),
        "result": {
            "utterances": copy.deepcopy(normalized_rows),
            "utterance_count": len(normalized_rows),
        },
    }


def _resolve_problem_taxonomy_utterance_rows(
    meeting_id: str,
    utterances: list[ProblemTaxonomyUtteranceInput] | list[dict[str, str]] | None,
) -> list[dict[str, str]]:
    rows = _normalize_problem_taxonomy_utterance_rows(list(utterances or []))
    if rows:
        _set_problem_taxonomy_utterance_snapshot(RT, meeting_id, rows)
        return rows
    return _get_problem_taxonomy_utterance_snapshot(RT, meeting_id)


def _problem_taxonomy_existing_group_dict(item: ProblemTaxonomyExistingGroupInput) -> dict[str, Any]:
    return {
        "group_id": _safe_text(item.group_id),
        "parent_group_id": _safe_text(item.parent_group_id),
        "depth": int(item.depth or 0),
        "topic": _safe_text(item.topic),
        "evidence_utterance_ids": _dedup_preserve(
            [_safe_text(value) for value in (item.evidence_utterance_ids or []) if _safe_text(value)],
            limit=80,
        ),
        "source_summary_items": _dedup_preserve(
            [_safe_text(value) for value in (item.source_summary_items or []) if _safe_text(value)],
            limit=8,
        ),
    }


def _problem_taxonomy_topic_key(raw: Any) -> str:
    text = _strip_leading_timestamp(raw).lower()
    text = re.sub(r"[^a-z0-9가-힣]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _problem_taxonomy_topic_token_set(raw: Any) -> set[str]:
    return set(_problem_taxonomy_tokens(_safe_text(raw)))


def _problem_taxonomy_topic_overlap(left: Any, right: Any) -> float:
    left_tokens = _problem_taxonomy_topic_token_set(left)
    right_tokens = _problem_taxonomy_topic_token_set(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))


def _problem_taxonomy_topics_similar(left: Any, right: Any) -> bool:
    left_key = _problem_taxonomy_topic_key(left)
    right_key = _problem_taxonomy_topic_key(right)
    if not left_key or not right_key:
        return False
    if left_key == right_key:
        return True

    left_tokens = _problem_taxonomy_topic_token_set(left)
    right_tokens = _problem_taxonomy_topic_token_set(right)
    if min(len(left_tokens), len(right_tokens)) < 2:
        return False
    overlap = len(left_tokens & right_tokens)
    return overlap >= 2 and overlap / max(1, min(len(left_tokens), len(right_tokens))) >= 0.8


def _problem_taxonomy_scope_existing_groups(payload: ProblemTaxonomyGenerateInput) -> list[dict[str, Any]]:
    parent_group_id = _safe_text(payload.parent_group_id)
    groups = [
        _problem_taxonomy_existing_group_dict(item)
        for item in (payload.existing_groups or [])
        if _safe_text(item.group_id) or _safe_text(item.topic)
    ]
    return [
        group
        for group in groups
        if _safe_text(group.get("parent_group_id")) == parent_group_id
        or _safe_text(group.get("group_id")) == parent_group_id
    ][:40]


def _problem_taxonomy_evidence_overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / max(1, min(len(left), len(right)))


def _problem_taxonomy_is_duplicate_group(
    payload: ProblemTaxonomyGenerateInput,
    group: dict[str, Any],
) -> bool:
    parent_group_id = _safe_text(payload.parent_group_id)
    group_id = _safe_text(group.get("group_id"))
    topic = _safe_text(group.get("topic"))
    if group_id and group_id in {_safe_text(item) for item in (payload.existing_group_ids or []) if _safe_text(item)}:
        return True
    if _safe_text(payload.parent_topic) and _problem_taxonomy_topics_similar(topic, payload.parent_topic):
        return True

    candidate_evidence = {
        _safe_text(item)
        for item in (group.get("evidence_utterance_ids") or [])
        if _safe_text(item)
    }
    for existing in _problem_taxonomy_scope_existing_groups(payload):
        existing_id = _safe_text(existing.get("group_id"))
        if group_id and existing_id == group_id:
            return True
        if existing_id == parent_group_id and _problem_taxonomy_topics_similar(topic, existing.get("topic")):
            return True
        if _safe_text(existing.get("parent_group_id")) != parent_group_id:
            continue
        if _problem_taxonomy_topics_similar(topic, existing.get("topic")):
            return True

        existing_evidence = {
            _safe_text(item)
            for item in (existing.get("evidence_utterance_ids") or [])
            if _safe_text(item)
        }
        if (
            _problem_taxonomy_evidence_overlap(candidate_evidence, existing_evidence) >= 0.75
            and _problem_taxonomy_topic_overlap(topic, existing.get("topic")) >= 0.5
        ):
            return True
    return False


def _filter_problem_taxonomy_duplicate_groups(
    payload: ProblemTaxonomyGenerateInput,
    groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen_topics: list[str] = []
    seen_evidence: list[set[str]] = []
    for group in groups:
        topic = _safe_text(group.get("topic"))
        evidence = {
            _safe_text(item)
            for item in (group.get("evidence_utterance_ids") or [])
            if _safe_text(item)
        }
        if _problem_taxonomy_is_duplicate_group(payload, group):
            continue
        if any(_problem_taxonomy_topics_similar(topic, previous_topic) for previous_topic in seen_topics):
            continue
        if any(
            _problem_taxonomy_evidence_overlap(evidence, previous_evidence) >= 0.85
            and _problem_taxonomy_topic_overlap(topic, seen_topics[index]) >= 0.5
            for index, previous_evidence in enumerate(seen_evidence)
        ):
            continue
        output.append(group)
        seen_topics.append(topic)
        seen_evidence.append(evidence)
    return output


def _split_taxonomy_clauses(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", _strip_leading_timestamp(text)).strip()
    if not normalized:
        return []
    chunks = re.split(r"[.!?\n。！？]+|(?:\s*/\s*)|(?:,\s*)|(?:;\s*)|(?<=고)\s+", normalized)
    clauses: list[str] = []
    for chunk in chunks:
        cleaned = re.sub(r"^(음|어|아|그|저|네|예|그러니까|그리고|근데|일단)\s+", "", chunk.strip())
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if len(cleaned) < 3:
            continue
        if cleaned.lower() in STOPWORDS:
            continue
        clauses.append(cleaned[:80])
    return clauses or ([normalized[:80]] if normalized else [])


def _problem_taxonomy_tokens(text: str) -> list[str]:
    tokens = []
    for token in re.findall(r"[A-Za-z0-9가-힣]{2,}", _safe_text(text).lower()):
        if token in STOPWORDS or _is_title_keyword_noise(token):
            continue
        tokens.append(token)
    return _dedup_preserve(tokens, limit=12)


def _problem_taxonomy_relevance(row: dict[str, str], parent_topic: str, parent_tokens: set[str]) -> int:
    if not parent_topic and not parent_tokens:
        return 1
    text = row.get("text", "").lower()
    score = 0
    if parent_topic and parent_topic.lower() in text:
        score += 4
    row_tokens = set(_problem_taxonomy_tokens(text))
    score += len(row_tokens & parent_tokens) * 2
    return score


def _select_problem_taxonomy_rows(payload: ProblemTaxonomyGenerateInput) -> list[dict[str, str]]:
    rows = [
        row
        for row in _resolve_problem_taxonomy_utterance_rows(payload.meeting_id, payload.utterances)
        if _safe_text(row.get("text"))
    ]
    parent_ids = {_safe_text(item) for item in (payload.parent_evidence_utterance_ids or []) if _safe_text(item)}
    if parent_ids:
        filtered = [row for row in rows if _safe_text(row.get("id")) in parent_ids]
        if filtered:
            return filtered

    parent_topic = _safe_text(payload.parent_topic)
    parent_tokens = set(_problem_taxonomy_tokens(parent_topic))
    if not parent_topic and not parent_tokens:
        return rows

    scored = [
        (row, _problem_taxonomy_relevance(row, parent_topic, parent_tokens))
        for row in rows
    ]
    relevant = [row for row, score in scored if score > 0]
    return relevant or rows


def _problem_taxonomy_group_from_cluster(
    payload: ProblemTaxonomyGenerateInput,
    index: int,
    cluster: dict[str, Any],
    used_ids: set[str],
    *,
    parent_group_id_override: str | None = None,
    parent_depth_override: int | None = None,
) -> dict[str, Any]:
    parent_group_id = _safe_text(
        parent_group_id_override if parent_group_id_override is not None else payload.parent_group_id
    )
    parent_depth_raw = parent_depth_override if parent_depth_override is not None else payload.parent_depth
    parent_depth = int(parent_depth_raw if parent_depth_raw is not None else -1)
    depth = max(0, parent_depth + 1)
    label = _normalize_problem_summary_label(cluster.get("label"), f"분류 {index}")
    group_id_base = f"{parent_group_id or 'problem-group'}-{_stable_short_id(label)}"
    group_id = group_id_base
    suffix = 2
    while group_id in used_ids:
        group_id = f"{group_id_base}-{suffix}"
        suffix += 1
    used_ids.add(group_id)

    rows = cluster.get("rows") or []
    source_items = [
        _to_summary_point(row.get("text", ""), max_len=None)
        for row in rows
        if _safe_text(row.get("text"))
    ]
    source_items = _dedup_preserve([item for item in source_items if item], limit=5)
    keywords = _dedup_preserve(
        [
            token
            for row in rows
            for token in _problem_taxonomy_tokens(row.get("text", ""))
        ],
        limit=6,
    )
    evidence_ids = _dedup_preserve(
        [_safe_text(row.get("id")) for row in rows if _safe_text(row.get("id"))],
        limit=60,
    )
    conclusion = _normalize_problem_taxonomy_conclusion(
        cluster.get("summary") or (source_items[0] if source_items else label),
        label,
        source_items[0] if source_items else "",
    )

    return {
        "group_id": group_id,
        "parent_group_id": parent_group_id,
        "depth": depth,
        "topic": label,
        "insight_lens": "",
        "keywords": keywords,
        "agenda_ids": ["agenda-fallback"],
        "agenda_titles": [_safe_text(payload.meeting_topic, "현재 회의")],
        "ideas": [],
        "discussion_items": [],
        "linked_group_ids": [],
        "evidence_utterance_ids": evidence_ids,
        "source_summary_items": source_items,
        "conclusion": conclusion,
        "conclusion_user_edited": False,
        "status": "draft",
        "source_signature": _canvas_llm_signature(
            {
                "parent_group_id": parent_group_id,
                "topic": label,
                "evidence_utterance_ids": evidence_ids,
            }
        ),
        "source_agenda_signatures": {},
        "source_idea_signatures": {},
    }


def _build_problem_taxonomy_groups_local(payload: ProblemTaxonomyGenerateInput) -> list[dict[str, Any]]:
    rows = _select_problem_taxonomy_rows(payload)
    if not rows:
        return []

    parent_topic = _safe_text(payload.parent_topic)
    clustering_rows: list[dict[str, str]] = []
    if parent_topic:
        for row in rows:
            clauses = _split_taxonomy_clauses(row.get("text", ""))
            for clause in clauses:
                clustering_rows.append(
                    {
                        **row,
                        "text": clause,
                    }
                )
        if not clustering_rows:
            clustering_rows = rows
    else:
        clustering_rows = rows

    clusters: list[dict[str, Any]] = []
    for row in clustering_rows:
        clauses = _split_taxonomy_clauses(row.get("text", ""))
        candidates = clauses[:2] or [row.get("text", "")]
        tokens = set(_problem_taxonomy_tokens(" ".join(candidates)))
        if not tokens:
            continue

        best_cluster: dict[str, Any] | None = None
        best_score = 0
        for cluster in clusters:
            overlap = len(tokens & set(cluster.get("tokens") or []))
            if overlap > best_score:
                best_score = overlap
                best_cluster = cluster

        if best_cluster and best_score >= 2:
            best_cluster["rows"].append(row)
            best_cluster["tokens"] = _dedup_preserve([*(best_cluster.get("tokens") or []), *tokens], limit=18)
            continue

        label_source = candidates[0]
        label = _normalize_problem_summary_label(label_source, label_source)
        clusters.append(
            {
                "label": label,
                "summary": label_source,
                "tokens": list(tokens),
                "rows": [row],
            }
        )

    clusters.sort(key=lambda item: (-len(item.get("rows") or []), _safe_text(item.get("label"))))
    used_ids = {_safe_text(item) for item in (payload.existing_group_ids or []) if _safe_text(item)}
    return [
        _problem_taxonomy_group_from_cluster(payload, index + 1, cluster, used_ids)
        for index, cluster in enumerate(clusters[: payload.max_groups])
    ]


def _demo_balance_clean_text(text: Any) -> str:
    return re.sub(r"\s+", " ", _safe_text(text)).strip()


def _demo_balance_has_choice_token(text: str, token: str) -> bool:
    return re.search(rf"(^|[^A-Za-z0-9가-힣]){re.escape(token)}([^A-Za-z0-9가-힣]|$)", text, re.IGNORECASE) is not None


def _demo_balance_has_option_mention(text: str, option: str) -> bool:
    clean_option = _safe_text(option).strip()
    return bool(clean_option and re.search(re.escape(clean_option), text, re.IGNORECASE))


def _demo_balance_choice_local(text: str, demo_config: dict[str, Any]) -> str:
    clean = _demo_balance_clean_text(text)
    has_a = (
        _demo_balance_has_choice_token(clean, "A")
        or _demo_balance_has_option_mention(clean, demo_config.get("option_a", ""))
        or _demo_balance_has_option_mention(clean, demo_config.get("option_a_keyword", ""))
    )
    has_b = (
        _demo_balance_has_choice_token(clean, "B")
        or _demo_balance_has_option_mention(clean, demo_config.get("option_b", ""))
        or _demo_balance_has_option_mention(clean, demo_config.get("option_b_keyword", ""))
    )
    if has_a and not has_b:
        return "a"
    if has_b and not has_a:
        return "b"
    return "unclassified"


def _build_demo_balance_classification_local(
    payload: ProblemTaxonomyGenerateInput,
    rows: list[dict[str, str]],
) -> dict[str, Any]:
    demo_config = _normalize_canvas_demo_config(payload.demo_config)
    source_signature = _canvas_llm_signature(
        {
            "mode": "demo_balance",
            "option_a": demo_config.get("option_a"),
            "option_a_keyword": demo_config.get("option_a_keyword"),
            "option_b": demo_config.get("option_b"),
            "option_b_keyword": demo_config.get("option_b_keyword"),
            "rows": [
                {
                    "id": row.get("id"),
                    "text": row.get("text"),
                    "timestamp": row.get("timestamp"),
                }
                for row in rows
            ],
        }
    )
    opinions = []
    for index, row in enumerate(rows):
        text = _demo_balance_clean_text(row.get("text"))
        choice = _demo_balance_choice_local(text, demo_config)
        valid = choice in {"a", "b"}
        opinions.append(
            {
                "id": f"demo-opinion-{index + 1}",
                "utterance_id": _safe_text(row.get("id")) or f"utterance-{index + 1}",
                "choice": choice,
                "valid": valid,
                "confidence": 0.65 if valid else 0.25,
                "reason_summary": _demo_balance_card_summary_text(text, choice, demo_config) if valid else _truncate_text(text, 180),
                "keywords": [],
                "text": _truncate_text(text, 360),
            }
        )

    main_opinions = {"a": [], "b": []}
    for choice in ("a", "b"):
        for opinion in [item for item in opinions if item.get("valid") and item.get("choice") == choice][:6]:
            text = _safe_text(opinion.get("text") or opinion.get("reason_summary"))
            if not text:
                continue
            next_index = len(main_opinions[choice]) + 1
            main_opinions[choice].append(
                {
                    "id": f"demo-main-{choice}-{next_index}",
                    "title": _demo_balance_card_summary_title(text, choice, demo_config, next_index),
                    "text": _truncate_text(_demo_balance_card_summary_text(text, choice, demo_config), 220),
                    "keywords": [],
                    "evidence_utterance_ids": [_safe_text(opinion.get("utterance_id"))],
                }
            )

    return _normalize_canvas_demo_balance_classification(
        {
            "version": 1,
            "mode": "demo_balance",
            "option_a": demo_config.get("option_a", ""),
            "option_b": demo_config.get("option_b", ""),
            "classified_at": _now_ts(),
            "source_signature": source_signature,
            "opinions": opinions,
            "summary": {
                "option_a_summary": "",
                "option_b_summary": "",
                "unclassified_summary": "",
            },
            "main_opinions": main_opinions,
        }
    )


def _build_demo_balance_classification_prompt(
    payload: ProblemTaxonomyGenerateInput,
    context: dict[str, Any],
) -> str:
    demo_config = _normalize_canvas_demo_config(payload.demo_config)
    rows = context.get("rows") if isinstance(context.get("rows"), list) else _select_problem_taxonomy_rows(payload)
    input_payload = {
        "option_a": demo_config.get("option_a", "A"),
        "option_b": demo_config.get("option_b", "B"),
        "utterances": [
            {
                "id": _safe_text(row.get("id")),
                "text": _truncate_text(_safe_text(row.get("text")), 260),
            }
            for row in rows[:120]
            if _safe_text(row.get("id")) and _safe_text(row.get("text"))
        ],
    }
    return (
        "너는 3분 내외 A/B 밸런스 게임 회의의 문제정의 카드를 만드는 AI 판정 보조자다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 전체 STT를 A 의견과 B 의견 중심으로 빠르게 정리한다.\n"
        "- 문제정의 화면에는 A/B 카드 2개만 들어간다. 별도 1단계/2단계 구조화는 만들지 않는다.\n"
        "- 각 utterance는 A/B/미분류 중 하나로 분류하되, A/B 유효 의견은 모두 opinions에 남긴다.\n"
        "- main_opinions는 화면 카드에 보여줄 대표 의견만 3~6개로 압축한다.\n"
        "- reason_summary와 main_opinions의 text는 STT 말투를 문장으로 다듬되 새로운 사실을 만들지 않는다.\n"
        "- main_opinions는 원문 발화를 복사하지 말고, 짧은 요약 카드 문장으로 다시 쓴다.\n"
        "- 감탄사, 말버릇, 반복어, '저는/제가/그냥/근데/아니' 같은 구어체 시작 표현은 제거한다.\n"
        "- 인명은 keywords에 넣지 않는다.\n"
        "- 입력에 없는 투표 결과, 참가자 수, 사실을 만들지 않는다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "opinions": [\n'
        '    {"utterance_id":"입력 id","choice":"a|b|unclassified","valid":true,"confidence":0.0,"reason_summary":"실제 의견 요약","keywords":["핵심 명사"]}\n'
        "  ],\n"
        '  "summary": {"option_a_summary":"A 의견 전체 요약","option_b_summary":"B 의견 전체 요약","unclassified_summary":"미분류 참고 요약"},\n'
        '  "main_opinions": {\n'
        '    "a": [{"title":"대표 의견 제목","text":"카드에 표시할 짧은 요약","keywords":["키워드"],"evidence_utterance_ids":["입력 id"]}],\n'
        '    "b": [{"title":"대표 의견 제목","text":"카드에 표시할 짧은 요약","keywords":["키워드"],"evidence_utterance_ids":["입력 id"]}]\n'
        "  }\n"
        "}\n\n"
        "[규칙]\n"
        "- opinions는 입력 utterances의 id를 그대로 사용한다.\n"
        "- choice가 a/b이면 valid=true, unclassified이면 valid=false다.\n"
        "- confidence는 0~1 숫자다. 선택이 직접 언급되면 0.8 이상, 선택지명만 명확하면 0.6~0.8, 애매하면 unclassified다.\n"
        "- reason_summary는 12~60자 정도로 짧고 구체적으로 쓴다.\n"
        "- main_opinions.a/b는 각각 최대 6개다. 비슷한 의견은 하나로 합친다.\n"
        "- main_opinions.title은 10~24자 논점 제목이다. 원문 첫 문장을 그대로 쓰지 않는다.\n"
        "- main_opinions.text는 30~80자 요약문이다. 원문을 따옴표처럼 그대로 옮기지 않는다.\n"
        "- main_opinions의 evidence_utterance_ids에는 근거가 된 입력 id를 1개 이상 넣는다.\n"
        "- keywords는 명사 중심 0~4개만 쓴다. 사람 이름은 제외한다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_demo_balance_llm_classification(
    parsed: Any,
    payload: ProblemTaxonomyGenerateInput,
    rows: list[dict[str, str]],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        return fallback
    demo_config = _normalize_canvas_demo_config(payload.demo_config)
    fallback_by_id = {
        _safe_text(opinion.get("utterance_id")): opinion
        for opinion in fallback.get("opinions", [])
        if isinstance(opinion, dict) and _safe_text(opinion.get("utterance_id"))
    }
    raw_opinions = parsed.get("opinions") if isinstance(parsed.get("opinions"), list) else []
    llm_by_id: dict[str, dict[str, Any]] = {}
    for item in raw_opinions:
        if not isinstance(item, dict):
            continue
        utterance_id = _safe_text(item.get("utterance_id") or item.get("utteranceId") or item.get("id"))
        if utterance_id:
            llm_by_id[utterance_id] = item

    opinions: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        utterance_id = _safe_text(row.get("id")) or f"utterance-{index + 1}"
        raw = llm_by_id.get(utterance_id) or fallback_by_id.get(utterance_id) or {}
        text = _demo_balance_clean_text(row.get("text"))
        choice = _safe_text(raw.get("choice")).lower()
        if choice not in {"a", "b"}:
            choice = "unclassified"
        valid = choice in {"a", "b"} and raw.get("valid") is not False
        opinions.append(
            {
                "id": _safe_text(raw.get("id")) or f"demo-opinion-{index + 1}",
                "utterance_id": utterance_id,
                "choice": choice if valid else "unclassified",
                "valid": valid,
                "confidence": _safe_float(raw.get("confidence"), 0.0),
                "reason_summary": _truncate_text(_safe_text(raw.get("reason_summary") or raw.get("reasonSummary")) or text, 260),
                "keywords": raw.get("keywords") if isinstance(raw.get("keywords"), list) else [],
                "text": _truncate_text(text, 360),
            }
        )

    main_opinions = _normalize_demo_balance_main_opinions(parsed.get("main_opinions") or parsed.get("mainOpinions") or {})
    if not main_opinions["a"] and not main_opinions["b"]:
        main_opinions = _normalize_demo_balance_main_opinions(fallback.get("main_opinions") or {})
    if not main_opinions["a"] and not main_opinions["b"]:
        main_opinions = _build_demo_balance_main_opinions_from_opinions(opinions, demo_config=demo_config)
    main_opinions = _sanitize_demo_balance_main_opinion_cards(main_opinions, demo_config)

    return _normalize_canvas_demo_balance_classification(
        {
            "version": 1,
            "mode": "demo_balance",
            "option_a": demo_config.get("option_a", ""),
            "option_b": demo_config.get("option_b", ""),
            "classified_at": _now_ts(),
            "source_signature": fallback.get("source_signature", ""),
            "opinions": opinions,
            "summary": parsed.get("summary") if isinstance(parsed.get("summary"), dict) else fallback.get("summary", {}),
            "main_opinions": main_opinions,
        }
    )


def _demo_balance_opinion_group(
    classification: dict[str, Any],
    choice: str,
    label: str,
    title: str,
) -> dict[str, Any]:
    opinions = [
        opinion
        for opinion in classification.get("opinions", [])
        if isinstance(opinion, dict)
        and ((choice in {"a", "b"} and opinion.get("valid") and opinion.get("choice") == choice) or (choice == "unclassified" and not opinion.get("valid")))
    ]
    group_id = f"demo-balance-{choice}"
    status = "final" if choice in {"a", "b"} else ("review" if opinions else "draft")
    main_opinions = _normalize_demo_balance_main_opinions(classification.get("main_opinions")).get(choice, [])
    if choice in {"a", "b"} and not main_opinions:
        main_opinions = _build_demo_balance_main_opinions_from_opinions(
            opinions,
            demo_config={
                "enabled": True,
                "mode": "demo_balance",
                "option_a": classification.get("option_a"),
                "option_b": classification.get("option_b"),
            },
        ).get(choice, [])
    source_summary_items = [
        _truncate_text(_safe_text(item.get("text") or item.get("title")), 160)
        for item in main_opinions
        if isinstance(item, dict) and _safe_text(item.get("text") or item.get("title"))
    ]
    if not source_summary_items:
        source_summary_items = [
            _truncate_text(_safe_text(opinion.get("reason_summary") or opinion.get("text")), 160)
            for opinion in opinions[:12]
            if _safe_text(opinion.get("reason_summary") or opinion.get("text"))
        ]
    summary = classification.get("summary") if isinstance(classification.get("summary"), dict) else {}
    choice_summary = _safe_text(
        summary.get("option_a_summary" if choice == "a" else "option_b_summary" if choice == "b" else "unclassified_summary")
    )
    return {
        "group_id": group_id,
        "parent_group_id": "",
        "depth": 0,
        "topic": title,
        "insight_lens": label,
        "keywords": [label, title],
        "agenda_ids": [],
        "agenda_titles": [],
        "ideas": [
            {
                "id": _safe_text(item.get("id")) or f"{group_id}-idea-{index + 1}",
                "kind": "utterance",
                "title": _safe_text(item.get("title")) or f"{label} {index + 1}",
                "body": _truncate_text(_safe_text(item.get("text") or item.get("title")), 180),
            }
            for index, item in enumerate(main_opinions[:8])
            if isinstance(item, dict)
        ],
        "discussion_items": [],
        "linked_group_ids": [],
        "evidence_utterance_ids": [
            _safe_text(opinion.get("utterance_id"))
            for opinion in opinions
            if _safe_text(opinion.get("utterance_id"))
        ],
        "source_summary_items": source_summary_items,
        "conclusion": choice_summary or (
            f"{title}에 대한 유효 의견 {len(opinions)}개가 정리되었습니다."
            if choice in {"a", "b"} and opinions
            else ("A/B 선택이 명확하지 않은 참고 발화입니다." if opinions else f"{title} 의견은 아직 충분하지 않습니다.")
        ),
        "conclusion_user_edited": False,
        "status": status,
        "source_signature": f"{classification.get('source_signature', '')}:{group_id}",
        "source_agenda_signatures": {},
    }


def _build_demo_balance_problem_groups(
    classification: dict[str, Any],
) -> list[dict[str, Any]]:
    option_a = _safe_text(classification.get("option_a"), "A")
    option_b = _safe_text(classification.get("option_b"), "B")
    groups = [
        _demo_balance_opinion_group(classification, "a", "A 의견", f"A. {option_a}"),
        _demo_balance_opinion_group(classification, "b", "B 의견", f"B. {option_b}"),
    ]
    return groups


def _build_demo_balance_problem_structure(
    classification: dict[str, Any],
    groups: list[dict[str, Any]],
) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    structure_groups: list[dict[str, Any]] = []
    group_by_id = {group.get("group_id"): group for group in groups}

    for group_id, title in (
        ("demo-balance-a", group_by_id.get("demo-balance-a", {}).get("topic", "A 의견")),
        ("demo-balance-b", group_by_id.get("demo-balance-b", {}).get("topic", "B 의견")),
    ):
        group = group_by_id.get(group_id)
        if not group:
            continue
        group_nodes: list[str] = []
        for index, idea in enumerate(group.get("ideas") or []):
            if not isinstance(idea, dict):
                continue
            node_id = f"{group_id}-node-{index + 1}"
            group_nodes.append(node_id)
            nodes.append(
                {
                    "id": node_id,
                    "source_group_id": group_id,
                    "title": _safe_text(idea.get("title")) or f"{title} {index + 1}",
                    "body": _safe_text(idea.get("body")),
                    "status": group.get("status", "draft"),
                    "depth": 0,
                }
            )
        structure_groups.append(
            {
                "id": f"{group_id}-structure",
                "title": title,
                "node_ids": group_nodes,
                "rationale": "",
                "status": group.get("status", "draft"),
                "created_by": "ai",
            }
        )

    return _normalize_canvas_problem_structure_state(
        {
            "phase": "structure",
            "method": "affinity",
            "mode": "ai",
            "revision": int(time.time() * 1000),
            "source_generation_id": _safe_text(classification.get("source_signature")),
            "based_on_transcript_revision": len(classification.get("opinions") or []),
            "updated_at": _now_ts(),
            "nodes": nodes,
            "groups": structure_groups,
        }
    )


def _build_demo_balance_problem_taxonomy_result(payload: ProblemTaxonomyGenerateInput) -> dict[str, Any]:
    started_at = time.perf_counter()
    rows = _select_problem_taxonomy_rows(payload)
    fallback = _build_demo_balance_classification_local(payload, rows)
    classification = fallback
    used_llm = False
    warning = ""
    failed = False
    retryable = False
    llm_error: dict[str, Any] = {}
    llm_ms = 0
    prompt_chars = 0

    client, llm_ready, llm_note = _ensure_llm_ready(RT)
    if llm_ready and client is not None and rows:
        try:
            taxonomy_context = {
                "rows": rows,
                "total_utterance_count": len(rows),
                "included_utterance_count": len(rows),
            }
            prompt = _build_demo_balance_classification_prompt(payload, taxonomy_context)
            prompt_chars = len(prompt)
            llm_started_at = time.perf_counter()
            parsed = _call_llm_json(
                RT,
                client,
                prompt=prompt,
                stage="canvas_demo_balance_problem_summary",
                temperature=0.12,
                max_tokens=1800,
            )
            llm_ms = int((time.perf_counter() - llm_started_at) * 1000)
            classification = _normalize_demo_balance_llm_classification(parsed, payload, rows, fallback)
            used_llm = True
            RT.last_llm_parsed_json = {
                "stage": "canvas_demo_balance_problem_summary",
                "classification": copy.deepcopy(classification),
            }
            RT.last_llm_parsed_at = _now_ts()
        except Exception as exc:
            llm_ms = int((time.perf_counter() - llm_started_at) * 1000) if "llm_started_at" in locals() else 0
            llm_error = _build_llm_error_payload(
                stage="canvas_demo_balance_problem_summary",
                error_type=type(exc).__name__,
                error_preview=repr(exc),
                client=client,
                elapsed_ms=llm_ms,
            )
            print(
                "[canvas demo balance problem summary llm failed]",
                {
                    "meeting_id": _safe_text(payload.meeting_id),
                    "prompt_chars": prompt_chars,
                    "elapsed_ms": llm_ms,
                    "llm_error": llm_error,
                },
                flush=True,
            )
            failed = True
            retryable = True
            warning = _demo_llm_retryable_warning("문제정의", exc)
    elif not rows:
        warning = "A/B 의견을 분류할 STT 발화가 아직 없습니다."
    else:
        failed = True
        retryable = True
        warning = llm_note or "문제정의 모델 연결이 준비되지 않았습니다. 다시 생성해 주세요."
        llm_error = _build_llm_error_payload(
            stage="canvas_demo_balance_problem_summary",
            error_type="llm_not_ready",
            error_preview=llm_note or "LLM client is not ready",
            client=client,
            elapsed_ms=0,
        )

    groups = _build_demo_balance_problem_groups(classification)
    problem_structure = _build_demo_balance_problem_structure(classification, groups)
    print(
        "[canvas demo balance problem summary]",
        {
            "meeting_id": _safe_text(payload.meeting_id),
            "rows_count": len(rows),
            "prompt_chars": prompt_chars,
            "used_llm": used_llm,
            "llm_ms": llm_ms,
            "total_ms": int((time.perf_counter() - started_at) * 1000),
            "valid_a": _safe_nonnegative_int(classification.get("valid_a_count")),
            "valid_b": _safe_nonnegative_int(classification.get("valid_b_count")),
            "unclassified": _safe_nonnegative_int(classification.get("unclassified_count")),
            "group_count": len(groups),
            "failed": failed,
            "retryable": retryable,
        },
    )
    if failed:
        return {
            "ok": False,
            "used_llm": False,
            "retryable": retryable,
            "warning": warning,
            "llm_error": llm_error,
            "generated_at": _now_ts(),
            "groups": [],
            "problem_structure": _normalize_canvas_problem_structure_state({}),
            "demo_balance_classification": _normalize_canvas_demo_balance_classification({}),
        }
    return {
        "ok": True,
        "used_llm": used_llm,
        "retryable": False,
        "warning": warning,
        "llm_error": llm_error,
        "generated_at": _now_ts(),
        "groups": groups,
        "problem_structure": problem_structure,
        "demo_balance_classification": classification,
    }


def _normalize_problem_taxonomy_llm_groups(
    payload: ProblemTaxonomyGenerateInput,
    raw_groups: Any,
) -> list[dict[str, Any]]:
    if not isinstance(raw_groups, list):
        return []
    rows_by_id = {row["id"]: row for row in _select_problem_taxonomy_rows(payload)}
    used_ids = {_safe_text(item) for item in (payload.existing_group_ids or []) if _safe_text(item)}
    groups: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_groups[: payload.max_groups], start=1):
        if not isinstance(raw, dict):
            continue
        evidence_ids = [
            _safe_text(item)
            for item in (raw.get("evidence_utterance_ids") or raw.get("evidenceUtteranceIds") or [])
            if _safe_text(item) in rows_by_id
        ]
        source_rows = [rows_by_id[item] for item in evidence_ids]
        if not source_rows:
            source_rows = list(rows_by_id.values())[:2]
        cluster = {
            "label": raw.get("topic") or raw.get("label") or raw.get("title") or f"분류 {index}",
            "summary": raw.get("conclusion") or raw.get("summary") or "",
            "rows": source_rows,
        }
        group = _problem_taxonomy_group_from_cluster(payload, index, cluster, used_ids)
        llm_source_items = [
            _safe_text(item)
            for item in (raw.get("source_summary_items") or raw.get("sourceSummaryItems") or [])
            if _safe_text(item)
        ]
        if llm_source_items:
            group["source_summary_items"] = _dedup_preserve(llm_source_items, limit=5)
        llm_keywords = [_safe_text(item) for item in (raw.get("keywords") or []) if _safe_text(item)]
        if llm_keywords:
            group["keywords"] = _dedup_preserve(llm_keywords, limit=6)
        group["topic"] = _normalize_problem_summary_label(raw.get("topic"), group["topic"])
        group["conclusion"] = _normalize_problem_taxonomy_conclusion(
            raw.get("conclusion") or group["conclusion"],
            group["topic"],
        )
        group["insight_lens"] = _safe_text(raw.get("insight_lens") or raw.get("insightLens") or "")
        groups.append(group)
    return groups


def _problem_taxonomy_outline_raw_nodes(parsed: Any) -> list[Any]:
    if isinstance(parsed, dict):
        raw = (
            parsed.get("outline")
            or parsed.get("tree")
            or parsed.get("nodes")
            or parsed.get("groups")
        )
        if isinstance(raw, list):
            return raw
        if isinstance(raw, dict):
            return [raw]
        if any(key in parsed for key in ("topic", "label", "title", "conclusion", "children")):
            return [parsed]
        return []
    return parsed if isinstance(parsed, list) else []


def _problem_taxonomy_outline_raw_children(raw: dict[str, Any]) -> list[Any]:
    children = (
        raw.get("children")
        or raw.get("child_groups")
        or raw.get("childGroups")
        or raw.get("subgroups")
        or raw.get("sub_groups")
    )
    return children if isinstance(children, list) else []


def _promote_single_problem_taxonomy_outline_root(nodes: list[Any]) -> list[Any]:
    if len(nodes) != 1 or not isinstance(nodes[0], dict):
        return nodes
    children = _problem_taxonomy_outline_raw_children(nodes[0])
    if len(children) < 2:
        return nodes
    return children


def _problem_taxonomy_outline_score(raw: dict[str, Any], key: str) -> float | None:
    value = raw.get(key)
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 1:
        number = number / 100
    return max(0.0, min(1.0, number))


def _problem_taxonomy_outline_node_allowed(raw: dict[str, Any], depth: int) -> bool:
    if raw.get("should_include") is False or raw.get("shouldInclude") is False:
        return False
    if depth <= 0:
        return True
    direct_child = raw.get("is_direct_child", raw.get("isDirectChild"))
    if direct_child is False:
        return False
    importance = _problem_taxonomy_outline_score(raw, "importance")
    parent_fit = _problem_taxonomy_outline_score(raw, "parent_fit")
    if parent_fit is None:
        parent_fit = _problem_taxonomy_outline_score(raw, "parentFit")
    novelty = _problem_taxonomy_outline_score(raw, "novelty")
    if importance is not None and importance < 0.45:
        return False
    if parent_fit is not None and parent_fit < 0.5:
        return False
    if novelty is not None and novelty < 0.35:
        return False
    return True


def _problem_taxonomy_rows_for_outline_node(
    raw: dict[str, Any],
    rows_by_id: dict[str, dict[str, str]],
) -> list[dict[str, str]]:
    evidence_ids = [
        _safe_text(item)
        for item in (raw.get("evidence_utterance_ids") or raw.get("evidenceUtteranceIds") or [])
        if _safe_text(item) in rows_by_id
    ]
    if evidence_ids:
        return [rows_by_id[item] for item in evidence_ids]

    topic = _safe_text(raw.get("topic") or raw.get("label") or raw.get("title"))
    tokens = set(_problem_taxonomy_tokens(topic))
    if not tokens:
        return []
    scored = [
        (row, len(tokens & set(_problem_taxonomy_tokens(row.get("text", "")))))
        for row in rows_by_id.values()
    ]
    matched = [row for row, score in sorted(scored, key=lambda item: -item[1]) if score > 0]
    return matched[:3]


def _normalize_problem_taxonomy_outline_groups(
    payload: ProblemTaxonomyGenerateInput,
    raw_nodes: Any,
) -> list[dict[str, Any]]:
    nodes = _problem_taxonomy_outline_raw_nodes(raw_nodes)
    nodes = _promote_single_problem_taxonomy_outline_root(nodes)
    if not nodes:
        return []
    rows_by_id = {row["id"]: row for row in _select_problem_taxonomy_rows(_problem_taxonomy_root_payload(payload))}
    used_ids: set[str] = set()
    groups: list[dict[str, Any]] = []

    def visit(raw: Any, index_path: str, parent_group_id: str, parent_depth: int, depth: int) -> None:
        if not isinstance(raw, dict) or depth > PROBLEM_TAXONOMY_OUTLINE_MAX_DEPTH:
            return
        if not _problem_taxonomy_outline_node_allowed(raw, depth):
            return

        label_source = raw.get("topic") or raw.get("label") or raw.get("title") or f"분류 {index_path}"
        source_rows = _problem_taxonomy_rows_for_outline_node(raw, rows_by_id)
        source_items = [
            _safe_text(item)
            for item in (raw.get("source_summary_items") or raw.get("sourceSummaryItems") or [])
            if _safe_text(item)
        ]
        cluster = {
            "label": label_source,
            "summary": raw.get("conclusion") or raw.get("summary") or (source_items[0] if source_items else ""),
            "rows": source_rows,
        }
        group = _problem_taxonomy_group_from_cluster(
            payload,
            len(groups) + 1,
            cluster,
            used_ids,
            parent_group_id_override=parent_group_id,
            parent_depth_override=parent_depth,
        )
        group["topic"] = _normalize_problem_summary_label(label_source, group["topic"])
        if source_items:
            group["source_summary_items"] = _dedup_preserve(source_items, limit=5)
        raw_keywords = [_safe_text(item) for item in (raw.get("keywords") or []) if _safe_text(item)]
        if raw_keywords:
            group["keywords"] = _dedup_preserve(raw_keywords, limit=6)
        group["conclusion"] = _normalize_problem_taxonomy_conclusion(
            raw.get("conclusion") or raw.get("summary") or group["conclusion"],
            group["topic"],
            group["source_summary_items"][0] if group.get("source_summary_items") else "",
        )
        group["insight_lens"] = _safe_text(raw.get("insight_lens") or raw.get("insightLens") or "")
        groups.append(group)

        children = _problem_taxonomy_outline_raw_children(raw)
        for child_index, child in enumerate(children[:5], start=1):
            visit(child, f"{index_path}.{child_index}", group["group_id"], int(group.get("depth") or 0), depth + 1)

    for index, raw in enumerate(nodes[: payload.max_groups], start=1):
        visit(raw, str(index), "", -1, 0)
    return groups


def _problem_taxonomy_rows_char_count(rows: list[dict[str, str]]) -> int:
    return sum(len(_safe_text(row.get("text"))) + len(_safe_text(row.get("speaker"))) + 18 for row in rows)


def _chunk_problem_taxonomy_rows(rows: list[dict[str, str]]) -> list[list[dict[str, str]]]:
    chunks: list[list[dict[str, str]]] = []
    current: list[dict[str, str]] = []
    current_chars = 0
    for row in rows:
        row_chars = len(_safe_text(row.get("text"))) + len(_safe_text(row.get("speaker"))) + 18
        if current and (
            len(current) >= PROBLEM_TAXONOMY_CHUNK_MAX_ROWS
            or current_chars + row_chars > PROBLEM_TAXONOMY_CHUNK_CHAR_BUDGET
        ):
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(row)
        current_chars += row_chars
    if current:
        chunks.append(current)
    return chunks


def _problem_taxonomy_prompt_rows(rows: list[dict[str, str]], max_text_chars: int = 900) -> list[dict[str, str]]:
    return [
        {
            "id": _safe_text(row.get("id")),
            "speaker": _safe_text(row.get("speaker"), "참가자"),
            "text": _truncate_text(row.get("text"), max_text_chars),
            "timestamp": _safe_text(row.get("timestamp")),
        }
        for row in rows
        if _safe_text(row.get("text"))
    ]


def _select_problem_taxonomy_raw_context_rows(payload: ProblemTaxonomyGenerateInput, rows: list[dict[str, str]]) -> list[dict[str, str]]:
    if _problem_taxonomy_rows_char_count(rows) <= PROBLEM_TAXONOMY_RAW_CONTEXT_CHAR_BUDGET:
        return rows

    parent_topic = _safe_text(payload.parent_topic)
    parent_tokens = set(_problem_taxonomy_tokens(parent_topic))
    scored = [
        (index, row, _problem_taxonomy_relevance(row, parent_topic, parent_tokens))
        for index, row in enumerate(rows)
    ]
    if parent_topic or parent_tokens:
        selected = sorted(
            [entry for entry in scored if entry[2] > 0],
            key=lambda entry: (-entry[2], entry[0]),
        )
    else:
        selected = scored

    picked: list[tuple[int, dict[str, str]]] = []
    total_chars = 0
    seen_ids: set[str] = set()
    for index, row, _score in selected:
        row_id = _safe_text(row.get("id"))
        if row_id and row_id in seen_ids:
            continue
        row_chars = len(_safe_text(row.get("text"))) + len(_safe_text(row.get("speaker"))) + 18
        if picked and total_chars + row_chars > PROBLEM_TAXONOMY_RAW_CONTEXT_CHAR_BUDGET:
            break
        picked.append((index, row))
        total_chars += row_chars
        if row_id:
            seen_ids.add(row_id)

    if not picked:
        picked = [(index, row) for index, row, _score in scored[:12]]

    return [row for _index, row in sorted(picked, key=lambda item: item[0])]


def _build_problem_taxonomy_chunk_summary_prompt(
    payload: ProblemTaxonomyGenerateInput,
    rows: list[dict[str, str]],
    chunk_index: int,
    chunk_count: int,
) -> str:
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "parent_topic": _safe_text(payload.parent_topic),
        "chunk_index": chunk_index,
        "chunk_count": chunk_count,
        "utterances": _problem_taxonomy_prompt_rows(rows),
    }
    return (
        "너는 회의 전문 chunk를 문제정의 요약 트리에 쓰기 좋게 압축하는 분석기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 입력 utterances에서 실제로 말한 논의 포인트만 요약한다.\n"
        "- 문서 제목 구조로 확장할 수 있도록, 서로 겹치지 않는 핵심 포인트를 뽑는다.\n"
        "- 새로운 사실, 장소, 이유, 해결책을 발명하지 않는다.\n"
        "- 각 summary_items 항목은 반드시 evidence_utterance_ids를 가진다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "chunk_title": "경복궁 후보와 선택 근거",\n'
        '  "summary_items": [\n'
        '    {"text": "경복궁은 역사 학습에 유용한 목적지로 제안됐다.", "evidence_utterance_ids": ["utt-1"]},\n'
        '    {"text": "교통과 식당 접근성도 경복궁 선택 근거로 언급됐다.", "evidence_utterance_ids": ["utt-1", "utt-2"]}\n'
        "  ],\n"
        '  "keywords": ["경복궁", "역사 학습", "교통", "식당"]\n'
        "}\n\n"
        "[규칙]\n"
        "- summary_items는 2~6개다.\n"
        "- 각 text는 한국어 1문장, 20~70자 정도다.\n"
        "- 같은 의미를 반복하지 말고 MECE에 가깝게 분리한다.\n"
        "- evidence_utterance_ids는 입력 utterances에 있는 id만 사용한다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_problem_taxonomy_chunk_summary(
    parsed: Any,
    rows: list[dict[str, str]],
    chunk_index: int,
) -> dict[str, Any]:
    row_ids = {_safe_text(row.get("id")) for row in rows if _safe_text(row.get("id"))}
    if not isinstance(parsed, dict):
        parsed = {}
    raw_items = parsed.get("summary_items") or parsed.get("summaryItems") or []
    summary_items: list[dict[str, Any]] = []
    if isinstance(raw_items, list):
        for item in raw_items:
            if isinstance(item, dict):
                text = _safe_text(item.get("text") or item.get("summary"))
                evidence_ids = [
                    _safe_text(value)
                    for value in (item.get("evidence_utterance_ids") or item.get("evidenceUtteranceIds") or [])
                    if _safe_text(value) in row_ids
                ]
            else:
                text = _safe_text(item)
                evidence_ids = []
            if not text:
                continue
            if not evidence_ids:
                evidence_ids = [_safe_text(row.get("id")) for row in rows[:2] if _safe_text(row.get("id"))]
            summary_items.append(
                {
                    "text": _to_summary_point(text, max_len=90),
                    "evidence_utterance_ids": _dedup_preserve(evidence_ids, limit=12),
                }
            )
            if len(summary_items) >= 6:
                break

    keywords = [
        _safe_text(item)
        for item in (parsed.get("keywords") if isinstance(parsed.get("keywords"), list) else [])
        if _safe_text(item)
    ][:10]
    return {
        "chunk_id": f"chunk-{chunk_index}",
        "chunk_title": _normalize_problem_summary_label(parsed.get("chunk_title") or parsed.get("title"), f"구간 {chunk_index}", max_len=32),
        "summary_items": summary_items,
        "keywords": keywords,
        "utterance_ids": [_safe_text(row.get("id")) for row in rows if _safe_text(row.get("id"))],
    }


def _problem_taxonomy_summary_evidence_ids(summary: dict[str, Any]) -> list[str]:
    evidence_ids: list[str] = []
    for item in summary.get("summary_items") or []:
        if not isinstance(item, dict):
            continue
        evidence_ids.extend(
            _safe_text(value)
            for value in (item.get("evidence_utterance_ids") or [])
            if _safe_text(value)
        )
    evidence_ids.extend(
        _safe_text(value)
        for value in (summary.get("utterance_ids") or [])
        if _safe_text(value)
    )
    return _dedup_preserve(evidence_ids, limit=80)


def _compact_problem_taxonomy_summary(summary: dict[str, Any], *, include_utterance_ids: bool = False) -> dict[str, Any]:
    compact_items: list[dict[str, Any]] = []
    for item in summary.get("summary_items") or []:
        if not isinstance(item, dict):
            continue
        text = _to_summary_point(item.get("text") or item.get("summary"), max_len=82)
        if not text:
            continue
        compact_items.append(
            {
                "text": text,
                "evidence_utterance_ids": _dedup_preserve(
                    [_safe_text(value) for value in (item.get("evidence_utterance_ids") or []) if _safe_text(value)],
                    limit=6,
                ),
            }
        )
        if len(compact_items) >= PROBLEM_TAXONOMY_CHUNK_SUMMARY_MAX_ITEMS:
            break

    compact = {
        "chunk_id": _safe_text(summary.get("chunk_id") or summary.get("overview_id")),
        "chunk_title": _normalize_problem_summary_label(
            summary.get("chunk_title") or summary.get("overview_title") or summary.get("title"),
            "요약",
            max_len=28,
        ),
        "summary_items": compact_items,
        "keywords": _dedup_preserve(
            [_safe_text(item) for item in (summary.get("keywords") or []) if _safe_text(item)],
            limit=6,
        ),
    }
    if include_utterance_ids:
        compact["utterance_ids"] = _problem_taxonomy_summary_evidence_ids(summary)[:16]
    return compact


def _problem_taxonomy_summary_char_count(summary: dict[str, Any]) -> int:
    return len(json.dumps(summary, ensure_ascii=False, separators=(",", ":")))


def _problem_taxonomy_summary_relevance(payload: ProblemTaxonomyGenerateInput, summary: dict[str, Any]) -> int:
    parent_ids = {_safe_text(item) for item in (payload.parent_evidence_utterance_ids or []) if _safe_text(item)}
    parent_topic = _safe_text(payload.parent_topic)
    parent_tokens = set(_problem_taxonomy_tokens(parent_topic))
    evidence_ids = set(_problem_taxonomy_summary_evidence_ids(summary))
    score = len(parent_ids & evidence_ids) * 8
    summary_text = " ".join(
        [
            _safe_text(summary.get("chunk_title") or summary.get("overview_title")),
            " ".join(_safe_text(item) for item in summary.get("keywords") or []),
            " ".join(
                _safe_text(item.get("text"))
                for item in summary.get("summary_items") or []
                if isinstance(item, dict)
            ),
        ]
    )
    if parent_tokens:
        score += len(parent_tokens & set(_problem_taxonomy_tokens(summary_text))) * 3
    if not parent_topic and not parent_ids:
        score += len(summary.get("summary_items") or [])
    return score


def _fit_problem_taxonomy_summaries(
    summaries: list[dict[str, Any]],
    *,
    char_budget: int,
    include_utterance_ids: bool = False,
) -> list[dict[str, Any]]:
    fitted: list[dict[str, Any]] = []
    total_chars = 0
    for summary in summaries:
        compact = _compact_problem_taxonomy_summary(summary, include_utterance_ids=include_utterance_ids)
        if not compact.get("summary_items"):
            continue
        summary_chars = _problem_taxonomy_summary_char_count(compact)
        if fitted and total_chars + summary_chars > char_budget:
            break
        fitted.append(compact)
        total_chars += summary_chars
    return fitted


def _select_problem_taxonomy_chunk_summaries(
    payload: ProblemTaxonomyGenerateInput,
    chunk_summaries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not chunk_summaries:
        return []
    indexed = list(enumerate(chunk_summaries))
    parent_topic = _safe_text(payload.parent_topic)
    parent_ids = {_safe_text(item) for item in (payload.parent_evidence_utterance_ids or []) if _safe_text(item)}
    if parent_topic or parent_ids:
        indexed.sort(
            key=lambda item: (-_problem_taxonomy_summary_relevance(payload, item[1]), item[0]),
        )
    selected = _fit_problem_taxonomy_summaries(
        [summary for _index, summary in indexed],
        char_budget=PROBLEM_TAXONOMY_CHUNK_SUMMARY_CONTEXT_CHAR_BUDGET,
    )
    return selected


def _get_or_create_problem_taxonomy_chunk_summary(
    rt: RuntimeStore,
    meeting_id: str,
    client: Any,
    payload: ProblemTaxonomyGenerateInput,
    rows: list[dict[str, str]],
    chunk_index: int,
    chunk_count: int,
) -> dict[str, Any]:
    signature = _canvas_llm_signature(
        {
            "version": 1,
            "meeting_topic": _safe_text(payload.meeting_topic),
            "rows": rows,
        }
    )
    cache_key = f"problem_taxonomy_chunk_summary:{_stable_short_id(signature)}"
    with rt.lock:
        if payload.refresh_chunk_summaries:
            workspace = _ensure_canvas_workspace_entry(rt, meeting_id)
            llm_cache = workspace.get("llm_cache") if isinstance(workspace, dict) else None
            if isinstance(llm_cache, dict):
                llm_cache.pop(cache_key, None)
        else:
            cached = _get_canvas_llm_cached_result(rt, meeting_id, cache_key, signature)
            if cached:
                return cached

    parsed = _call_llm_json(
        rt,
        client,
        prompt=_build_problem_taxonomy_chunk_summary_prompt(payload, rows, chunk_index, chunk_count),
        stage="canvas_problem_taxonomy_chunk_summary",
        temperature=0.12,
        max_tokens=1000,
    )
    result = _normalize_problem_taxonomy_chunk_summary(parsed, rows, chunk_index)
    with rt.lock:
        _set_canvas_llm_cached_result(rt, meeting_id, cache_key, signature, result)
    return result


def _batch_problem_taxonomy_summaries(summaries: list[dict[str, Any]], batch_size: int) -> list[list[dict[str, Any]]]:
    return [summaries[index : index + batch_size] for index in range(0, len(summaries), batch_size)]


def _build_problem_taxonomy_overview_prompt(
    payload: ProblemTaxonomyGenerateInput,
    summaries: list[dict[str, Any]],
    batch_index: int,
    batch_count: int,
) -> str:
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "parent_topic": _safe_text(payload.parent_topic),
        "batch_index": batch_index,
        "batch_count": batch_count,
        "chunk_summaries": summaries,
    }
    return (
        "너는 회의 chunk 요약들을 더 작은 문제정의용 개요로 압축하는 분석기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- chunk_summaries의 실제 요약 내용만 근거로 큰 논의 흐름을 압축한다.\n"
        "- 같은 의미를 반복하지 않고, 문서 제목 구조로 확장하기 좋은 포인트만 남긴다.\n"
        "- 새로운 사실, 장소, 이유, 해결책을 발명하지 않는다.\n"
        "- evidence_utterance_ids는 입력 chunk_summaries에 있는 id만 사용한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "overview_title": "현장학습 목적지 후보 논의",\n'
        '  "summary_items": [\n'
        '    {"text": "경복궁은 역사 학습과 교통 접근성을 근거로 후보가 됐다.", "evidence_utterance_ids": ["utt-1"]},\n'
        '    {"text": "경주는 주요 역사 유적 방문지로 논의됐다.", "evidence_utterance_ids": ["utt-4"]}\n'
        "  ],\n"
        '  "keywords": ["경복궁", "경주", "역사 학습"]\n'
        "}\n\n"
        "[규칙]\n"
        "- summary_items는 3~7개다.\n"
        "- 각 text는 한국어 1문장, 20~80자 정도다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_problem_taxonomy_overview_summary(
    parsed: Any,
    summaries: list[dict[str, Any]],
    batch_index: int,
) -> dict[str, Any]:
    valid_ids = {
        evidence_id
        for summary in summaries
        for evidence_id in _problem_taxonomy_summary_evidence_ids(summary)
        if evidence_id
    }
    if not isinstance(parsed, dict):
        parsed = {}
    summary_items: list[dict[str, Any]] = []
    raw_items = parsed.get("summary_items") or parsed.get("summaryItems") or []
    if isinstance(raw_items, list):
        for item in raw_items:
            if isinstance(item, dict):
                text = _safe_text(item.get("text") or item.get("summary"))
                evidence_ids = [
                    _safe_text(value)
                    for value in (item.get("evidence_utterance_ids") or item.get("evidenceUtteranceIds") or [])
                    if _safe_text(value) in valid_ids
                ]
            else:
                text = _safe_text(item)
                evidence_ids = []
            if not text:
                continue
            if not evidence_ids:
                evidence_ids = sorted(valid_ids)[:4]
            summary_items.append(
                {
                    "text": _to_summary_point(text, max_len=90),
                    "evidence_utterance_ids": _dedup_preserve(evidence_ids, limit=10),
                }
            )
            if len(summary_items) >= 7:
                break
    keywords = [
        _safe_text(item)
        for item in (parsed.get("keywords") if isinstance(parsed.get("keywords"), list) else [])
        if _safe_text(item)
    ][:10]
    return {
        "overview_id": f"overview-{batch_index}",
        "overview_title": _normalize_problem_summary_label(
            parsed.get("overview_title") or parsed.get("title"),
            f"개요 {batch_index}",
            max_len=32,
        ),
        "summary_items": summary_items,
        "keywords": keywords,
        "utterance_ids": _dedup_preserve(list(valid_ids), limit=80),
    }


def _get_or_create_problem_taxonomy_overview_summary(
    rt: RuntimeStore,
    meeting_id: str,
    client: Any,
    payload: ProblemTaxonomyGenerateInput,
    summaries: list[dict[str, Any]],
    batch_index: int,
    batch_count: int,
) -> dict[str, Any]:
    signature = _canvas_llm_signature(
        {
            "version": 1,
            "meeting_topic": _safe_text(payload.meeting_topic),
            "parent_topic": _safe_text(payload.parent_topic),
            "summaries": summaries,
        }
    )
    cache_key = f"problem_taxonomy_overview_summary:{_stable_short_id(signature)}"
    with rt.lock:
        if payload.refresh_chunk_summaries:
            workspace = _ensure_canvas_workspace_entry(rt, meeting_id)
            llm_cache = workspace.get("llm_cache") if isinstance(workspace, dict) else None
            if isinstance(llm_cache, dict):
                llm_cache.pop(cache_key, None)
        else:
            cached = _get_canvas_llm_cached_result(rt, meeting_id, cache_key, signature)
            if cached:
                return cached

    parsed = _call_llm_json(
        rt,
        client,
        prompt=_build_problem_taxonomy_overview_prompt(payload, summaries, batch_index, batch_count),
        stage="canvas_problem_taxonomy_overview_summary",
        temperature=0.12,
        max_tokens=1200,
    )
    result = _normalize_problem_taxonomy_overview_summary(parsed, summaries, batch_index)
    with rt.lock:
        _set_canvas_llm_cached_result(rt, meeting_id, cache_key, signature, result)
    return result


def _build_problem_taxonomy_overview_summaries(
    rt: RuntimeStore,
    meeting_id: str,
    client: Any,
    payload: ProblemTaxonomyGenerateInput,
    chunk_summaries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if len(chunk_summaries) < PROBLEM_TAXONOMY_OVERVIEW_TRIGGER_CHUNKS:
        return []
    compact_summaries = [
        _compact_problem_taxonomy_summary(summary, include_utterance_ids=True)
        for summary in chunk_summaries
        if summary.get("summary_items")
    ]
    overview_summaries: list[dict[str, Any]] = []
    batches = _batch_problem_taxonomy_summaries(
        compact_summaries,
        PROBLEM_TAXONOMY_CHUNK_SUMMARY_BATCH_SIZE,
    )
    for index, batch in enumerate(batches, start=1):
        overview_summaries.append(
            _get_or_create_problem_taxonomy_overview_summary(
                rt,
                meeting_id,
                client,
                payload,
                batch,
                index,
                len(batches),
            )
        )
    return _fit_problem_taxonomy_summaries(
        overview_summaries,
        char_budget=PROBLEM_TAXONOMY_OVERVIEW_CONTEXT_CHAR_BUDGET,
    )


def _build_problem_taxonomy_context(
    rt: RuntimeStore,
    payload: ProblemTaxonomyGenerateInput,
    client: Any | None,
    llm_ready: bool,
) -> tuple[dict[str, Any], str]:
    rows = _select_problem_taxonomy_rows(payload)
    selected_rows = _select_problem_taxonomy_raw_context_rows(payload, rows)
    warning = ""
    chunk_summaries: list[dict[str, Any]] = []
    overview_summaries: list[dict[str, Any]] = []
    should_summarize = (
        llm_ready
        and bool(_safe_text(payload.meeting_id))
        and _problem_taxonomy_rows_char_count(rows) > PROBLEM_TAXONOMY_SUMMARY_TRIGGER_CHARS
    )

    if should_summarize and client is not None:
        chunks = _chunk_problem_taxonomy_rows(rows)
        for index, chunk_rows in enumerate(chunks, start=1):
            try:
                chunk_summaries.append(
                    _get_or_create_problem_taxonomy_chunk_summary(
                        rt,
                        _safe_text(payload.meeting_id),
                        client,
                        payload,
                        chunk_rows,
                        index,
                        len(chunks),
                    )
                )
            except Exception as exc:
                warning = f"chunk 요약 생성 실패: {exc}"
                chunk_summaries = []
                break
        if chunk_summaries and len(chunk_summaries) >= PROBLEM_TAXONOMY_OVERVIEW_TRIGGER_CHUNKS:
            try:
                overview_summaries = _build_problem_taxonomy_overview_summaries(
                    rt,
                    _safe_text(payload.meeting_id),
                    client,
                    payload,
                    chunk_summaries,
                )
            except Exception as exc:
                warning = f"{warning} overview 요약 생성 실패: {exc}".strip()
    elif _problem_taxonomy_rows_char_count(rows) > PROBLEM_TAXONOMY_RAW_CONTEXT_CHAR_BUDGET:
        warning = "LLM chunk 요약을 사용할 수 없어 관련 원문 일부만 사용했습니다."

    selected_chunk_summaries = _select_problem_taxonomy_chunk_summaries(payload, chunk_summaries)

    return {
        "rows": selected_rows,
        "chunk_summaries": selected_chunk_summaries,
        "overview_summaries": overview_summaries,
        "total_utterance_count": len(rows),
        "included_utterance_count": len(selected_rows),
        "raw_context_char_count": _problem_taxonomy_rows_char_count(selected_rows),
        "chunk_summary_count": len(chunk_summaries),
        "included_chunk_summary_count": len(selected_chunk_summaries),
        "overview_summary_count": len(overview_summaries),
    }, warning


def _build_problem_taxonomy_prompt(payload: ProblemTaxonomyGenerateInput, context: dict[str, Any] | None = None) -> str:
    context = context or {}
    rows = context.get("rows") if isinstance(context.get("rows"), list) else _select_problem_taxonomy_rows(payload)
    chunk_summaries = context.get("chunk_summaries") if isinstance(context.get("chunk_summaries"), list) else []
    overview_summaries = context.get("overview_summaries") if isinstance(context.get("overview_summaries"), list) else []
    parent_topic = _safe_text(payload.parent_topic)
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "parent_topic": parent_topic,
        "parent_group_id": _safe_text(payload.parent_group_id),
        "context_policy": {
            "total_utterance_count": int(context.get("total_utterance_count") or len(rows)),
            "included_raw_utterance_count": int(context.get("included_utterance_count") or len(rows)),
            "total_chunk_summary_count": int(context.get("chunk_summary_count") or len(chunk_summaries)),
            "included_chunk_summary_count": int(context.get("included_chunk_summary_count") or len(chunk_summaries)),
            "overview_summary_count": len(overview_summaries),
            "note": "overview_summaries는 긴 회의 전체 흐름을 압축한 개요, chunk_summaries는 관련 구간 요약, raw_utterances는 근거 확인용 선별 원문이다.",
        },
        "existing_groups_in_scope": [
            {
                "group_id": group.get("group_id", ""),
                "topic": group.get("topic", ""),
                "evidence_utterance_ids": group.get("evidence_utterance_ids", [])[:20],
            }
            for group in _problem_taxonomy_scope_existing_groups(payload)
        ],
        "overview_summaries": overview_summaries,
        "chunk_summaries": chunk_summaries,
        "raw_utterances": _problem_taxonomy_prompt_rows(
            rows[:PROBLEM_TAXONOMY_PROMPT_RAW_ROW_LIMIT],
            PROBLEM_TAXONOMY_PROMPT_RAW_TEXT_CHARS,
        ),
        "max_groups": payload.max_groups,
    }
    scope = (
        f"'{parent_topic}'의 바로 아래 세부 요약 노드"
        if parent_topic
        else "아이디어 단계 발화의 최상위 큰 요약 노드"
    )
    depth_hint = (
        "- parent_topic이 없으면 Markdown 문서의 H1처럼 큰 논의 단위만 만든다.\n"
        "- parent_topic이 있으면 Markdown 문서의 바로 다음 하위 제목처럼 parent_topic을 구성하는 세부 포인트만 만든다.\n"
    )
    output_example = {
        "groups": [
            {
                "source_summary_items": ["경복궁은 교통편을 구하기 쉽다는 장점이 언급됐다."],
                "conclusion": "경복궁은 대중교통과 이동 동선이 비교적 편해 아이들과 함께 방문하기 쉬운 후보로 언급됐다.",
                "topic": "교통의 편의성",
                "keywords": ["교통", "편의"],
                "evidence_utterance_ids": ["utt-1"],
            },
            {
                "source_summary_items": ["근처에 아이들이 좋아할 만한 식당이 많다는 경험이 공유됐다."],
                "conclusion": "방문 후 식사까지 이어가기 좋은 선택지가 주변에 많아 가족 단위 일정에 적합하다는 경험이 공유됐다.",
                "topic": "괜찮은 식당이 많음",
                "keywords": ["식당", "근처"],
                "evidence_utterance_ids": ["utt-1"],
            },
        ]
    } if parent_topic else {
        "groups": [
            {
                "source_summary_items": ["경복궁은 역사 학습, 교통, 식당 접근성이 함께 언급된 후보였다."],
                "conclusion": "경복궁은 역사 학습에 도움이 되고 이동과 식사 동선도 무리 없다는 점에서 목적지 후보로 제안됐다.",
                "topic": "목적지 경복궁 설정",
                "keywords": ["경복궁", "목적지"],
                "evidence_utterance_ids": ["utt-1"],
            },
            {
                "source_summary_items": ["박물관은 실내 활동이 가능하고 비가 와도 일정 진행이 쉽다는 장점이 언급됐다."],
                "conclusion": "박물관은 날씨 영향을 덜 받고 실내에서 안정적으로 진행할 수 있어 대체 목적지로 검토됐다.",
                "topic": "실내 대체지 박물관 검토",
                "keywords": ["박물관", "실내"],
                "evidence_utterance_ids": ["utt-2"],
            },
            {
                "source_summary_items": ["최종 방문지는 이동 시간과 교육 효과를 함께 보고 결정하자는 의견이 나왔다."],
                "conclusion": "방문지는 흥미만으로 정하지 않고 이동 부담과 학습 효과를 함께 비교해 정하기로 했다.",
                "topic": "방문지 선택 기준 정리",
                "keywords": ["이동 시간", "학습 효과"],
                "evidence_utterance_ids": ["utt-3"],
            }
        ]
    }
    conclusion_examples = (
        "[conclusion 작성 예]\n"
        "- 나쁨: 이번 방문의 결과에 대한 요약을 제시하며, 회의의 결론임을 명확히 했다.\n"
        "- 좋음: 방문 결과 이동 동선은 무리 없었지만 식사 장소 예약과 우천 대비가 다음 준비 과제로 남았다.\n"
        "- 나쁨: 예산 관련 논의가 있었다.\n"
        "- 좋음: 예산은 장비 구입보다 운영 인력 확보에 우선 배정해야 한다는 의견이 모였다.\n\n"
        "[압축 방식 예]\n"
        "- 원문: 2026년 방문에서는 9년 전과 달리 시진핑 주석이 트럼프 대통령을 '위대한 지도자'라고 칭하며 만남을 마무리하는 등 다른 양상을 보였다.\n"
        "- 좋음: 시진핑 주석이 트럼프 대통령을 '위대한 지도자'라고 칭하며 9년 전과 다른 양상을 보임.\n"
        "- 나쁨: 2026년 방문과 9년 전 방문의 차이에 대한 요약을 제시함.\n\n"
    )
    return (
        "너는 회의 전문을 읽고 Markdown 문서의 제목 구조처럼 문제정의 요약 트리를 만드는 회의 퍼실리테이터다. 출력은 JSON 하나만 반환한다.\n\n"
        f"[목표]\n- 입력 발화에서 실제로 말한 내용만 근거로 {scope}를 만든다.\n"
        f"{depth_hint}"
        "- 각 group은 먼저 source_summary_items와 conclusion으로 실제 본문을 요약한 뒤, 그 본문을 대표하는 topic을 붙인다.\n"
        "- parent_topic이 없으면 전체 전사문의 1차 목차를 만든다. 회의가 명백히 하나의 단일 논점만 다룬 경우가 아니라면 보통 3~6개 root로 나눈다.\n"
        "- 새로운 아이디어, 장소, 원인, 해결책을 발명하지 않는다.\n"
        "- topic은 키워드가 아니라, 제목으로 바로 읽히는 짧은 요약 문장이어야 한다.\n"
        "- topic은 '경복궁' 같은 명사 하나가 아니라 '목적지 경복궁 설정'처럼 논의 행위/판단이 드러나야 한다.\n"
        "- conclusion은 해당 topic 아래에 실제로 들어갈 핵심 본문 요약이다. topic을 설명하는 메타 문장을 쓰지 않는다.\n"
        "- conclusion은 topic의 성격을 문맥상 판단해 실제 결과, 쟁점, 근거, 대안, 비교 내용을 자연스럽게 쓴다.\n"
        "- conclusion은 같은 레벨에서 같은 문장을 반복하지 않는다.\n"
        "- 같은 레벨의 groups는 서로 겹치지 않게 분리한다. 한 근거를 같은 의미의 노드로 반복하지 않는다.\n"
        "- source_summary_items는 실제 발화를 1~3문장으로 압축한 근거 요약이다.\n"
        "- evidence_utterance_ids에는 그 분류를 뒷받침하는 utterance id만 넣는다.\n"
        "- overview_summaries가 있으면 전체 흐름은 overview_summaries에서 먼저 파악한다.\n"
        "- chunk_summaries가 있으면 관련 구간의 세부 흐름은 chunk_summaries에서 파악한다.\n"
        "- raw_utterances는 근거 확인과 세부 뉘앙스 확인에만 사용한다.\n"
        "- existing_groups_in_scope와 같은 topic 또는 같은 근거의 분류는 다시 만들지 않는다.\n"
        "- 근거가 부족하면 groups를 빈 배열로 둔다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 예시]\n"
        f"{json.dumps(output_example, ensure_ascii=False, indent=2)}\n\n"
        f"{conclusion_examples}"
        "[규칙]\n"
        f"- groups는 최대 {payload.max_groups}개다.\n"
        "- 같은 의미의 분류를 중복 생성하지 않는다. MECE에 가깝게 서로 다른 포인트로 나눈다.\n"
        "- parent_topic이 있으면 parent_topic과 직접 관련된 세부 요약만 만든다. 부모와 같은 수준의 큰 노드를 다시 만들지 않는다.\n"
        "- topic은 8~32자 정도의 한국어 요약 문장/구로 쓴다.\n"
        "- conclusion은 40~90자 정도의 1~2문장으로 쓰고, 제목 자체가 아니라 해당 section의 실제 내용을 쓴다.\n"
        "- conclusion은 주체, 대상, 핵심 행동, 비교 기준, 숫자, 시점, 인용 표현을 가능한 보존해 압축한다.\n"
        "- conclusion은 '~함', '~보임', '~드러남', '~제시됨' 같은 짧은 요약체를 우선 사용한다.\n"
        "- '요약을 제시했다', '관련 논의가 있었다', '결론임을 명확히 했다', '중요성이 언급됐다' 같은 메타 설명은 쓰지 않는다.\n"
        "- topic은 '서울', '경복궁', '식당'처럼 단일 명사로 끝내지 않는다.\n"
        "- topic은 '논의됨', '관련 내용', '기타' 같은 메타 표현을 쓰지 않는다.\n"
        "- utterance에 직접 근거가 없는 세부 노드는 만들지 않는다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _build_problem_taxonomy_outline_prompt(
    payload: ProblemTaxonomyGenerateInput,
    context: dict[str, Any] | None = None,
) -> str:
    context = context or {}
    root_payload = _problem_taxonomy_root_payload(payload)
    rows = context.get("rows") if isinstance(context.get("rows"), list) else _select_problem_taxonomy_rows(root_payload)
    chunk_summaries = context.get("chunk_summaries") if isinstance(context.get("chunk_summaries"), list) else []
    overview_summaries = context.get("overview_summaries") if isinstance(context.get("overview_summaries"), list) else []
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "context_policy": {
            "total_utterance_count": int(context.get("total_utterance_count") or len(rows)),
            "included_raw_utterance_count": int(context.get("included_utterance_count") or len(rows)),
            "total_chunk_summary_count": int(context.get("chunk_summary_count") or len(chunk_summaries)),
            "included_chunk_summary_count": int(context.get("included_chunk_summary_count") or len(chunk_summaries)),
            "overview_summary_count": len(overview_summaries),
            "note": "회의 전문을 Markdown heading 구조로 정리하기 위한 전체 흐름 요약과 선별 원문이다.",
        },
        "overview_summaries": overview_summaries,
        "chunk_summaries": chunk_summaries,
        "raw_utterances": _problem_taxonomy_prompt_rows(
            rows[:PROBLEM_TAXONOMY_PROMPT_RAW_ROW_LIMIT],
            PROBLEM_TAXONOMY_PROMPT_RAW_TEXT_CHARS,
        ),
        "max_root_groups": payload.max_groups,
        "max_depth": PROBLEM_TAXONOMY_OUTLINE_MAX_DEPTH,
    }
    output_example = {
        "outline": [
            {
                "source_summary_items": ["경복궁은 역사 학습, 교통, 식당 접근성이 함께 언급된 후보였다."],
                "conclusion": "역사 학습, 이동 편의, 식사 여건이 함께 언급되어 경복궁이 목적지 후보로 정리됐다.",
                "topic": "목적지 경복궁 설정",
                "importance": 0.92,
                "parent_fit": 1.0,
                "is_direct_child": True,
                "keywords": ["경복궁", "목적지"],
                "evidence_utterance_ids": ["utt-1"],
                "children": [
                    {
                        "source_summary_items": ["경복궁 방문이 아이들의 역사 학습에 도움이 된다는 의견이 나왔다."],
                        "conclusion": "방문 이유가 단순 관광이 아니라 아이들의 역사 이해를 돕는 학습 경험으로 설명됐다.",
                        "topic": "역사 학습에 유용",
                        "importance": 0.78,
                        "parent_fit": 0.93,
                        "is_direct_child": True,
                        "keywords": ["역사", "학습"],
                        "evidence_utterance_ids": ["utt-1"],
                        "children": [],
                    }
                ],
            },
            {
                "source_summary_items": ["박물관은 실내 활동이 가능하고 비가 와도 일정 진행이 쉽다는 장점이 언급됐다."],
                "conclusion": "박물관은 날씨 영향을 덜 받고 실내에서 안정적으로 진행할 수 있어 대체 목적지로 검토됐다.",
                "topic": "실내 대체지 박물관 검토",
                "importance": 0.84,
                "parent_fit": 1.0,
                "is_direct_child": True,
                "keywords": ["박물관", "실내"],
                "evidence_utterance_ids": ["utt-2"],
                "children": [],
            },
            {
                "source_summary_items": ["최종 방문지는 이동 시간과 교육 효과를 함께 보고 결정하자는 의견이 나왔다."],
                "conclusion": "방문지는 흥미만으로 정하지 않고 이동 부담과 학습 효과를 함께 비교해 정하기로 했다.",
                "topic": "방문지 선택 기준 정리",
                "importance": 0.88,
                "parent_fit": 1.0,
                "is_direct_child": True,
                "keywords": ["이동 시간", "학습 효과"],
                "evidence_utterance_ids": ["utt-3"],
                "children": [],
            },
        ]
    }
    conclusion_examples = (
        "[conclusion 작성 예]\n"
        "- 나쁨: 이번 방문의 결과에 대한 요약을 제시하며, 회의의 결론임을 명확히 했다.\n"
        "- 좋음: 방문 결과 이동 동선은 무리 없었지만 식사 장소 예약과 우천 대비가 다음 준비 과제로 남았다.\n"
        "- 나쁨: 예산 관련 논의가 있었다.\n"
        "- 좋음: 예산은 장비 구입보다 운영 인력 확보에 우선 배정해야 한다는 의견이 모였다.\n\n"
        "[압축 방식 예]\n"
        "- 원문: 2026년 방문에서는 9년 전과 달리 시진핑 주석이 트럼프 대통령을 '위대한 지도자'라고 칭하며 만남을 마무리하는 등 다른 양상을 보였다.\n"
        "- 좋음: 시진핑 주석이 트럼프 대통령을 '위대한 지도자'라고 칭하며 9년 전과 다른 양상을 보임.\n"
        "- 나쁨: 2026년 방문과 9년 전 방문의 차이에 대한 요약을 제시함.\n\n"
    )
    return (
        "너는 회의 전문을 하나의 Markdown 문서로 읽고, 문제정의용 heading outline을 만드는 회의 분석가다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 회의 전체 흐름에서 중요한 논점만 Markdown heading 트리처럼 구조화한다.\n"
        "- 각 노드는 먼저 source_summary_items와 conclusion으로 실제 본문을 요약한 뒤, 그 본문을 대표하는 topic을 붙인다.\n"
        "- root outline은 전체 전사문의 1차 목차다. 회의가 명백히 하나의 단일 논점만 다룬 경우가 아니라면 보통 3~6개 root로 나눈다.\n"
        "- depth 0은 H1 수준의 큰 문제정의 논점, depth 1~2는 바로 위 heading의 직접 하위 논점이다.\n"
        "- 각 children은 부모 heading을 더 구체화하는 중요한 하위 heading일 때만 만든다.\n"
        "- 중요도가 낮은 예시, 잡담, 단순 배경, 부모 반복, 같은 레벨 반복은 만들지 않는다.\n"
        "- 만들 만한 하위 논점이 없으면 children은 빈 배열로 둔다. 빈 children은 정상이다.\n"
        "- 새로운 사실, 원인, 해결책을 발명하지 않는다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 예시]\n"
        f"{json.dumps(output_example, ensure_ascii=False, indent=2)}\n\n"
        f"{conclusion_examples}"
        "[규칙]\n"
        f"- outline의 root는 최대 {payload.max_groups}개다.\n"
        "- root가 1개뿐이라면 전체 전사문이 정말 하나의 큰 논점만 다뤘는지 다시 확인하고, 나눌 수 있는 1차 목차가 있으면 반드시 분리한다.\n"
        "- 각 노드의 children은 최대 5개다.\n"
        f"- 최대 depth는 {PROBLEM_TAXONOMY_OUTLINE_MAX_DEPTH}이다. 그보다 깊게 만들지 않는다.\n"
        "- topic은 8~32자 정도의 한국어 요약 문장/구로 쓴다.\n"
        "- conclusion은 topic의 다른 표현이 아니라, 해당 heading 아래에 실제로 들어갈 핵심 본문 요약이다.\n"
        "- conclusion은 topic의 성격을 문맥상 판단해 실제 결과, 쟁점, 근거, 대안, 비교 내용을 자연스럽게 쓴다.\n"
        "- conclusion은 40~90자 정도의 1~2문장으로 쓰고, 제목 자체가 아니라 해당 section의 실제 내용을 쓴다.\n"
        "- conclusion은 주체, 대상, 핵심 행동, 비교 기준, 숫자, 시점, 인용 표현을 가능한 보존해 압축한다.\n"
        "- conclusion은 '~함', '~보임', '~드러남', '~제시됨' 같은 짧은 요약체를 우선 사용한다.\n"
        "- '요약을 제시했다', '관련 논의가 있었다', '결론임을 명확히 했다', '중요성이 언급됐다' 같은 메타 설명은 쓰지 않는다.\n"
        "- importance, parent_fit, novelty는 0~1 숫자로 쓴다.\n"
        "- parent_fit은 부모와 직접 연결된 하위 논점일수록 높다. root는 1.0으로 둔다.\n"
        "- is_direct_child는 바로 위 heading 아래에 놓을 수 있을 때만 true다.\n"
        "- evidence_utterance_ids는 입력 utterances에 있는 id만 사용한다.\n"
        "- overview_summaries와 chunk_summaries로 전체 흐름을 먼저 파악하고, raw_utterances는 근거 확인에만 사용한다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _get_or_create_problem_taxonomy_outline_groups(
    rt: RuntimeStore,
    payload: ProblemTaxonomyGenerateInput,
    client: Any,
    context: dict[str, Any],
) -> list[dict[str, Any]]:
    meeting_id = _safe_text(payload.meeting_id)
    if not meeting_id:
        return []
    root_payload = _problem_taxonomy_root_payload(payload)
    snapshot_rows = _resolve_problem_taxonomy_utterance_rows(root_payload.meeting_id, root_payload.utterances)
    signature = _canvas_llm_signature(
        {
            "meeting_topic": _safe_text(root_payload.meeting_topic),
            "utterance_snapshot_signature": _canvas_llm_signature(snapshot_rows),
            "outline_policy": "markdown_section_body_v3",
            "max_depth": PROBLEM_TAXONOMY_OUTLINE_MAX_DEPTH,
            "max_root_groups": root_payload.max_groups,
        }
    )
    cache_key = "problem_taxonomy_outline"
    bypass_cache = bool(_safe_text(payload.debug_nonce) or payload.refresh_chunk_summaries)
    if not bypass_cache:
        with rt.lock:
            cached = _get_canvas_llm_cached_result(rt, meeting_id, cache_key, signature)
        if cached and isinstance(cached.get("groups"), list):
            return copy.deepcopy(cached["groups"])

    parsed = _call_llm_json(
        rt,
        client,
        prompt=_build_problem_taxonomy_outline_prompt(root_payload, context),
        stage="canvas_problem_taxonomy_outline",
        temperature=0.12,
        max_tokens=3200,
    )
    groups = _normalize_problem_taxonomy_outline_groups(root_payload, parsed)
    result = {"groups": groups}
    with rt.lock:
        _set_canvas_llm_cached_result(rt, meeting_id, cache_key, signature, result)
    return copy.deepcopy(groups)


def _select_problem_taxonomy_outline_scope_groups(
    payload: ProblemTaxonomyGenerateInput,
    outline_groups: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    parent_group_id = _safe_text(payload.parent_group_id)
    parent_topic = _safe_text(payload.parent_topic)
    if not parent_group_id:
        return [group for group in outline_groups if not _safe_text(group.get("parent_group_id"))], True

    direct = [
        group
        for group in outline_groups
        if _safe_text(group.get("parent_group_id")) == parent_group_id
    ]
    if direct:
        return direct, True

    matched_parent = next(
        (
            group
            for group in outline_groups
            if _safe_text(group.get("group_id")) == parent_group_id
        ),
        None,
    )
    if matched_parent is None and parent_topic:
        matched_parent = next(
            (
                group
                for group in outline_groups
                if _problem_taxonomy_topics_similar(parent_topic, group.get("topic"))
            ),
            None,
        )
    if matched_parent is None:
        return [], False

    matched_parent_id = _safe_text(matched_parent.get("group_id"))
    return [
        group
        for group in outline_groups
        if _safe_text(group.get("parent_group_id")) == matched_parent_id
    ], True


def _build_meeting_goal_local(topic: str) -> str:
    clean_topic = _safe_text(topic, "이번 회의").strip()
    if not clean_topic:
        return "이번 회의에서 실행 방향과 우선순위를 정리한다."
    return f"{clean_topic}에 대해 실행 방향과 핵심 우선순위를 정리한다."


def _build_meeting_goal_local_options(topic: str) -> list[str]:
    clean_topic = _safe_text(topic, "이번 회의").strip()
    if not clean_topic:
        return [
            "이번 회의에서 실행 방향과 우선순위를 정리한다.",
            "이번 회의의 핵심 쟁점과 결정 기준을 합의한다.",
            "이번 회의에서 다음 실행 과제를 명확히 한다.",
        ]
    return _dedup_preserve(
        [
            f"{clean_topic}에 대해 실행 방향과 핵심 우선순위를 정리한다.",
            f"{clean_topic}의 핵심 쟁점과 의사결정 기준을 합의한다.",
            f"{clean_topic}에서 다음 실행 과제와 담당 범위를 정리한다.",
        ],
        limit=3,
    )


def _build_meeting_goal_prompt(topic: str) -> str:
    payload = {
        "meeting_topic": _safe_text(topic),
    }
    return (
        "너는 회의 제목을 보고 회의 목표를 한 문장으로 정리하는 분석기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- meeting_topic을 바탕으로 이번 회의가 무엇을 정리하거나 결정해야 하는지 목표 후보 3개를 쓴다.\n"
        "- 제목을 그대로 반복하지 말고, 회의에서 얻고 싶은 결과나 방향이 드러나게 쓴다.\n"
        "- 너무 추상적이지 않게, 실행 또는 정리의 대상이 보이도록 쓴다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "goal": "키링 굿즈 전략에서 우선 검증할 타깃 수요와 실행 방향을 정리한다.",\n'
        '  "goals": [\n'
        '    "키링 굿즈 전략에서 우선 검증할 타깃 수요와 실행 방향을 정리한다.",\n'
        '    "키링 굿즈 출시를 위한 고객 반응과 제작 우선순위를 합의한다.",\n'
        '    "키링 굿즈 아이디어의 실현 가능성과 다음 실행 과제를 정한다."\n'
        "  ]\n"
        "}\n\n"
        "[규칙]\n"
        "- goal은 가장 추천하는 목표 1개다.\n"
        "- goals는 사용자가 선택할 수 있는 서로 다른 관점의 목표 3개다.\n"
        "- 제목 복붙이 아니라 회의 목적이 드러나는 재작성 문장.\n"
        "- 각 목표는 한국어 1문장, 18~48자 정도의 짧고 분명한 문장.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _idea_assimilation_utterance_dict(item: CanvasIdeaAssimilationUtteranceInput) -> dict[str, str]:
    return {
        "id": _safe_text(item.id),
        "speaker": _safe_text(item.speaker, "참가자"),
        "text": _safe_text(item.text),
        "timestamp": _safe_text(item.timestamp),
    }


def _idea_assimilation_existing_idea_dict(item: CanvasIdeaAssimilationIdeaInput) -> dict[str, Any]:
    return {
        "id": _safe_text(item.id),
        "title": _safe_text(item.title),
        "summary": _safe_text(item.summary),
        "keywords": [_safe_text(keyword) for keyword in (item.keywords or []) if _safe_text(keyword)][:8],
        "key_evidence": [_safe_text(value) for value in (item.key_evidence or []) if _safe_text(value)][:6],
        "refined_utterances": _normalize_refined_utterances(item.refined_utterances, limit=12),
        "evidence_utterance_ids": [
            _safe_text(value) for value in (item.evidence_utterance_ids or []) if _safe_text(value)
        ][:40],
        "user_edited": bool(item.user_edited),
    }


IDEA_KEYWORD_NOISE = {
    "content",
    "summary",
    "keyword",
    "keywords",
    "title",
    "요약",
    "내용",
    "키워드",
    "제목",
    "아이디어",
    "발화",
    "전사",
    "정리",
    "회의",
    "논의",
    "언급",
    "화자",
    "참가자",
    "speaker",
}


def _strip_idea_reference_text(raw: Any, collapse_whitespace: bool = True) -> str:
    text = _strip_leading_timestamp(raw)
    text = re.sub(r"\[[0-9a-fA-F-]{8,}\]\s*", "", text)
    text = re.sub(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b", "", text)
    text = re.sub(r"\b[\w.+-]+@[\w.-]+\.\w+\b:?\s*", "", text)
    text = re.sub(r"^\s*(?:speaker|화자|참가자|user|root)\d*[:：]\s*", "", text, flags=re.IGNORECASE)
    if collapse_whitespace:
        text = re.sub(r"\s+", " ", text)
    else:
        text = re.sub(r"[ \t\r\f\v]+", " ", text)
        text = re.sub(r"\n\s+", "\n", text)
    return _safe_text(text.strip(" \t\r\n-:：|/.,;"))


def _normalize_idea_keyword(raw: Any) -> str:
    token = _strip_idea_reference_text(raw)
    token = re.sub(r"^#+", "", token).strip()
    token = re.sub(r"^[^\w가-힣]+|[^\w가-힣]+$", "", token)
    token = re.sub(r"\s+", " ", token).strip()
    if not token:
        return ""
    if "@" in token:
        return ""
    if re.fullmatch(r"\d+", token):
        return ""
    if re.fullmatch(r"[0-9a-fA-F-]{8,}", token):
        return ""
    if re.search(r"\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}|^\d{1,2}:\d{2}", token):
        return ""
    if len(token) > 24:
        return ""

    if " " not in token:
        normalized = _normalize_keyword_token(token)
    else:
        normalized = " ".join(_normalize_keyword_token(part) for part in token.split())
        normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized or len(normalized) < 2:
        return ""
    lowered = normalized.lower()
    if lowered in STOPWORDS or lowered in TITLE_NOISE_TOKENS or lowered in IDEA_KEYWORD_NOISE:
        return ""
    if _is_title_keyword_noise(normalized):
        return ""
    return normalized


def _extract_light_keywords(text: str, limit: int = 4) -> list[str]:
    tokens: list[str] = []
    for token in re.findall(r"[A-Za-z0-9가-힣]{2,}", _strip_leading_timestamp(text)):
        cleaned = _normalize_idea_keyword(token)
        if not cleaned:
            continue
        if cleaned not in tokens:
            tokens.append(cleaned)
        if len(tokens) >= limit:
            break
    return tokens


def _normalize_idea_keywords(raw_keywords: Any, source_text: str, limit: int = 6) -> list[str]:
    values: list[Any] = []
    if isinstance(raw_keywords, str):
        values.extend(re.split(r"[,/#\n]+", raw_keywords))
    elif isinstance(raw_keywords, list):
        for item in raw_keywords:
            if isinstance(item, str):
                values.extend(re.split(r"[,/#\n]+", item))
            else:
                values.append(item)

    keywords = _dedup_preserve(
        [_normalize_idea_keyword(value) for value in values if _safe_text(value)],
        limit=limit,
    )
    if len(keywords) < min(3, limit):
        keywords = _dedup_preserve(keywords + _extract_light_keywords(source_text, limit), limit=limit)
    return keywords[:limit]


def _clean_idea_title(raw_title: Any, keywords: list[str], fallback: str = "AI 아이디어") -> str:
    title = _strip_idea_reference_text(raw_title)
    title = re.sub(r"^(?:아이디어|요약|핵심|제목)\s*[:：-]\s*", "", title)
    title = re.sub(r"\s+", " ", title).strip(" -:：|/.,;")
    if not title or title.lower() in IDEA_KEYWORD_NOISE:
        title = " ".join(keywords[:2]).strip() or fallback
    if len(title) > 24:
        title = _to_summary_point(title, 24)
    return _safe_text(title, fallback)


def _clean_idea_summary(raw_summary: Any, fallback_title: str, keywords: list[str]) -> str:
    summary = _safe_text(raw_summary)
    if isinstance(raw_summary, list):
        summary = "\n".join(_safe_text(item) for item in raw_summary if _safe_text(item))
    summary = _strip_idea_reference_text(summary, collapse_whitespace=False)
    summary = re.sub(r"^(?:내용|요약|summary|content)\s*[:：-]\s*", "", summary, flags=re.IGNORECASE)
    candidates = [
        _to_summary_point(part, 46)
        for part in re.split(r"\n+|\s*/\s*|[;；]+", summary)
        if _safe_text(part)
    ]
    candidates = [
        item
        for item in candidates
        if item and item.lower() not in IDEA_KEYWORD_NOISE and not re.fullmatch(r"(없음|해당 없음|n/?a)", item, flags=re.IGNORECASE)
    ]
    if not candidates:
        fallback = " / ".join(keywords[:2]) or fallback_title
        candidates = [_to_summary_point(fallback, 46)]
    return "\n".join(_dedup_preserve(candidates, limit=2))


def _normalize_idea_assimilation_update(raw: Any, fallback_ids: list[str]) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    action = _safe_text(raw.get("action")).lower()
    if action not in {"merge", "create"}:
        return None

    target_id = _safe_text(raw.get("targetIdeaId") or raw.get("target_idea_id") or raw.get("target_id"))
    if action == "merge" and not target_id:
        return None

    raw_title = raw.get("title")
    raw_summary = raw.get("summary") or raw.get("content") or raw.get("contentSummary") or raw.get("body")
    keywords = _normalize_idea_keywords(raw.get("keywords") or [], f"{raw_title or ''} {raw_summary or ''}", 6)
    title = _clean_idea_title(raw_title, keywords, "새 아이디어")
    summary = _clean_idea_summary(raw_summary, title, keywords)
    keywords = keywords or _normalize_idea_keywords([], f"{title} {summary}", 6)
    key_evidence = [
        _to_summary_point(_strip_idea_reference_text(value), 72)
        for value in (raw.get("keyEvidence") or raw.get("key_evidence") or [])
        if _safe_text(value)
    ][:6]
    evidence_ids = [
        _safe_text(value)
        for value in (raw.get("evidenceUtteranceIds") or raw.get("evidence_utterance_ids") or [])
        if _safe_text(value)
    ][:400]
    ignored_ids = [
        _safe_text(value)
        for value in (raw.get("ignoredUtteranceIds") or raw.get("ignored_utterance_ids") or [])
        if _safe_text(value)
    ][:400]

    if not evidence_ids and not ignored_ids:
        evidence_ids = fallback_ids[:400]

    refined_utterances = _normalize_refined_utterances(
        raw.get("refinedUtterances") or raw.get("refined_utterances") or raw.get("refined_utterance") or [],
        limit=4,
        allowed_ids=set(evidence_ids),
        min_relevance_score=0.78,
    )

    return {
        "action": action,
        "targetIdeaId": target_id,
        "title": title,
        "summary": summary,
        "keywords": keywords,
        "keyEvidence": key_evidence,
        "refinedUtterances": refined_utterances,
        "evidenceUtteranceIds": evidence_ids,
        "ignoredUtteranceIds": ignored_ids,
    }


def _build_idea_assimilation_prompt(payload: CanvasIdeaAssimilationInput) -> str:
    context_rows = [_idea_assimilation_utterance_dict(item) for item in (payload.context_utterances or [])[-8:]]
    target_rows = [_idea_assimilation_utterance_dict(item) for item in (payload.target_utterances or [])]
    context_transcript_text = " ".join(
        f"{row['speaker']}: {row['text']}" for row in context_rows if _safe_text(row.get("text"))
    )
    target_ref_rows = [
        {
            **row,
            "ref": f"U{index + 1}",
        }
        for index, row in enumerate(target_rows)
        if _safe_text(row.get("text"))
    ]
    target_transcript_text = " ".join(
        f"[{row['ref']}] {row['speaker']}: {row['text']}" for row in target_ref_rows
    )
    prompt_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "context_transcript_text": context_transcript_text,
        "target_transcript_text": target_transcript_text,
        "target_utterance_refs": [
            {
                "ref": row["ref"],
                "id": row["id"],
                "speaker": row["speaker"],
                "timestamp": row["timestamp"],
            }
            for row in target_ref_rows
            if _safe_text(row.get("id"))
        ],
        "existing_ideas": [
            _idea_assimilation_existing_idea_dict(item) for item in (payload.existing_ideas or [])[:40]
        ],
    }
    return (
        "너는 회의 발화를 아이디어 캔버스에 반영하는 분석기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- target_transcript_text 전체를 하나의 이어진 전사문으로 보고 기존 아이디어에 편입할지, 새 아이디어를 만들지 결정한다.\n"
        "- meeting_topic과 context_transcript_text는 배경 정보일 뿐이다. title/summary/keywords/refinedUtterances는 반드시 target_transcript_text에서 나온 의미만 사용한다.\n"
        "- 잡담, 단순 맞장구, 반복 확인, 감사 인사는 아이디어 노드에 넣지 말고 ignoredUtteranceIds에만 포함한다.\n"
        "- 아이디어 노드에는 불필요한 대화 흐름이 아니라 전체 전사문에서 드러난 실행/기획 핵심만 정제해서 넣는다.\n"
        "- summary는 노드 본문에 들어갈 content이며, 완성형 설명문이 아니라 핵심만 남긴 압축 문구여야 한다.\n"
        "- summary는 1~2줄로 작성하되 각 줄은 짧은 명사구/핵심 구문 중심으로 쓴다.\n"
        "- summary에는 '해야 한다', '필요하다', '정리된다', '보인다', '논의했다' 같은 일반 서술어를 되도록 쓰지 않는다.\n"
        "- keywords는 target_transcript_text 전체를 모두 읽은 뒤 중심 의미를 이루는 용어만 추출한다. 앞에 나온 단어를 순서대로 뽑지 않는다.\n"
        "- 대괄호 ref, id, timestamp, speaker/email/user/root 같은 식별자는 참조용이다. title/summary/keywords/keyEvidence/refinedUtterances.text에 절대 쓰지 않는다.\n"
        "- keywords에는 '회의', '논의', '요약', '내용', '아이디어', '발화', '전사' 같은 일반어를 넣지 않는다.\n"
        "- refinedUtterances는 summary에 깊게 관련된 주요 발화만 각각 한 줄씩 '요약'한 것이다.\n"
        "- refinedUtterances는 원문을 예쁘게 고친 문장이 아니라, 해당 발화가 content를 만든 직접 근거/의도만 남긴 압축문이다.\n"
        "- refinedUtterances는 content에서 빠지면 summary 의미가 바뀌는 발화만 포함한다.\n"
        "- 기존 아이디어와 의미가 매우 같을 때만 merge한다. 단순 키워드 1개 겹침, 같은 안건, 같은 화자라는 이유만으로 merge하지 않는다.\n"
        "- merge 확신이 낮거나 기존 아이디어와 핵심 대상/방향이 다르면 반드시 create를 사용한다.\n"
        "- user_edited가 true인 기존 아이디어는 제목과 요약을 덮어쓰지 않도록 merge 대상으로 삼더라도 근거/키워드 보강 중심으로 응답한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(prompt_payload, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "updates": [\n'
        "    {\n"
        '      "action": "merge",\n'
        '      "targetIdeaId": "idea-id",\n'
        '      "title": "짧은 아이디어 제목",\n'
        '      "summary": "핵심 키워드/방향만 남긴 1~2줄 압축 content",\n'
        '      "keywords": ["키워드1", "키워드2"],\n'
        '      "keyEvidence": ["A: 핵심 근거 발화 요약"],\n'
        '      "refinedUtterances": [\n'
        '        {"utterance_id": "utterance-id-1", "speaker": "A", "text": "주요 발화의 핵심 근거 한 줄 요약", "timestamp": "ISO time", "relevanceScore": 0.9}\n'
        "      ],\n"
        '      "evidenceUtteranceIds": ["utterance-id-1"],\n'
        '      "ignoredUtteranceIds": ["utterance-id-2"]\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "[규칙]\n"
        "- updates는 0~3개까지 가능하다. 한 번의 전사 묶음에서 핵심 의미가 하나면 update도 하나만 만든다.\n"
        "- 하나의 target_utterance는 evidenceUtteranceIds 또는 ignoredUtteranceIds 중 하나에만 넣는다.\n"
        "- create의 targetIdeaId는 빈 문자열로 둔다.\n"
        "- title은 12자 이내의 한국어 명사구를 우선한다.\n"
        "- title에는 '이유', '방안', '문제'처럼 의미를 보강하는 말은 쓸 수 있지만, '요약', '정리', '논의' 같은 메타어는 쓰지 않는다.\n"
        "- summary는 회의 잡담을 제거하고 전체 전사문의 핵심만 1~2줄로 남긴다.\n"
        "- summary는 문장형 설명보다 '핵심 대상 + 방향/문제/조건' 형태의 압축 구문을 우선한다.\n"
        "- summary 예시: '사용자별 회의 흐름 유지 / 다중 기기 STT 동기화', '잡담 제외, 의미 단위 아이디어 병합'.\n"
        "- summary에는 회의 주제의 일반 설명을 쓰지 말고, target_transcript_text에서 새로 나온 구체 논지만 쓴다.\n"
        "- keywords는 3~6개로 작성하고, title/summary에서 실제 의미를 구성하는 명사구만 넣는다.\n"
        "- keywords는 target_transcript_text의 첫 단어들이 아니라, 전체 발화에서 반복/강조/결론 역할을 하는 중심 개념이어야 한다.\n"
        "- refinedUtterances에는 핵심 요약문에 직접 영향을 준 주요 발화만 넣고, 잡담은 넣지 않는다.\n"
        "- refinedUtterances에는 단순 배경 설명, 동의/확인, 중복 부연, 간접 관련 발화는 넣지 않는다.\n"
        "- refinedUtterances는 update 하나당 최대 4개까지만 작성한다. 확실한 직접 근거가 1개면 1개만 작성한다.\n"
        "- relevanceScore는 content와의 직접 관련도를 0~1로 평가한다. 0.78 미만이면 refinedUtterances에 넣지 않는다.\n"
        "- refinedUtterances.text는 반드시 14~38자 정도의 짧은 요약문으로 쓴다.\n"
        "- refinedUtterances.text는 발화 원문을 그대로 복사하거나 긴 문장으로 다듬어 쓰지 않는다.\n"
        "- refinedUtterances.text는 '말함', '언급함', '논의함' 같은 메타 표현 없이 핵심 근거만 쓴다.\n"
        "- refinedUtterances 예시: '다중 마이크 전사 중복 문제', '노드 생성 전 LLM 정리 대기', '핵심 요약과 발화 근거 분리'.\n"
        "- refinedUtterances의 utterance_id, speaker, timestamp는 target_utterance_refs 중 ref가 일치하는 실제 id/speaker/timestamp를 사용한다.\n"
        "- evidenceUtteranceIds와 ignoredUtteranceIds는 target_utterance_refs의 id만 사용한다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _compute_idea_assimilation_result(payload: CanvasIdeaAssimilationInput) -> dict[str, Any]:
    updates: list[dict[str, Any]] = []
    used_llm = False
    warning = ""
    fallback_ids = [_safe_text(item.id) for item in (payload.target_utterances or []) if _safe_text(item.id)]

    client, llm_ready, llm_note = _ensure_llm_ready(RT)
    if payload.target_utterances and llm_ready:
        try:
            parsed = _call_llm_json(
                RT,
                client,
                prompt=_build_idea_assimilation_prompt(payload),
                stage="canvas_idea_assimilation",
                temperature=0.2,
                max_tokens=2200,
            )
            parsed_updates = parsed.get("updates") if isinstance(parsed, dict) else None
            normalized_updates: list[dict[str, Any]] = []
            if isinstance(parsed_updates, list):
                for item in parsed_updates:
                    normalized = _normalize_idea_assimilation_update(item, fallback_ids)
                    if normalized:
                        normalized_updates.append(normalized)
            if normalized_updates:
                updates = normalized_updates[:5]
                used_llm = True
                RT.last_llm_parsed_json = {
                    "stage": "canvas_idea_assimilation",
                    "updates": copy.deepcopy(updates),
                }
                RT.last_llm_parsed_at = _now_ts()
            else:
                warning = "LLM JSON 형식이 예상과 달라 아이디어 노드를 생성하지 않았습니다."
        except Exception as exc:
            warning = f"아이디어 병합 LLM 생성 실패: {exc}"
    elif payload.target_utterances:
        warning = llm_note or "LLM 미연결 상태라 아이디어 노드를 생성하지 않았습니다."

    return {
        "ok": True,
        "used_llm": used_llm,
        "warning": warning,
        "generated_at": _now_ts(),
        "updates": updates,
    }


def _build_problem_definition_prompt(topic: str, groups: list[dict[str, Any]]) -> str:
    prompt_groups: list[dict[str, Any]] = []
    for group in groups:
        prompt_groups.append(
            {
                "group_id": _safe_text(group.get("group_id")),
                "draft_topic": _safe_text(group.get("topic")),
                "draft_insight_lens": _safe_text(group.get("insight_lens"), "공통 행동과 니즈를 묶어 해석"),
                "keywords": [_safe_text(x) for x in (group.get("keywords") or []) if _safe_text(x)],
                "agenda_titles": [_safe_text(x) for x in (group.get("agenda_titles") or []) if _safe_text(x)],
                "ideas": group.get("ideas") or [],
                "source_summary_items": [_safe_text(x) for x in (group.get("source_summary_items") or []) if _safe_text(x)],
            }
        )
    payload = {
        "meeting_topic": _safe_text(topic),
        "groups": prompt_groups,
    }
    return (
        "너는 회의 아이디어를 문제 정의 단계용 주제 묶음으로 정리하는 분석기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 각 묶음의 draft_topic은 초안일 뿐이다. 이를 그대로 복사하지 말고, 묶음 전체를 더 잘 설명하는 최종 topic을 다시 정제해 작성한다.\n"
        "- 유사한 안건/아이디어 묶음마다 '주제 결론'을 새로 작성한다.\n"
        "- 주제 결론은 기존 문장을 그대로 복사하지 말고, 입력 내용을 종합해서 새 한국어 문장 1개로 재작성한다.\n"
        "- topic은 너무 길지 않은 키워드/짧은 구 형태로 유지한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "groups": [\n'
        "    {\n"
        '      "group_id": "problem-group-1",\n'
        '      "topic": "트렌드",\n'
        '      "insight_lens": "사용자의 행동에서 드러난 숨은 니즈를 정리",\n'
        '      "conclusion": "키링을 통해 자신을 표현하려는 수요가 강하게 드러난다."\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "[규칙]\n"
        "- group_id는 입력값을 그대로 유지한다.\n"
        "- topic은 draft_topic 재사용이 아니라, 묶음의 안건/아이디어/요약을 보고 다시 정제한 최종 주제명이어야 한다.\n"
        "- insight_lens는 이 묶음의 인사이트를 어떤 관점으로 정리했는지 설명하는 짧은 문구다.\n"
        "- insight_lens는 예를 들면 '행동에서 드러난 니즈', '의사결정 기준의 충돌', '실행 제약과 우선순위' 같은 식으로 쓴다.\n"
        "- insight_lens는 반드시 8~20자 이내의 짧은 한국어 구로 쓴다.\n"
        "- topic은 반드시 1~2단어만 사용한다.\n"
        "- topic은 가급적 10자 이내의 짧은 명사구로 쓴다.\n"
        "- topic은 너무 일반적인 표현(예: 기타, 논의, 안건, 주제)으로 쓰지 않는다.\n"
        "- conclusion은 각 주제당 정확히 1문장.\n"
        "- conclusion은 반드시 insight_lens의 관점으로 해석한 결과여야 한다.\n"
        "- conclusion은 '이 그룹에서는', '~에서는', '~정리된다', '~필요가 있다' 같은 서술 틀로 시작하거나 끝내지 않는다.\n"
        "- conclusion은 바로 핵심 결과 문장만 쓴다.\n"
        "- conclusion은 요약문 재인용이 아니라 새로 쓴 문장.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _build_problem_group_conclusion_local(payload: ProblemConclusionGenerateInput) -> str:
    summary_items = [_safe_text(item) for item in (payload.group.source_summary_items or []) if _safe_text(item)]
    idea_bodies = [
        _safe_text(item.body) or _safe_text(item.title)
        for item in (payload.group.ideas or [])
        if _safe_text(item.body) or _safe_text(item.title)
    ]
    evidence = summary_items + idea_bodies
    if evidence:
        anchor = _to_summary_point(evidence[0], max_len=None)
        if anchor:
            return anchor
    agenda_titles = [_safe_text(item) for item in (payload.group.agenda_titles or []) if _safe_text(item)]
    if agenda_titles:
        return f"{agenda_titles[0]} 방향 구체화"
    return f"{_safe_text(payload.group.topic, '주제')} 방향 구체화"


def _build_problem_group_insight_lens_local(payload: ProblemConclusionGenerateInput) -> str:
    existing = _safe_text(payload.group.insight_lens)
    if existing:
        return existing
    if payload.group.ideas:
        return "개인 메모와 요약을 함께 해석"
    if payload.group.source_summary_items:
        return "요약 흐름에서 공통 인사이트 도출"
    if payload.group.agenda_titles:
        return "안건 흐름에서 공통 방향 정리"
    return "핵심 방향을 묶어 해석"


def _build_problem_group_conclusion_prompt(payload: ProblemConclusionGenerateInput) -> str:
    serialized = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "group": {
            "group_id": _safe_text(payload.group.group_id),
            "topic": _safe_text(payload.group.topic),
            "draft_insight_lens": _safe_text(payload.group.insight_lens),
            "agenda_titles": [_safe_text(item) for item in (payload.group.agenda_titles or []) if _safe_text(item)],
            "source_summary_items": [
                _safe_text(item) for item in (payload.group.source_summary_items or []) if _safe_text(item)
            ],
            "ideas": [
                {
                    "id": _safe_text(item.id),
                    "kind": _safe_text(item.kind, "note"),
                    "title": _safe_text(item.title),
                    "body": _safe_text(item.body),
                }
                for item in (payload.group.ideas or [])
                if _safe_text(item.id) or _safe_text(item.title) or _safe_text(item.body)
            ],
        },
    }
    return (
        "너는 문제정의 그룹의 현재 메모와 요약을 보고 결론 한 문장을 작성하는 분석기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 먼저 이 그룹의 인사이트를 어떤 관점으로 정리할지 insight_lens를 정한다.\n"
        "- group.topic, source_summary_items, ideas를 종합해 이 그룹의 결론을 한 문장으로 쓴다.\n"
        "- 회의에서 드러난 핵심 인사이트나 방향이 드러나야 한다.\n"
        "- 입력 문장을 그대로 복붙하지 말고 새로운 한국어 문장으로 정리한다.\n"
        "- 너무 추상적이지 않게, 실제 논의된 흐름이 느껴지게 쓴다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(serialized, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "group_id": "problem-group-1",\n'
        '  "insight_lens": "행동에서 드러난 숨은 니즈",\n'
        '  "conclusion": "사용자의 표현 욕구를 반영한 방향으로 아이디어를 정리해야 한다."\n'
        "}\n\n"
        "[규칙]\n"
        "- group_id는 입력값을 그대로 유지한다.\n"
        "- insight_lens는 인사이트를 어떤 각도로 정리했는지 드러내는 8~20자 이내의 짧은 한국어 구다.\n"
        "- insight_lens는 예를 들면 '행동에서 드러난 니즈', '의사결정 기준의 충돌', '실행 제약과 우선순위'처럼 쓴다.\n"
        "- conclusion은 한국어 1문장.\n"
        "- conclusion은 18~45자 정도의 짧고 분명한 문장.\n"
        "- conclusion은 반드시 insight_lens 관점으로 해석한 결과여야 한다.\n"
        "- conclusion은 '이 그룹에서는', '~에서는', '~정리된다', '~필요가 있다' 같은 틀을 쓰지 않는다.\n"
        "- conclusion은 바로 핵심 결과 문장만 쓴다.\n"
        "- topic을 반복만 하지 말고, 근거를 종합한 결과를 써야 한다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _problem_grouping_rationale_basis_items(payload: ProblemGroupingRationaleGenerateInput) -> list[str]:
    basis: list[str] = []

    for item in payload.group.source_summary_items or []:
        text = _safe_text(item)
        if text:
            basis.append(_to_summary_point(text, max_len=72))

    for idea in payload.group.ideas or []:
        text = _safe_text(idea.body) or _safe_text(idea.title)
        if text:
            basis.append(_to_summary_point(text, max_len=72))

    evidence_ids = {_safe_text(item) for item in payload.group.evidence_utterance_ids or [] if _safe_text(item)}
    topic_tokens = set(
        _problem_taxonomy_tokens(
            " ".join(
                [
                    _safe_text(payload.group.topic),
                    _safe_text(payload.group.insight_lens),
                    _safe_text(payload.group.conclusion),
                    " ".join(_safe_text(item) for item in payload.group.source_summary_items or []),
                ],
            ),
        ),
    )
    scored_rows: list[tuple[int, str]] = []
    for row in _resolve_problem_taxonomy_utterance_rows(payload.meeting_id, payload.utterances):
        text = _safe_text(row.get("text"))
        if not text:
            continue
        row_id = _safe_text(row.get("id"))
        score = 3 if row_id and row_id in evidence_ids else 0
        if topic_tokens:
            score += len(topic_tokens & set(_problem_taxonomy_tokens(text)))
        if score > 0:
            scored_rows.append((score, _to_summary_point(text, max_len=72)))

    for _, text in sorted(scored_rows, key=lambda item: item[0], reverse=True):
        basis.append(text)

    for child in payload.child_groups or []:
        child_topic = _safe_text(child.topic)
        child_summary = _safe_text(child.conclusion) or _safe_text(child.insight_lens)
        if child_topic and child_summary:
            basis.append(f"{child_topic}: {_to_summary_point(child_summary, max_len=56)}")
        elif child_topic:
            basis.append(child_topic)

    deduped: list[str] = []
    seen: set[str] = set()
    for item in basis:
        key = re.sub(r"\s+", " ", _safe_text(item)).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(_safe_text(item))
        if len(deduped) >= 5:
            break

    return deduped


def _build_problem_grouping_rationale_local(payload: ProblemGroupingRationaleGenerateInput) -> dict[str, Any]:
    topic = _safe_text(payload.group.topic, "이 분류")
    child_topics = [_safe_text(item.topic) for item in payload.child_groups or [] if _safe_text(item.topic)]
    basis_items = _problem_grouping_rationale_basis_items(payload)

    if child_topics:
        visible_children = ", ".join(child_topics[:4])
        rationale = f"{topic}은 {visible_children}처럼 세부 논의가 나뉘는 흐름을 기준으로 묶은 것으로 보입니다."
    elif basis_items:
        rationale = f"{topic}은 '{basis_items[0]}' 흐름이 반복되어 하나의 분류로 묶은 것으로 보입니다."
    else:
        rationale = f"{topic}은 현재 노드 제목과 연결된 요약을 기준으로 임시 분류한 것으로 보입니다."

    return {
        "rationale": rationale,
        "basis_items": basis_items,
    }


def _build_problem_grouping_rationale_prompt(payload: ProblemGroupingRationaleGenerateInput) -> str:
    evidence_ids = {_safe_text(item) for item in payload.group.evidence_utterance_ids or [] if _safe_text(item)}
    rows = _resolve_problem_taxonomy_utterance_rows(payload.meeting_id, payload.utterances)
    evidence_rows = [
        row
        for row in rows
        if _safe_text(row.get("text")) and (not evidence_ids or _safe_text(row.get("id")) in evidence_ids)
    ][:24]
    if not evidence_rows:
        evidence_rows = [row for row in rows[:24] if _safe_text(row.get("text"))]
    serialized = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "group": {
            "group_id": _safe_text(payload.group.group_id),
            "topic": _safe_text(payload.group.topic),
            "insight_lens": _safe_text(payload.group.insight_lens),
            "conclusion": _safe_text(payload.group.conclusion),
            "agenda_titles": [_safe_text(item) for item in payload.group.agenda_titles or [] if _safe_text(item)],
            "source_summary_items": [
                _safe_text(item) for item in payload.group.source_summary_items or [] if _safe_text(item)
            ][:12],
            "ideas": [
                {
                    "id": _safe_text(item.id),
                    "kind": _safe_text(item.kind, "note"),
                    "title": _safe_text(item.title),
                    "body": _safe_text(item.body),
                }
                for item in payload.group.ideas or []
                if _safe_text(item.title) or _safe_text(item.body)
            ][:12],
        },
        "child_groups": [
            {
                "group_id": _safe_text(item.group_id),
                "topic": _safe_text(item.topic),
                "insight_lens": _safe_text(item.insight_lens),
                "conclusion": _safe_text(item.conclusion),
            }
            for item in payload.child_groups or []
            if _safe_text(item.topic)
        ][:12],
        "evidence_utterances": evidence_rows,
    }
    return (
        "너는 문제정의 캔버스에서 AI가 어떤 기준으로 노드를 묶었는지 설명하는 분석기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- group, child_groups, evidence_utterances를 보고 이 분류가 어떤 공통 기준으로 묶였는지 추정한다.\n"
        "- 회의에 없던 새로운 사실을 만들지 않는다.\n"
        "- 사용자가 회의 효율화를 위해 AI가 한 일을 이해할 수 있게 짧고 투명하게 설명한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(serialized, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "group_id": "problem-group-1",\n'
        '  "rationale": "반복적으로 나온 장소 후보와 이동 조건을 함께 다뤄 하나의 분류로 묶은 것으로 보입니다.",\n'
        '  "basis_items": ["서울과 경주가 현장학습 후보로 반복 언급됨", "이동 시간과 교육성이 함께 비교됨"]\n'
        "}\n\n"
        "[규칙]\n"
        "- group_id는 입력값을 그대로 유지한다.\n"
        "- rationale은 한국어 1~2문장, 90자 이내.\n"
        "- basis_items는 2~4개, 입력에 근거한 짧은 문장 또는 구.\n"
        "- 확실하지 않은 경우 '~로 보입니다'처럼 추정임을 드러낸다.\n"
        "- basis_items에는 입력에 없는 내용을 추가하지 않는다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_problem_structure_method(raw: Any) -> str:
    text = _safe_text(raw).lower().replace("_", "-").strip()
    return "card-sorting" if text in {"card-sorting", "card sorting", "cardsorting"} else "affinity"


def _problem_structure_node_dict(item: ProblemStructureNodeInput) -> dict[str, Any]:
    title = _normalize_problem_summary_label(item.title, "문제정의 노드", max_len=42)
    body = _to_summary_point(item.body, max_len=120)
    return {
        "id": _safe_text(item.id) or f"structure-node-{_stable_short_id(title + body)}",
        "title": title,
        "body": body,
        "status": _safe_text(item.status, "draft"),
        "depth": max(0, min(8, int(item.depth or 0))),
    }


def _problem_structure_node_tokens(node: dict[str, Any]) -> set[str]:
    return set(_problem_taxonomy_tokens(f"{node.get('title', '')} {node.get('body', '')}"))


def _problem_structure_group_title(nodes: list[dict[str, Any]], index: int) -> str:
    if len(nodes) == 1:
        return _normalize_problem_summary_label(nodes[0].get("title"), f"구조화 그룹 {index}", max_len=38)
    token_counts: Counter[str] = Counter()
    for node in nodes:
        token_counts.update(_problem_structure_node_tokens(node))
    common_tokens = [token for token, _count in token_counts.most_common(2)]
    if common_tokens:
        return _normalize_problem_summary_label(f"{'·'.join(common_tokens)} 관련 논의 묶음", f"구조화 그룹 {index}", max_len=38)
    return _normalize_problem_summary_label(nodes[0].get("title"), f"구조화 그룹 {index}", max_len=38)


def _problem_structure_group_rationale(nodes: list[dict[str, Any]], method: str) -> str:
    titles = [_safe_text(node.get("title")) for node in nodes if _safe_text(node.get("title"))]
    visible_titles = ", ".join(titles[:3])
    if len(nodes) <= 1:
        return f"{visible_titles or '이 노드'}는 별도 검토가 필요한 단일 논의로 분리했습니다."
    if method == "card-sorting":
        return f"{visible_titles} 등이 같은 분류 기준으로 읽혀 하나의 카드 그룹으로 묶었습니다."
    return f"{visible_titles} 등이 의미상 가까운 논의 흐름으로 보여 함께 묶었습니다."


def _build_problem_structure_groups_local(payload: ProblemStructureGenerateInput) -> list[dict[str, Any]]:
    nodes = [
        _problem_structure_node_dict(item)
        for item in payload.nodes or []
        if _safe_text(item.id) or _safe_text(item.title) or _safe_text(item.body)
    ]
    if not nodes:
        return []

    max_groups = max(1, min(int(payload.max_groups or 6), len(nodes)))
    clusters: list[dict[str, Any]] = []
    for node in nodes:
        tokens = _problem_structure_node_tokens(node)
        best_cluster: dict[str, Any] | None = None
        best_score = 0
        for cluster in clusters:
            cluster_tokens = set(cluster.get("tokens") or [])
            score = len(tokens & cluster_tokens)
            if score > best_score:
                best_score = score
                best_cluster = cluster

        if best_cluster is not None and best_score >= 2:
            best_cluster["nodes"].append(node)
            best_cluster["tokens"] = _dedup_preserve(
                [*(best_cluster.get("tokens") or []), *tokens],
                limit=24,
            )
            continue

        if len(clusters) < max_groups:
            clusters.append({"nodes": [node], "tokens": list(tokens)})
            continue

        fallback_cluster = min(clusters, key=lambda item: len(item.get("nodes") or []))
        fallback_cluster["nodes"].append(node)
        fallback_cluster["tokens"] = _dedup_preserve(
            [*(fallback_cluster.get("tokens") or []), *tokens],
            limit=24,
        )

    method = _normalize_problem_structure_method(payload.method)
    output: list[dict[str, Any]] = []
    used_group_ids: set[str] = set()
    for index, cluster in enumerate(clusters, start=1):
        cluster_nodes = [node for node in cluster.get("nodes") or [] if isinstance(node, dict)]
        if not cluster_nodes:
            continue
        title = _problem_structure_group_title(cluster_nodes, index)
        group_id_base = f"structure-ai-{_stable_short_id(title)}"
        group_id = group_id_base
        suffix = 2
        while group_id in used_group_ids:
            group_id = f"{group_id_base}-{suffix}"
            suffix += 1
        used_group_ids.add(group_id)
        output.append(
            {
                "id": group_id,
                "title": title,
                "node_ids": [_safe_text(node.get("id")) for node in cluster_nodes if _safe_text(node.get("id"))],
                "rationale": _problem_structure_group_rationale(cluster_nodes, method),
                "created_by": "ai",
            }
        )
    return output


def _normalize_problem_structure_llm_groups(
    payload: ProblemStructureGenerateInput,
    raw_groups: Any,
) -> list[dict[str, Any]]:
    if not isinstance(raw_groups, list):
        return []
    valid_nodes = [
        _problem_structure_node_dict(item)
        for item in payload.nodes or []
        if _safe_text(item.id) or _safe_text(item.title) or _safe_text(item.body)
    ]
    node_by_id = {_safe_text(node.get("id")): node for node in valid_nodes if _safe_text(node.get("id"))}
    max_groups = max(1, min(int(payload.max_groups or 6), max(len(node_by_id), 1)))
    used_node_ids: set[str] = set()
    used_group_ids: set[str] = set()
    output: list[dict[str, Any]] = []

    for index, raw in enumerate(raw_groups, start=1):
        if not isinstance(raw, dict) or len(output) >= max_groups:
            continue
        node_ids = [
            _safe_text(item)
            for item in (raw.get("node_ids") or raw.get("nodeIds") or [])
            if _safe_text(item) in node_by_id and _safe_text(item) not in used_node_ids
        ]
        if not node_ids:
            continue
        title = _normalize_problem_summary_label(
            raw.get("title") or raw.get("name") or raw.get("label"),
            f"구조화 그룹 {index}",
            max_len=40,
        )
        group_id_base = _safe_text(raw.get("id")) or f"structure-ai-{_stable_short_id(title)}"
        group_id = group_id_base
        suffix = 2
        while group_id in used_group_ids:
            group_id = f"{group_id_base}-{suffix}"
            suffix += 1
        used_group_ids.add(group_id)
        used_node_ids.update(node_ids)
        rationale = _to_summary_point(
            raw.get("rationale") or raw.get("reason") or raw.get("description"),
            max_len=140,
        )
        if not rationale:
            rationale = _problem_structure_group_rationale([node_by_id[node_id] for node_id in node_ids], _normalize_problem_structure_method(payload.method))
        output.append(
            {
                "id": group_id,
                "title": title,
                "node_ids": node_ids,
                "rationale": rationale,
                "created_by": "ai",
            }
        )

    missing_nodes = [node for node_id, node in node_by_id.items() if node_id not in used_node_ids]
    if missing_nodes:
        if output:
            for node in missing_nodes:
                best_group = min(output, key=lambda group: len(group.get("node_ids") or []))
                best_group["node_ids"] = [
                    *(best_group.get("node_ids") or []),
                    _safe_text(node.get("id")),
                ]
        else:
            return _build_problem_structure_groups_local(payload)

    return output


def _build_problem_structure_prompt(payload: ProblemStructureGenerateInput) -> str:
    method = _normalize_problem_structure_method(payload.method)
    nodes = [
        _problem_structure_node_dict(item)
        for item in payload.nodes or []
        if _safe_text(item.id) or _safe_text(item.title) or _safe_text(item.body)
    ]
    existing_groups = [
        {
            "id": _safe_text(group.id),
            "title": _safe_text(group.title),
            "node_ids": [_safe_text(item) for item in group.node_ids or [] if _safe_text(item)],
            "rationale": _safe_text(group.rationale),
        }
        for group in payload.existing_groups or []
        if _safe_text(group.title) or group.node_ids
    ][:20]
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "structure_method": method,
        "method_hint": (
            "Affinity Diagram: 의미가 가까운 노드를 자연스럽게 묶고, 그룹 제목은 공통 논의 흐름을 드러낸다."
            if method == "affinity"
            else "Card Sorting: 사용자가 분류 기준을 이해하기 쉽게 그룹 카드 제목과 설명/이유를 만든다."
        ),
        "nodes": nodes,
        "existing_groups": existing_groups,
        "max_groups": payload.max_groups,
    }
    output_schema = {
        "groups": [
            {
                "id": "structure-ai-1",
                "title": "현장학습 목적지 후보 비교",
                "node_ids": ["node-1", "node-2"],
                "rationale": "두 노드 모두 목적지 후보를 비교하는 기준과 근거를 다룹니다.",
            }
        ]
    }
    return (
        "너는 문제정의 2단계에서 정의 1단계 노드를 구조화하는 회의 퍼실리테이터다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 입력 nodes를 구조화 방식에 맞춰 여러 그룹으로 묶는다.\n"
        "- 노드 내용은 이미 회의 STT에서 요약된 것이므로, 새 노드나 새 내용을 만들지 않는다.\n"
        "- 모든 node id는 정확히 한 번만 어떤 group.node_ids에 들어가야 한다.\n"
        "- 같은 그룹 안의 노드들은 사용자가 납득할 수 있는 공통 기준이 있어야 한다.\n"
        "- 그룹 제목은 키워드 하나가 아니라, 묶음의 의미가 드러나는 짧은 문장/구로 쓴다.\n"
        "- rationale은 사용자가 왜 묶였는지 이해할 수 있는 한국어 1문장으로 쓴다.\n"
        "- existing_groups는 사용자가 이미 만든 구조의 참고 정보일 뿐이며, 입력 nodes 기준으로 새 그룹 목록을 반환한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        f"{json.dumps(output_schema, ensure_ascii=False, indent=2)}\n\n"
        "[규칙]\n"
        f"- groups는 1~{payload.max_groups}개다.\n"
        "- node_ids에는 입력 nodes에 있는 id만 사용한다.\n"
        "- 입력된 모든 node id를 정확히 한 번 포함한다.\n"
        "- '기타', '논의됨', '관련 내용' 같은 막연한 그룹명은 피한다.\n"
        "- 근거가 약한 노드는 가장 가까운 의미의 그룹에 넣되 rationale에서 과장하지 않는다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_canvas_quick_ask_rows(raw_rows: Any, limit: int = 80) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not isinstance(raw_rows, list):
        return rows
    for index, item in enumerate(raw_rows):
        if not isinstance(item, dict):
            continue
        text = _strip_leading_timestamp(item.get("text"))
        if not text:
            continue
        rows.append(
            {
                "id": _safe_text(item.get("id"), f"quick-row-{index + 1}"),
                "speaker": _safe_text(item.get("speaker"), "참가자"),
                "text": _truncate_text(text, 500),
                "timestamp": _safe_text(item.get("timestamp")),
                "canvas_stage": _normalize_canvas_stage(item.get("canvas_stage") or item.get("stage")),
            }
        )
    return rows[-limit:]


def _resolve_canvas_quick_ask_rows(payload: CanvasQuickAskInput, meeting_id: str) -> list[dict[str, str]]:
    server_rows = _resolve_problem_taxonomy_utterance_rows(meeting_id, []) if meeting_id else []
    context_rows = _normalize_canvas_quick_ask_rows((payload.context or {}).get("recent_utterances"))
    if not server_rows:
        return context_rows

    merged_by_id: dict[str, dict[str, str]] = {}
    for row in server_rows[-80:] + context_rows:
        row_id = _safe_text(row.get("id"), f"quick-row-{len(merged_by_id) + 1}")
        merged_by_id[row_id] = {
            "id": row_id,
            "speaker": _safe_text(row.get("speaker"), "참가자"),
            "text": _truncate_text(_strip_leading_timestamp(row.get("text")), 500),
            "timestamp": _safe_text(row.get("timestamp")),
            "canvas_stage": _normalize_canvas_stage(row.get("canvas_stage")),
        }
    return list(merged_by_id.values())[-80:]


def _compact_canvas_quick_ask_context(payload: CanvasQuickAskInput, rows: list[dict[str, str]]) -> dict[str, Any]:
    context = dict(payload.context or {})
    context["recent_utterances"] = rows[-32:]
    context["question_stage"] = _normalize_canvas_stage(payload.stage)
    if not _safe_text(context.get("meeting_topic")):
        context["meeting_topic"] = _safe_text(payload.meeting_topic)
    return context


def _build_canvas_quick_ask_prompt(payload: CanvasQuickAskInput, rows: list[dict[str, str]]) -> str:
    compact_context = _compact_canvas_quick_ask_context(payload, rows)
    context_json = _truncate_text(json.dumps(compact_context, ensure_ascii=False, indent=2), 10000)
    question = _truncate_text(payload.question, 2000)
    return (
        "너는 일반 LLM 채팅 서비스처럼 사용자의 질문에 답하는 범용 AI 보조자다. 출력은 JSON 하나만 반환한다.\n\n"
        "[역할]\n"
        "- 사용자의 질문에 한국어로 바로 답한다. 질문은 회의와 관련 없어도 된다.\n"
        "- 제공된 회의/캔버스 맥락은 선택 참고자료일 뿐이며, 답변의 기본 주제가 아니다.\n"
        "- 질문이 회의나 캔버스를 직접 가리킬 때만 제공된 회의 맥락을 참고한다.\n"
        "- 질문이 일반 지식, 글쓰기, 코드, 번역, 아이디어, 잡담이면 회의 맥락을 무시하고 일반 LLM 답변으로 처리한다.\n"
        "- 회의 맥락을 사용하지 않았다면 회의와 연결하려는 문장을 덧붙이지 않는다.\n"
        "- 실시간 웹 검색은 현재 연결되어 있지 않다. 최신성이나 실시간 사실 확인이 핵심이면 그 한계를 짧게 말한다.\n\n"
        "[참고 맥락 JSON]\n"
        f"{context_json}\n\n"
        "[사용자 질문]\n"
        f"{question}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "answer": "2~6문장 또는 짧은 bullet 답변"\n'
        "}\n\n"
        "[규칙]\n"
        "- answer 외 다른 최상위 필드는 만들지 않는다.\n"
        "- Markdown bullet은 허용하지만, 코드블록은 사용하지 않는다.\n"
        "- 질문이 단순하면 1~3문장으로 답한다.\n"
        "- 불필요한 인사말 없이 바로 답한다."
    )


def _normalize_canvas_quick_ask_answer(parsed: Any, fallback: str) -> str:
    if isinstance(parsed, dict):
        answer = _safe_text(parsed.get("answer") or parsed.get("response") or parsed.get("text"))
        if answer:
            return _truncate_text(answer, 5000)
    return _truncate_text(fallback, 5000)


def _build_canvas_quick_ask_local_answer(question: str, rows: list[dict[str, str]]) -> str:
    tokens = set(_keyword_tokens(question))
    matches: list[tuple[int, int, dict[str, str]]] = []
    if tokens:
        for index, row in enumerate(rows):
            row_tokens = set(_keyword_tokens(row.get("text", "")))
            score = len(tokens & row_tokens)
            if score > 0:
                matches.append((score, index, row))
    matches.sort(key=lambda item: (-item[0], -item[1]))
    snippets = matches[:3]
    if snippets:
        lines = [
            "LLM 연결이 없어 일반 답변을 생성하지 못했습니다. 참고로 회의 기록에서 질문과 겹치는 발언 후보는 아래와 같습니다.",
            *[
                f"- {_safe_text(row.get('speaker'), '참가자')}: {_truncate_text(row.get('text'), 180)}"
                for _score, _index, row in snippets
            ],
        ]
        return "\n".join(lines)
    return "LLM 연결이 없어 지금은 일반 답변을 생성하지 못했습니다."


_IDEATION_KEYWORD_NON_NOUN_PATTERNS = [
    re.compile(r"(하다|했다|한다|했던|하고|하며|하면|해서|해야|하기|하자|하죠|하게|하려|하려고|하려면|하던|할까|할지|해도|해요)$"),
    re.compile(r"(되다|된다|됐다|되고|되면|되어|되는|되죠|돼요|됩니다)$"),
    re.compile(r"(입니다|있는|있다|있고|있어|없다|없고|없어|같다|같은|같아요|싶다|싶은)$"),
    re.compile(r"(좋다|좋은|나쁘다|나쁜|어렵다|어려운|쉽다|쉬운|많다|많은|적다|적은|크다|큰|작다|작은)$"),
    re.compile(r"(아요|어요|워요|네요|군요|죠|지요|고요|습니다|습니까|면서|지만|거나|니까|어서|아서|려고|다고)$"),
]

_IDEATION_KEYWORD_SINGLE_CHAR_ALLOWLIST = {"돈", "집", "차", "맛", "잠", "힘", "일"}


def _normalize_ideation_keyword_text(raw: Any) -> str:
    text = re.sub(r"\s+", " ", _safe_text(raw)).strip()
    text = re.sub(r"^[^\w가-힣]+|[^\w가-힣]+$", "", text)
    if not text or len(text) > 28:
        return ""
    if len(text) < 2 and text not in _IDEATION_KEYWORD_SINGLE_CHAR_ALLOWLIST:
        return ""
    if re.fullmatch(r"\d+", text):
        return ""
    if re.fullmatch(r"\d{2,4}\s*년(?:도)?", text):
        return ""
    lowered = text.lower()
    if lowered in STOPWORDS or lowered in TITLE_NOISE_TOKENS:
        return ""
    if any(pattern.search(lowered) for pattern in _IDEATION_KEYWORD_NON_NOUN_PATTERNS):
        return ""
    if re.search(r"[가-힣][a-z0-9+#._-]+", text, flags=re.IGNORECASE):
        return ""
    return lowered if re.fullmatch(r"[A-Za-z0-9+#._ -]+", text) else text


def _ideation_keyword_rows(payload: IdeationKeywordExtractInput) -> list[dict[str, str]]:
    return _normalize_problem_taxonomy_utterance_rows(payload.utterances)[-180:]


def _ideation_context_keyword_rows(payload: IdeationKeywordExtractInput) -> list[dict[str, str]]:
    return _normalize_problem_taxonomy_utterance_rows(payload.context_utterances)[-180:]


def _ideation_context_cache_text(payload: IdeationKeywordExtractInput) -> str:
    cache = _safe_text(payload.context_cache)
    if cache:
        return _truncate_text(cache, 18000)
    rows = _ideation_context_keyword_rows(payload)
    return "\n".join(
        f"{idx + 1}. {_safe_text(row.get('speaker'), '참가자')}: {_truncate_text(_strip_leading_timestamp(row.get('text')), 320)}"
        for idx, row in enumerate(rows)
    )


def _ideation_existing_keyword_rows(payload: IdeationKeywordExtractInput) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in payload.existing_keywords or []:
        text = _normalize_ideation_keyword_text(item.text)
        if not text:
            continue
        aliases = _dedup_preserve(
            [
                _normalize_ideation_keyword_text(value)
                for value in (item.aliases or [])
                if _normalize_ideation_keyword_text(value)
            ],
            limit=8,
        )
        kind = _safe_text(item.kind, "topic").lower()
        rows.append(
            {
                "id": _safe_text(item.id),
                "text": text,
                "canonical_label": _normalize_ideation_keyword_text(item.canonical_label) or text,
                "aliases": [value for value in aliases if value != text],
                "evidence_utterance_ids": _dedup_preserve(
                    [
                        _safe_text(value)
                        for value in (item.evidence_utterance_ids or [])
                        if _safe_text(value)
                    ],
                    limit=10,
                ),
                "count": max(1, _safe_nonnegative_int(item.count, 1) or 1),
                "kind": kind if kind in {"entity", "topic", "relation", "action", "off_topic"} else "topic",
                "importance": max(0, min(1, _safe_float(item.importance, 0.65))),
                "relevance": max(0, min(1, _safe_float(item.relevance, 1))),
                "off_topic": bool(item.off_topic),
                "anchor": _normalize_ideation_keyword_text(item.anchor),
                "choice_affinity": _safe_text(item.choice_affinity).lower(),
                "affinity_score": max(0.0, min(1.0, _safe_float(item.affinity_score, 0.0))),
                "needs_affinity_review": bool(item.needs_affinity_review),
                "related": _dedup_preserve(
                    [
                        _normalize_ideation_keyword_text(value)
                        for value in (item.related or [])
                        if _normalize_ideation_keyword_text(value)
                    ],
                    limit=6,
                ),
            }
        )
        if len(rows) >= 30:
            break
    return rows


def _build_local_ideation_keywords(rows: list[dict[str, str]], max_keywords: int) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    first_seen: dict[str, int] = {}
    cooccurrence: dict[str, Counter[str]] = {}
    cursor = 0
    for row in rows:
        row_terms: list[str] = []
        for token in _keyword_tokens(_strip_leading_timestamp(row.get("text"))):
            keyword = _normalize_ideation_keyword_text(token)
            if not keyword:
                continue
            row_terms.append(keyword)
        unique_terms = _dedup_preserve(row_terms, limit=14)
        for keyword in unique_terms:
            counts[keyword] += 1
            if keyword not in first_seen:
                first_seen[keyword] = cursor
                cursor += 1
        for left in unique_terms:
            related = cooccurrence.setdefault(left, Counter())
            for right in unique_terms:
                if left != right:
                    related[right] += 1

    minimum_count = 2 if len(rows) >= 8 else 1
    sorted_items = [
        keyword
        for keyword, count in counts.items()
        if count >= minimum_count
    ]
    sorted_items.sort(key=lambda keyword: (-counts[keyword], first_seen.get(keyword, 0)))
    if not sorted_items:
        sorted_items = sorted(counts, key=lambda keyword: (-counts[keyword], first_seen.get(keyword, 0)))

    selected = sorted_items[:max_keywords]
    selected_set = set(selected)
    return [
        {
            "text": keyword,
            "count": int(counts[keyword]),
            "related": [
                related_keyword
                for related_keyword, _score in cooccurrence.get(keyword, Counter()).most_common(5)
                if related_keyword in selected_set
            ],
        }
        for keyword in selected
    ]


def _build_demo_balance_keyword_extract_prompt(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
) -> str:
    input_payload = _demo_balance_consolidate_llm_input_payload(payload, rows)
    return (
        "너는 3분 내외 A/B 밸런스 게임 시연에서 최근 STT와 기존 버블만 보고 버블 그래프를 정리하는 AI다. 출력은 JSON 하나만 반환한다.\n\n"
        "[시연 목표]\n"
        "- recent_utterances는 판단 참고용이다. 전사 보정 결과는 출력하지 않는다.\n"
        "- 새 버블은 절대 만들지 않는다. 새 버블 생성은 local_fast_keywords가 담당한다.\n"
        "- bubbles에 있는 기존 버블 id만 대상으로 표기 보정, 병합, 삭제, A/B side 이동을 지시한다.\n"
        "- 예: 버블 label이 '사생활 치매'이고 문맥상 '사생활 침해'라면 rename으로 같은 id의 label만 고친다.\n"
        "- aliases는 STT 변형이다. aliases에 있는 표현이 올바른 label로 보이면 rename/merge에 적극 사용한다.\n"
        "- 같은 label이라도 side가 a와 b에 각각 있으면 서로 다른 버블이다. 기본적으로 합치지 않는다.\n"
        "- merge는 같은 side 안에서만 지시한다. 다른 side로 옮겨야 하면 move를 사용한다.\n"
        "- A/B 배치가 잘못된 기존 버블은 move로 side를 a 또는 b로 바꾼다.\n"
        "- bubbles.review가 true인 버블은 서버가 애매하게 임시 배치한 것이므로 side 이동 여부를 우선 검토한다.\n"
        "- 사람 이름, 잡담성 버블, 단독 숫자, 무의미한 filler 버블은 remove로 정리한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "rename": [{"id": "b1", "label": "사생활 침해"}],\n'
        '  "merge": [{"from": "b2", "to": "b1"}],\n'
        '  "remove": ["b5"],\n'
        '  "move": [{"id": "b3", "side": "a"}]\n'
        "}\n\n"
        "[규칙]\n"
        "- 모든 id는 입력 JSON의 bubbles.id에 있는 b1, b2 같은 짧은 id만 사용한다.\n"
        "- rename.label은 올바른 맞춤법/표기의 짧은 명사 또는 명사구다. 의미를 새로 만들지 않는다.\n"
        "- merge.from과 merge.to는 반드시 같은 side의 버블이어야 한다.\n"
        "- remove는 bubbles에 있는 기존 버블 id 배열이다.\n"
        "- move.side는 a 또는 b만 허용한다.\n"
        "- refine, refined_transcripts, keywords, reason, confidence, count, importance, relevance, valid, choice, ignored_utterance_ids는 반환하지 않는다.\n"
        "- 할 일이 없으면 모든 배열을 빈 배열로 반환한다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _demo_balance_consolidate_llm_request_parts(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
) -> tuple[dict[str, Any], dict[str, str]]:
    demo_config = _normalize_canvas_demo_config(payload.demo_config)
    existing_keywords = _ideation_existing_keyword_rows(payload)
    id_map: dict[str, str] = {}
    bubbles: list[dict[str, Any]] = []
    for item in existing_keywords:
        real_id = _safe_text(item.get("id"))
        label = _safe_text(item.get("text"))
        side = _safe_text(item.get("choice_affinity")).lower()
        if not real_id or not label or side not in {"a", "b"}:
            continue
        short_id = f"b{len(id_map) + 1}"
        id_map[short_id] = real_id
        bubbles.append(
            {
                "id": short_id,
                "label": label,
                "aliases": [
                    _safe_text(value)
                    for value in (item.get("aliases") or [])
                    if _safe_text(value)
                ][:8],
                "side": side,
                "review": bool(item.get("needs_affinity_review") or item.get("needsAffinityReview")),
            }
        )
    input_payload = {
        "options": {
            "a": _safe_text(demo_config.get("option_a")),
            "b": _safe_text(demo_config.get("option_b")),
            "a_keyword": _safe_text(demo_config.get("option_a_keyword") or demo_config.get("option_a")),
            "b_keyword": _safe_text(demo_config.get("option_b_keyword") or demo_config.get("option_b")),
        },
        "recent_utterances": [
            {
                "text": _truncate_text(_strip_leading_timestamp(row.get("text")), 220),
            }
            for row in rows[-5:]
            if _safe_text(row.get("text"))
        ],
        "bubbles": bubbles,
    }
    return input_payload, id_map


def _demo_balance_consolidate_llm_input_payload(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
) -> dict[str, Any]:
    input_payload, _id_map = _demo_balance_consolidate_llm_request_parts(payload, rows)
    return input_payload


def _demo_balance_consolidate_llm_id_map(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
) -> dict[str, str]:
    _input_payload, id_map = _demo_balance_consolidate_llm_request_parts(payload, rows)
    return id_map


def _build_demo_balance_realtime_text_batch_prompt(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
) -> str:
    demo_config = _normalize_canvas_demo_config(payload.demo_config)
    existing_keywords = _ideation_existing_keyword_rows(payload)
    context_cache = _ideation_context_cache_text(payload)
    max_keywords = min(8, max(1, int(payload.max_keywords or 8)))
    input_payload = {
        "max_keywords": max_keywords,
        "meeting_topic": _safe_text(payload.meeting_topic),
        "meeting_goal": _safe_text(payload.meeting_goal),
        "meeting_goal_context": _safe_text(payload.meeting_goal_context),
        "demo_config": demo_config,
        "conversation_context_cache": context_cache,
        "existing_keywords": existing_keywords,
        "target_utterances": [
            {
                "id": _safe_text(row.get("id")),
                "speaker": _safe_text(row.get("speaker"), "참가자"),
                "text": _truncate_text(_strip_leading_timestamp(row.get("text")), 180),
                "timestamp": _safe_text(row.get("timestamp")),
            }
            for row in rows[-6:]
        ],
    }
    return (
        "너는 A/B 밸런스 게임 시연에서 짧은 STT 발화들을 4초 단위로 후처리하는 AI다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- raw STT를 문맥에 맞게 짧고 자연스러운 한국어 발화로 보정한다.\n"
        "- 동시에 화면에 즉시 띄울 짧은 명사/명사구 버블 키워드를 고른다.\n"
        "- 이 단계는 빠른 반응성이 목적이다. 완벽한 병합/삭제/중요도 정리는 20초 consolidate 단계에서 한다.\n"
        "- 키워드는 중요한 결론만이 아니라 참가자가 방금 말한 선택 이유를 대표하는 명사구까지 허용한다.\n"
        "- 키워드는 가능하면 1단어, 최대 2단어 이하의 한국어/영어 명사 또는 명사구로 쓴다.\n"
        "- 인명, 감탄사, filler, 단독 숫자, 단독 알파벳 A/B, 문장, 동사구, 형용사구는 금지한다.\n"
        "- existing_keywords에 같은 의미가 있으면 새 표현을 만들지 말고 기존 text를 그대로 반환한다.\n"
        "- A/B 선택지 자체보다 선택 이유 명사를 우선한다. 단, 선택지명이 핵심 주제라면 허용한다.\n"
        "- merge_keywords/remove_keywords는 이 단계에서 원칙적으로 비워둔다. 명백히 잘못된 중복만 확신이 높을 때 사용한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "refined_transcripts": [\n'
        '    {"id": "utterance-id", "text": "보정된 발화", "choice": "a", "valid": true, "confidence": 0.82, "reason": "A 선택 이유를 설명함"}\n'
        "  ],\n"
        '  "ignored_utterance_ids": ["utterance-id"],\n'
        '  "keywords": [\n'
        '    {"text": "비용", "count": 1, "support_count": 1, "kind": "topic", "importance": 0.7, "relevance": 0.92, "anchor": "A 선택지", "related": []},\n'
        '    {"text": "재미", "count": 1, "support_count": 1, "kind": "topic", "importance": 0.66, "relevance": 0.88, "anchor": "B 선택지", "related": []}\n'
        "  ],\n"
        '  "merge_keywords": [],\n'
        '  "remove_keywords": []\n'
        "}\n\n"
        "[규칙]\n"
        "- refined_transcripts는 target_utterances마다 가능하면 1개씩 만든다. 의미를 바꾸지 말고 STT 오류만 보정한다.\n"
        "- choice는 a, b, unclear 중 하나다. valid는 밸런스 게임 의견이면 true, 잡담/무의미한 발화면 false다.\n"
        "- ignored_utterance_ids에는 잡담, filler, 인명만 있는 발화, A/B 의견으로 보기 어려운 발화 id를 넣는다.\n"
        f"- keywords는 0개 이상, 최대 {max_keywords}개다.\n"
        "- 새 text는 target_utterances에서 실제로 나온 개념만 만든다.\n"
        "- A/B 선택이 불명확해도 선택 이유로 볼 수 있는 명사구는 relevance를 낮춰 후보로 둘 수 있다.\n"
        "- count는 target_utterances에서 해당 의미가 나타난 발화 수다.\n"
        "- support_count는 conversation_context_cache와 target_utterances를 합쳐 해당 의미가 등장한 총 발화 수다.\n"
        "- kind는 entity, topic, relation, action, off_topic 중 하나다.\n"
        "- importance와 relevance는 0~1 숫자다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_demo_balance_refined_transcripts(
    parsed: Any,
    rows: list[dict[str, str]],
) -> list[dict[str, Any]]:
    if not isinstance(parsed, dict):
        return []
    allowed_ids = {_safe_text(row.get("id")) for row in rows if _safe_text(row.get("id"))}
    raw_items = (
        parsed.get("refine")
        or parsed.get("refined_transcripts")
        or parsed.get("refinedTranscripts")
        or []
    )
    if not isinstance(raw_items, list):
        return []
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        item_id = _safe_text(item.get("id") or item.get("utterance_id") or item.get("utteranceId"))
        if not item_id or item_id not in allowed_ids or item_id in seen:
            continue
        text = _safe_text(item.get("text") or item.get("refined_text") or item.get("refinedText"))
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        choice = _safe_text(item.get("choice"), "unclear").lower()
        if choice not in {"a", "b", "unclear"}:
            choice = "unclear"
        normalized.append(
            {
                "id": item_id,
                "text": _truncate_text(text, 260),
                "choice": choice,
                "valid": bool(item.get("valid", choice in {"a", "b"})),
                "confidence": max(0.0, min(1.0, _safe_float(item.get("confidence"), 0.0))),
                "reason": _truncate_text(_safe_text(item.get("reason")), 160),
            }
        )
        seen.add(item_id)
    return normalized[: len(allowed_ids)]


def _normalize_demo_balance_ignored_utterance_ids(parsed: Any, rows: list[dict[str, str]]) -> list[str]:
    if not isinstance(parsed, dict):
        return []
    allowed_ids = {_safe_text(row.get("id")) for row in rows if _safe_text(row.get("id"))}
    raw_ids = parsed.get("ignored_utterance_ids") or parsed.get("ignoredUtteranceIds") or []
    if not isinstance(raw_ids, list):
        return []
    return _dedup_preserve(
        [_safe_text(value) for value in raw_ids if _safe_text(value) in allowed_ids],
        limit=len(allowed_ids),
    )


def _build_demo_balance_fast_keyword_prompt(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
) -> str:
    demo_config = _normalize_canvas_demo_config(payload.demo_config)
    existing_keywords = _ideation_existing_keyword_rows(payload)
    max_keywords = min(8, max(1, int(payload.max_keywords or 8)))
    input_payload = {
        "max_keywords": max_keywords,
        "meeting_topic": _safe_text(payload.meeting_topic),
        "meeting_goal": _safe_text(payload.meeting_goal),
        "meeting_goal_context": _safe_text(payload.meeting_goal_context),
        "demo_config": demo_config,
        "existing_keywords": existing_keywords,
        "target_utterances": [
            {
                "id": _safe_text(row.get("id")),
                "speaker": _safe_text(row.get("speaker"), "참가자"),
                "text": _truncate_text(_strip_leading_timestamp(row.get("text")), 160),
                "timestamp": _safe_text(row.get("timestamp")),
            }
            for row in rows[-2:]
        ],
    }
    return (
        "너는 A/B 밸런스 게임 시연에서 발화 직후 화면에 띄울 버블 키워드만 빠르게 고르는 AI다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- target_utterances의 raw STT에서 A/B 선택 이유를 나타내는 핵심 명사 키워드를 빠르게 추출한다.\n"
        "- 전사 보정, 문장 요약, 병합 판단, 삭제 판단은 하지 않는다.\n"
        "- 참가자가 방금 말한 내용을 5초 안에 화면에서 볼 수 있게 하는 것이 목적이다.\n"
        "- 키워드는 0~8개만 반환한다. 의미 있는 명사가 없으면 빈 배열을 반환한다.\n"
        "- 키워드는 가능하면 1단어, 최대 2단어 이하의 한국어/영어 명사 또는 명사구여야 한다.\n"
        "- 인명, 잡담, filler, 단독 숫자, 단독 알파벳 A/B, 문장, 동사구, 형용사구는 금지한다.\n"
        "- A/B 선택지명 자체보다 선택 이유 명사를 우선한다. 단, 선택지명이 핵심 주제라면 허용한다.\n"
        "- existing_keywords에 같은 의미가 있으면 새 표현을 만들지 말고 기존 text를 그대로 반환한다.\n"
        "- 아주 중요한 키워드만 고르지 말고, 방금 말한 선택 이유를 대표하는 명사구라면 후보로 포함한다.\n"
        "- 확신이 낮거나 화면을 어지럽히는 단어는 만들지 않는다. 대신 keywords를 []로 둔다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "keywords": [\n'
        '    {"text": "비용", "count": 1, "support_count": 1, "kind": "topic", "importance": 0.72, "relevance": 0.94, "anchor": "A 선택지", "related": []},\n'
        '    {"text": "재미", "count": 1, "support_count": 1, "kind": "topic", "importance": 0.68, "relevance": 0.9, "anchor": "B 선택지", "related": []}\n'
        "  ]\n"
        "}\n\n"
        "[규칙]\n"
        f"- keywords는 최대 {max_keywords}개다.\n"
        "- text는 반드시 명사/짧은 명사구다. 공백 기준 2단어를 넘기지 않는다.\n"
        "- count와 support_count는 최소 1이다.\n"
        "- kind는 entity, topic, relation, action, off_topic 중 하나다.\n"
        "- importance와 relevance는 0~1 숫자다.\n"
        "- anchor와 related는 existing_keywords 또는 이번 keywords의 text를 참조할 때만 넣는다.\n"
        "- merge_keywords, remove_keywords, refined_transcripts는 출력하지 않는다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _build_ideation_keyword_extract_prompt(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
    update_mode: str = "",
) -> str:
    if _is_demo_balance_config(payload.demo_config):
        normalized_update_mode = _safe_text(update_mode)
        if normalized_update_mode == "realtime_text_batch":
            return _build_demo_balance_realtime_text_batch_prompt(payload, rows)
        if normalized_update_mode == "fast_keywords":
            return _build_demo_balance_fast_keyword_prompt(payload, rows)
        return _build_demo_balance_keyword_extract_prompt(payload, rows)

    existing_keywords = _ideation_existing_keyword_rows(payload)
    context_cache = _ideation_context_cache_text(payload)
    input_payload = {
        "max_keywords": int(payload.max_keywords or 18),
        "conversation_context_cache": context_cache,
        "existing_keywords": existing_keywords,
        "target_utterances": [
            {
                "id": _safe_text(row.get("id")),
                "speaker": _safe_text(row.get("speaker"), "참가자"),
                "text": _truncate_text(_strip_leading_timestamp(row.get("text")), 420),
                "timestamp": _safe_text(row.get("timestamp")),
            }
            for row in rows[-120:]
        ],
    }
    meeting_topic = _safe_text(payload.meeting_topic)
    meeting_goal = _safe_text(payload.meeting_goal)
    meeting_goal_context = _safe_text(payload.meeting_goal_context)
    if meeting_topic:
        input_payload["meeting_topic"] = meeting_topic
    if meeting_goal:
        input_payload["meeting_goal"] = meeting_goal
    if meeting_goal_context:
        input_payload["meeting_goal_context"] = meeting_goal_context
    return (
        "너는 아이디어 회의의 STT 전사에서 캔버스 버블로 보여줄 핵심 의미 그래프를 갱신하는 AI다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- conversation_context_cache, meeting_goal, meeting_goal_context, existing_keywords를 참고해 회의 흐름과 이미 잡힌 핵심어를 이해한다.\n"
        "- meeting_goal과 meeting_goal_context가 입력에 없으면 없는 정보로 간주하고 추측하지 않는다.\n"
        "- 새로 반환할 keywords는 target_utterances에서 실제로 말한 핵심 명사/사람 이름을 제외한 고유명사/짧은 명사구만 추출하거나 기존 버블에 흡수한다.\n"
        "- 반드시 target_utterances에 나온 표현 또는 그 명사형 축약만 새 keywords로 뽑는다. 문맥 캐시에만 있고 target에는 없는 새 개념을 만들지 않는다.\n"
        "- 동사, 형용사, 서술어, 문장, filler, 접속사, 단독 숫자/년도, 인명, 직함이 붙은 인명, '생각', '부분', '관련', '회의', '아이디어' 같은 범용어는 제외한다.\n"
        "- text는 반드시 명사, 사람 이름을 제외한 고유명사, 또는 짧은 명사구여야 한다. '~하다', '~한다', '~해야', '~되는', '~보임' 같은 서술형/동사형은 금지한다.\n"
        "- 사람 이름은 절대 버블 text로 쓰지 않는다. 인물이 중요하게 언급되어도 '정상회담', '미중 관계', '관세', '방문 결과'처럼 회의 쟁점/주제어로 바꾼다.\n"
        "- 이번 batch 전체에서 반환할 버블은 0~3개다. 맥락상 의미 있는 핵심 명사가 없으면 keywords는 빈 배열이어야 한다.\n"
        "- 새 버블 생성보다 기존 버블 흡수, count 증가, merge_keywords 합병을 우선한다.\n"
        "- existing_keywords에 같은 의미, 동의어, 축약어, 상하위 표현이 있으면 새 버블을 만들지 말고 기존 text를 그대로 반환한다.\n"
        "- 예: '미국 관세', '관세 정책', '관세'가 같은 의미로 쓰이면 기존 text 하나로 합친다.\n"
        "- 새 text는 conversation_context_cache와 target_utterances 전체를 기준으로 같은 의미가 최소 2번 이상 등장한 경우에만 만든다.\n"
        "- 기존 버블 text를 재사용하는 경우에는 이번 batch에서 1번만 다시 나와도 반환할 수 있다.\n"
        "- existing_keywords 안에서 중복/동의어/세부 표현이 따로 버블화되어 있으면 merge_keywords로 합병한다.\n"
        "- existing_keywords 안에서 회의 흐름상 너무 범용적이거나 현재 의미 그래프를 흐리는 버블은 remove_keywords에 넣어 정리한다. 단, 한동안 언급이 적다는 이유만으로 핵심 주제를 지우지 않는다.\n"
        "- 기존 버블의 세부 표현에 불과한 문구는 기존 버블 count를 올리는 용도로 기존 text를 반환한다.\n"
        "- 정말 새로운 중심 개념이거나 기존 버블과 분리해서 보아야 할 관계/쟁점일 때만 새 text를 만든다.\n"
        "- 문장 안에서는 눈에 띄어도 meeting_topic/meeting_goal/최근 흐름과 약하면 relevance를 낮게 주거나 off_topic으로 표시한다.\n"
        "- 같은 문장이나 가까운 발화에서 함께 나온 명사는 related에 서로 연결한다. related와 anchor는 기존 버블 text를 참조해도 된다.\n"
        "- '미중 갈등', '미중 경쟁'처럼 복합 표현은 '미중'이 기존에 있으면 text='미중'으로 흡수하거나, 관계 자체가 핵심이면 text='갈등'/'경쟁', anchor='미중'처럼 분리한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "merge_keywords": [{"source": "미중 갈등", "target": "갈등", "reason": "중복된 복합 표현을 관계 버블로 통합"}],\n'
        '  "remove_keywords": ["잡담"],\n'
        '  "keywords": [\n'
        '    {"text": "미중", "count": 3, "support_count": 4, "kind": "entity", "importance": 0.95, "relevance": 0.98, "related": ["경쟁", "갈등"]},\n'
        '    {"text": "경쟁", "count": 2, "support_count": 3, "kind": "relation", "importance": 0.72, "relevance": 0.9, "anchor": "미중", "related": ["미중"]},\n'
        '    {"text": "사진", "count": 1, "support_count": 1, "kind": "off_topic", "importance": 0.35, "relevance": 0.15, "off_topic": true, "off_topic_reason": "현재 논점과 직접 관련이 낮음", "related": []}\n'
        "  ]\n"
        "}\n\n"
        "[규칙]\n"
        f"- keywords는 0개 이상, 최대 {int(payload.max_keywords or 18)}개.\n"
        "- 가능하면 existing_keywords의 text를 재사용한다. 재사용한 text는 기존 버블의 크기를 키우는 신호다.\n"
        "- merge_keywords.source는 existing_keywords에 있는 text여야 한다. target은 existing_keywords 또는 이번 keywords에 있는 text여야 한다.\n"
        "- remove_keywords에는 existing_keywords의 text만 넣는다. 이번 keywords나 merge target으로 반환한 text는 remove_keywords에 넣지 않는다.\n"
        "- merge/remove는 확신이 높은 경우만 사용한다. 불확실하면 기존 버블을 유지한다.\n"
        "- 새 text는 이번 batch에서 정말 새 논점일 때만 만든다. 같은 의미의 중복 버블은 금지한다.\n"
        "- 새 text는 conversation_context_cache와 target_utterances를 합쳐 같은 의미가 최소 2회 이상 확인될 때만 만든다. 1회성 언급이면 만들지 않는다.\n"
        "- 반드시 1개 이상 반환하려고 하지 않는다. 잡담, 추임새, 단독 연도/숫자, 전체 흐름과 약한 단어만 있으면 keywords는 []로 둔다.\n"
        "- 3개를 초과해서 반환하지 않는다. 여러 표현이 있으면 중심 개념 1개와 관계 1~2개만 남긴다.\n"
        "- count는 기존 count가 아니라 target_utterances에서 해당 의미가 나타난 발화 수다.\n"
        "- support_count는 conversation_context_cache와 target_utterances를 합쳐 해당 의미가 등장한 총 발화 수다. 새 text는 support_count가 2 이상이어야 한다.\n"
        "- text는 2~18자 정도의 명사/사람 이름을 제외한 고유명사/짧은 명사구만 허용한다. 문장, 서술어, 동사구, 형용사구, 인명은 금지한다.\n"
        "- 좋은 text 예: '미중', '경쟁', '갈등', '방문 결과', '관세', '일정 조율'. 나쁜 text 예: '트럼프', '시진핑', '2026년', '다른 양상을 보임', '해야 한다', '좋은 것 같다'.\n"
        "- count는 최소 1 이상.\n"
        "- kind는 entity, topic, relation, action, off_topic 중 하나다.\n"
        "- importance는 회의 전체에서의 중요도, relevance는 현재 meeting_topic/최근 흐름과의 관련도이며 0~1 숫자다.\n"
        "- off_topic은 딴소리/논점 이탈일 때만 true로 둔다. 단순히 중요도가 낮다는 이유만으로 true로 두지 않는다.\n"
        "- anchor는 keywords 또는 existing_keywords 안에 있는 중심 text만 넣는다. 중심 버블이 없으면 빈 문자열로 둔다.\n"
        "- related에는 keywords 또는 existing_keywords 안에 있는 text만 넣는다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_ideation_keyword_items(
    parsed: Any,
    fallback: list[dict[str, Any]],
    max_keywords: int,
    existing_keywords: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    raw_items = parsed.get("keywords") if isinstance(parsed, dict) else None
    if not isinstance(raw_items, list):
        return fallback

    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_items:
        if isinstance(item, dict):
            text = _normalize_ideation_keyword_text(item.get("text") or item.get("keyword") or item.get("noun"))
            raw_count = item.get("count")
            raw_related = item.get("related")
            raw_kind = _safe_text(item.get("kind"), "topic").lower()
            raw_importance = item.get("importance")
            raw_relevance = item.get("relevance")
            raw_support_count = (
                item.get("support_count")
                or item.get("supportCount")
                or item.get("total_count")
                or item.get("totalCount")
                or item.get("occurrence_count")
                or item.get("occurrenceCount")
            )
            raw_off_topic = item.get("off_topic") or item.get("offTopic")
            raw_off_topic_reason = item.get("off_topic_reason") or item.get("offTopicReason")
            raw_anchor = item.get("anchor") or item.get("anchor_text")
        else:
            text = _normalize_ideation_keyword_text(item)
            raw_count = 1
            raw_related = []
            raw_kind = "topic"
            raw_importance = 0.6
            raw_relevance = 1
            raw_support_count = 1
            raw_off_topic = False
            raw_off_topic_reason = ""
            raw_anchor = ""
        if not text or text in seen:
            continue
        seen.add(text)
        count = _safe_nonnegative_int(raw_count, 1) or 1
        kind = raw_kind if raw_kind in {"entity", "topic", "relation", "action", "off_topic"} else "topic"
        off_topic = _boolify(raw_off_topic, False)
        importance = _safe_float(raw_importance, 0.65)
        relevance = _safe_float(raw_relevance, 1)
        support_count = _safe_nonnegative_int(raw_support_count, count) or count
        related = [
            _normalize_ideation_keyword_text(value)
            for value in (raw_related if isinstance(raw_related, list) else [])
        ]
        candidates.append(
            {
                "text": text,
                "count": max(1, count),
                "support_count": max(1, support_count),
                "kind": "off_topic" if off_topic or kind == "off_topic" else kind,
                "importance": max(0, min(1, importance)),
                "relevance": max(0, min(1, relevance)),
                "off_topic": bool(off_topic or kind == "off_topic"),
                "off_topic_reason": _safe_text(raw_off_topic_reason),
                "anchor": _normalize_ideation_keyword_text(raw_anchor),
                "related": _dedup_preserve([value for value in related if value], limit=5),
            }
        )
        if len(candidates) >= max_keywords:
            break

    selected_texts = {item["text"] for item in candidates}
    existing_texts = {_safe_text(item.get("text")) for item in (existing_keywords or []) if _safe_text(item.get("text"))}
    relationship_texts = selected_texts | existing_texts
    for item in candidates:
        item["related"] = [value for value in item.get("related", []) if value in relationship_texts and value != item["text"]]
        if item.get("anchor") not in relationship_texts or item.get("anchor") == item["text"]:
            item["anchor"] = ""
    return candidates


def _normalize_ideation_keyword_operations(
    parsed: Any,
    existing_keywords: list[dict[str, Any]],
    keywords: list[dict[str, Any]],
) -> tuple[list[dict[str, str]], list[str]]:
    if not isinstance(parsed, dict):
        return [], []

    existing_text_lookup = _ideation_existing_keyword_text_lookup(existing_keywords)
    existing_texts = {_safe_text(item.get("text")) for item in existing_keywords if _safe_text(item.get("text"))}
    keyword_texts = {_safe_text(item.get("text")) for item in keywords if _safe_text(item.get("text"))}
    allowed_target_texts = existing_texts | keyword_texts

    raw_merges = parsed.get("merge_keywords") or parsed.get("merges") or parsed.get("merge") or []
    merge_keywords: list[dict[str, str]] = []
    merge_sources: set[str] = set()
    merge_targets: set[str] = set()
    if isinstance(raw_merges, list):
        for item in raw_merges:
            if not isinstance(item, dict):
                continue
            source = _normalize_ideation_keyword_text(
                item.get("source") or item.get("from") or item.get("source_text") or item.get("sourceText")
            )
            target = _normalize_ideation_keyword_text(
                item.get("target") or item.get("to") or item.get("target_text") or item.get("targetText")
            )
            source = existing_text_lookup.get(source, source)
            target = existing_text_lookup.get(target, target)
            if (
                not source
                or not target
                or source == target
                or source not in existing_texts
                or target not in allowed_target_texts
            ):
                continue
            merge_keywords.append(
                {
                    "source": source,
                    "target": target,
                    "reason": _truncate_text(_safe_text(item.get("reason")), 120),
                }
            )
            merge_sources.add(source)
            merge_targets.add(target)
            if len(merge_keywords) >= 8:
                break

    raw_removes = parsed.get("remove_keywords") or parsed.get("delete_keywords") or parsed.get("archive_keywords") or []
    remove_keywords: list[str] = []
    seen_removes: set[str] = set()
    if isinstance(raw_removes, list):
        for item in raw_removes:
            raw_text = item.get("text") if isinstance(item, dict) else item
            text = _normalize_ideation_keyword_text(raw_text)
            if (
                not text
                or text not in existing_texts
                or text in keyword_texts
                or text in merge_targets
                or text in merge_sources
                or text in seen_removes
            ):
                continue
            remove_keywords.append(text)
            seen_removes.add(text)
            if len(remove_keywords) >= 8:
                break

    return merge_keywords, remove_keywords


def _ideation_existing_keyword_text_lookup(existing_keywords: list[dict[str, Any]]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for item in existing_keywords:
        text = _normalize_ideation_keyword_text(item.get("text"))
        if not text:
            continue
        variants = [
            text,
            _normalize_ideation_keyword_text(item.get("canonical_label")),
            *[
                _normalize_ideation_keyword_text(value)
                for value in (item.get("aliases") or [])
                if _normalize_ideation_keyword_text(value)
            ],
        ]
        for variant in variants:
            if variant:
                lookup.setdefault(variant, text)
    return lookup


def _normalize_ideation_keyword_rename_merges(
    parsed: Any,
    existing_keywords: list[dict[str, Any]],
    merge_keywords: list[dict[str, str]],
    remove_keywords: list[str],
) -> list[dict[str, str]]:
    if not isinstance(parsed, dict):
        return []

    existing_text_lookup = _ideation_existing_keyword_text_lookup(existing_keywords)
    existing_texts = {_safe_text(item.get("text")) for item in existing_keywords if _safe_text(item.get("text"))}
    merge_sources = {_safe_text(item.get("source")) for item in merge_keywords if _safe_text(item.get("source"))}
    merge_targets = {_safe_text(item.get("target")) for item in merge_keywords if _safe_text(item.get("target"))}
    blocked_sources = merge_sources
    seen_pairs = {
        (_safe_text(item.get("source")), _safe_text(item.get("target")))
        for item in merge_keywords
        if _safe_text(item.get("source")) and _safe_text(item.get("target"))
    }

    raw_renames = (
        parsed.get("rename_keywords")
        or parsed.get("renames")
        or parsed.get("rename")
        or parsed.get("correct_keywords")
        or []
    )
    rename_merges: list[dict[str, str]] = []
    if not isinstance(raw_renames, list):
        return []

    for item in raw_renames:
        if not isinstance(item, dict):
            continue
        source = _normalize_ideation_keyword_text(
            item.get("source") or item.get("from") or item.get("source_text") or item.get("sourceText")
        )
        target = _normalize_ideation_keyword_text(
            item.get("target") or item.get("to") or item.get("target_text") or item.get("targetText")
        )
        source = existing_text_lookup.get(source, source)
        target = existing_text_lookup.get(target, target)
        pair = (source, target)
        if (
            not source
            or not target
            or source == target
            or source not in existing_texts
            or target not in existing_texts
            or source in blocked_sources
            or pair in seen_pairs
        ):
            continue
        rename_merges.append(
            {
                "source": source,
                "target": target,
                "reason": _truncate_text(_safe_text(item.get("reason")) or "rename target already exists", 120),
            }
        )
        seen_pairs.add(pair)
        if len(rename_merges) >= 8:
            break
    return rename_merges


def _normalize_ideation_keyword_renames(
    parsed: Any,
    existing_keywords: list[dict[str, Any]],
    merge_keywords: list[dict[str, str]],
    remove_keywords: list[str],
) -> list[dict[str, str]]:
    if not isinstance(parsed, dict):
        return []

    existing_text_lookup = _ideation_existing_keyword_text_lookup(existing_keywords)
    existing_texts = {_safe_text(item.get("text")) for item in existing_keywords if _safe_text(item.get("text"))}
    merge_sources = {_safe_text(item.get("source")) for item in merge_keywords if _safe_text(item.get("source"))}
    merge_targets = {_safe_text(item.get("target")) for item in merge_keywords if _safe_text(item.get("target"))}
    blocked_sources = merge_sources | merge_targets

    raw_renames = (
        parsed.get("rename_keywords")
        or parsed.get("renames")
        or parsed.get("rename")
        or parsed.get("correct_keywords")
        or []
    )
    rename_keywords: list[dict[str, str]] = []
    seen_sources: set[str] = set()
    seen_targets: set[str] = set()
    if not isinstance(raw_renames, list):
        return []

    for item in raw_renames:
        if not isinstance(item, dict):
            continue
        source = _normalize_ideation_keyword_text(
            item.get("source") or item.get("from") or item.get("source_text") or item.get("sourceText")
        )
        target = _normalize_ideation_keyword_text(
            item.get("target") or item.get("to") or item.get("target_text") or item.get("targetText")
        )
        source = existing_text_lookup.get(source, source)
        target = existing_text_lookup.get(target, target)
        if (
            not source
            or not target
            or source == target
            or source not in existing_texts
            or target in existing_texts
            or source in blocked_sources
            or source in seen_sources
            or target in seen_targets
        ):
            continue
        rename_keywords.append(
            {
                "source": source,
                "target": target,
                "reason": _truncate_text(_safe_text(item.get("reason")), 120),
            }
        )
        seen_sources.add(source)
        seen_targets.add(target)
        if len(rename_keywords) >= 10:
            break

    return rename_keywords


def _demo_balance_local_keyword_renames(existing_keywords: list[dict[str, Any]]) -> list[dict[str, str]]:
    existing_text_lookup = _ideation_existing_keyword_text_lookup(existing_keywords)
    existing_texts = {_safe_text(item.get("text")) for item in existing_keywords if _safe_text(item.get("text"))}
    renames: list[dict[str, str]] = []
    seen_sources: set[str] = set()
    for source_text, target_text in DEMO_BALANCE_LOCAL_KEYWORD_RENAMES:
        source = existing_text_lookup.get(
            _normalize_ideation_keyword_text(source_text),
            _normalize_ideation_keyword_text(source_text),
        )
        target = _normalize_ideation_keyword_text(target_text)
        if not source or not target or source == target or source not in existing_texts or source in seen_sources:
            continue
        renames.append(
            {
                "source": source,
                "target": target,
                "reason": "demo local STT correction",
            }
        )
        seen_sources.add(source)
    return renames


def _demo_balance_primary_keywords_present(parsed: Any) -> bool:
    return isinstance(parsed, dict) and any(
        key in parsed
        for key in (
            "primary_keywords",
            "primaryKeywords",
            "important_keywords",
            "importantKeywords",
        )
    )


def _normalize_demo_balance_primary_keywords(parsed: Any, *, limit: int = 4) -> list[str]:
    if not isinstance(parsed, dict):
        return []
    raw_items = (
        parsed.get("primary_keywords")
        if "primary_keywords" in parsed
        else parsed.get("primaryKeywords")
        if "primaryKeywords" in parsed
        else parsed.get("important_keywords")
        if "important_keywords" in parsed
        else parsed.get("importantKeywords")
        if "importantKeywords" in parsed
        else []
    )
    if not isinstance(raw_items, list):
        return []

    texts: list[str] = []
    for item in raw_items:
        if isinstance(item, dict):
            raw_text = (
                item.get("text")
                or item.get("keyword")
                or item.get("label")
                or item.get("canonical_label")
                or item.get("canonicalLabel")
            )
        else:
            raw_text = item
        text = _normalize_ideation_keyword_text(raw_text)
        if text:
            texts.append(text)
        if len(texts) >= limit:
            break
    return _dedup_preserve(texts, limit=limit)


def _normalize_demo_balance_affinity_updates(
    parsed: Any,
    existing_keywords: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(parsed, dict):
        return []
    existing_texts = {_safe_text(item.get("text")) for item in existing_keywords if _safe_text(item.get("text"))}
    raw_items = (
        parsed.get("affinity_updates")
        or parsed.get("affinityUpdates")
        or parsed.get("move_keywords")
        or parsed.get("moveKeywords")
        or []
    )
    if not isinstance(raw_items, list):
        return []
    updates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        text = _normalize_ideation_keyword_text(
            item.get("text") or item.get("source") or item.get("keyword") or item.get("label")
        )
        affinity = _safe_text(
            item.get("choice_affinity")
            or item.get("choiceAffinity")
            or item.get("affinity")
            or item.get("target")
            or item.get("choice")
        ).lower()
        if affinity in {"option_a", "a_choice"}:
            affinity = "a"
        elif affinity in {"option_b", "b_choice"}:
            affinity = "b"
        if not text or text not in existing_texts or text in seen or affinity not in DEMO_BALANCE_DISPLAY_AFFINITIES:
            continue
        updates.append(
            {
                "text": text,
                "choice_affinity": affinity,
                "affinity_score": max(0.0, min(1.0, _safe_float(item.get("affinity_score") or item.get("affinityScore"), 0.86))),
                "reason": _truncate_text(_safe_text(item.get("reason")), 120),
            }
        )
        seen.add(text)
        if len(updates) >= 12:
            break
    return updates


def _apply_demo_balance_affinity_updates(
    graph: dict[str, Any],
    updates: list[dict[str, Any]],
    cycle: int,
) -> int:
    if not updates:
        return 0
    _by_id, by_text = _ideation_bubble_graph_text_maps(graph)
    changed = 0
    for update in updates:
        bubble = by_text.get(_ideation_bubble_text_key(update.get("text")))
        if not bubble or _is_demo_balance_anchor_bubble(bubble):
            continue
        affinity = _safe_text(update.get("choice_affinity")).lower()
        if affinity not in DEMO_BALANCE_DISPLAY_AFFINITIES:
            continue
        anchor_id = _demo_balance_anchor_id(affinity)
        previous = (_safe_text(bubble.get("choice_affinity")), _safe_text(bubble.get("anchor_id")))
        bubble["choice_affinity"] = affinity
        bubble["anchor_id"] = anchor_id
        bubble["affinity_score"] = max(0.0, min(1.0, _safe_float(update.get("affinity_score"), 0.86)))
        bubble["needs_affinity_review"] = False
        bubble["activity"] = max(_safe_float(bubble.get("activity"), 0.0), 0.58)
        bubble["display_state"] = "active"
        bubble["last_seen_cycle"] = max(_safe_nonnegative_int(bubble.get("last_seen_cycle"), 0), cycle)
        if update.get("reason"):
            bubble["affinity_reason"] = _safe_text(update.get("reason"))
        if previous != (_safe_text(bubble.get("choice_affinity")), _safe_text(bubble.get("anchor_id"))):
            bubble["orbit_order_key"] = None
            bubble["orbit_slot_index"] = None
            changed += 1
    return changed


def _current_ideation_primary_keyword_texts(graph: dict[str, Any], *, limit: int = 4) -> list[str]:
    primary_texts = [
        _normalize_ideation_keyword_text(bubble.get("label"))
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _safe_text(bubble.get("emphasis")) == "primary"
        and _is_ideation_bubble_visible_state(bubble.get("display_state"))
        and not bool(bubble.get("off_topic"))
    ]
    return _dedup_preserve([text for text in primary_texts if text], limit=limit)


def _resolve_ideation_primary_keyword_ids(
    graph: dict[str, Any],
    primary_keywords: list[str],
    *,
    limit: int = 4,
) -> set[str]:
    if not primary_keywords:
        return set()
    _by_id, by_text = _ideation_bubble_graph_text_maps(graph)
    primary_ids: list[str] = []
    for text in primary_keywords:
        bubble = by_text.get(_ideation_bubble_text_key(text))
        if (
            not bubble
            or bool(bubble.get("off_topic"))
            or not _is_ideation_bubble_visible_state(bubble.get("display_state"))
        ):
            continue
        bubble_id = _safe_text(bubble.get("id"))
        if bubble_id:
            primary_ids.append(bubble_id)
        if len(primary_ids) >= limit:
            break
    return set(_dedup_preserve(primary_ids, limit=limit))


DEMO_LOCAL_FAST_FILLER_WORDS = {
    "아니",
    "근데",
    "그쵸",
    "그렇죠",
    "맞죠",
    "음",
    "어",
    "아",
    "뭐",
    "약간",
    "완전",
    "되게",
    "너무",
    "그런데",
    "그냥",
    "진짜",
    "때문",
    "때문에",
}
DEMO_LOCAL_FAST_ONE_CHAR_NOUN_ALLOWLIST = _IDEATION_KEYWORD_SINGLE_CHAR_ALLOWLIST
DEMO_LOCAL_FAST_HONORIFICS = ("씨", "님", "선생님", "교수님", "박사님")
DEMO_LOCAL_FAST_NOUN_TAG_PREFIXES = ("N", "SL", "SN")
DEMO_LOCAL_FAST_DEBUG_LIST_LIMIT = 24
_HANGUL_CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
_HANGUL_JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
_HANGUL_JONG = ("", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ")


def _get_local_kiwi_extractor() -> tuple[Any, str]:
    global _LOCAL_KIWI_EXTRACTOR
    global _LOCAL_KIWI_EXTRACTOR_ATTEMPTED
    global _LOCAL_KIWI_WARNING_LOGGED
    if _LOCAL_KIWI_EXTRACTOR_ATTEMPTED:
        return _LOCAL_KIWI_EXTRACTOR, "kiwi" if _LOCAL_KIWI_EXTRACTOR is not None else "regex_fallback"
    with _LOCAL_KIWI_EXTRACTOR_LOCK:
        if not _LOCAL_KIWI_EXTRACTOR_ATTEMPTED:
            _LOCAL_KIWI_EXTRACTOR_ATTEMPTED = True
            try:
                from kiwipiepy import Kiwi  # type: ignore

                _LOCAL_KIWI_EXTRACTOR = Kiwi()
            except Exception as exc:
                _LOCAL_KIWI_EXTRACTOR = None
                if not _LOCAL_KIWI_WARNING_LOGGED:
                    _LOCAL_KIWI_WARNING_LOGGED = True
                    print(
                        "[local fast keyword extractor] Kiwi unavailable; using regex fallback",
                        {"error_type": type(exc).__name__, "error": repr(exc)[:240]},
                        flush=True,
                    )
    return _LOCAL_KIWI_EXTRACTOR, "kiwi" if _LOCAL_KIWI_EXTRACTOR is not None else "regex_fallback"


def _normalize_demo_local_fast_keyword_text(raw: Any, *, allow_single: bool = False) -> str:
    text = re.sub(r"\s+", " ", _safe_text(raw)).strip()
    text = re.sub(r"^[^\w가-힣]+|[^\w가-힣]+$", "", text)
    if not text or len(text) > 28:
        return ""
    if len(text) < 2 and not (allow_single and text in DEMO_LOCAL_FAST_ONE_CHAR_NOUN_ALLOWLIST):
        return ""
    if re.fullmatch(r"[ABab]", text):
        return ""
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return ""
    lowered = text.lower()
    if lowered in DEMO_LOCAL_FAST_FILLER_WORDS:
        return ""
    if any(lowered.endswith(suffix) for suffix in DEMO_LOCAL_FAST_HONORIFICS):
        return ""
    if any(pattern.search(lowered) for pattern in _IDEATION_KEYWORD_NON_NOUN_PATTERNS):
        return ""
    if re.search(r"[가-힣][a-z0-9+#._-]+", text, flags=re.IGNORECASE):
        return ""
    return lowered if re.fullmatch(r"[A-Za-z0-9+#._ -]+", text) else text


def _demo_local_fast_clean_token(raw: Any, *, allow_single: bool = False) -> str:
    return _normalize_demo_local_fast_keyword_text(raw, allow_single=allow_single)


def _demo_local_fast_is_noun_token(token: Any) -> bool:
    form = _safe_text(getattr(token, "form", ""))
    tag = _safe_text(getattr(token, "tag", "")).upper()
    if not form or not tag:
        return False
    if tag == "SN" and re.fullmatch(r"\d+(?:\.\d+)?", form):
        return False
    return tag.startswith(DEMO_LOCAL_FAST_NOUN_TAG_PREFIXES)


def _demo_local_fast_safe_int(raw: Any, fallback: int = -1) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return fallback


def _demo_local_fast_make_token(raw: Any, tag: Any = "", start: Any = -1, end: Any = -1) -> dict[str, Any] | None:
    cleaned = _demo_local_fast_clean_token(raw, allow_single=True)
    if not cleaned:
        return None
    token_start = _demo_local_fast_safe_int(start, -1)
    token_end = _demo_local_fast_safe_int(end, -1)
    return {
        "text": cleaned,
        "tag": _safe_text(tag),
        "start": token_start,
        "end": token_end if token_end >= token_start else -1,
    }


def _demo_local_fast_tokenize_nouns(text: str) -> tuple[list[dict[str, Any]], str]:
    extractor, route = _get_local_kiwi_extractor()
    if extractor is not None:
        try:
            tokens = extractor.tokenize(text)
            local_tokens: list[dict[str, Any]] = []
            for token in tokens:
                if not _demo_local_fast_is_noun_token(token):
                    continue
                token_start = _demo_local_fast_safe_int(getattr(token, "start", -1), -1)
                token_len = _demo_local_fast_safe_int(getattr(token, "len", getattr(token, "length", 0)), 0)
                token_end = token_start + token_len if token_start >= 0 and token_len > 0 else -1
                local_token = _demo_local_fast_make_token(
                    getattr(token, "form", ""),
                    getattr(token, "tag", ""),
                    token_start,
                    token_end,
                )
                if local_token:
                    local_tokens.append(local_token)
            return local_tokens, route
        except Exception as exc:
            print(
                "[local fast keyword extractor] Kiwi tokenize failed; using regex fallback",
                {"error_type": type(exc).__name__, "error": repr(exc)[:240]},
                flush=True,
            )

    local_tokens = []
    for match in re.finditer(r"[가-힣A-Za-z][가-힣A-Za-z0-9+#._-]*", text):
        local_token = _demo_local_fast_make_token(match.group(0), "REGEX", match.start(), match.end())
        if local_token:
            local_tokens.append(local_token)
    return local_tokens, "regex_fallback"


def _demo_local_fast_token_debug(token: dict[str, Any]) -> dict[str, Any]:
    return {
        "text": _safe_text(token.get("text")),
        "tag": _safe_text(token.get("tag")),
        "start": _demo_local_fast_safe_int(token.get("start"), -1),
        "end": _demo_local_fast_safe_int(token.get("end"), -1),
    }


def _demo_local_fast_normalize_for_compact_match(raw: str) -> str:
    return re.sub(r"[\s+/·._-]+", "", raw.lower())


def _demo_local_fast_phrase_from_adjacent_tokens(
    left: dict[str, Any],
    right: dict[str, Any],
    raw_text: str,
) -> tuple[str, str]:
    left_text = _safe_text(left.get("text"))
    right_text = _safe_text(right.get("text"))
    if not left_text or not right_text:
        return "", "empty"
    left_key = _ideation_bubble_text_key(left_text)
    right_key = _ideation_bubble_text_key(right_text)
    if left_key == right_key:
        return "", "repeat"
    if left_key in right_key or right_key in left_key:
        return "", "contained"
    left_jamo = _demo_local_fast_jamo_key(left_text)
    right_jamo = _demo_local_fast_jamo_key(right_text)
    if left_jamo and right_jamo and _demo_local_fast_edit_similarity(left_jamo, right_jamo) >= 0.9:
        return "", "same_sound"

    span_verified = False
    left_end = _demo_local_fast_safe_int(left.get("end"), -1)
    right_start = _demo_local_fast_safe_int(right.get("start"), -1)
    if 0 <= left_end <= right_start <= len(raw_text):
        gap = raw_text[left_end:right_start]
        span_verified = bool(re.fullmatch(r"[\s+/·._-]*", gap))

    lowered_raw = raw_text.lower()
    spaced_phrase = f"{left_text} {right_text}".lower()
    compact_phrase = f"{left_text}{right_text}".lower()
    text_verified = spaced_phrase in re.sub(r"\s+", " ", lowered_raw)
    compact_verified = _demo_local_fast_normalize_for_compact_match(compact_phrase) in _demo_local_fast_normalize_for_compact_match(lowered_raw)
    if not (span_verified or text_verified or compact_verified):
        return "", "not_in_source"

    phrase = _demo_local_fast_clean_token(f"{left_text} {right_text}")
    if not phrase:
        return "", "cleaned_empty"
    return phrase, ""


def _demo_local_fast_count_text_mentions(text: str, rows: list[dict[str, str]]) -> int:
    normalized = _safe_text(text).lower()
    if not normalized:
        return 0
    mention_count = 0
    compact_candidate = _demo_local_fast_normalize_for_compact_match(normalized)
    for row in rows:
        row_text = _strip_leading_timestamp(row.get("text")).lower()
        if not row_text:
            continue
        row_mentions = row_text.count(normalized)
        if " " in normalized and compact_candidate:
            compact_row = _demo_local_fast_normalize_for_compact_match(row_text)
            row_mentions = max(row_mentions, compact_row.count(compact_candidate))
        mention_count += row_mentions
    return mention_count


def _demo_local_fast_jamo_key(raw: Any) -> str:
    text = _normalize_demo_local_fast_keyword_text(raw, allow_single=True)
    parts: list[str] = []
    for char in text:
        code = ord(char)
        if 0xAC00 <= code <= 0xD7A3:
            value = code - 0xAC00
            cho = value // 588
            jung = (value % 588) // 28
            jong = value % 28
            parts.append(_HANGUL_CHO[cho])
            parts.append(_HANGUL_JUNG[jung])
            if _HANGUL_JONG[jong]:
                parts.append(_HANGUL_JONG[jong])
        elif char.isalnum():
            parts.append(char.lower())
    return "".join(parts)


def _demo_local_fast_edit_similarity(left: str, right: str) -> float:
    if left == right:
        return 1.0
    if not left or not right:
        return 0.0
    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_char in enumerate(right, start=1):
            replace_cost = 0 if left_char == right_char else 1
            current.append(
                min(
                    previous[right_index] + 1,
                    current[right_index - 1] + 1,
                    previous[right_index - 1] + replace_cost,
                )
            )
        previous = current
    distance = previous[-1]
    return max(0.0, 1.0 - distance / max(len(left), len(right)))


def _demo_local_fast_context_text(payload: IdeationKeywordExtractInput) -> str:
    return " ".join(
        [
            _safe_text(payload.meeting_topic),
            _safe_text(payload.meeting_goal),
            _safe_text(payload.meeting_goal_context),
            _safe_text((payload.demo_config or {}).get("option_a")),
            _safe_text((payload.demo_config or {}).get("option_a_keyword")),
            _safe_text((payload.demo_config or {}).get("option_b")),
            _safe_text((payload.demo_config or {}).get("option_b_keyword")),
            _safe_text(payload.context_cache),
        ]
    ).lower()


def _demo_local_fast_existing_text_lookup(
    existing_rows: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], set[str]]:
    lookup: dict[str, dict[str, Any]] = {}
    canonical_texts: set[str] = set()
    for item in existing_rows:
        label = _normalize_demo_local_fast_keyword_text(item.get("text"), allow_single=True)
        canonical = _normalize_demo_local_fast_keyword_text(item.get("canonical_label"), allow_single=True) or label
        if not label:
            continue
        canonical_texts.add(canonical or label)
        for value in [label, canonical, *(item.get("aliases") or [])]:
            normalized = _normalize_demo_local_fast_keyword_text(value, allow_single=True)
            if normalized:
                lookup.setdefault(_ideation_bubble_text_key(normalized), item)
    return lookup, canonical_texts


def _demo_local_fast_canonicalize_candidate(
    text: str,
    existing_rows: list[dict[str, Any]],
    existing_lookup: dict[str, dict[str, Any]],
    context_text: str,
) -> tuple[str, str, str, float]:
    normalized = _normalize_demo_local_fast_keyword_text(text, allow_single=True)
    if not normalized:
        return "", "", "", 0.0

    exact = existing_lookup.get(_ideation_bubble_text_key(normalized))
    if exact:
        canonical = _normalize_demo_local_fast_keyword_text(exact.get("canonical_label"), allow_single=True) or _normalize_demo_local_fast_keyword_text(exact.get("text"), allow_single=True)
        return canonical or normalized, normalized if normalized != canonical else "", "exact_or_alias", 1.0

    if not re.fullmatch(r"[가-힣 ]{2,12}", normalized):
        return normalized, "", "", 0.0

    normalized_jamo = _demo_local_fast_jamo_key(normalized)
    if len(normalized_jamo) < 4:
        return normalized, "", "", 0.0

    best_target = ""
    best_similarity = 0.0
    for item in existing_rows:
        if bool(item.get("off_topic")):
            continue
        label = _normalize_demo_local_fast_keyword_text(item.get("text"), allow_single=True)
        canonical = _normalize_demo_local_fast_keyword_text(item.get("canonical_label"), allow_single=True) or label
        if not canonical or canonical == normalized:
            continue
        if not re.fullmatch(r"[가-힣 ]{2,12}", canonical):
            continue
        canonical_jamo = _demo_local_fast_jamo_key(canonical)
        if not canonical_jamo:
            continue
        similarity = _demo_local_fast_edit_similarity(normalized_jamo, canonical_jamo)
        short_variant = (
            len(normalized.replace(" ", "")) <= 3
            and len(canonical.replace(" ", "")) <= 3
            and _safe_nonnegative_int(item.get("count"), 0) >= 1
        )
        if similarity >= 0.94 or (short_variant and similarity >= 0.9):
            if similarity > best_similarity:
                best_similarity = similarity
                best_target = canonical

    if best_target:
        return best_target, normalized, "jamo_similarity", best_similarity
    return normalized, "", "", 0.0


def _demo_local_fast_keyword_score(
    text: str,
    rows: list[dict[str, str]],
    payload: IdeationKeywordExtractInput,
    existing_texts: set[str],
    *,
    is_phrase: bool = False,
) -> tuple[float, float, dict[str, Any]]:
    topic_context = _demo_local_fast_context_text(payload)
    lower_text = text.lower()
    row_mentions = _demo_local_fast_count_text_mentions(text, rows)
    context_bonus = 0.16 if lower_text in topic_context else 0.0
    existing_bonus = 0.1 if text in existing_texts else 0.0
    length_adjustment = -0.04 if is_phrase else 0.03
    importance = min(0.92, 0.54 + row_mentions * 0.08 + context_bonus + existing_bonus + length_adjustment)
    relevance = min(1.0, 0.64 + context_bonus * 1.4 + existing_bonus + min(0.18, row_mentions * 0.04))
    return importance, relevance, {
        "row_mentions": row_mentions,
        "context_match": context_bonus > 0,
        "existing_match": existing_bonus > 0,
        "is_phrase": is_phrase,
    }


def _demo_balance_choice_flags(text: str, demo_config: dict[str, Any]) -> dict[str, bool]:
    clean = _demo_balance_clean_text(text)
    return {
        "a": (
            _demo_balance_has_choice_token(clean, "A")
            or _demo_balance_has_option_mention(clean, demo_config.get("option_a", ""))
            or _demo_balance_has_option_mention(clean, demo_config.get("option_a_keyword", ""))
        ),
        "b": (
            _demo_balance_has_choice_token(clean, "B")
            or _demo_balance_has_option_mention(clean, demo_config.get("option_b", ""))
            or _demo_balance_has_option_mention(clean, demo_config.get("option_b_keyword", ""))
        ),
    }


def _demo_balance_existing_side_counts(existing_rows: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"a": 0, "b": 0}
    for item in existing_rows or []:
        bubble_id = _safe_text(item.get("id"))
        side = _safe_text(item.get("choice_affinity")).lower()
        if side in counts and bubble_id not in _demo_balance_anchor_ids() and _safe_text(item.get("kind")).lower() != "off_topic":
            counts[side] += 1
    return counts


def _demo_balance_existing_side_match_scores(text: str, existing_rows: list[dict[str, Any]]) -> dict[str, float]:
    normalized = _normalize_demo_local_fast_keyword_text(text, allow_single=True)
    compact = _demo_local_fast_normalize_for_compact_match(normalized)
    scores = {"a": 0.0, "b": 0.0}
    if not normalized:
        return scores
    for item in existing_rows or []:
        side = _safe_text(item.get("choice_affinity")).lower()
        if side not in scores or _safe_text(item.get("id")) in _demo_balance_anchor_ids():
            continue
        matched = False
        for raw_value in [_safe_text(item.get("text")), _safe_text(item.get("canonical_label")), *[_safe_text(alias) for alias in (item.get("aliases") or [])]]:
            value = _normalize_demo_local_fast_keyword_text(raw_value, allow_single=True)
            if not value:
                continue
            value_compact = _demo_local_fast_normalize_for_compact_match(value)
            if value == normalized or (compact and value_compact == compact):
                scores[side] += 0.22
                matched = True
                break
            if normalized in value or value in normalized:
                scores[side] += 0.1
                matched = True
                break
        if matched:
            continue
    return scores


def _demo_balance_keyword_affinity(
    text: str,
    rows: list[dict[str, str]],
    demo_config: dict[str, Any],
    existing_rows: list[dict[str, Any]] | None = None,
) -> tuple[str, float, bool, dict[str, Any]]:
    candidate = _normalize_demo_local_fast_keyword_text(text, allow_single=True).lower()
    combined_rows = " ".join(_safe_text(row.get("text")) for row in rows).lower()
    choice_flags = _demo_balance_choice_flags(combined_rows, demo_config)
    explicit_choice = "a" if choice_flags["a"] and not choice_flags["b"] else "b" if choice_flags["b"] and not choice_flags["a"] else ""
    existing_rows = existing_rows or []
    side_counts = _demo_balance_existing_side_counts(existing_rows)
    scores = {"a": 0.0, "b": 0.0}
    reason_parts: list[str] = []

    if explicit_choice in scores:
        scores[explicit_choice] += 0.55
        reason_parts.append("explicit_choice")
    elif choice_flags["a"] and choice_flags["b"]:
        reason_parts.append("explicit_both_sides")

    for choice, option_key, keyword_key in (
        ("a", "option_a", "option_a_keyword"),
        ("b", "option_b", "option_b_keyword"),
    ):
        option = _normalize_demo_local_fast_keyword_text(demo_config.get(option_key), allow_single=True).lower()
        keyword = _normalize_demo_local_fast_keyword_text(demo_config.get(keyword_key) or demo_config.get(option_key), allow_single=True).lower()
        for value, direct_weight, row_weight, label in (
            (keyword, 0.52, 0.22, "center_keyword"),
            (option, 0.34, 0.14, "option_label"),
        ):
            value = value.strip()
            if not value:
                continue
            if value in candidate or candidate in value:
                scores[choice] += direct_weight
                reason_parts.append(f"{label}_{choice}")
            if value in combined_rows:
                scores[choice] += row_weight

    existing_scores = _demo_balance_existing_side_match_scores(candidate, existing_rows)
    for choice, value in existing_scores.items():
        if value > 0:
            scores[choice] += value
            reason_parts.append(f"existing_match_{choice}")

    winner = "a" if scores["a"] > scores["b"] else "b" if scores["b"] > scores["a"] else ""
    if winner:
        loser = "b" if winner == "a" else "a"
        margin = scores[winner] - scores[loser]
    else:
        loser = ""
        margin = 0.0

    confident = bool(winner and scores[winner] >= 0.42 and margin >= 0.16)
    fallback_side = ""
    fallback_reason = ""
    if confident:
        selected = winner
        needs_review = False
        affinity_score = max(0.0, min(1.0, scores[selected]))
        affinity_reason = "score_confident"
    else:
        if explicit_choice in scores:
            fallback_side = explicit_choice
            fallback_reason = "recent_explicit_choice"
        elif side_counts["a"] < side_counts["b"]:
            fallback_side = "a"
            fallback_reason = "fewer_side_bubbles"
        elif side_counts["b"] < side_counts["a"]:
            fallback_side = "b"
            fallback_reason = "fewer_side_bubbles"
        elif winner:
            fallback_side = winner
            fallback_reason = "weak_score_winner"
        else:
            fallback_side = "a" if sum(ord(ch) for ch in candidate) % 2 == 0 else "b"
            fallback_reason = "balanced_hash"
        selected = fallback_side
        needs_review = True
        affinity_score = max(0.12, min(0.32, scores.get(selected, 0.0)))
        affinity_reason = fallback_reason

    debug = {
        "a_score": round(scores["a"], 4),
        "b_score": round(scores["b"], 4),
        "explicit_choice": explicit_choice,
        "choice_flags": choice_flags,
        "side_counts": side_counts,
        "winner": winner,
        "loser": loser,
        "margin": round(margin, 4),
        "fallback_side": fallback_side,
        "affinity_reason": affinity_reason,
        "reason_parts": _dedup_preserve(reason_parts, limit=8),
    }
    return selected, max(0.0, min(1.0, affinity_score)), needs_review, debug


def _extract_demo_local_fast_keywords(
    payload: IdeationKeywordExtractInput,
    rows: list[dict[str, str]],
    *,
    max_keywords: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    existing_rows = _ideation_existing_keyword_rows(payload)
    existing_lookup, canonical_texts = _demo_local_fast_existing_text_lookup(existing_rows)
    existing_texts = {
        _normalize_demo_local_fast_keyword_text(value, allow_single=True)
        for item in existing_rows
        for value in [_safe_text(item.get("text")), _safe_text(item.get("canonical_label")), *[_safe_text(alias) for alias in (item.get("aliases") or [])]]
        if _normalize_demo_local_fast_keyword_text(value, allow_single=True)
    }
    context_text = _demo_local_fast_context_text(payload)
    counts: Counter[str] = Counter()
    evidence_by_text: dict[str, set[str]] = {}
    aliases_by_text: dict[str, set[str]] = {}
    candidate_meta_by_text: dict[str, dict[str, bool]] = {}
    raw_noun_count = 0
    local_candidate_count = 0
    single_candidate_texts: list[str] = []
    phrase_candidate_texts: list[str] = []
    raw_token_debug: list[dict[str, Any]] = []
    rejected_phrase_count = 0
    rejected_repeat_count = 0
    dropped_low_support_count = 0
    canonicalized_count = 0
    alias_merge_count = 0
    routes: Counter[str] = Counter()

    for row in rows:
        row_id = _safe_text(row.get("id"))
        text = _strip_leading_timestamp(row.get("text"))
        noun_tokens, route = _demo_local_fast_tokenize_nouns(text)
        routes[route] += 1
        raw_noun_count += len(noun_tokens)
        raw_token_debug.extend(_demo_local_fast_token_debug(token) for token in noun_tokens)
        local_candidates: list[tuple[str, bool]] = []
        for token in noun_tokens:
            noun = _safe_text(token.get("text"))
            if noun:
                local_candidates.append((noun, False))
                single_candidate_texts.append(noun)
        for left, right in zip(noun_tokens, noun_tokens[1:]):
            phrase, rejection_reason = _demo_local_fast_phrase_from_adjacent_tokens(left, right, text)
            if phrase:
                local_candidates.append((phrase, True))
                phrase_candidate_texts.append(phrase)
            else:
                rejected_phrase_count += 1
                if rejection_reason in {"repeat", "contained", "same_sound"}:
                    rejected_repeat_count += 1
        local_candidate_count += len(local_candidates)
        seen_row_candidate_keys: set[str] = set()
        for value, is_phrase in local_candidates[:24]:
            candidate_key = _ideation_bubble_text_key(value)
            if not candidate_key:
                continue
            if candidate_key in seen_row_candidate_keys and is_phrase:
                continue
            if candidate_key not in seen_row_candidate_keys:
                seen_row_candidate_keys.add(candidate_key)
            canonical, alias_source, canonical_reason, similarity = _demo_local_fast_canonicalize_candidate(
                value,
                existing_rows,
                existing_lookup,
                context_text,
            )
            if not canonical:
                continue
            counts[canonical] += 1
            if row_id:
                evidence_by_text.setdefault(canonical, set()).add(row_id)
            if alias_source and alias_source != canonical:
                aliases_by_text.setdefault(canonical, set()).add(alias_source)
                alias_merge_count += 1
                if canonical_reason == "jamo_similarity" and similarity > 0:
                    canonicalized_count += 1
            meta = candidate_meta_by_text.setdefault(
                canonical,
                {"single": False, "phrase": False, "verified_phrase": False},
            )
            if is_phrase:
                meta["phrase"] = True
                meta["verified_phrase"] = True
            else:
                meta["single"] = True

    candidates: list[dict[str, Any]] = []
    for text, count in counts.items():
        if not text:
            continue
        meta = candidate_meta_by_text.get(text) or {}
        word_count = len(text.split())
        is_phrase = bool(meta.get("phrase")) or word_count > 1
        verified_phrase = bool(meta.get("verified_phrase")) and is_phrase
        importance, relevance, score_features = _demo_local_fast_keyword_score(
            text,
            rows,
            payload,
            existing_texts,
            is_phrase=is_phrase,
        )
        word_count = len(text.split())
        support_count = len(evidence_by_text.get(text) or [])
        row_mentions = _safe_nonnegative_int(score_features.get("row_mentions"), 0)
        context_match = bool(score_features.get("context_match"))
        existing_match = text in canonical_texts or bool(score_features.get("existing_match"))
        alias_match = bool(aliases_by_text.get(text))
        single_candidate = word_count == 1 and not is_phrase
        concise_phrase = 1 <= word_count <= 2
        phrase_compact_length = len(text.replace(" ", ""))
        one_off_single_allowed = single_candidate
        one_off_phrase_allowed = (
            verified_phrase
            and concise_phrase
            and phrase_compact_length >= 4
        )
        if not (
            existing_match
            or alias_match
            or (context_match and (single_candidate or verified_phrase))
            or one_off_single_allowed
            or one_off_phrase_allowed
        ):
            dropped_low_support_count += 1
            continue
        score = (
            support_count * 1.18
            + count * 0.64
            + row_mentions * 0.32
            + importance * 0.72
            + relevance * 0.5
            + (1.2 if existing_match else 0.0)
            + (0.95 if alias_match else 0.0)
            + (0.78 if context_match else 0.0)
            + (1.6 if one_off_phrase_allowed else 0.0)
            + (-0.28 if is_phrase else 0.16)
        )
        candidates.append(
            {
                "text": text,
                "count": max(1, count),
                "support_count": support_count,
                "kind": "topic",
                "importance": importance,
                "relevance": relevance,
                "off_topic": False,
                "off_topic_reason": "",
                "anchor": "",
                "related": [],
                "alias_sources": sorted(aliases_by_text.get(text) or []),
                "canonicalized": alias_match,
                "source_kind": "phrase" if is_phrase else "single",
                "_score": score,
            }
        )

        choice_affinity, affinity_score, needs_affinity_review, affinity_debug = _demo_balance_keyword_affinity(
            text,
            rows,
            payload.demo_config or {},
            existing_rows,
        )
        candidates[-1]["choice_affinity"] = choice_affinity
        candidates[-1]["affinity_score"] = affinity_score
        candidates[-1]["needs_affinity_review"] = needs_affinity_review
        candidates[-1]["anchor_id"] = _demo_balance_anchor_id(choice_affinity)
        candidates[-1]["affinity_reason"] = _safe_text(affinity_debug.get("affinity_reason"))
        candidates[-1]["affinity_debug"] = affinity_debug

    candidates.sort(key=lambda item: (-_safe_float(item.get("_score"), 0.0), _safe_text(item.get("text"))))
    top_candidate_debug = [
        {
            "text": _safe_text(item.get("text")),
            "score": round(_safe_float(item.get("_score"), 0.0), 4),
            "count": _safe_nonnegative_int(item.get("count"), 0),
            "support_count": _safe_nonnegative_int(item.get("support_count"), 0),
            "source_kind": _safe_text(item.get("source_kind")),
            "choice_affinity": _safe_text(item.get("choice_affinity")),
            "affinity_score": round(_safe_float(item.get("affinity_score"), 0.0), 4),
            "needs_affinity_review": bool(item.get("needs_affinity_review")),
            "affinity_reason": _safe_text(item.get("affinity_reason")),
            "a_score": round(_safe_float((item.get("affinity_debug") or {}).get("a_score"), 0.0), 4),
            "b_score": round(_safe_float((item.get("affinity_debug") or {}).get("b_score"), 0.0), 4),
            "fallback_side": _safe_text((item.get("affinity_debug") or {}).get("fallback_side")),
            "alias_sources": [_safe_text(value) for value in (item.get("alias_sources") or [])[:5]],
            "canonicalized": bool(item.get("canonicalized")),
        }
        for item in candidates[:16]
    ]
    selected: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    seen_jamo_keys: list[str] = []
    for candidate in candidates:
        text = _safe_text(candidate.get("text"))
        text_key = _ideation_bubble_text_key(text)
        if not text_key or text_key in seen_keys:
            continue
        # Prefer concise phrases; if a selected longer phrase already contains the token, skip the weaker duplicate.
        if any(text_key in _ideation_bubble_text_key(item.get("text")) or _ideation_bubble_text_key(item.get("text")) in text_key for item in selected):
            if text not in existing_texts:
                continue
        text_jamo = _demo_local_fast_jamo_key(text)
        if text_jamo and any(_demo_local_fast_edit_similarity(text_jamo, seen_jamo) >= 0.92 for seen_jamo in seen_jamo_keys):
            if text not in existing_texts:
                continue
        candidate.pop("_score", None)
        selected.append(candidate)
        seen_keys.add(text_key)
        if text_jamo:
            seen_jamo_keys.append(text_jamo)
        if len(selected) >= max_keywords:
            break

    route_name = "kiwi" if routes.get("kiwi") else "regex_fallback"
    diagnostics = {
        "stage": "canvas_ideation_bubble_graph_local_fast",
        "extractor": route_name,
        "input_rows": len(rows),
        "raw_tokens": raw_token_debug[:DEMO_LOCAL_FAST_DEBUG_LIST_LIMIT],
        "single_candidates": _dedup_preserve(single_candidate_texts, limit=DEMO_LOCAL_FAST_DEBUG_LIST_LIMIT),
        "phrase_candidates": _dedup_preserve(phrase_candidate_texts, limit=DEMO_LOCAL_FAST_DEBUG_LIST_LIMIT),
        "raw_noun_count": raw_noun_count,
        "local_candidate_count": local_candidate_count,
        "counted_candidate_count": len(counts),
        "candidate_count": len(candidates),
        "selected_count": len(selected),
        "accepted_count": len(selected),
        "top_candidates": top_candidate_debug,
        "selected_keywords": [
            {
                "text": _safe_text(item.get("text")),
                "count": _safe_nonnegative_int(item.get("count"), 0),
                "support_count": _safe_nonnegative_int(item.get("support_count"), 0),
                "source_kind": _safe_text(item.get("source_kind")),
                "choice_affinity": _safe_text(item.get("choice_affinity")),
                "affinity_score": round(_safe_float(item.get("affinity_score"), 0.0), 4),
                "needs_affinity_review": bool(item.get("needs_affinity_review")),
                "alias_sources": [_safe_text(value) for value in (item.get("alias_sources") or [])[:5]],
                "canonicalized": bool(item.get("canonicalized")),
            }
            for item in selected
        ],
        "rejected_phrase_count": rejected_phrase_count,
        "rejected_repeat_count": rejected_repeat_count,
        "dropped_low_support_count": dropped_low_support_count,
        "kiwi_available": route_name == "kiwi",
        "alias_merge_count": alias_merge_count,
        "canonicalized_count": canonicalized_count,
    }
    return selected, diagnostics


IDEATION_BUBBLE_GRAPH_VERSION = 2
IDEATION_BUBBLE_GRAPH_LAYOUT_MODE = "orbit"
IDEATION_BUBBLE_GRAPH_MAX_BUBBLES = 80
DEMO_BALANCE_BUBBLE_GRAPH_VISIBLE_CAP = 24
IDEATION_BUBBLE_GRAPH_PROCESSED_IDS_LIMIT = 2000
IDEATION_BUBBLE_GRAPH_ARCHIVE_MISSING_CYCLES = 5
IDEATION_BUBBLE_GRAPH_DIM_MISSING_CYCLES = 3
IDEATION_BUBBLE_GRAPH_OFF_TOPIC_ARCHIVE_CYCLES = 3
IDEATION_BUBBLE_GRAPH_CORE_TOP_RATIO = 0.2
IDEATION_BUBBLE_GRAPH_LAYOUT_WIDTH = 1580
IDEATION_BUBBLE_GRAPH_LAYOUT_HEIGHT = 940
IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X = IDEATION_BUBBLE_GRAPH_LAYOUT_WIDTH / 2
IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y = 540
IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X = 70
IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y = 80
IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP = 12
IDEATION_BUBBLE_GRAPH_LAYOUT_CLUSTER_GAP = 118
IDEATION_BUBBLE_GRAPH_CORE_CLUSTER_MOVE_LIMIT = 68
IDEATION_BUBBLE_GRAPH_DEFAULT_CLUSTER_MOVE_LIMIT = 118
IDEATION_BUBBLE_GRAPH_PERIPHERAL_CLUSTER_MOVE_LIMIT = 152
IDEATION_BUBBLE_GRAPH_MAX_ORBIT_CLUSTERS = 3
DEMO_BALANCE_ANCHOR_A_ID = "demo-balance-anchor-a"
DEMO_BALANCE_ANCHOR_B_ID = "demo-balance-anchor-b"
DEMO_BALANCE_ANCHOR_NEUTRAL_ID = "demo-balance-anchor-neutral"
DEMO_BALANCE_NEUTRAL_LABEL = "미분류"
DEMO_BALANCE_AFFINITIES = {"a", "b", "neutral"}
DEMO_BALANCE_DISPLAY_AFFINITIES = {"a", "b"}
DEMO_BALANCE_MIN_VISIBLE_PER_SIDE = 4
DEMO_BALANCE_LOCAL_KEYWORD_RENAMES = (
    ("사생활 치매", "사생활 침해"),
    ("사생활치매", "사생활 침해"),
)


def _empty_canvas_ideation_bubble_graph() -> dict[str, Any]:
    return {
        "version": IDEATION_BUBBLE_GRAPH_VERSION,
        "layout_mode": IDEATION_BUBBLE_GRAPH_LAYOUT_MODE,
        "update_cycle": 0,
        "layout_revision": 0,
        "layout_overlap_resolved_count": 0,
        "clusters": [],
        "bubbles": [],
        "processed_utterance_ids": [],
        "updated_at": "",
    }


def _normalize_ideation_bubble_state(raw: Any) -> str:
    state = _safe_text(raw, "active").lower()
    return state if state in {"active", "dimmed", "exiting", "archived"} else "active"


def _normalize_ideation_bubble_layout_zone(raw: Any) -> str:
    zone = _safe_text(raw, "default").lower()
    return zone if zone in {"core", "default", "peripheral", "archived"} else "default"


def _is_ideation_bubble_visible_state(raw: Any) -> bool:
    return _normalize_ideation_bubble_state(raw) in {"active", "dimmed"}


def _normalize_ideation_bubble_role(raw: Any) -> str:
    role = _safe_text(raw, "satellite").lower()
    return role if role in {"center", "satellite", "dot"} else "satellite"


def _ideation_bubble_text_key(raw: Any) -> str:
    return _safe_text(raw).strip().lower()


def _normalize_canvas_ideation_bubble_graph(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return _empty_canvas_ideation_bubble_graph()

    bubbles: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    for index, item in enumerate(raw.get("bubbles") or []):
        if not isinstance(item, dict):
            continue
        label = _normalize_ideation_keyword_text(
            item.get("label") or item.get("text") or item.get("keyword")
        )
        if not label:
            continue
        bubble_id = _safe_text(item.get("id")) or f"ideation-bubble-{_stable_short_id(label)}"
        bubble_id_base = bubble_id
        suffix = 2
        while bubble_id in used_ids:
            bubble_id = f"{bubble_id_base}-{suffix}"
            suffix += 1
        used_ids.add(bubble_id)
        aliases = _dedup_preserve(
            [
                _normalize_ideation_keyword_text(value)
                for value in (item.get("aliases") or item.get("alias") or [])
                if _normalize_ideation_keyword_text(value)
            ],
            limit=20,
        )
        aliases = [value for value in aliases if value != label]
        kind = _safe_text(item.get("kind"), "topic").lower()
        if kind not in {"entity", "topic", "relation", "action", "off_topic"}:
            kind = "topic"
        off_topic = bool(item.get("off_topic") or item.get("offTopic") or kind == "off_topic")
        if off_topic:
            kind = "off_topic"
        count = max(1, _safe_nonnegative_int(item.get("count"), 1) or 1)
        importance = max(0.0, min(1.0, _safe_float(item.get("importance"), 0.6)))
        relevance = max(0.0, min(1.0, _safe_float(item.get("relevance"), 1.0)))
        activity = max(0.0, min(1.0, _safe_float(item.get("activity"), 0.6)))
        opacity = max(0.0, min(1.0, _safe_float(item.get("opacity"), 1.0)))
        emphasis = _safe_text(item.get("emphasis"), "default").lower()
        if emphasis not in {"primary", "default"}:
            emphasis = "default"
        size = max(48, min(260, _safe_nonnegative_int(item.get("size") or item.get("radius"), 0)))
        raw_x = item.get("x")
        raw_y = item.get("y")
        x = _safe_float(raw_x, 0.0) if raw_x is not None else None
        y = _safe_float(raw_y, 0.0) if raw_y is not None else None
        cluster_x = item.get("cluster_x") if item.get("cluster_x") is not None else item.get("clusterX")
        cluster_y = item.get("cluster_y") if item.get("cluster_y") is not None else item.get("clusterY")
        local_x = item.get("local_x") if item.get("local_x") is not None else item.get("localX")
        local_y = item.get("local_y") if item.get("local_y") is not None else item.get("localY")
        display_state = _normalize_ideation_bubble_state(
            item.get("display_state") or item.get("displayState") or item.get("state")
        )
        choice_affinity = _safe_text(item.get("choice_affinity") or item.get("choiceAffinity")).lower()
        if choice_affinity not in DEMO_BALANCE_AFFINITIES:
            choice_affinity = ""
        affinity_score = max(0.0, min(1.0, _safe_float(item.get("affinity_score") or item.get("affinityScore"), 0.0)))
        needs_affinity_review = bool(item.get("needs_affinity_review") or item.get("needsAffinityReview"))
        missing_cycles = _safe_nonnegative_int(
            item.get("missing_cycles") or item.get("missingCycles"),
            0,
        )
        last_seen_cycle = _safe_nonnegative_int(
            item.get("last_seen_cycle") or item.get("lastSeenCycle"),
            0,
        )
        orbit_center_id = _safe_text(item.get("orbit_center_id") or item.get("orbitCenterId"))
        raw_orbit_ring = item.get("orbit_ring") if item.get("orbit_ring") is not None else item.get("orbitRing")
        raw_orbit_angle = item.get("orbit_angle") if item.get("orbit_angle") is not None else item.get("orbitAngle")
        raw_orbit_radius = item.get("orbit_radius") if item.get("orbit_radius") is not None else item.get("orbitRadius")
        raw_orbit_order_key = (
            item.get("orbit_order_key")
            if item.get("orbit_order_key") is not None
            else item.get("orbitOrderKey")
        )
        raw_orbit_slot_index = (
            item.get("orbit_slot_index")
            if item.get("orbit_slot_index") is not None
            else item.get("orbitSlotIndex")
        )
        motion_reason = _safe_text(item.get("motion_reason") or item.get("motionReason"))
        if motion_reason not in {
            "gate_enter",
            "insert_push",
            "gap_fill",
            "ring_overflow",
            "affinity_transfer",
            "relayout",
            "relayout_transfer",
            "content_update",
            "exit",
            "",
        }:
            motion_reason = ""
        motion_direction = _safe_text(item.get("motion_direction") or item.get("motionDirection"))
        if motion_direction not in {"counterclockwise", "clockwise", "nearest", "nearest_arc", "orbit_radial_arc", "direct", ""}:
            motion_direction = ""
        raw_enter_sequence = (
            item.get("enter_sequence")
            if item.get("enter_sequence") is not None
            else item.get("enterSequence")
        )
        raw_enter_delay_ms = (
            item.get("enter_delay_ms")
            if item.get("enter_delay_ms") is not None
            else item.get("enterDelayMs")
        )
        raw_gate_angle = item.get("gate_angle") if item.get("gate_angle") is not None else item.get("gateAngle")
        raw_from_slot_index = (
            item.get("from_slot_index")
            if item.get("from_slot_index") is not None
            else item.get("fromSlotIndex")
        )
        raw_to_slot_index = (
            item.get("to_slot_index")
            if item.get("to_slot_index") is not None
            else item.get("toSlotIndex")
        )
        raw_move_cost = item.get("move_cost") if item.get("move_cost") is not None else item.get("moveCost")
        raw_move_angle_delta = (
            item.get("move_angle_delta")
            if item.get("move_angle_delta") is not None
            else item.get("moveAngleDelta")
        )
        raw_arc_cost = item.get("arc_cost") if item.get("arc_cost") is not None else item.get("arcCost")
        raw_radius_cost = item.get("radius_cost") if item.get("radius_cost") is not None else item.get("radiusCost")
        bubbles.append(
            {
                "id": bubble_id,
                "label": label,
                "canonical_label": _normalize_ideation_keyword_text(
                    item.get("canonical_label") or item.get("canonicalLabel")
                )
                or label,
                "aliases": aliases,
                "kind": kind,
                "count": count,
                "importance": importance,
                "relevance": relevance,
                "activity": activity,
                "opacity": opacity,
                "emphasis": emphasis,
                "x": x,
                "y": y,
                "size": size,
                "cluster_id": _safe_text(item.get("cluster_id") or item.get("clusterId")),
                "cluster_x": _safe_float(cluster_x, 0.0) if cluster_x is not None else None,
                "cluster_y": _safe_float(cluster_y, 0.0) if cluster_y is not None else None,
                "local_x": _safe_float(local_x, 0.0) if local_x is not None else None,
                "local_y": _safe_float(local_y, 0.0) if local_y is not None else None,
                "role": _normalize_ideation_bubble_role(item.get("role")),
                "orbit_center_id": orbit_center_id,
                "orbit_ring": _safe_nonnegative_int(raw_orbit_ring, 0) if raw_orbit_ring is not None else 0,
                "orbit_angle": _safe_float(raw_orbit_angle, 0.0) if raw_orbit_angle is not None else None,
                "orbit_radius": _safe_float(raw_orbit_radius, 0.0) if raw_orbit_radius is not None else None,
                "orbit_order_key": _safe_float(raw_orbit_order_key, 0.0) if raw_orbit_order_key is not None else None,
                "orbit_slot_index": _safe_nonnegative_int(raw_orbit_slot_index, 0) if raw_orbit_slot_index is not None else None,
                "motion_reason": motion_reason,
                "motion_direction": motion_direction,
                "motion_plan_id": _safe_text(item.get("motion_plan_id") or item.get("motionPlanId")),
                "from_slot_index": _safe_nonnegative_int(raw_from_slot_index, 0) if raw_from_slot_index is not None else 0,
                "to_slot_index": _safe_nonnegative_int(raw_to_slot_index, 0) if raw_to_slot_index is not None else 0,
                "move_cost": max(0.0, _safe_float(raw_move_cost, 0.0)) if raw_move_cost is not None else 0.0,
                "move_angle_delta": _safe_float(raw_move_angle_delta, 0.0) if raw_move_angle_delta is not None else 0.0,
                "arc_cost": max(0.0, _safe_float(raw_arc_cost, 0.0)) if raw_arc_cost is not None else 0.0,
                "radius_cost": max(0.0, _safe_float(raw_radius_cost, 0.0)) if raw_radius_cost is not None else 0.0,
                "gate_blocked": bool(item.get("gate_blocked") or item.get("gateBlocked")),
                "enter_sequence": _safe_nonnegative_int(raw_enter_sequence, 0) if raw_enter_sequence is not None else 0,
                "enter_delay_ms": _safe_nonnegative_int(raw_enter_delay_ms, 0) if raw_enter_delay_ms is not None else 0,
                "gate_angle": _safe_float(raw_gate_angle, 0.0) if raw_gate_angle is not None else None,
                "display_state": display_state,
                "layout_zone": _normalize_ideation_bubble_layout_zone(
                    item.get("layout_zone") or item.get("layoutZone")
                ),
                "missing_cycles": missing_cycles,
                "anchor_id": _safe_text(item.get("anchor_id") or item.get("anchorId")),
                "choice_affinity": choice_affinity,
                "affinity_score": affinity_score,
                "needs_affinity_review": needs_affinity_review,
                "durable": bool(item.get("durable")),
                "related_ids": _dedup_preserve(
                    [
                        _safe_text(value)
                        for value in (item.get("related_ids") or item.get("relatedIds") or [])
                        if _safe_text(value)
                    ],
                    limit=12,
                ),
                "evidence_utterance_ids": _dedup_preserve(
                    [
                        _safe_text(value)
                        for value in (item.get("evidence_utterance_ids") or item.get("evidenceUtteranceIds") or [])
                        if _safe_text(value)
                    ],
                    limit=80,
                ),
                "first_seen_at": _safe_text(item.get("first_seen_at") or item.get("firstSeenAt")),
                "last_seen_at": _safe_text(item.get("last_seen_at") or item.get("lastSeenAt")),
                "last_seen_cycle": last_seen_cycle,
                "off_topic": off_topic,
                "off_topic_reason": _safe_text(item.get("off_topic_reason") or item.get("offTopicReason")),
                "archive_reason": _safe_text(item.get("archive_reason") or item.get("archiveReason")),
                "lifecycle_state": _safe_text(item.get("lifecycle_state") or item.get("lifecycleState") or "active"),
            }
        )
        if len(bubbles) >= IDEATION_BUBBLE_GRAPH_MAX_BUBBLES:
            break

    bubble_ids = {item["id"] for item in bubbles}
    for item in bubbles:
        if item.get("anchor_id") not in bubble_ids:
            item["anchor_id"] = ""
        if item.get("orbit_center_id") not in bubble_ids:
            item["orbit_center_id"] = ""
        item["related_ids"] = [
            related_id
            for related_id in item.get("related_ids", [])
            if related_id in bubble_ids and related_id != item["id"]
        ][:12]

    clusters: list[dict[str, Any]] = []
    used_cluster_ids: set[str] = set()
    for index, item in enumerate(raw.get("clusters") or []):
        if not isinstance(item, dict):
            continue
        center_id = _safe_text(
            item.get("center_bubble_id")
            or item.get("centerBubbleId")
            or item.get("center_id")
            or item.get("centerId")
        )
        if center_id and center_id not in bubble_ids:
            center_id = ""
        cluster_id = _safe_text(item.get("id") or item.get("cluster_id") or item.get("clusterId"))
        if not cluster_id:
            cluster_id = f"bubble-cluster-{_stable_short_id(center_id or str(index))}"
        cluster_id_base = cluster_id
        suffix = 2
        while cluster_id in used_cluster_ids:
            cluster_id = f"{cluster_id_base}-{suffix}"
            suffix += 1
        used_cluster_ids.add(cluster_id)
        raw_x = item.get("x")
        raw_y = item.get("y")
        raw_radius = item.get("radius")
        raw_rings = item.get("rings")
        rings: list[float] = []
        if isinstance(raw_rings, list):
            for ring in raw_rings[:4]:
                radius_value = ring.get("radius") if isinstance(ring, dict) else ring
                radius = _safe_float(radius_value, 0.0)
                if radius > 0:
                    rings.append(round(radius, 2))
        cluster_bubble_ids = _dedup_preserve(
            [
                _safe_text(value)
                for value in (item.get("bubble_ids") or item.get("bubbleIds") or [])
                if _safe_text(value) in bubble_ids
            ],
            limit=IDEATION_BUBBLE_GRAPH_MAX_BUBBLES,
        )
        clusters.append(
            {
                "id": cluster_id,
                "center_bubble_id": center_id,
                "x": _safe_float(raw_x, 0.0) if raw_x is not None else None,
                "y": _safe_float(raw_y, 0.0) if raw_y is not None else None,
                "radius": _safe_float(raw_radius, 0.0) if raw_radius is not None else None,
                "rings": rings,
                "zone": _normalize_ideation_bubble_layout_zone(item.get("zone")),
                "overlap_resolved_count": _safe_nonnegative_int(
                    item.get("overlap_resolved_count") or item.get("overlapResolvedCount"),
                    0,
                ),
                "bubble_ids": cluster_bubble_ids,
            }
        )

    processed_ids = _dedup_preserve(
        [
            _safe_text(value)
            for value in (raw.get("processed_utterance_ids") or raw.get("processedUtteranceIds") or [])
            if _safe_text(value)
        ],
        limit=IDEATION_BUBBLE_GRAPH_PROCESSED_IDS_LIMIT,
    )
    return {
        "version": IDEATION_BUBBLE_GRAPH_VERSION,
        "layout_mode": IDEATION_BUBBLE_GRAPH_LAYOUT_MODE,
        "update_cycle": _safe_nonnegative_int(raw.get("update_cycle") or raw.get("updateCycle"), 0),
        "layout_revision": _safe_nonnegative_int(raw.get("layout_revision") or raw.get("layoutRevision"), 0),
        "layout_overlap_resolved_count": _safe_nonnegative_int(
            raw.get("layout_overlap_resolved_count") or raw.get("layoutOverlapResolvedCount"),
            0,
        ),
        "clusters": clusters,
        "bubbles": bubbles,
        "processed_utterance_ids": processed_ids,
        "updated_at": _safe_text(raw.get("updated_at") or raw.get("updatedAt")),
    }


def _demo_balance_anchor_id(choice: str) -> str:
    normalized = _safe_text(choice).lower()
    if normalized == "a":
        return DEMO_BALANCE_ANCHOR_A_ID
    if normalized == "b":
        return DEMO_BALANCE_ANCHOR_B_ID
    return DEMO_BALANCE_ANCHOR_A_ID


def _demo_balance_anchor_ids() -> set[str]:
    return {DEMO_BALANCE_ANCHOR_A_ID, DEMO_BALANCE_ANCHOR_B_ID, DEMO_BALANCE_ANCHOR_NEUTRAL_ID}


def _demo_balance_visible_anchor_ids() -> set[str]:
    return {DEMO_BALANCE_ANCHOR_A_ID, DEMO_BALANCE_ANCHOR_B_ID}


def _is_demo_balance_anchor_bubble(bubble: dict[str, Any]) -> bool:
    return _safe_text(bubble.get("id")) in _demo_balance_anchor_ids() or bool(bubble.get("durable"))


def _is_demo_balance_visible_anchor_bubble(bubble: dict[str, Any]) -> bool:
    return _safe_text(bubble.get("id")) in _demo_balance_visible_anchor_ids()


def _demo_balance_anchor_label(choice: str, demo_config: dict[str, Any]) -> str:
    normalized = _safe_text(choice).lower()
    if normalized == "a":
        return _normalize_ideation_keyword_text(demo_config.get("option_a_keyword") or demo_config.get("option_a")) or "A"
    if normalized == "b":
        return _normalize_ideation_keyword_text(demo_config.get("option_b_keyword") or demo_config.get("option_b")) or "B"
    return DEMO_BALANCE_NEUTRAL_LABEL


def _demo_balance_primary_anchor_texts(demo_config: dict[str, Any]) -> list[str]:
    return _dedup_preserve(
        [
            _demo_balance_anchor_label("a", demo_config),
            _demo_balance_anchor_label("b", demo_config),
        ],
        limit=2,
    )


def _ensure_demo_balance_anchor_bubbles(graph: dict[str, Any], demo_config: dict[str, Any]) -> bool:
    if not _is_demo_balance_config(demo_config):
        return False

    changed = False
    now = _now_ts()
    existing_by_id = {
        _safe_text(bubble.get("id")): bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict) and _safe_text(bubble.get("id"))
    }

    before_count = len(graph.get("bubbles") or [])
    graph["bubbles"] = [
        bubble
        for bubble in (graph.get("bubbles") or [])
        if not (
            isinstance(bubble, dict)
            and (
                _safe_text(bubble.get("id")) == DEMO_BALANCE_ANCHOR_NEUTRAL_ID
                or _safe_text(bubble.get("label")) == DEMO_BALANCE_NEUTRAL_LABEL
            )
        )
    ]
    if len(graph.get("bubbles") or []) != before_count:
        changed = True

    anchor_specs = [
        ("a", DEMO_BALANCE_ANCHOR_A_ID, _demo_balance_anchor_label("a", demo_config), "primary", 7, 0.94),
        ("b", DEMO_BALANCE_ANCHOR_B_ID, _demo_balance_anchor_label("b", demo_config), "primary", 7, 0.94),
    ]
    for choice, bubble_id, label, emphasis, count, importance in anchor_specs:
        label = _normalize_ideation_keyword_text(label)
        if not label:
            continue
        bubble = existing_by_id.get(bubble_id)
        if bubble is None:
            bubble = {
                "id": bubble_id,
                "label": label,
                "canonical_label": label,
                "aliases": [],
                "kind": "topic",
                "count": count,
                "importance": importance,
                "relevance": 1.0,
                "activity": 1.0,
                "opacity": 1.0,
                "emphasis": emphasis,
                "display_state": "active",
                "layout_zone": "core",
                "missing_cycles": 0,
                "anchor_id": "",
                "choice_affinity": choice,
                "affinity_score": 1.0,
                "durable": True,
                "related_ids": [],
                "evidence_utterance_ids": [],
                "first_seen_at": now,
                "last_seen_at": now,
                "last_seen_cycle": _safe_nonnegative_int(graph.get("update_cycle"), 0),
                "off_topic": False,
                "off_topic_reason": "",
                "archive_reason": "",
                "lifecycle_state": "active",
                "role": "center",
                "orbit_order_key": 0.0,
                "orbit_slot_index": 0,
            }
            graph.setdefault("bubbles", []).append(bubble)
            existing_by_id[bubble_id] = bubble
            changed = True
        if _safe_text(bubble.get("label")) != label or _safe_text(bubble.get("canonical_label")) != label:
            previous_label = _safe_text(bubble.get("label"))
            aliases = _dedup_preserve([*(bubble.get("aliases") or []), previous_label], limit=20)
            bubble["label"] = label
            bubble["canonical_label"] = label
            bubble["aliases"] = [value for value in aliases if value and value != label]
            changed = True
        desired_emphasis = "primary"
        for key, value in {
            "kind": "topic",
            "display_state": "active",
            "off_topic": False,
            "off_topic_reason": "",
            "archive_reason": "",
            "lifecycle_state": "active",
            "choice_affinity": choice,
            "affinity_score": 1.0,
            "durable": True,
            "emphasis": desired_emphasis,
            "orbit_order_key": 0.0,
            "orbit_slot_index": 0,
        }.items():
            if bubble.get(key) != value:
                bubble[key] = value
                changed = True
        bubble["count"] = max(count, _safe_nonnegative_int(bubble.get("count"), count))
        bubble["importance"] = max(importance, _safe_float(bubble.get("importance"), importance))
        bubble["relevance"] = max(0.9, _safe_float(bubble.get("relevance"), 1.0))
        bubble["activity"] = max(1.0, _safe_float(bubble.get("activity"), 0.0))

    changed = _normalize_demo_balance_graph_affinities(graph) or changed

    return changed


def _normalize_demo_balance_graph_affinities(graph: dict[str, Any]) -> bool:
    changed = False
    side_counts = {"a": 0, "b": 0}
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict) or _is_demo_balance_anchor_bubble(bubble):
            continue
        if not _is_ideation_bubble_visible_state(bubble.get("display_state")):
            continue
        affinity = _safe_text(bubble.get("choice_affinity")).lower()
        if affinity in DEMO_BALANCE_DISPLAY_AFFINITIES:
            side_counts[affinity] += 1

    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict) or _is_demo_balance_anchor_bubble(bubble):
            continue
        affinity = _safe_text(bubble.get("choice_affinity")).lower()
        if affinity in DEMO_BALANCE_DISPLAY_AFFINITIES:
            desired_anchor = _demo_balance_anchor_id(affinity)
            if _safe_text(bubble.get("anchor_id")) != desired_anchor:
                bubble["anchor_id"] = desired_anchor
                changed = True
            continue

        target = "a" if side_counts["a"] <= side_counts["b"] else "b"
        side_counts[target] += 1
        bubble["choice_affinity"] = target
        bubble["anchor_id"] = _demo_balance_anchor_id(target)
        bubble["affinity_score"] = min(_safe_float(bubble.get("affinity_score"), 0.0), 0.24)
        bubble["needs_affinity_review"] = True
        changed = True
    return changed


def _ensure_demo_balance_workspace_graph(workspace: dict[str, Any], saved_at: str = "") -> bool:
    demo_config = _normalize_canvas_demo_config(workspace.get("demo_config"))
    if not _is_demo_balance_config(demo_config):
        return False

    graph = _normalize_canvas_ideation_bubble_graph(workspace.get("ideation_bubble_graph"))
    changed = _ensure_demo_balance_anchor_bubbles(graph, demo_config)
    layout_changed = _ensure_ideation_bubble_graph_server_layout(graph)
    if changed:
        graph["update_cycle"] = max(1, _safe_nonnegative_int(graph.get("update_cycle"), 0))
        graph["layout_revision"] = max(1, _safe_nonnegative_int(graph.get("layout_revision"), 0))
        graph["updated_at"] = saved_at or _now_ts()
    elif layout_changed and not _safe_text(graph.get("updated_at")):
        graph["updated_at"] = saved_at or _now_ts()
    workspace["demo_config"] = demo_config
    workspace["ideation_bubble_graph"] = graph
    return changed or layout_changed


def _ideation_bubble_graph_text_maps(
    graph: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_id: dict[str, dict[str, Any]] = {}
    by_text: dict[str, dict[str, Any]] = {}
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        by_id[_safe_text(bubble.get("id"))] = bubble
        texts = [
            _safe_text(bubble.get("label")),
            _safe_text(bubble.get("canonical_label")),
            *[_safe_text(value) for value in (bubble.get("aliases") or [])],
        ]
        for text in texts:
            key = _ideation_bubble_text_key(text)
            if key:
                by_text[key] = bubble
    return by_id, by_text


def _ideation_bubble_existing_keyword_inputs(
    graph: dict[str, Any],
    *,
    include_exiting: bool = False,
) -> list[IdeationExistingKeywordInput]:
    bubbles = [
        item
        for item in (graph.get("bubbles") or [])
        if isinstance(item, dict)
        and (
            _is_ideation_bubble_visible_state(item.get("display_state"))
            or (include_exiting and _normalize_ideation_bubble_state(item.get("display_state")) == "exiting")
        )
    ]
    visible_rank = {"active": 0, "dimmed": 1, "exiting": 2, "archived": 3}
    bubbles.sort(
        key=lambda item: (
            visible_rank.get(_normalize_ideation_bubble_state(item.get("display_state")), 3),
            -_safe_nonnegative_int(item.get("count"), 1),
            -_safe_float(item.get("importance"), 0.0),
            _safe_text(item.get("label")),
        )
    )
    by_id = {
        _safe_text(item.get("id")): item
        for item in bubbles
        if _safe_text(item.get("id"))
    }
    existing: list[IdeationExistingKeywordInput] = []
    for bubble in bubbles[:40]:
        related_labels = [
            _safe_text((by_id.get(related_id) or {}).get("label"))
            for related_id in (bubble.get("related_ids") or [])
            if _safe_text((by_id.get(related_id) or {}).get("label"))
        ]
        anchor_label = _safe_text((by_id.get(_safe_text(bubble.get("anchor_id"))) or {}).get("label"))
        existing.append(
            IdeationExistingKeywordInput(
                id=_safe_text(bubble.get("id")),
                text=_safe_text(bubble.get("label")),
                canonical_label=_safe_text(bubble.get("canonical_label")) or _safe_text(bubble.get("label")),
                aliases=[
                    _normalize_ideation_keyword_text(value)
                    for value in (bubble.get("aliases") or [])
                    if _normalize_ideation_keyword_text(value)
                ][:8],
                evidence_utterance_ids=[
                    _safe_text(value)
                    for value in (bubble.get("evidence_utterance_ids") or [])
                    if _safe_text(value)
                ][:10],
                count=max(1, _safe_nonnegative_int(bubble.get("count"), 1) or 1),
                related=related_labels,
                kind=_safe_text(bubble.get("kind"), "topic"),
                importance=max(0.0, min(1.0, _safe_float(bubble.get("importance"), 0.6))),
                relevance=max(0.0, min(1.0, _safe_float(bubble.get("relevance"), 1.0))),
                off_topic=bool(bubble.get("off_topic")),
                anchor=anchor_label,
                choice_affinity=_safe_text(bubble.get("choice_affinity")),
                affinity_score=max(0.0, min(1.0, _safe_float(bubble.get("affinity_score"), 0.0))),
                needs_affinity_review=bool(bubble.get("needs_affinity_review") or bubble.get("needsAffinityReview")),
            )
        )
    return existing


def _archive_ideation_bubble(bubble: dict[str, Any], cycle: int, reason: str, *, exiting: bool = False) -> None:
    if _is_demo_balance_anchor_bubble(bubble):
        bubble["display_state"] = "active"
        bubble["archive_reason"] = ""
        bubble["missing_cycles"] = 0
        bubble["last_seen_cycle"] = max(_safe_nonnegative_int(bubble.get("last_seen_cycle"), 0), cycle)
        return
    bubble["display_state"] = "exiting" if exiting else "archived"
    bubble["layout_zone"] = "archived"
    bubble["activity"] = min(_safe_float(bubble.get("activity"), 0.0), 0.12)
    bubble["opacity"] = 0.0
    bubble["emphasis"] = "default"
    bubble["missing_cycles"] = max(
        _safe_nonnegative_int(bubble.get("missing_cycles"), 0),
        1,
    )
    bubble["archive_reason"] = reason
    bubble["last_seen_cycle"] = _safe_nonnegative_int(bubble.get("last_seen_cycle"), cycle)


def _ideation_bubble_core_ids(graph: dict[str, Any]) -> set[str]:
    candidates = [
        bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _safe_text(bubble.get("id"))
        and _is_ideation_bubble_visible_state(bubble.get("display_state"))
        and not bool(bubble.get("off_topic"))
    ]
    if not candidates:
        return set()

    top_n = max(1, math.ceil(len(candidates) * IDEATION_BUBBLE_GRAPH_CORE_TOP_RATIO))
    by_count = sorted(
        candidates,
        key=lambda bubble: (
            -_safe_nonnegative_int(bubble.get("count"), 1),
            -_safe_float(bubble.get("importance"), 0.0),
            _safe_text(bubble.get("label")),
        ),
    )[:top_n]
    by_importance = sorted(
        candidates,
        key=lambda bubble: (
            -_safe_float(bubble.get("importance"), 0.0),
            -_safe_nonnegative_int(bubble.get("count"), 1),
            _safe_text(bubble.get("label")),
        ),
    )[:top_n]
    core_ids = {
        _safe_text(bubble.get("id"))
        for bubble in [*by_count, *by_importance]
        if _safe_text(bubble.get("id"))
    }
    core_ids.update(
        _safe_text(bubble.get("id"))
        for bubble in candidates
        if _safe_text(bubble.get("id")) in {DEMO_BALANCE_ANCHOR_A_ID, DEMO_BALANCE_ANCHOR_B_ID}
    )
    return core_ids


def _apply_ideation_bubble_layout_zones(graph: dict[str, Any], core_ids: set[str]) -> None:
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        bubble_id = _safe_text(bubble.get("id"))
        state = _normalize_ideation_bubble_state(bubble.get("display_state"))
        if state in {"exiting", "archived"}:
            bubble["layout_zone"] = "archived"
            continue
        if bubble_id in core_ids and not bool(bubble.get("off_topic")):
            bubble["display_state"] = "active"
            bubble["layout_zone"] = "core"
            bubble["activity"] = max(
                _safe_float(bubble.get("activity"), 0.0),
                0.62,
            )
            continue
        bubble["layout_zone"] = "peripheral" if state == "dimmed" else "default"


def _apply_ideation_bubble_decay(
    graph: dict[str, Any],
    touched_ids: set[str],
    core_ids: set[str],
    cycle: int,
    *,
    dim_cycles: int = IDEATION_BUBBLE_GRAPH_DIM_MISSING_CYCLES,
    archive_cycles: int = IDEATION_BUBBLE_GRAPH_ARCHIVE_MISSING_CYCLES,
    off_topic_archive_cycles: int = IDEATION_BUBBLE_GRAPH_OFF_TOPIC_ARCHIVE_CYCLES,
    exit_before_archive: bool = False,
) -> None:
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        if _safe_text(bubble.get("id")) in touched_ids:
            continue
        if _normalize_ideation_bubble_state(bubble.get("display_state")) in {"exiting", "archived"}:
            continue
        missing_cycles = _safe_nonnegative_int(bubble.get("missing_cycles"), 0) + 1
        bubble["missing_cycles"] = missing_cycles
        bubble["activity"] = max(0.0, min(1.0, _safe_float(bubble.get("activity"), 0.4) * 0.62))
        is_core = _safe_text(bubble.get("id")) in core_ids
        if bool(bubble.get("off_topic")) and missing_cycles >= off_topic_archive_cycles:
            _archive_ideation_bubble(bubble, cycle, "off_topic_inactive", exiting=exit_before_archive)
        elif missing_cycles >= archive_cycles and not is_core:
            _archive_ideation_bubble(bubble, cycle, "inactive_low_importance", exiting=exit_before_archive)
        elif missing_cycles >= dim_cycles and not is_core:
            bubble["display_state"] = "dimmed"
        else:
            bubble["display_state"] = "active"


def _apply_ideation_bubble_visual_state(
    graph: dict[str, Any],
    core_ids: set[str],
    *,
    primary_ids: set[str] | None = None,
) -> None:
    explicit_primary_ids = primary_ids is not None
    resolved_primary_ids = primary_ids or set()
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        state = _normalize_ideation_bubble_state(bubble.get("display_state"))
        bubble_id = _safe_text(bubble.get("id"))
        off_topic = bool(bubble.get("off_topic")) or _safe_text(bubble.get("kind")) == "off_topic"
        if state in {"exiting", "archived"}:
            bubble["opacity"] = 0.0
            bubble["emphasis"] = "default"
            continue

        is_primary = bubble_id in resolved_primary_ids if explicit_primary_ids else bubble_id in core_ids
        if is_primary and not off_topic:
            bubble["opacity"] = 1.0
            bubble["emphasis"] = "primary"
            bubble["display_state"] = "active"
            bubble["layout_zone"] = "core"
            continue

        bubble["emphasis"] = "default"
        activity = max(0.0, min(1.0, _safe_float(bubble.get("activity"), 0.45)))
        relevance = max(0.0, min(1.0, _safe_float(bubble.get("relevance"), 1.0)))
        if state == "dimmed":
            bubble["opacity"] = round(0.38 + min(activity, relevance) * 0.2, 3)
        elif off_topic:
            bubble["opacity"] = round(0.54 + activity * 0.22, 3)
        else:
            bubble["opacity"] = round(0.72 + activity * relevance * 0.28, 3)


def _prune_archived_ideation_bubbles(graph: dict[str, Any]) -> None:
    visible = [
        bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _normalize_ideation_bubble_state(bubble.get("display_state")) != "archived"
    ]
    visible_ids = {_safe_text(bubble.get("id")) for bubble in visible if _safe_text(bubble.get("id"))}
    for bubble in visible:
        if _safe_text(bubble.get("anchor_id")) not in visible_ids:
            bubble["anchor_id"] = ""
        bubble["related_ids"] = [
            related_id
            for related_id in _safe_list_texts(bubble.get("related_ids"))
            if related_id in visible_ids and related_id != _safe_text(bubble.get("id"))
        ][:12]
    graph["bubbles"] = visible


def _prune_exiting_ideation_bubbles(graph: dict[str, Any]) -> None:
    graph["bubbles"] = [
        bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _normalize_ideation_bubble_state(bubble.get("display_state")) != "exiting"
    ]


def _ideation_bubble_state_counts(graph: dict[str, Any]) -> dict[str, int]:
    counts = {"active": 0, "dimmed": 0, "exiting": 0, "archived": 0, "provisional": 0}
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        state = _normalize_ideation_bubble_state(bubble.get("display_state"))
        counts[state] = counts.get(state, 0) + 1
        if _safe_text(bubble.get("lifecycle_state")).lower() == "provisional":
            counts["provisional"] += 1
    return counts


def _ideation_bubble_seed_ratio(value: str, salt: int) -> float:
    raw = _stable_short_id(f"{value}:{salt}")
    try:
        seed = int(raw, 16)
    except Exception:
        seed = 0
    return (seed % 10000) / 10000


def _ideation_bubble_layout_size(bubble: dict[str, Any], max_count: int) -> int:
    count = max(1, _safe_nonnegative_int(bubble.get("count"), 1) or 1)
    count_ratio = 1 if max_count <= 1 else max(0.0, min(1.0, count / max_count))
    emphasized_ratio = math.pow(count_ratio, 0.72)
    activity = max(0.0, min(1.0, _safe_float(bubble.get("activity"), 0.6)))
    return int(round((72 + emphasized_ratio * 142) * (0.82 + activity * 0.18)))


def _clamp_ideation_bubble_layout_xy(x: float, y: float, size: float) -> tuple[float, float]:
    max_x = max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X, IDEATION_BUBBLE_GRAPH_LAYOUT_WIDTH - size - IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X)
    max_y = max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y, IDEATION_BUBBLE_GRAPH_LAYOUT_HEIGHT - size - IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y)
    return (
        max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X, min(max_x, x)),
        max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y, min(max_y, y)),
    )


def _ideation_bubble_layout_circles_overlap(
    left: dict[str, Any],
    right: dict[str, Any],
    gap: float,
) -> bool:
    left_size = max(1.0, float(left.get("size") or 1))
    right_size = max(1.0, float(right.get("size") or 1))
    left_radius = left_size / 2
    right_radius = right_size / 2
    dx = float(left.get("x") or 0) + left_radius - (float(right.get("x") or 0) + right_radius)
    dy = float(left.get("y") or 0) + left_radius - (float(right.get("y") or 0) + right_radius)
    min_distance = left_radius + right_radius + gap
    return dx * dx + dy * dy < min_distance * min_distance


def _ideation_bubble_layout_clusters(bubbles: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    by_id = {_safe_text(bubble.get("id")): bubble for bubble in bubbles if _safe_text(bubble.get("id"))}
    if any(_safe_text(bubble.get("choice_affinity")).lower() in DEMO_BALANCE_AFFINITIES for bubble in bubbles):
        clusters: list[list[dict[str, Any]]] = []
        assigned_ids: set[str] = set()
        for choice in ("a", "b"):
            anchor_id = _demo_balance_anchor_id(choice)
            cluster: list[dict[str, Any]] = []
            anchor = by_id.get(anchor_id)
            if anchor:
                cluster.append(anchor)
                assigned_ids.add(anchor_id)
            for bubble in bubbles:
                bubble_id = _safe_text(bubble.get("id"))
                if not bubble_id or bubble_id in assigned_ids:
                    continue
                affinity = _safe_text(bubble.get("choice_affinity")).lower()
                if affinity not in DEMO_BALANCE_DISPLAY_AFFINITIES:
                    affinity = "a" if len(clusters) == 0 else "b"
                if affinity == choice or _safe_text(bubble.get("anchor_id")) == anchor_id:
                    cluster.append(bubble)
                    assigned_ids.add(bubble_id)
            if cluster:
                clusters.append(cluster)
        remaining = [
            bubble
            for bubble in bubbles
            if _safe_text(bubble.get("id")) and _safe_text(bubble.get("id")) not in assigned_ids
        ]
        if remaining:
            if clusters:
                clusters[-1].extend(remaining)
            else:
                clusters.append(remaining)
        return clusters

    adjacency: dict[str, set[str]] = {bubble_id: set() for bubble_id in by_id}
    for bubble in bubbles:
        bubble_id = _safe_text(bubble.get("id"))
        if not bubble_id:
            continue
        for related_id in [*_safe_list_texts(bubble.get("related_ids")), _safe_text(bubble.get("anchor_id"))]:
            if related_id and related_id in by_id and related_id != bubble_id:
                adjacency.setdefault(bubble_id, set()).add(related_id)
                adjacency.setdefault(related_id, set()).add(bubble_id)

    visited: set[str] = set()
    clusters: list[list[dict[str, Any]]] = []
    sorted_ids = sorted(
        by_id,
        key=lambda bubble_id: (
            -_safe_nonnegative_int(by_id[bubble_id].get("count"), 1),
            -_safe_float(by_id[bubble_id].get("importance"), 0.0),
            _safe_text(by_id[bubble_id].get("label")),
        ),
    )
    for seed_id in sorted_ids:
        if seed_id in visited:
            continue
        stack = [seed_id]
        visited.add(seed_id)
        cluster_ids: list[str] = []
        while stack:
            current_id = stack.pop()
            cluster_ids.append(current_id)
            for next_id in sorted(adjacency.get(current_id) or []):
                if next_id in visited:
                    continue
                visited.add(next_id)
                stack.append(next_id)
        clusters.append([by_id[bubble_id] for bubble_id in cluster_ids])
    return clusters


def _safe_list_texts(raw: Any) -> list[str]:
    return [_safe_text(value) for value in (raw if isinstance(raw, list) else []) if _safe_text(value)]


def _ideation_bubble_has_number(raw: Any) -> bool:
    return isinstance(raw, (int, float)) and math.isfinite(float(raw))


def _ideation_bubble_cluster_anchor(cluster: list[dict[str, Any]]) -> dict[str, Any]:
    if not cluster:
        return {}
    demo_anchors = [
        bubble
        for bubble in cluster
        if _safe_text(bubble.get("id")) in _demo_balance_anchor_ids()
    ]
    if demo_anchors:
        return sorted(
            demo_anchors,
            key=lambda bubble: (
                0,
                _safe_text(bubble.get("id")),
            ),
        )[0]
    return sorted(
        cluster,
        key=lambda bubble: (
            0 if _normalize_ideation_bubble_layout_zone(bubble.get("layout_zone")) == "core" else 1,
            -_safe_nonnegative_int(bubble.get("count"), 1),
            -_safe_float(bubble.get("importance"), 0.0),
            _safe_text(bubble.get("label")),
        ),
    )[0]


def _ideation_bubble_cluster_zone(cluster: list[dict[str, Any]]) -> str:
    if any(_normalize_ideation_bubble_layout_zone(bubble.get("layout_zone")) == "core" for bubble in cluster):
        return "core"
    if cluster and all(_normalize_ideation_bubble_layout_zone(bubble.get("layout_zone")) == "peripheral" for bubble in cluster):
        return "peripheral"
    return "default"


def _ideation_bubble_cluster_move_limit(zone: str) -> float:
    if zone == "core":
        return IDEATION_BUBBLE_GRAPH_CORE_CLUSTER_MOVE_LIMIT
    if zone == "peripheral":
        return IDEATION_BUBBLE_GRAPH_PERIPHERAL_CLUSTER_MOVE_LIMIT
    return IDEATION_BUBBLE_GRAPH_DEFAULT_CLUSTER_MOVE_LIMIT


def _limit_ideation_bubble_layout_delta(
    previous_x: float,
    previous_y: float,
    target_x: float,
    target_y: float,
    max_distance: float,
) -> tuple[float, float]:
    dx = target_x - previous_x
    dy = target_y - previous_y
    distance = math.sqrt(dx * dx + dy * dy)
    if distance <= max_distance or distance < 0.001:
        return target_x, target_y
    ratio = max_distance / distance
    return previous_x + dx * ratio, previous_y + dy * ratio


def _clamp_ideation_bubble_cluster_box_xy(
    x: float,
    y: float,
    width: float,
    height: float,
) -> tuple[float, float]:
    max_x = max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X, IDEATION_BUBBLE_GRAPH_LAYOUT_WIDTH - width - IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X)
    max_y = max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y, IDEATION_BUBBLE_GRAPH_LAYOUT_HEIGHT - height - IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y)
    return (
        max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X, min(max_x, x)),
        max(IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y, min(max_y, y)),
    )


def _ideation_bubble_cluster_box(
    cluster: list[dict[str, Any]],
    cluster_id: str,
) -> dict[str, Any]:
    anchor = _ideation_bubble_cluster_anchor(cluster)
    sorted_bubbles = sorted(
        cluster,
        key=lambda bubble: (
            0 if _safe_text(bubble.get("id")) == _safe_text(anchor.get("id")) else 1,
            -_safe_nonnegative_int(bubble.get("size"), 1),
            -_safe_nonnegative_int(bubble.get("count"), 1),
            -_safe_float(bubble.get("importance"), 0.0),
            _safe_text(bubble.get("label")),
        ),
    )
    placements: list[dict[str, Any]] = []
    golden_angle = math.pi * (3 - math.sqrt(5))
    for index, bubble in enumerate(sorted_bubbles):
        bubble_id = _safe_text(bubble.get("id"))
        size = max(1, _safe_nonnegative_int(bubble.get("size"), 1))
        preserved_local = None
        if (
            _safe_text(bubble.get("cluster_id")) == cluster_id
            and _ideation_bubble_has_number(bubble.get("local_x"))
            and _ideation_bubble_has_number(bubble.get("local_y"))
        ):
            preserved_local = {
                "bubble": bubble,
                "x": float(bubble.get("local_x") or 0),
                "y": float(bubble.get("local_y") or 0),
                "size": size,
            }
        if index == 0:
            placements.append(preserved_local or {"bubble": bubble, "x": 0.0, "y": 0.0, "size": size})
            continue

        if preserved_local and not any(
            _ideation_bubble_layout_circles_overlap(
                preserved_local,
                placed,
                IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP,
            )
            for placed in placements
        ):
            placements.append(preserved_local)
            continue

        anchor_id = _safe_text(bubble.get("anchor_id"))
        related_ids = set(_safe_list_texts(bubble.get("related_ids")))
        anchor = next(
            (
                placement
                for placement in placements
                if _safe_text(placement["bubble"].get("id")) == anchor_id
                or _safe_text(placement["bubble"].get("id")) in related_ids
            ),
            placements[0],
        )
        seed_angle = _ideation_bubble_seed_ratio(f"{bubble_id}:{cluster_id}", 17) * math.pi * 2
        chosen: dict[str, Any] | None = None
        for attempt in range(120):
            ring = attempt // 22
            angle = seed_angle + attempt * golden_angle + index * 0.21
            radius = (
                max(1.0, float(anchor["size"])) / 2
                + size / 2
                + IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP
                + ring * 16
            )
            candidate = {
                "bubble": bubble,
                "x": float(anchor["x"]) + float(anchor["size"]) / 2 + math.cos(angle) * radius - size / 2,
                "y": float(anchor["y"]) + float(anchor["size"]) / 2 + math.sin(angle) * radius - size / 2,
                "size": size,
            }
            if not any(_ideation_bubble_layout_circles_overlap(candidate, placed, IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP) for placed in placements):
                chosen = candidate
                break
        if chosen is None:
            max_right = max(0.0, *[float(placement["x"]) + float(placement["size"]) for placement in placements])
            chosen = {"bubble": bubble, "x": max_right + IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP, "y": 0.0, "size": size}
        placements.append(chosen)

    min_x = min(float(placement["x"]) for placement in placements)
    min_y = min(float(placement["y"]) for placement in placements)
    max_x = max(float(placement["x"]) + float(placement["size"]) for placement in placements)
    max_y = max(float(placement["y"]) + float(placement["size"]) for placement in placements)
    normalized_placements = [
        {
            **placement,
            "x": float(placement["x"]) - min_x,
            "y": float(placement["y"]) - min_y,
        }
        for placement in placements
    ]
    previous_box_x_values: list[float] = []
    previous_box_y_values: list[float] = []
    cluster_x_values: list[float] = []
    cluster_y_values: list[float] = []
    for placement in normalized_placements:
        bubble = placement.get("bubble")
        if not isinstance(bubble, dict):
            continue
        if (
            _safe_text(bubble.get("cluster_id")) == cluster_id
            and _ideation_bubble_has_number(bubble.get("cluster_x"))
            and _ideation_bubble_has_number(bubble.get("cluster_y"))
        ):
            cluster_x_values.append(float(bubble.get("cluster_x") or 0))
            cluster_y_values.append(float(bubble.get("cluster_y") or 0))
        if _ideation_bubble_has_number(bubble.get("x")) and _ideation_bubble_has_number(bubble.get("y")):
            previous_box_x_values.append(float(bubble.get("x") or 0) - float(placement.get("x") or 0))
            previous_box_y_values.append(float(bubble.get("y") or 0) - float(placement.get("y") or 0))

    previous_x = (
        sum(cluster_x_values) / len(cluster_x_values)
        if cluster_x_values
        else sum(previous_box_x_values) / len(previous_box_x_values)
        if previous_box_x_values
        else None
    )
    previous_y = (
        sum(cluster_y_values) / len(cluster_y_values)
        if cluster_y_values
        else sum(previous_box_y_values) / len(previous_box_y_values)
        if previous_box_y_values
        else None
    )
    return {
        "cluster_id": cluster_id,
        "width": max_x - min_x,
        "height": max_y - min_y,
        "zone": _ideation_bubble_cluster_zone(cluster),
        "previous_x": previous_x,
        "previous_y": previous_y,
        "placements": normalized_placements,
    }


def _place_ideation_bubble_cluster_boxes(boxes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    placed_boxes: list[dict[str, Any]] = []
    placed_bubbles: list[dict[str, Any]] = []
    golden_angle = math.pi * (3 - math.sqrt(5))

    for index, box in enumerate(boxes):
        width = max(1.0, float(box.get("width") or 1))
        height = max(1.0, float(box.get("height") or 1))
        zone = _safe_text(box.get("zone"), "default")
        if zone not in {"core", "default", "peripheral"}:
            zone = "default"
        seed_angle = _ideation_bubble_seed_ratio(str(box.get("cluster_id")), 23) * math.pi * 2
        if index == 0 and zone == "core":
            raw_x = IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X - width / 2
            raw_y = IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y - height / 2
        else:
            radius_base = 92 if zone == "core" else 220 if zone == "default" else 360
            radius_step = 44 if zone == "core" else 68 if zone == "default" else 82
            radius = radius_base + math.sqrt(index + 1) * radius_step
            angle = seed_angle + index * 1.03
            raw_x = IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X + math.cos(angle) * radius - width / 2
            raw_y = IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y + math.sin(angle) * radius * 0.72 - height / 2
        desired_x, desired_y = _clamp_ideation_bubble_cluster_box_xy(raw_x, raw_y, width, height)

        previous_x = box.get("previous_x")
        previous_y = box.get("previous_y")
        if _ideation_bubble_has_number(previous_x) and _ideation_bubble_has_number(previous_y):
            limited_x, limited_y = _limit_ideation_bubble_layout_delta(
                float(previous_x),
                float(previous_y),
                desired_x,
                desired_y,
                _ideation_bubble_cluster_move_limit(zone),
            )
            target_x, target_y = _clamp_ideation_bubble_cluster_box_xy(limited_x, limited_y, width, height)
        else:
            target_x, target_y = desired_x, desired_y

        chosen: tuple[float, float] | None = None
        gap_candidates = [
            IDEATION_BUBBLE_GRAPH_LAYOUT_CLUSTER_GAP,
            84,
            48,
            18,
            0,
        ]

        for gap in gap_candidates:
            for attempt in range(180):
                if attempt == 0:
                    candidate_x, candidate_y = target_x, target_y
                else:
                    radius = 18 + math.sqrt(attempt) * 34
                    angle = seed_angle + attempt * golden_angle
                    candidate_x, candidate_y = _clamp_ideation_bubble_cluster_box_xy(
                        target_x + math.cos(angle) * radius,
                        target_y + math.sin(angle) * radius * 0.72,
                        width,
                        height,
                    )
                separated = all(
                    candidate_x + width + gap < placed["x"]
                    or placed["x"] + placed["width"] + gap < candidate_x
                    or candidate_y + height + gap < placed["y"]
                    or placed["y"] + placed["height"] + gap < candidate_y
                    for placed in placed_boxes
                )
                if separated:
                    chosen = (candidate_x, candidate_y)
                    break
            if chosen is not None:
                break

        if chosen is None:
            chosen = _clamp_ideation_bubble_cluster_box_xy(target_x, target_y, width, height)

        box_x, box_y = chosen
        placed_boxes.append({"x": box_x, "y": box_y, "width": width, "height": height})
        for placement in box.get("placements") or []:
            bubble = placement.get("bubble")
            if not isinstance(bubble, dict):
                continue
            placed_bubbles.append(
                {
                    "bubble": bubble,
                    "x": box_x + float(placement.get("x") or 0),
                    "y": box_y + float(placement.get("y") or 0),
                    "local_x": float(placement.get("x") or 0),
                    "local_y": float(placement.get("y") or 0),
                    "cluster_x": box_x,
                    "cluster_y": box_y,
                    "size": float(placement.get("size") or bubble.get("size") or 1),
                    "cluster_id": _safe_text(box.get("cluster_id")),
                }
            )
    return placed_bubbles


def _relax_ideation_bubble_layout(placements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    relaxed = [dict(placement) for placement in placements]
    for iteration in range(80):
        moved = False
        for left_index in range(len(relaxed)):
            for right_index in range(left_index + 1, len(relaxed)):
                left = relaxed[left_index]
                right = relaxed[right_index]
                left_radius = max(1.0, float(left.get("size") or 1)) / 2
                right_radius = max(1.0, float(right.get("size") or 1)) / 2
                left_center_x = float(left.get("x") or 0) + left_radius
                left_center_y = float(left.get("y") or 0) + left_radius
                right_center_x = float(right.get("x") or 0) + right_radius
                right_center_y = float(right.get("y") or 0) + right_radius
                dx = right_center_x - left_center_x
                dy = right_center_y - left_center_y
                distance = math.sqrt(dx * dx + dy * dy)
                min_distance = left_radius + right_radius + IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP
                if distance >= min_distance:
                    continue
                if distance < 0.001:
                    angle = _ideation_bubble_seed_ratio(
                        f"{_safe_text((left.get('bubble') or {}).get('id'))}:{_safe_text((right.get('bubble') or {}).get('id'))}:{iteration}",
                        31,
                    ) * math.pi * 2
                    dx = math.cos(angle)
                    dy = math.sin(angle)
                    distance = 1
                overlap = min_distance - distance
                push_x = (dx / distance) * overlap * 0.5
                push_y = (dy / distance) * overlap * 0.5
                left_share = right_radius / max(1.0, left_radius + right_radius)
                right_share = 1 - left_share
                left_x, left_y = _clamp_ideation_bubble_layout_xy(
                    float(left.get("x") or 0) - push_x * left_share,
                    float(left.get("y") or 0) - push_y * left_share,
                    left_radius * 2,
                )
                right_x, right_y = _clamp_ideation_bubble_layout_xy(
                    float(right.get("x") or 0) + push_x * right_share,
                    float(right.get("y") or 0) + push_y * right_share,
                    right_radius * 2,
                )
                left["x"] = left_x
                left["y"] = left_y
                right["x"] = right_x
                right["y"] = right_y
                moved = True
        if not moved:
            break
    return relaxed


def _ideation_bubble_rank_tuple(bubble: dict[str, Any]) -> tuple[int, float, float, str]:
    return (
        _safe_nonnegative_int(bubble.get("count"), 1),
        _safe_float(bubble.get("importance"), 0.0),
        _safe_float(bubble.get("activity"), 0.0),
        _safe_text(bubble.get("label")),
    )


def _split_large_ideation_bubble_orbit_cluster(cluster: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    if any(_safe_text(bubble.get("id")) in _demo_balance_anchor_ids() for bubble in cluster):
        return [cluster]
    if len(cluster) <= 7:
        return [cluster]

    ranked = sorted(
        cluster,
        key=lambda bubble: (
            -_safe_nonnegative_int(bubble.get("count"), 1),
            -_safe_float(bubble.get("importance"), 0.0),
            -_safe_float(bubble.get("activity"), 0.0),
            _safe_text(bubble.get("label")),
        ),
    )
    target_count = min(
        IDEATION_BUBBLE_GRAPH_MAX_ORBIT_CLUSTERS,
        max(2, math.ceil(len(ranked) / 7)),
    )
    seeds = ranked[:target_count]
    buckets: list[list[dict[str, Any]]] = [[seed] for seed in seeds]
    seed_ids = [_safe_text(seed.get("id")) for seed in seeds]

    for bubble in ranked[target_count:]:
        related_ids = set(_safe_list_texts(bubble.get("related_ids")))
        anchor_id = _safe_text(bubble.get("anchor_id"))
        chosen_index: int | None = None
        for index, seed_id in enumerate(seed_ids):
            if seed_id and (seed_id == anchor_id or seed_id in related_ids):
                chosen_index = index
                break
        if chosen_index is None:
            chosen_index = min(range(len(buckets)), key=lambda index: len(buckets[index]))
        buckets[chosen_index].append(bubble)

    return buckets


def _ideation_bubble_orbit_clusters(visible: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    if any(_safe_text(bubble.get("choice_affinity")).lower() in DEMO_BALANCE_AFFINITIES for bubble in visible):
        return _ideation_bubble_layout_clusters(visible)[:IDEATION_BUBBLE_GRAPH_MAX_ORBIT_CLUSTERS]

    expanded: list[list[dict[str, Any]]] = []
    for cluster in _ideation_bubble_layout_clusters(visible):
        expanded.extend(_split_large_ideation_bubble_orbit_cluster(cluster))

    expanded.sort(
        key=lambda cluster: (
            0 if _ideation_bubble_cluster_zone(cluster) == "core" else 1,
            -max(_safe_nonnegative_int(bubble.get("count"), 1) for bubble in cluster),
            -max(_safe_float(bubble.get("importance"), 0.0) for bubble in cluster),
            _safe_text(_ideation_bubble_cluster_anchor(cluster).get("label")),
        )
    )
    if len(expanded) <= IDEATION_BUBBLE_GRAPH_MAX_ORBIT_CLUSTERS:
        return expanded

    primary = [list(cluster) for cluster in expanded[:IDEATION_BUBBLE_GRAPH_MAX_ORBIT_CLUSTERS]]
    primary_id_sets = [
        {_safe_text(bubble.get("id")) for bubble in cluster if _safe_text(bubble.get("id"))}
        for cluster in primary
    ]
    for extra_cluster in expanded[IDEATION_BUBBLE_GRAPH_MAX_ORBIT_CLUSTERS:]:
        anchor = _ideation_bubble_cluster_anchor(extra_cluster)
        anchor_id = _safe_text(anchor.get("anchor_id"))
        related_ids = set(_safe_list_texts(anchor.get("related_ids")))
        chosen_index: int | None = None
        for index, id_set in enumerate(primary_id_sets):
            if (anchor_id and anchor_id in id_set) or related_ids.intersection(id_set):
                chosen_index = index
                break
        if chosen_index is None:
            chosen_index = min(range(len(primary)), key=lambda index: len(primary[index]))
        primary[chosen_index].extend(extra_cluster)
        primary_id_sets[chosen_index].update(
            _safe_text(bubble.get("id"))
            for bubble in extra_cluster
            if _safe_text(bubble.get("id"))
        )
    return primary


def _ideation_bubble_orbit_cluster_id(cluster: list[dict[str, Any]], fallback_index: int) -> str:
    anchor = _ideation_bubble_cluster_anchor(cluster)
    anchor_key = _safe_text(anchor.get("id")) or _safe_text(anchor.get("label")) or str(fallback_index)
    return f"bubble-orbit-{_stable_short_id(anchor_key)}"


def _ideation_bubble_orbit_previous_center(
    graph: dict[str, Any],
    cluster_id: str,
) -> tuple[float, float] | None:
    for cluster in graph.get("clusters") or []:
        if not isinstance(cluster, dict):
            continue
        if _safe_text(cluster.get("id")) != cluster_id:
            continue
        if _ideation_bubble_has_number(cluster.get("x")) and _ideation_bubble_has_number(cluster.get("y")):
            return float(cluster.get("x") or 0), float(cluster.get("y") or 0)
    return None


def _ideation_bubble_orbit_desired_center(index: int, total: int) -> tuple[float, float]:
    if total <= 1:
        return IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X, IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y - 10
    if total == 2:
        centers = [
            (IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X - 235, IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y - 95),
            (IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X + 275, IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y + 70),
        ]
    else:
        centers = [
            (IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X - 310, IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y - 120),
            (IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X + 315, IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y - 70),
            (IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X + 10, IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y + 220),
        ]
    return centers[min(index, len(centers) - 1)]


def _clamp_ideation_bubble_orbit_center(x: float, y: float, radius: float) -> tuple[float, float]:
    margin_x = IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_X + radius
    margin_y = IDEATION_BUBBLE_GRAPH_LAYOUT_MARGIN_Y + radius
    max_x = max(margin_x, IDEATION_BUBBLE_GRAPH_LAYOUT_WIDTH - margin_x)
    max_y = max(margin_y, IDEATION_BUBBLE_GRAPH_LAYOUT_HEIGHT - margin_y)
    return (
        max(margin_x, min(max_x, x)),
        max(margin_y, min(max_y, y)),
    )


def _ideation_bubble_orbit_role(bubble: dict[str, Any], center_id: str) -> str:
    bubble_id = _safe_text(bubble.get("id"))
    if bubble_id == center_id:
        return "center"
    if bool(bubble.get("off_topic")) or _safe_text(bubble.get("kind")) == "off_topic":
        return "satellite"
    layout_zone = _normalize_ideation_bubble_layout_zone(bubble.get("layout_zone"))
    count = _safe_nonnegative_int(bubble.get("count"), 1)
    importance = _safe_float(bubble.get("importance"), 0.0)
    relevance = _safe_float(bubble.get("relevance"), 1.0)
    if layout_zone == "peripheral" and count <= 2 and importance < 0.52:
        return "dot"
    if count <= 1 and importance < 0.42 and relevance < 0.72:
        return "dot"
    return "satellite"


def _ideation_bubble_orbit_size(bubble: dict[str, Any], max_count: int, role: str) -> int:
    base = _ideation_bubble_layout_size(bubble, max_count)
    if role == "center":
        if _safe_text(bubble.get("id")) == DEMO_BALANCE_ANCHOR_NEUTRAL_ID:
            return 76
        return int(round(max(122, min(154, base * 0.82))))
    if role == "dot":
        return int(round(max(18, min(21, base * 0.13))))
    return int(round(max(64, min(88, base * 0.52))))


def _ideation_bubble_orbit_rings(center_size: int, cluster_size: int, total_clusters: int) -> list[float]:
    scale = 0.88 if total_clusters >= 3 else 1.0
    first = max(142.0, min(198.0, center_size * 0.72 + 82.0)) * scale
    second = first + (88.0 if total_clusters >= 3 else 104.0)
    rings = [round(first, 2)]
    if cluster_size > 3:
        rings.append(round(second, 2))
    return rings


def _is_demo_balance_orbit_cluster(cluster: list[dict[str, Any]]) -> bool:
    return any(
        _safe_text(bubble.get("id")) in {DEMO_BALANCE_ANCHOR_A_ID, DEMO_BALANCE_ANCHOR_B_ID}
        for bubble in cluster
        if isinstance(bubble, dict)
    )


def _demo_balance_orbit_order_key(bubble: dict[str, Any], cycle: int, fallback_index: int) -> float:
    raw_order = bubble.get("orbit_order_key")
    if _ideation_bubble_has_number(raw_order) and float(raw_order) > 0:
        return float(raw_order)

    first_seen_cycle = _safe_nonnegative_int(bubble.get("first_seen_cycle"), 0)
    if first_seen_cycle > 0:
        return float(first_seen_cycle * 1000 + fallback_index)

    last_seen_cycle = _safe_nonnegative_int(bubble.get("last_seen_cycle"), 0)
    if last_seen_cycle > 0:
        return float(last_seen_cycle * 1000 + fallback_index)

    created = _safe_text(bubble.get("first_seen_at"))
    if created:
        try:
            return float(max(1, int(_stable_short_id(created), 16) % 1000000))
        except Exception:
            return float(cycle * 1000 + fallback_index)

    return float(max(1, cycle * 1000 + fallback_index))


def _demo_balance_reassign_orbit_orders(
    cluster: list[dict[str, Any]],
    cycle: int,
    center_id: str,
) -> None:
    target_affinity = "a" if center_id == DEMO_BALANCE_ANCHOR_A_ID else "b"
    next_order = max(
        [
            _safe_float(bubble.get("orbit_order_key"), 0.0)
            for bubble in cluster
            if isinstance(bubble, dict) and _safe_float(bubble.get("orbit_order_key"), 0.0) > 0
        ]
        or [float(cycle * 1000)]
    )
    used_orders: set[float] = set()
    for index, bubble in enumerate(cluster):
        if not isinstance(bubble, dict) or _safe_text(bubble.get("id")) == center_id:
            continue
        raw_order = _safe_float(bubble.get("orbit_order_key"), 0.0)
        rounded_raw_order = round(raw_order, 4)
        previous_anchor_id = _safe_text(bubble.get("anchor_id"))
        previous_affinity = _safe_text(bubble.get("choice_affinity")).lower()
        moved_orbit = (
            previous_anchor_id
            and previous_anchor_id != center_id
        ) or (
            previous_affinity in DEMO_BALANCE_DISPLAY_AFFINITIES
            and previous_affinity != target_affinity
        )
        needs_new_order = (
            moved_orbit
            or not _ideation_bubble_has_number(bubble.get("orbit_order_key"))
            or raw_order <= 0
            or rounded_raw_order in used_orders
        )
        if needs_new_order:
            next_order = max(
                next_order + 1,
                _demo_balance_orbit_order_key(bubble, cycle, index),
            )
            assigned_order = round(next_order, 4)
            bubble["orbit_order_key"] = assigned_order
            used_orders.add(assigned_order)
        else:
            assigned_order = round(raw_order, 4)
            bubble["orbit_order_key"] = assigned_order
            used_orders.add(assigned_order)


def _demo_balance_orbit_ring_for_slot(slot_index: int) -> int:
    if slot_index < 8:
        return 1
    if slot_index < 20:
        return 2
    return 3 + max(0, slot_index - 20) // 16


def _demo_balance_orbit_ring_capacity_limit(ring: int) -> int:
    if ring <= 1:
        return 8
    if ring == 2:
        return 12
    return 16


def _demo_balance_orbit_ring_start_index(ring: int) -> int:
    if ring <= 1:
        return 0
    if ring == 2:
        return 8
    return 20 + max(0, ring - 3) * 16


def _demo_balance_orbit_ring_slot_count(ring: int, total: int) -> int:
    start_index = _demo_balance_orbit_ring_start_index(ring)
    if total <= start_index:
        return 0
    return min(_demo_balance_orbit_ring_capacity_limit(ring), total - start_index)


def _demo_balance_revolver_insert_angle() -> float:
    # Screen coordinates use positive Y downward; -135deg is visually near 10 o'clock.
    return -math.pi * 3 / 4


def _demo_balance_revolver_slot_angle(slot_index: int, slot_count: int) -> float:
    safe_slot_count = max(1, slot_count)
    # Decreasing mathematical angle rotates visually counterclockwise in screen coordinates.
    return _demo_balance_revolver_insert_angle() - slot_index * (math.pi * 2 / safe_slot_count)


def _demo_balance_graph_bubbles_by_id(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        _safe_text(bubble.get("id")): bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict) and _safe_text(bubble.get("id"))
    }


def _demo_balance_same_orbit(previous: dict[str, Any], current: dict[str, Any]) -> bool:
    return (
        _safe_text(previous.get("orbit_center_id"))
        and _safe_text(previous.get("orbit_center_id")) == _safe_text(current.get("orbit_center_id"))
    )


def _demo_balance_mark_motion(
    bubble: dict[str, Any],
    *,
    reason: str,
    direction: str,
    sequence: int = 0,
    delay_ms: int = 0,
    plan_id: str = "",
    from_slot_index: int = 0,
    to_slot_index: int = 0,
    move_cost: float = 0.0,
    gate_blocked: bool = False,
) -> None:
    bubble["motion_reason"] = reason
    bubble["motion_direction"] = direction
    bubble["motion_plan_id"] = _safe_text(plan_id)
    bubble["from_slot_index"] = max(0, int(from_slot_index))
    bubble["to_slot_index"] = max(0, int(to_slot_index))
    bubble["move_cost"] = round(max(0.0, float(move_cost or 0.0)), 2)
    bubble["gate_blocked"] = bool(gate_blocked)
    bubble["enter_sequence"] = max(0, int(sequence))
    bubble["enter_delay_ms"] = max(0, int(delay_ms))
    bubble["gate_angle"] = round(_demo_balance_revolver_insert_angle(), 6)


_DEMO_BALANCE_SLOT_LAYOUT_FIELDS = (
    "x",
    "y",
    "cluster_id",
    "cluster_x",
    "cluster_y",
    "local_x",
    "local_y",
    "role",
    "orbit_center_id",
    "orbit_ring",
    "orbit_angle",
    "orbit_radius",
    "orbit_slot_index",
)


def _demo_balance_motion_plan_id(graph: dict[str, Any], signature: str) -> str:
    cycle = _safe_nonnegative_int(graph.get("update_cycle"), 0)
    return f"demo-orbit-plan-{cycle}-{_stable_short_id(signature)[:8]}"


def _demo_balance_copy_slot_layout(target: dict[str, Any], source: dict[str, Any]) -> None:
    target_size = max(1, _safe_nonnegative_int(target.get("size"), _safe_nonnegative_int(source.get("size"), 64)))
    source_size = max(1, _safe_nonnegative_int(source.get("size"), target_size))
    source_center_x = _safe_float(source.get("x"), 0.0) + source_size / 2
    source_center_y = _safe_float(source.get("y"), 0.0) + source_size / 2
    for field in _DEMO_BALANCE_SLOT_LAYOUT_FIELDS:
        if field in {"x", "y", "local_x", "local_y"}:
            continue
        target[field] = copy.deepcopy(source.get(field))
    target["x"] = round(source_center_x - target_size / 2, 2)
    target["y"] = round(source_center_y - target_size / 2, 2)
    cluster_x = _safe_float(target.get("cluster_x"), 0.0)
    cluster_y = _safe_float(target.get("cluster_y"), 0.0)
    target["local_x"] = round(target["x"] - cluster_x, 2)
    target["local_y"] = round(target["y"] - cluster_y, 2)


def _demo_balance_shortest_angle_delta(from_angle: float, to_angle: float) -> float:
    return math.atan2(math.sin(to_angle - from_angle), math.cos(to_angle - from_angle))


def _demo_balance_apply_gate_pose(bubble: dict[str, Any]) -> None:
    size = max(1, _safe_nonnegative_int(bubble.get("size"), 64))
    cluster_x = _safe_float(bubble.get("cluster_x"), IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X)
    cluster_y = _safe_float(bubble.get("cluster_y"), IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y)
    radius = max(1.0, _safe_float(bubble.get("orbit_radius"), 150.0))
    angle = _demo_balance_revolver_insert_angle()
    raw_x = cluster_x + math.cos(angle) * radius - size / 2
    raw_y = cluster_y + math.sin(angle) * radius - size / 2
    x, y = _clamp_ideation_bubble_layout_xy(raw_x, raw_y, size)
    bubble["x"] = round(x, 2)
    bubble["y"] = round(y, 2)
    bubble["local_x"] = round(x - cluster_x, 2)
    bubble["local_y"] = round(y - cluster_y, 2)
    bubble["orbit_slot_index"] = 0
    bubble["orbit_angle"] = round(angle, 6)


def _demo_balance_assign_nearest_open_rail_slots(
    previous_graph: dict[str, Any],
    final_graph: dict[str, Any],
    new_bubble_ids: set[str],
) -> dict[str, Any]:
    previous_by_id = _demo_balance_graph_bubbles_by_id(previous_graph)
    final_by_id = _demo_balance_graph_bubbles_by_id(final_graph)
    assigned_count = 0
    total_move_cost = 0.0
    max_move_cost = 0.0
    groups: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for bubble in final_by_id.values():
        bubble_id = _safe_text(bubble.get("id"))
        if bubble_id in new_bubble_ids or bubble_id not in previous_by_id or _is_demo_balance_anchor_bubble(bubble):
            continue
        previous = previous_by_id.get(bubble_id) or {}
        if _safe_text(previous.get("orbit_center_id")) != _safe_text(bubble.get("orbit_center_id")):
            continue
        if not _is_ideation_bubble_visible_state(bubble.get("display_state")):
            continue
        key = (
            _safe_text(bubble.get("orbit_center_id")),
            _safe_nonnegative_int(bubble.get("orbit_ring"), 0),
        )
        if not key[0] or key[1] <= 0:
            continue
        groups.setdefault(key, []).append(bubble)

    def _center_of(item: dict[str, Any]) -> tuple[float, float]:
        size = max(1, _safe_nonnegative_int(item.get("size"), 64))
        return (
            _safe_float(item.get("x"), 0.0) + size / 2,
            _safe_float(item.get("y"), 0.0) + size / 2,
        )

    def _orbit_center_for_slot(slot: dict[str, Any]) -> tuple[float, float]:
        slot_x, slot_y = _center_of(slot)
        angle = _safe_float(slot.get("orbit_angle"), 0.0)
        radius = max(0.0, _safe_float(slot.get("orbit_radius"), 0.0))
        if radius <= 0:
            return slot_x, slot_y
        return (
            slot_x - math.cos(angle) * radius,
            slot_y - math.sin(angle) * radius,
        )

    def _slot_cost_details(previous: dict[str, Any], slot: dict[str, Any]) -> dict[str, float]:
        previous_x, previous_y = _center_of(previous)
        orbit_x, orbit_y = _orbit_center_for_slot(slot)
        current_angle = math.atan2(previous_y - orbit_y, previous_x - orbit_x)
        current_radius = math.hypot(previous_x - orbit_x, previous_y - orbit_y)
        target_angle = _safe_float(slot.get("orbit_angle"), current_angle)
        target_radius = max(1.0, _safe_float(slot.get("orbit_radius"), current_radius or 1.0))
        angle_delta = _demo_balance_shortest_angle_delta(current_angle, target_angle)
        arc_radius = max(1.0, (current_radius + target_radius) / 2)
        arc_cost = abs(angle_delta) * arc_radius
        radius_cost = abs(target_radius - current_radius) * 0.65
        previous_slot = _safe_nonnegative_int(previous.get("orbit_slot_index"), 0)
        next_slot = _safe_nonnegative_int(slot.get("orbit_slot_index"), 0)
        slot_delta = abs(next_slot - previous_slot)
        move_cost = arc_cost + radius_cost + (arc_cost * arc_cost / 180.0) + slot_delta * 0.01
        return {
            "move_cost": move_cost,
            "move_angle_delta": angle_delta,
            "arc_cost": arc_cost,
            "radius_cost": radius_cost,
        }

    def _slot_cost(previous: dict[str, Any], slot: dict[str, Any]) -> float:
        return _slot_cost_details(previous, slot)["move_cost"]

    def _minimum_cost_assignment(costs: list[list[float]]) -> list[int]:
        count = len(costs)
        if count == 0:
            return []
        if count > 16:
            remaining = set(range(count))
            assignment: list[int] = []
            for row in costs:
                chosen = min(remaining, key=lambda index: row[index])
                remaining.remove(chosen)
                assignment.append(chosen)
            return assignment

        full_mask = 1 << count
        best_cost = [math.inf] * full_mask
        parent: list[tuple[int, int] | None] = [None] * full_mask
        best_cost[0] = 0.0
        for mask in range(full_mask):
            row_index = mask.bit_count()
            if row_index >= count or not math.isfinite(best_cost[mask]):
                continue
            row = costs[row_index]
            for slot_index in range(count):
                if mask & (1 << slot_index):
                    continue
                next_mask = mask | (1 << slot_index)
                next_cost = best_cost[mask] + row[slot_index]
                if next_cost < best_cost[next_mask]:
                    best_cost[next_mask] = next_cost
                    parent[next_mask] = (mask, slot_index)

        assignment = [0] * count
        mask = full_mask - 1
        for row_index in range(count - 1, -1, -1):
            previous = parent[mask]
            if previous is None:
                assignment[row_index] = row_index
                continue
            previous_mask, slot_index = previous
            assignment[row_index] = slot_index
            mask = previous_mask
        return assignment

    for _key, bubbles in groups.items():
        slot_snapshots = [
            copy.deepcopy(bubble)
            for bubble in sorted(
                bubbles,
                key=lambda item: (
                    _safe_nonnegative_int(item.get("orbit_slot_index"), 0),
                    _safe_text(item.get("id")),
                ),
            )
        ]
        ordered_bubbles = sorted(
            bubbles,
            key=lambda item: (
                _safe_nonnegative_int((previous_by_id.get(_safe_text(item.get("id"))) or {}).get("orbit_slot_index"), 0),
                _safe_text(item.get("id")),
            ),
        )
        if len(slot_snapshots) != len(ordered_bubbles):
            continue
        costs = [
            [
                _slot_cost(previous_by_id.get(_safe_text(bubble.get("id"))) or bubble, slot)
                for slot in slot_snapshots
            ]
            for bubble in ordered_bubbles
        ]
        assignment = _minimum_cost_assignment(costs)
        for bubble_index, slot_index in enumerate(assignment):
            if bubble_index >= len(ordered_bubbles) or slot_index >= len(slot_snapshots):
                continue
            bubble = ordered_bubbles[bubble_index]
            bubble_id = _safe_text(bubble.get("id"))
            previous = previous_by_id.get(bubble_id) or bubble
            chosen = slot_snapshots[slot_index]
            details = _slot_cost_details(previous, chosen)
            move_cost = details["move_cost"]
            _demo_balance_copy_slot_layout(bubble, chosen)
            bubble["gate_blocked"] = False
            bubble["move_cost"] = round(move_cost, 2)
            bubble["move_angle_delta"] = round(details["move_angle_delta"], 6)
            bubble["arc_cost"] = round(details["arc_cost"], 2)
            bubble["radius_cost"] = round(details["radius_cost"], 2)
            assigned_count += 1
            total_move_cost += move_cost
            max_move_cost = max(max_move_cost, move_cost)

    return {
        "assigned_count": assigned_count,
        "gate_blocked_count": 0,
        "total_move_cost": round(total_move_cost, 2),
        "max_move_cost": round(max_move_cost, 2),
    }


def _annotate_demo_balance_motion_hints(
    previous_graph: dict[str, Any],
    next_graph: dict[str, Any],
    *,
    update_reason: str,
    sequence: int = 0,
    delay_ms: int = 0,
    plan_id: str = "",
) -> dict[str, int]:
    previous_by_id = _demo_balance_graph_bubbles_by_id(previous_graph)
    new_count = 0
    relayout_count = 0
    content_count = 0
    exit_count = 0

    for bubble in next_graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        bubble_id = _safe_text(bubble.get("id"))
        previous = previous_by_id.get(bubble_id)

        if _is_demo_balance_anchor_bubble(bubble):
            _demo_balance_mark_motion(bubble, reason="content_update", direction="direct", plan_id=plan_id)
            continue

        if previous is None:
            _demo_balance_mark_motion(
                bubble,
                reason="gate_enter",
                direction="direct",
                sequence=sequence,
                delay_ms=delay_ms,
                plan_id=plan_id,
                from_slot_index=0,
                to_slot_index=_safe_nonnegative_int(bubble.get("orbit_slot_index"), 0),
                move_cost=0.0,
            )
            new_count += 1
            continue

        if _normalize_ideation_bubble_state(bubble.get("display_state")) == "exiting":
            _demo_balance_mark_motion(
                bubble,
                reason="exit",
                direction="direct",
                plan_id=plan_id,
                from_slot_index=_safe_nonnegative_int(previous.get("orbit_slot_index"), 0),
                to_slot_index=_safe_nonnegative_int(bubble.get("orbit_slot_index"), 0),
                move_cost=0.0,
            )
            exit_count += 1
            continue

        previous_slot = _safe_nonnegative_int(previous.get("orbit_slot_index"), 0)
        current_slot = _safe_nonnegative_int(bubble.get("orbit_slot_index"), 0)
        same_orbit = _demo_balance_same_orbit(previous, bubble)
        same_ring = _safe_nonnegative_int(previous.get("orbit_ring"), 0) == _safe_nonnegative_int(bubble.get("orbit_ring"), 0)
        same_position = (
            abs(_safe_float(previous.get("x"), 0.0) - _safe_float(bubble.get("x"), 0.0)) < 0.5
            and abs(_safe_float(previous.get("y"), 0.0) - _safe_float(bubble.get("y"), 0.0)) < 0.5
            and same_orbit
            and same_ring
            and previous_slot == current_slot
        )
        move_cost = _safe_float(bubble.get("move_cost"), 0.0)

        if same_position:
            _demo_balance_mark_motion(
                bubble,
                reason="content_update",
                direction="direct",
                plan_id=plan_id,
                from_slot_index=previous_slot,
                to_slot_index=current_slot,
                move_cost=0.0,
            )
            content_count += 1
        else:
            if not same_orbit:
                reason = "relayout_transfer"
                direction = "direct"
            elif same_ring:
                reason = "relayout"
                direction = "nearest_arc"
            else:
                reason = "relayout"
                direction = "orbit_radial_arc"
            _demo_balance_mark_motion(
                bubble,
                reason=reason,
                direction=direction,
                plan_id=plan_id,
                from_slot_index=previous_slot,
                to_slot_index=current_slot,
                move_cost=move_cost,
            )
            relayout_count += 1

    return {
        "new_count": new_count,
        "relayout_count": relayout_count,
        "push_count": 0,
        "gap_count": 0,
        "content_count": content_count,
        "transfer_count": 0,
        "overflow_count": 0,
        "exit_count": exit_count,
    }


def _relax_ideation_bubble_orbit_placements(
    placements: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    if len(placements) < 2:
        return placements, 0
    relaxed = [dict(placement) for placement in placements]
    resolved_count = 0
    for iteration in range(90):
        moved = False
        for left_index in range(len(relaxed)):
            for right_index in range(left_index + 1, len(relaxed)):
                left = relaxed[left_index]
                right = relaxed[right_index]
                if not _ideation_bubble_layout_circles_overlap(left, right, IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP):
                    continue

                left_radius = max(1.0, float(left.get("size") or 1)) / 2
                right_radius = max(1.0, float(right.get("size") or 1)) / 2
                left_center_x = float(left.get("x") or 0) + left_radius
                left_center_y = float(left.get("y") or 0) + left_radius
                right_center_x = float(right.get("x") or 0) + right_radius
                right_center_y = float(right.get("y") or 0) + right_radius
                dx = right_center_x - left_center_x
                dy = right_center_y - left_center_y
                distance = math.sqrt(dx * dx + dy * dy)
                if distance < 0.001:
                    angle = _ideation_bubble_seed_ratio(
                        f"{_safe_text((left.get('bubble') or {}).get('id'))}:{_safe_text((right.get('bubble') or {}).get('id'))}:{iteration}",
                        97,
                    ) * math.pi * 2
                    dx = math.cos(angle)
                    dy = math.sin(angle)
                    distance = 1.0

                min_distance = left_radius + right_radius + IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP
                overlap = max(0.0, min_distance - distance)
                if overlap <= 0:
                    continue

                push_x = (dx / distance) * (overlap + 2)
                push_y = (dy / distance) * (overlap + 2)
                if left_index == 0:
                    left_share, right_share = 0.0, 1.0
                elif right_index == 0:
                    left_share, right_share = 1.0, 0.0
                else:
                    left_share = right_radius / max(1.0, left_radius + right_radius)
                    right_share = 1 - left_share

                if left_share:
                    left_x, left_y = _clamp_ideation_bubble_layout_xy(
                        float(left.get("x") or 0) - push_x * left_share,
                        float(left.get("y") or 0) - push_y * left_share,
                        left_radius * 2,
                    )
                    left["x"] = left_x
                    left["y"] = left_y
                if right_share:
                    right_x, right_y = _clamp_ideation_bubble_layout_xy(
                        float(right.get("x") or 0) + push_x * right_share,
                        float(right.get("y") or 0) + push_y * right_share,
                        right_radius * 2,
                    )
                    right["x"] = right_x
                    right["y"] = right_y
                resolved_count += 1
                moved = True
        if not moved:
            break
    return relaxed, resolved_count


def _place_ideation_bubble_orbit_cluster(
    graph: dict[str, Any],
    cluster: list[dict[str, Any]],
    cluster_id: str,
    cluster_index: int,
    total_clusters: int,
    max_count: int,
) -> dict[str, Any]:
    anchor = _ideation_bubble_cluster_anchor(cluster)
    center_id = _safe_text(anchor.get("id"))
    is_demo_cluster = _is_demo_balance_orbit_cluster(cluster)
    if is_demo_cluster:
        _demo_balance_reassign_orbit_orders(
            cluster,
            _safe_nonnegative_int(graph.get("update_cycle"), 0),
            center_id,
        )
        sorted_bubbles = sorted(
            cluster,
            key=lambda bubble: (
                0 if _safe_text(bubble.get("id")) == center_id else 1,
                -_safe_float(bubble.get("orbit_order_key"), 0.0),
                _safe_text(bubble.get("id")),
            ),
        )
    else:
        sorted_bubbles = sorted(
            cluster,
            key=lambda bubble: (
                0 if _safe_text(bubble.get("id")) == center_id else 1,
                -_safe_nonnegative_int(bubble.get("count"), 1),
                -_safe_float(bubble.get("importance"), 0.0),
                -_safe_float(bubble.get("activity"), 0.0),
                _safe_text(bubble.get("label")),
            ),
        )

    for bubble in sorted_bubbles:
        role = _ideation_bubble_orbit_role(bubble, center_id)
        bubble["role"] = role
        bubble["size"] = _ideation_bubble_orbit_size(bubble, max_count, role)

    center = sorted_bubbles[0]
    center_size = max(1, _safe_nonnegative_int(center.get("size"), 140))
    rings = _ideation_bubble_orbit_rings(center_size, len(sorted_bubbles), total_clusters)
    if is_demo_cluster:
        satellite_sizes = [
            max(1, _safe_nonnegative_int(bubble.get("size"), 64))
            for bubble in sorted_bubbles[1:]
        ]

        def demo_min_radius(slot_count: int, max_satellite_size: int) -> float:
            safe_slot_count = max(2, slot_count)
            chord_radius = (max_satellite_size + IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP + 8) / max(
                0.2,
                2 * math.sin(math.pi / safe_slot_count),
            )
            anchor_radius = center_size / 2 + max_satellite_size / 2 + IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP + 10
            return max(anchor_radius, chord_radius)

        demo_rings: list[float] = []
        ring_index = 1
        while _demo_balance_orbit_ring_start_index(ring_index) < len(satellite_sizes):
            ring_start_index = _demo_balance_orbit_ring_start_index(ring_index)
            ring_slot_count = _demo_balance_orbit_ring_capacity_limit(ring_index)
            ring_sizes = satellite_sizes[ring_start_index:ring_start_index + ring_slot_count]
            max_ring_size = max(ring_sizes or [64])
            previous_radius = demo_rings[-1] if demo_rings else 0.0
            base_radius = rings[min(ring_index - 1, len(rings) - 1)] if rings else 0.0
            min_gap_radius = previous_radius + (104 if ring_index > 1 else 0)
            demo_rings.append(
                round(max(base_radius, min_gap_radius, demo_min_radius(ring_slot_count, max_ring_size)), 2)
            )
            ring_index += 1
        rings = demo_rings or rings
    orbit_radius = max(rings or [center_size / 2]) + 54
    desired_x, desired_y = _ideation_bubble_orbit_desired_center(cluster_index, total_clusters)
    desired_x, desired_y = _clamp_ideation_bubble_orbit_center(desired_x, desired_y, orbit_radius)
    previous_center = _ideation_bubble_orbit_previous_center(graph, cluster_id)
    if previous_center:
        move_limit = _ideation_bubble_cluster_move_limit(_ideation_bubble_cluster_zone(cluster))
        center_x, center_y = _limit_ideation_bubble_layout_delta(
            previous_center[0],
            previous_center[1],
            desired_x,
            desired_y,
            move_limit,
        )
        center_x, center_y = _clamp_ideation_bubble_orbit_center(center_x, center_y, orbit_radius)
    else:
        center_x, center_y = desired_x, desired_y

    placements: list[dict[str, Any]] = []
    center_x_top = center_x - center_size / 2
    center_y_top = center_y - center_size / 2
    placements.append(
        {
            "bubble": center,
            "x": center_x_top,
            "y": center_y_top,
            "size": center_size,
            "orbit_ring": 0,
            "orbit_angle": 0.0,
            "orbit_radius": 0.0,
        }
    )

    satellites = sorted_bubbles[1:]
    slot_count = max(6, len(satellites) + 2)
    golden_angle = math.pi * (3 - math.sqrt(5))
    if is_demo_cluster:
        base_angle = _demo_balance_revolver_insert_angle()
    else:
        base_angle = _ideation_bubble_seed_ratio(cluster_id, 83) * math.pi * 2
    for index, bubble in enumerate(satellites):
        bubble_id = _safe_text(bubble.get("id"))
        size = max(1, _safe_nonnegative_int(bubble.get("size"), 64))
        role = _normalize_ideation_bubble_role(bubble.get("role"))
        preferred_ring_index = _demo_balance_orbit_ring_for_slot(index) if is_demo_cluster else 1 if index < max(4, math.ceil(slot_count * 0.56)) else 2
        if not is_demo_cluster and role == "dot" and len(rings) > 1:
            preferred_ring_index = 2
        radius = rings[min(preferred_ring_index - 1, len(rings) - 1)]
        if is_demo_cluster:
            ring_start_index = _demo_balance_orbit_ring_start_index(preferred_ring_index)
            ring_slot_index = max(0, index - ring_start_index)
            ring_slot_count = max(1, _demo_balance_orbit_ring_slot_count(preferred_ring_index, len(satellites)))
            angle = _demo_balance_revolver_slot_angle(ring_slot_index, ring_slot_count)
            raw_x = center_x + math.cos(angle) * radius - size / 2
            raw_y = center_y + math.sin(angle) * radius - size / 2
            candidate_x, candidate_y = _clamp_ideation_bubble_layout_xy(raw_x, raw_y, size)
            placements.append(
                {
                    "bubble": bubble,
                    "x": candidate_x,
                    "y": candidate_y,
                    "size": size,
                    "orbit_ring": preferred_ring_index,
                    "orbit_angle": angle,
                    "orbit_radius": radius,
                    "orbit_slot_index": ring_slot_index,
                }
            )
            continue
        seed_jitter = (_ideation_bubble_seed_ratio(f"{bubble_id}:{cluster_id}", 89) - 0.5) * 0.34
        angle = base_angle + index * (math.pi * 2 / slot_count) + seed_jitter
        chosen: dict[str, Any] | None = None
        fallback_candidate: dict[str, Any] | None = None
        fallback_overlap_score = float("inf")
        for attempt in range(108):
            attempt_slot = attempt % slot_count
            attempt_ring = attempt // slot_count
            attempt_angle = angle + attempt_slot * (math.pi * 2 / slot_count) + attempt_ring * golden_angle * 0.36
            attempt_radius = radius + attempt_ring * 28
            raw_x = center_x + math.cos(attempt_angle) * attempt_radius - size / 2
            raw_y = center_y + math.sin(attempt_angle) * attempt_radius - size / 2
            candidate_x, candidate_y = _clamp_ideation_bubble_layout_xy(raw_x, raw_y, size)
            candidate = {
                "bubble": bubble,
                "x": candidate_x,
                "y": candidate_y,
                "size": size,
                "orbit_ring": preferred_ring_index,
                "orbit_angle": attempt_angle,
                "orbit_radius": attempt_radius,
            }
            overlap_score = 0.0
            for placed in placements:
                if _ideation_bubble_layout_circles_overlap(
                    candidate,
                    placed,
                    IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP,
                ):
                    candidate_radius = size / 2
                    placed_radius = max(1.0, float(placed.get("size") or 1)) / 2
                    dx = candidate_x + candidate_radius - (float(placed.get("x") or 0) + placed_radius)
                    dy = candidate_y + candidate_radius - (float(placed.get("y") or 0) + placed_radius)
                    distance = math.sqrt(dx * dx + dy * dy)
                    overlap_score += max(0.0, candidate_radius + placed_radius + IDEATION_BUBBLE_GRAPH_LAYOUT_BUBBLE_GAP - distance)
            if overlap_score <= 0:
                chosen = candidate
                break
            if overlap_score < fallback_overlap_score:
                fallback_candidate = candidate
                fallback_overlap_score = overlap_score
        placements.append(chosen or fallback_candidate or candidate)

    bubble_ids: list[str] = []
    if is_demo_cluster:
        overlap_resolved_count = 0
    else:
        placements, overlap_resolved_count = _relax_ideation_bubble_orbit_placements(placements)
    for placement in placements:
        bubble = placement.get("bubble")
        if not isinstance(bubble, dict):
            continue
        bubble_id = _safe_text(bubble.get("id"))
        if bubble_id:
            bubble_ids.append(bubble_id)
        size = max(1.0, float(placement.get("size") or bubble.get("size") or 1))
        x, y = _clamp_ideation_bubble_layout_xy(float(placement.get("x") or 0), float(placement.get("y") or 0), size)
        bubble["x"] = round(x, 2)
        bubble["y"] = round(y, 2)
        bubble["size"] = int(round(size))
        bubble["cluster_id"] = cluster_id
        bubble["cluster_x"] = round(center_x, 2)
        bubble["cluster_y"] = round(center_y, 2)
        bubble["local_x"] = round(x - center_x, 2)
        bubble["local_y"] = round(y - center_y, 2)
        bubble["orbit_center_id"] = center_id if bubble_id != center_id else ""
        bubble["orbit_ring"] = _safe_nonnegative_int(placement.get("orbit_ring"), 0)
        bubble["orbit_slot_index"] = _safe_nonnegative_int(placement.get("orbit_slot_index"), 0)
        if bubble_id != center_id:
            dx = x + size / 2 - center_x
            dy = y + size / 2 - center_y
            bubble["orbit_angle"] = round(math.atan2(dy, dx), 6)
            bubble["orbit_radius"] = round(math.sqrt(dx * dx + dy * dy), 2)
        else:
            bubble["orbit_angle"] = 0.0
            bubble["orbit_radius"] = 0.0
            bubble["orbit_order_key"] = 0.0
            bubble["orbit_slot_index"] = 0

    return {
        "id": cluster_id,
        "center_bubble_id": center_id,
        "x": round(center_x, 2),
        "y": round(center_y, 2),
        "radius": round(orbit_radius, 2),
        "rings": rings,
        "zone": _ideation_bubble_cluster_zone(cluster),
        "overlap_resolved_count": overlap_resolved_count,
        "bubble_ids": _dedup_preserve(bubble_ids, limit=IDEATION_BUBBLE_GRAPH_MAX_BUBBLES),
    }


def _apply_ideation_bubble_server_layout(graph: dict[str, Any]) -> None:
    graph["layout_mode"] = IDEATION_BUBBLE_GRAPH_LAYOUT_MODE
    visible = [
        bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _is_ideation_bubble_visible_state(bubble.get("display_state"))
    ]
    if not visible:
        graph["clusters"] = []
        graph["layout_overlap_resolved_count"] = 0
        graph["layout_revision"] = _safe_nonnegative_int(graph.get("layout_revision"), 0) + 1
        return

    max_count = max(1, *[_safe_nonnegative_int(bubble.get("count"), 1) for bubble in visible])
    clusters = _ideation_bubble_orbit_clusters(visible)
    graph["clusters"] = [
        _place_ideation_bubble_orbit_cluster(
            graph,
            cluster,
            _ideation_bubble_orbit_cluster_id(cluster, cluster_index),
            cluster_index,
            len(clusters),
            max_count,
        )
        for cluster_index, cluster in enumerate(clusters)
    ]
    graph["layout_overlap_resolved_count"] = sum(
        _safe_nonnegative_int(cluster.get("overlap_resolved_count"), 0)
        for cluster in graph.get("clusters") or []
        if isinstance(cluster, dict)
    )

    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        if not _is_ideation_bubble_visible_state(bubble.get("display_state")):
            bubble["cluster_id"] = _safe_text(bubble.get("cluster_id"))
            bubble["role"] = _normalize_ideation_bubble_role(bubble.get("role"))
            continue
        if bubble.get("x") is None or bubble.get("y") is None:
            size = max(1, _safe_nonnegative_int(bubble.get("size"), 96))
            x, y = _clamp_ideation_bubble_layout_xy(
                IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_X - size / 2,
                IDEATION_BUBBLE_GRAPH_LAYOUT_CENTER_Y - size / 2,
                size,
            )
            bubble["x"] = round(x, 2)
            bubble["y"] = round(y, 2)
            bubble["size"] = size
            bubble["cluster_x"] = round(x, 2)
            bubble["cluster_y"] = round(y, 2)
            bubble["local_x"] = 0.0
            bubble["local_y"] = 0.0
            bubble["role"] = _normalize_ideation_bubble_role(bubble.get("role"))
            bubble["orbit_center_id"] = _safe_text(bubble.get("orbit_center_id"))
            bubble["orbit_ring"] = _safe_nonnegative_int(bubble.get("orbit_ring"), 0)
            bubble["orbit_angle"] = _safe_float(bubble.get("orbit_angle"), 0.0)
            bubble["orbit_radius"] = _safe_float(bubble.get("orbit_radius"), 0.0)

    graph["layout_revision"] = _safe_nonnegative_int(graph.get("layout_revision"), 0) + 1


def _ensure_ideation_bubble_graph_server_layout(graph: dict[str, Any]) -> bool:
    visible = [
        bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _is_ideation_bubble_visible_state(bubble.get("display_state"))
    ]
    if not visible:
        return False

    core_ids = _ideation_bubble_core_ids(graph)
    _apply_ideation_bubble_layout_zones(graph, core_ids)
    demo_primary_ids = {
        _safe_text(bubble.get("id"))
        for bubble in visible
        if _safe_text(bubble.get("id")) in {DEMO_BALANCE_ANCHOR_A_ID, DEMO_BALANCE_ANCHOR_B_ID}
    }
    _apply_ideation_bubble_visual_state(
        graph,
        core_ids | demo_primary_ids,
        primary_ids=demo_primary_ids if demo_primary_ids else None,
    )
    graph["layout_mode"] = IDEATION_BUBBLE_GRAPH_LAYOUT_MODE
    needs_layout = any(
        not isinstance(bubble.get("x"), (int, float))
        or not isinstance(bubble.get("y"), (int, float))
        or not isinstance(bubble.get("size"), int)
        or not _safe_text(bubble.get("cluster_id"))
        or not _ideation_bubble_has_number(bubble.get("cluster_x"))
        or not _ideation_bubble_has_number(bubble.get("cluster_y"))
        or not _ideation_bubble_has_number(bubble.get("local_x"))
        or not _ideation_bubble_has_number(bubble.get("local_y"))
        or not _safe_text(bubble.get("role"))
        or not isinstance(bubble.get("orbit_ring"), int)
        or not _ideation_bubble_has_number(bubble.get("orbit_angle"))
        or not _ideation_bubble_has_number(bubble.get("orbit_radius"))
        for bubble in visible
    ) or not isinstance(graph.get("clusters"), list) or not graph.get("clusters")
    if not needs_layout:
        return False

    _apply_ideation_bubble_server_layout(graph)
    return True


def _demo_balance_bubble_side(bubble: dict[str, Any]) -> str:
    side = _safe_text(bubble.get("choice_affinity")).lower()
    return side if side in DEMO_BALANCE_DISPLAY_AFFINITIES else ""


def _demo_balance_bubble_texts(bubble: dict[str, Any]) -> list[str]:
    return _dedup_preserve(
        [
            _normalize_ideation_keyword_text(bubble.get("label")),
            _normalize_ideation_keyword_text(bubble.get("canonical_label")),
            *[
                _normalize_ideation_keyword_text(value)
                for value in (bubble.get("aliases") or [])
                if _normalize_ideation_keyword_text(value)
            ],
        ],
        limit=24,
    )


def _find_demo_balance_bubble_by_text_side(
    graph: dict[str, Any],
    text: Any,
    side: str,
    *,
    exclude_id: str = "",
) -> dict[str, Any] | None:
    text_key = _ideation_bubble_text_key(text)
    normalized_side = _safe_text(side).lower()
    if not text_key or normalized_side not in DEMO_BALANCE_DISPLAY_AFFINITIES:
        return None
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        if _safe_text(bubble.get("id")) == exclude_id:
            continue
        if _demo_balance_bubble_side(bubble) != normalized_side:
            continue
        if any(_ideation_bubble_text_key(value) == text_key for value in _demo_balance_bubble_texts(bubble)):
            return bubble
    return None


def _upsert_ideation_bubble_from_keyword(
    graph: dict[str, Any],
    keyword: dict[str, Any],
    rows: list[dict[str, str]],
    cycle: int,
    now: str,
    *,
    allow_single_support: bool = False,
    lifecycle_state: str = "active",
) -> str:
    _by_id, by_text = _ideation_bubble_graph_text_maps(graph)
    text = _normalize_ideation_keyword_text(keyword.get("text"))
    if not text:
        return ""
    alias_sources = [
        _normalize_ideation_keyword_text(value)
        for value in (keyword.get("alias_sources") or keyword.get("aliases") or [])
        if _normalize_ideation_keyword_text(value)
    ]
    alias_sources = [value for value in _dedup_preserve(alias_sources, limit=8) if value != text]
    keyword_side = _safe_text(keyword.get("choice_affinity") or keyword.get("choiceAffinity")).lower()
    bubble = (
        _find_demo_balance_bubble_by_text_side(graph, text, keyword_side)
        if keyword_side in DEMO_BALANCE_DISPLAY_AFFINITIES
        else by_text.get(_ideation_bubble_text_key(text))
    )
    if bubble is None:
        support_count = max(
            _safe_nonnegative_int(keyword.get("support_count"), 0),
            _safe_nonnegative_int(keyword.get("count"), 1),
        )
        if support_count < (1 if allow_single_support else 2):
            return ""
        bubble_id = (
            f"ideation-bubble-{keyword_side}-{_stable_short_id(text)}"
            if keyword_side in DEMO_BALANCE_DISPLAY_AFFINITIES
            else f"ideation-bubble-{_stable_short_id(text)}"
        )
        bubble = {
            "id": bubble_id,
            "label": text,
            "canonical_label": text,
            "aliases": alias_sources,
            "kind": "topic",
            "count": 0,
            "importance": 0.5,
            "relevance": 1.0,
            "activity": 0.0,
            "display_state": "active",
            "layout_zone": "default",
            "missing_cycles": 0,
            "anchor_id": _safe_text(keyword.get("anchor_id") or keyword.get("anchorId")),
            "choice_affinity": _safe_text(keyword.get("choice_affinity") or keyword.get("choiceAffinity")),
            "affinity_score": max(0.0, min(1.0, _safe_float(keyword.get("affinity_score") or keyword.get("affinityScore"), 0.0))),
            "needs_affinity_review": bool(keyword.get("needs_affinity_review") or keyword.get("needsAffinityReview")),
            "durable": False,
            "related_ids": [],
            "evidence_utterance_ids": [],
            "first_seen_at": now,
            "last_seen_at": "",
            "last_seen_cycle": 0,
            "off_topic": False,
            "off_topic_reason": "",
            "archive_reason": "",
            "lifecycle_state": "provisional" if lifecycle_state == "provisional" else "active",
        }
        graph.setdefault("bubbles", []).append(bubble)
    elif text != _safe_text(bubble.get("label")):
        aliases = _dedup_preserve([*(bubble.get("aliases") or []), text], limit=20)
        bubble["aliases"] = [value for value in aliases if value != _safe_text(bubble.get("label"))]
    if alias_sources:
        aliases = _dedup_preserve([*(bubble.get("aliases") or []), *alias_sources], limit=20)
        bubble["aliases"] = [value for value in aliases if value and value != _safe_text(bubble.get("label"))]

    kind = _safe_text(keyword.get("kind"), "topic").lower()
    off_topic = bool(keyword.get("off_topic") or kind == "off_topic")
    bubble["kind"] = "off_topic" if off_topic else kind if kind in {"entity", "topic", "relation", "action"} else "topic"
    bubble["off_topic"] = off_topic
    bubble["off_topic_reason"] = _safe_text(keyword.get("off_topic_reason")) if off_topic else ""
    bubble["count"] = max(1, _safe_nonnegative_int(bubble.get("count"), 0) + max(1, _safe_nonnegative_int(keyword.get("count"), 1) or 1))
    bubble["importance"] = max(
        _safe_float(bubble.get("importance"), 0.0),
        max(0.0, min(1.0, _safe_float(keyword.get("importance"), 0.65))),
    )
    bubble["relevance"] = max(
        0.0,
        min(
            1.0,
            _safe_float(bubble.get("relevance"), 0.8) * 0.35
            + max(0.0, min(1.0, _safe_float(keyword.get("relevance"), 1.0))) * 0.65,
        ),
    )
    bubble["activity"] = max(
        _safe_float(bubble.get("activity"), 0.0) * 0.35,
        max(0.28, min(1.0, _safe_float(keyword.get("importance"), 0.65))),
    )
    bubble["display_state"] = "active"
    bubble["lifecycle_state"] = "provisional" if lifecycle_state == "provisional" else "active"
    bubble["layout_zone"] = "core"
    choice_affinity = _safe_text(keyword.get("choice_affinity") or keyword.get("choiceAffinity") or bubble.get("choice_affinity")).lower()
    if choice_affinity in DEMO_BALANCE_AFFINITIES:
        bubble["choice_affinity"] = choice_affinity
        bubble["anchor_id"] = _safe_text(keyword.get("anchor_id") or keyword.get("anchorId")) or _demo_balance_anchor_id(choice_affinity)
        bubble["affinity_score"] = max(
            _safe_float(bubble.get("affinity_score"), 0.0),
            max(0.0, min(1.0, _safe_float(keyword.get("affinity_score") or keyword.get("affinityScore"), 0.0))),
        )
        bubble["needs_affinity_review"] = bool(keyword.get("needs_affinity_review") or keyword.get("needsAffinityReview"))
    bubble["missing_cycles"] = 0
    bubble["last_seen_at"] = now
    bubble["last_seen_cycle"] = cycle
    bubble["archive_reason"] = ""
    row_ids = [_safe_text(row.get("id")) for row in rows if _safe_text(row.get("id"))]
    bubble["evidence_utterance_ids"] = _dedup_preserve(
        [*(bubble.get("evidence_utterance_ids") or []), *row_ids],
        limit=80,
    )
    return _safe_text(bubble.get("id"))


def _rename_ideation_bubble(
    graph: dict[str, Any],
    source_text: str,
    target_text: str,
    cycle: int,
    reason: str = "",
    *,
    exiting: bool = False,
) -> str:
    _by_id, by_text = _ideation_bubble_graph_text_maps(graph)
    source = by_text.get(_ideation_bubble_text_key(source_text))
    if not source:
        return ""
    if _is_demo_balance_anchor_bubble(source):
        return _safe_text(source.get("id"))

    normalized_target = _normalize_ideation_keyword_text(target_text)
    if not normalized_target:
        return _safe_text(source.get("id"))

    existing_target = by_text.get(_ideation_bubble_text_key(normalized_target))
    if existing_target and existing_target is not source:
        if _is_demo_balance_anchor_bubble(existing_target):
            return _safe_text(source.get("id"))
        return _merge_ideation_bubbles(graph, source_text, normalized_target, cycle, exiting=exiting)

    previous_label = _safe_text(source.get("label"))
    aliases = _dedup_preserve(
        [
            previous_label,
            *(source.get("aliases") or []),
            source_text,
        ],
        limit=20,
    )
    source["label"] = normalized_target
    source["canonical_label"] = normalized_target
    source["aliases"] = [value for value in aliases if value and value != normalized_target]
    source["archive_reason"] = ""
    source["display_state"] = "active"
    source["activity"] = max(_safe_float(source.get("activity"), 0.0), 0.62)
    source["last_seen_cycle"] = max(_safe_nonnegative_int(source.get("last_seen_cycle"), 0), cycle)
    if reason:
        source["rename_reason"] = _truncate_text(reason, 120)
    return _safe_text(source.get("id"))


def _merge_ideation_bubbles(
    graph: dict[str, Any],
    source_text: str,
    target_text: str,
    cycle: int,
    *,
    exiting: bool = False,
) -> str:
    _by_id, by_text = _ideation_bubble_graph_text_maps(graph)
    source = by_text.get(_ideation_bubble_text_key(source_text))
    target = by_text.get(_ideation_bubble_text_key(target_text))
    if not source or not target or source is target:
        return _safe_text(target.get("id")) if target else ""
    if _is_demo_balance_anchor_bubble(source) or _is_demo_balance_anchor_bubble(target):
        return _safe_text(target.get("id"))

    target["count"] = max(1, _safe_nonnegative_int(target.get("count"), 1) + _safe_nonnegative_int(source.get("count"), 1))
    target["importance"] = max(_safe_float(target.get("importance"), 0.0), _safe_float(source.get("importance"), 0.0))
    target["relevance"] = max(_safe_float(target.get("relevance"), 0.0), _safe_float(source.get("relevance"), 0.0))
    target["activity"] = max(_safe_float(target.get("activity"), 0.0), _safe_float(source.get("activity"), 0.0), 0.55)
    target["aliases"] = _dedup_preserve(
        [
            *(target.get("aliases") or []),
            _safe_text(source.get("label")),
            *(source.get("aliases") or []),
        ],
        limit=20,
    )
    target["aliases"] = [value for value in target["aliases"] if value and value != _safe_text(target.get("label"))]
    target["evidence_utterance_ids"] = _dedup_preserve(
        [
            *(target.get("evidence_utterance_ids") or []),
            *(source.get("evidence_utterance_ids") or []),
        ],
        limit=80,
    )
    target["related_ids"] = _dedup_preserve(
        [
            *(target.get("related_ids") or []),
            *(source.get("related_ids") or []),
        ],
        limit=12,
    )
    source_id = _safe_text(source.get("id"))
    target_id = _safe_text(target.get("id"))
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        if _safe_text(bubble.get("anchor_id")) == source_id:
            bubble["anchor_id"] = target_id
        bubble["related_ids"] = [
            target_id if related_id == source_id else related_id
            for related_id in (bubble.get("related_ids") or [])
        ]
        bubble["related_ids"] = _dedup_preserve(
            [value for value in bubble["related_ids"] if value and value != _safe_text(bubble.get("id"))],
            limit=12,
        )
    _archive_ideation_bubble(source, cycle, "merged", exiting=exiting)
    return target_id


def _merge_ideation_bubbles_by_id(
    graph: dict[str, Any],
    source_id: str,
    target_id: str,
    cycle: int,
    *,
    exiting: bool = False,
) -> str:
    by_id, _by_text = _ideation_bubble_graph_text_maps(graph)
    source = by_id.get(_safe_text(source_id))
    target = by_id.get(_safe_text(target_id))
    if not source or not target or source is target:
        return _safe_text((target or {}).get("id"))
    if _is_demo_balance_anchor_bubble(source) or _is_demo_balance_anchor_bubble(target):
        return _safe_text(target.get("id"))

    target["count"] = max(1, _safe_nonnegative_int(target.get("count"), 1) + _safe_nonnegative_int(source.get("count"), 1))
    target["importance"] = max(_safe_float(target.get("importance"), 0.0), _safe_float(source.get("importance"), 0.0))
    target["relevance"] = max(_safe_float(target.get("relevance"), 0.0), _safe_float(source.get("relevance"), 0.0))
    target["activity"] = max(_safe_float(target.get("activity"), 0.0), _safe_float(source.get("activity"), 0.0), 0.55)
    target["aliases"] = _dedup_preserve(
        [
            *(target.get("aliases") or []),
            _safe_text(source.get("label")),
            _safe_text(source.get("canonical_label")),
            *(source.get("aliases") or []),
        ],
        limit=24,
    )
    target["aliases"] = [value for value in target["aliases"] if value and value != _safe_text(target.get("label"))]
    target["evidence_utterance_ids"] = _dedup_preserve(
        [
            *(target.get("evidence_utterance_ids") or []),
            *(source.get("evidence_utterance_ids") or []),
        ],
        limit=80,
    )
    target["related_ids"] = _dedup_preserve(
        [
            *(target.get("related_ids") or []),
            *(source.get("related_ids") or []),
        ],
        limit=12,
    )
    source_id = _safe_text(source.get("id"))
    target_id = _safe_text(target.get("id"))
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        if _safe_text(bubble.get("anchor_id")) == source_id:
            bubble["anchor_id"] = target_id
        bubble["related_ids"] = [
            target_id if related_id == source_id else related_id
            for related_id in (bubble.get("related_ids") or [])
        ]
        bubble["related_ids"] = _dedup_preserve(
            [value for value in bubble["related_ids"] if value and value != _safe_text(bubble.get("id"))],
            limit=12,
        )
    _archive_ideation_bubble(source, cycle, "merged", exiting=exiting)
    return target_id


def _rename_demo_balance_bubble_by_id(
    graph: dict[str, Any],
    bubble_id: str,
    target_text: str,
    cycle: int,
    *,
    exiting: bool = True,
) -> str:
    by_id, _by_text = _ideation_bubble_graph_text_maps(graph)
    bubble = by_id.get(_safe_text(bubble_id))
    if not bubble:
        return ""
    if _is_demo_balance_anchor_bubble(bubble):
        return _safe_text(bubble.get("id"))
    normalized_target = _normalize_ideation_keyword_text(target_text)
    if not normalized_target:
        return _safe_text(bubble.get("id"))
    side = _demo_balance_bubble_side(bubble)
    existing_target = _find_demo_balance_bubble_by_text_side(
        graph,
        normalized_target,
        side,
        exclude_id=_safe_text(bubble.get("id")),
    )
    if existing_target:
        return _merge_ideation_bubbles_by_id(
            graph,
            _safe_text(bubble.get("id")),
            _safe_text(existing_target.get("id")),
            cycle,
            exiting=exiting,
        )

    previous_label = _safe_text(bubble.get("label"))
    bubble["label"] = normalized_target
    bubble["canonical_label"] = normalized_target
    bubble["aliases"] = [
        value
        for value in _dedup_preserve(
            [previous_label, _safe_text(bubble.get("canonical_label")), *(bubble.get("aliases") or [])],
            limit=24,
        )
        if value and value != normalized_target
    ]
    bubble["archive_reason"] = ""
    bubble["display_state"] = "active"
    bubble["activity"] = max(_safe_float(bubble.get("activity"), 0.0), 0.62)
    bubble["last_seen_cycle"] = max(_safe_nonnegative_int(bubble.get("last_seen_cycle"), 0), cycle)
    bubble["rename_reason"] = "demo compact directive"
    return _safe_text(bubble.get("id"))


def _normalize_demo_balance_directive_side(raw: Any) -> str:
    side = _safe_text(raw).lower()
    if side in {"option_a", "a_choice", "left"}:
        return "a"
    if side in {"option_b", "b_choice", "right"}:
        return "b"
    return side if side in DEMO_BALANCE_DISPLAY_AFFINITIES else ""


def _demo_balance_has_compact_id_directives(parsed: Any) -> bool:
    return isinstance(parsed, dict) and any(key in parsed for key in ("rename", "merge", "remove", "move"))


def _resolve_demo_balance_llm_bubble_id(raw: Any, id_map: dict[str, str] | None = None) -> str:
    bubble_id = _safe_text(raw)
    if not bubble_id:
        return ""
    return _safe_text((id_map or {}).get(bubble_id) or bubble_id)


def _apply_demo_balance_compact_id_directives(
    graph: dict[str, Any],
    parsed: Any,
    cycle: int,
    *,
    id_map: dict[str, str] | None = None,
    metrics: dict[str, int] | None = None,
) -> set[str]:
    if not isinstance(parsed, dict):
        return set()
    touched_ids: set[str] = set()

    def _bump(key: str, amount: int = 1) -> None:
        if metrics is not None:
            metrics[key] = _safe_nonnegative_int(metrics.get(key), 0) + max(0, amount)

    raw_renames = parsed.get("rename") or []
    if isinstance(raw_renames, list):
        for item in raw_renames[:12]:
            if not isinstance(item, dict):
                continue
            bubble_id = _resolve_demo_balance_llm_bubble_id(
                item.get("id") or item.get("bubble_id") or item.get("bubbleId"),
                id_map,
            )
            label = _normalize_ideation_keyword_text(item.get("label") or item.get("text") or item.get("target"))
            if not bubble_id or not label:
                continue
            changed_id = _rename_demo_balance_bubble_by_id(graph, bubble_id, label, cycle, exiting=True)
            if changed_id:
                touched_ids.add(changed_id)
                _bump("rename_count")

    raw_merges = parsed.get("merge") or []
    if isinstance(raw_merges, list):
        for item in raw_merges[:12]:
            if not isinstance(item, dict):
                continue
            from_id = _resolve_demo_balance_llm_bubble_id(
                item.get("from")
                or item.get("from_id")
                or item.get("fromId")
                or item.get("source")
                or item.get("source_id")
                or item.get("sourceId"),
                id_map,
            )
            to_id = _resolve_demo_balance_llm_bubble_id(
                item.get("to")
                or item.get("to_id")
                or item.get("toId")
                or item.get("target")
                or item.get("target_id")
                or item.get("targetId"),
                id_map,
            )
            by_id, _by_text = _ideation_bubble_graph_text_maps(graph)
            source = by_id.get(from_id)
            target = by_id.get(to_id)
            if not source or not target or source is target:
                continue
            if _demo_balance_bubble_side(source) != _demo_balance_bubble_side(target):
                _bump("cross_side_merge_ignored_count")
                continue
            changed_id = _merge_ideation_bubbles_by_id(graph, from_id, to_id, cycle, exiting=True)
            if changed_id:
                touched_ids.add(changed_id)
                _bump("merge_count")

    raw_moves = parsed.get("move") or []
    if isinstance(raw_moves, list):
        for item in raw_moves[:12]:
            if not isinstance(item, dict):
                continue
            bubble_id = _resolve_demo_balance_llm_bubble_id(
                item.get("id") or item.get("bubble_id") or item.get("bubbleId"),
                id_map,
            )
            target_side = _normalize_demo_balance_directive_side(item.get("side") or item.get("target") or item.get("choice_affinity"))
            if not bubble_id or target_side not in DEMO_BALANCE_DISPLAY_AFFINITIES:
                continue
            by_id, _by_text = _ideation_bubble_graph_text_maps(graph)
            bubble = by_id.get(bubble_id)
            if not bubble or _is_demo_balance_anchor_bubble(bubble):
                continue
            if _demo_balance_bubble_side(bubble) == target_side:
                continue
            target = None
            for text in _demo_balance_bubble_texts(bubble):
                target = _find_demo_balance_bubble_by_text_side(graph, text, target_side, exclude_id=bubble_id)
                if target:
                    break
            if target:
                changed_id = _merge_ideation_bubbles_by_id(
                    graph,
                    bubble_id,
                    _safe_text(target.get("id")),
                    cycle,
                    exiting=True,
                )
                if changed_id:
                    touched_ids.add(changed_id)
                    _bump("merge_count")
                    _bump("move_count")
                continue
            bubble["choice_affinity"] = target_side
            bubble["anchor_id"] = _demo_balance_anchor_id(target_side)
            bubble["affinity_score"] = max(_safe_float(bubble.get("affinity_score"), 0.0), 0.86)
            bubble["needs_affinity_review"] = False
            bubble["display_state"] = "active"
            bubble["activity"] = max(_safe_float(bubble.get("activity"), 0.0), 0.58)
            bubble["last_seen_cycle"] = max(_safe_nonnegative_int(bubble.get("last_seen_cycle"), 0), cycle)
            bubble["orbit_order_key"] = None
            bubble["orbit_slot_index"] = None
            touched_ids.add(bubble_id)
            _bump("move_count")

    raw_removes = parsed.get("remove") or []
    protected_ids = _demo_balance_minimum_side_protected_ids(graph)
    if isinstance(raw_removes, list):
        by_id, _by_text = _ideation_bubble_graph_text_maps(graph)
        for item in raw_removes[:12]:
            bubble_id = _resolve_demo_balance_llm_bubble_id(
                item.get("id") if isinstance(item, dict) else item,
                id_map,
            )
            bubble = by_id.get(bubble_id)
            if not bubble or _is_demo_balance_anchor_bubble(bubble):
                continue
            if bubble_id in protected_ids and not bool(bubble.get("off_topic")):
                _bump("protected_remove_ignored_count")
                continue
            _archive_ideation_bubble(bubble, cycle, "llm_remove", exiting=True)
            _bump("remove_count")

    return touched_ids


def _mark_demo_balance_overflow_bubbles_exiting(
    graph: dict[str, Any],
    cycle: int,
    core_ids: set[str],
    protected_ids: set[str] | None = None,
) -> None:
    protected_ids = protected_ids or set()
    visible = [
        bubble
        for bubble in (graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _is_ideation_bubble_visible_state(bubble.get("display_state"))
    ]
    overflow = len(visible) - DEMO_BALANCE_BUBBLE_GRAPH_VISIBLE_CAP
    if overflow <= 0:
        return

    def removal_rank(bubble: dict[str, Any]) -> tuple[int, float, str]:
        bubble_id = _safe_text(bubble.get("id"))
        protected = (
            ((bubble_id in core_ids or bubble_id in protected_ids) and not bool(bubble.get("off_topic")))
            or _is_demo_balance_anchor_bubble(bubble)
        )
        recent = 1.0 / max(1, _safe_nonnegative_int(bubble.get("missing_cycles"), 0) + 1)
        score = (
            _safe_float(bubble.get("activity"), 0.0) * 0.34
            + _safe_float(bubble.get("relevance"), 0.0) * 0.24
            + _safe_float(bubble.get("importance"), 0.0) * 0.24
            + min(1.0, _safe_nonnegative_int(bubble.get("count"), 1) / 5) * 0.12
            + recent * 0.06
        )
        if bool(bubble.get("off_topic")):
            score -= 0.35
        if _safe_text(bubble.get("lifecycle_state")).lower() == "provisional":
            score -= 0.08
        return (1 if protected else 0, score, _safe_text(bubble.get("label")))

    for bubble in sorted(visible, key=removal_rank)[:overflow]:
        _archive_ideation_bubble(bubble, cycle, "demo_overflow", exiting=True)


def _apply_demo_balance_local_provisional_cleanup(
    graph: dict[str, Any],
    touched_ids: set[str],
    core_ids: set[str],
    cycle: int,
    protected_ids: set[str] | None = None,
) -> int:
    protected_ids = protected_ids or set()
    cleaned = 0
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        bubble_id = _safe_text(bubble.get("id"))
        if not bubble_id or bubble_id in touched_ids:
            continue
        if not _is_ideation_bubble_visible_state(bubble.get("display_state")):
            continue
        if _is_demo_balance_anchor_bubble(bubble):
            bubble["missing_cycles"] = 0
            continue
        if _safe_text(bubble.get("lifecycle_state")).lower() != "provisional":
            continue
        if bubble_id in core_ids and _safe_nonnegative_int(bubble.get("count"), 1) >= 3:
            continue
        if bubble_id in protected_ids and not bool(bubble.get("off_topic")):
            bubble["missing_cycles"] = 0
            bubble["display_state"] = "active"
            continue

        missing_cycles = _safe_nonnegative_int(bubble.get("missing_cycles"), 0) + 1
        bubble["missing_cycles"] = missing_cycles
        bubble["activity"] = max(0.0, min(1.0, _safe_float(bubble.get("activity"), 0.0) * 0.72))
        weak_score = (
            _safe_float(bubble.get("importance"), 0.0) * 0.36
            + _safe_float(bubble.get("relevance"), 0.0) * 0.34
            + min(1.0, _safe_nonnegative_int(bubble.get("count"), 1) / 4) * 0.3
        )
        if missing_cycles >= 3 or (missing_cycles >= 2 and weak_score < 0.62):
            _archive_ideation_bubble(bubble, cycle, "demo_local_cleanup", exiting=True)
            cleaned += 1
        elif missing_cycles >= 2:
            bubble["display_state"] = "dimmed"
    return cleaned


def _demo_balance_minimum_side_protected_ids(graph: dict[str, Any]) -> set[str]:
    protected: set[str] = set()
    by_side: dict[str, list[dict[str, Any]]] = {"a": [], "b": []}
    for bubble in graph.get("bubbles") or []:
        if not isinstance(bubble, dict):
            continue
        if _is_demo_balance_anchor_bubble(bubble):
            continue
        if bool(bubble.get("off_topic")):
            continue
        if not _is_ideation_bubble_visible_state(bubble.get("display_state")):
            continue
        affinity = _safe_text(bubble.get("choice_affinity")).lower()
        if affinity not in DEMO_BALANCE_DISPLAY_AFFINITIES:
            continue
        by_side[affinity].append(bubble)

    def keep_rank(bubble: dict[str, Any]) -> tuple[float, int, str]:
        recent = 1.0 / max(1, _safe_nonnegative_int(bubble.get("missing_cycles"), 0) + 1)
        score = (
            _safe_float(bubble.get("activity"), 0.0) * 0.34
            + _safe_float(bubble.get("relevance"), 0.0) * 0.24
            + _safe_float(bubble.get("importance"), 0.0) * 0.2
            + min(1.0, _safe_nonnegative_int(bubble.get("count"), 1) / 5) * 0.16
            + recent * 0.06
        )
        return (score, _safe_nonnegative_int(bubble.get("count"), 1), _safe_text(bubble.get("label")))

    for bubbles in by_side.values():
        for bubble in sorted(bubbles, key=keep_rank, reverse=True)[:DEMO_BALANCE_MIN_VISIBLE_PER_SIDE]:
            bubble_id = _safe_text(bubble.get("id"))
            if bubble_id:
                protected.add(bubble_id)
    return protected


def _apply_ideation_bubble_graph_update(
    graph: dict[str, Any],
    rows: list[dict[str, str]],
    keywords: list[dict[str, Any]],
    rename_keywords: list[dict[str, str]],
    merge_keywords: list[dict[str, str]],
    remove_keywords: list[str],
    *,
    allow_single_support: bool = False,
    decay_profile: str = "normal",
    apply_decay: bool = True,
    mark_processed: bool = True,
    demo_local_cleanup: bool = False,
    primary_keyword_texts: list[str] | None = None,
    affinity_updates: list[dict[str, Any]] | None = None,
    demo_id_directives: dict[str, Any] | None = None,
    demo_id_map: dict[str, str] | None = None,
    metrics: dict[str, int] | None = None,
) -> dict[str, Any]:
    next_graph = _normalize_canvas_ideation_bubble_graph(graph)
    if decay_profile == "demo_balance":
        _prune_exiting_ideation_bubbles(next_graph)
    previous_primary_ids = {
        _safe_text(bubble.get("id"))
        for bubble in (next_graph.get("bubbles") or [])
        if isinstance(bubble, dict)
        and _safe_text(bubble.get("id"))
        and _safe_text(bubble.get("emphasis")) == "primary"
    }
    cycle = _safe_nonnegative_int(next_graph.get("update_cycle"), 0) + 1
    now = _now_ts()
    touched_ids: set[str] = set()
    lifecycle_state = "provisional" if decay_profile == "demo_balance" and not mark_processed else "active"

    for keyword in keywords:
        bubble_id = _upsert_ideation_bubble_from_keyword(
            next_graph,
            keyword,
            rows,
            cycle,
            now,
            allow_single_support=allow_single_support,
            lifecycle_state=lifecycle_state,
        )
        if bubble_id:
            touched_ids.add(bubble_id)

    if decay_profile == "demo_balance" and demo_id_directives:
        touched_ids.update(
            _apply_demo_balance_compact_id_directives(
                next_graph,
                demo_id_directives,
                cycle,
                id_map=demo_id_map,
                metrics=metrics,
            )
        )

    for directive in rename_keywords:
        bubble_id = _rename_ideation_bubble(
            next_graph,
            _safe_text(directive.get("source")),
            _safe_text(directive.get("target")),
            cycle,
            _safe_text(directive.get("reason")),
            exiting=decay_profile == "demo_balance",
        )
        if bubble_id:
            touched_ids.add(bubble_id)

    for directive in merge_keywords:
        target_id = _merge_ideation_bubbles(
            next_graph,
            _safe_text(directive.get("source")),
            _safe_text(directive.get("target")),
            cycle,
            exiting=decay_profile == "demo_balance",
        )
        if target_id:
            touched_ids.add(target_id)

    if decay_profile == "demo_balance":
        _normalize_demo_balance_graph_affinities(next_graph)

    _by_id, by_text = _ideation_bubble_graph_text_maps(next_graph)
    protected_minimum_ids = _demo_balance_minimum_side_protected_ids(next_graph) if decay_profile == "demo_balance" else set()
    for text in remove_keywords:
        bubble = by_text.get(_ideation_bubble_text_key(text))
        bubble_id = _safe_text((bubble or {}).get("id"))
        protected = bubble_id in protected_minimum_ids and not bool((bubble or {}).get("off_topic"))
        if bubble and bubble_id not in touched_ids and not protected and not _is_demo_balance_anchor_bubble(bubble):
            _archive_ideation_bubble(bubble, cycle, "llm_remove", exiting=decay_profile == "demo_balance")

    affinity_update_count = 0
    if decay_profile == "demo_balance" and affinity_updates:
        affinity_update_count = _apply_demo_balance_affinity_updates(next_graph, affinity_updates, cycle)
        _normalize_demo_balance_graph_affinities(next_graph)
        if metrics is not None:
            metrics["affinity_update_count"] = affinity_update_count

    _by_id, by_text = _ideation_bubble_graph_text_maps(next_graph)
    for keyword in keywords:
        keyword_side = _safe_text(keyword.get("choice_affinity") or keyword.get("choiceAffinity")).lower()
        current = (
            _find_demo_balance_bubble_by_text_side(next_graph, keyword.get("text"), keyword_side)
            if decay_profile == "demo_balance" and keyword_side in DEMO_BALANCE_DISPLAY_AFFINITIES
            else by_text.get(_ideation_bubble_text_key(keyword.get("text")))
        )
        if not current:
            continue
        current_id = _safe_text(current.get("id"))
        related_ids = [
            _safe_text((by_text.get(_ideation_bubble_text_key(value)) or {}).get("id"))
            for value in (keyword.get("related") or [])
        ]
        current["related_ids"] = _dedup_preserve(
            [
                *(current.get("related_ids") or []),
                *[value for value in related_ids if value and value != current_id],
            ],
            limit=12,
        )
        anchor = by_text.get(_ideation_bubble_text_key(keyword.get("anchor")))
        if anchor and _safe_text(anchor.get("id")) != current_id:
            current["anchor_id"] = _safe_text(anchor.get("id"))

    explicit_primary_ids: set[str] | None = None
    if primary_keyword_texts is not None:
        explicit_primary_ids = _resolve_ideation_primary_keyword_ids(
            next_graph,
            primary_keyword_texts,
            limit=4,
        )

    core_ids = _ideation_bubble_core_ids(next_graph)
    if explicit_primary_ids is not None:
        core_ids = {*core_ids, *explicit_primary_ids}
    protected_minimum_ids = _demo_balance_minimum_side_protected_ids(next_graph) if decay_profile == "demo_balance" else set()
    if apply_decay:
        if decay_profile == "demo_balance":
            _apply_ideation_bubble_decay(
                next_graph,
                touched_ids,
                {*core_ids, *protected_minimum_ids},
                cycle,
                dim_cycles=1,
                archive_cycles=3,
                off_topic_archive_cycles=1,
                exit_before_archive=True,
            )
        else:
            _apply_ideation_bubble_decay(next_graph, touched_ids, core_ids, cycle)
        _prune_archived_ideation_bubbles(next_graph)
    core_ids = _ideation_bubble_core_ids(next_graph)
    if decay_profile == "demo_balance" and demo_local_cleanup:
        protected_minimum_ids = _demo_balance_minimum_side_protected_ids(next_graph)
        cleaned_count = _apply_demo_balance_local_provisional_cleanup(
            next_graph,
            touched_ids,
            core_ids,
            cycle,
            protected_minimum_ids,
        )
        if metrics is not None:
            metrics["local_cleanup_count"] = cleaned_count
        if cleaned_count:
            core_ids = _ideation_bubble_core_ids(next_graph)
            if explicit_primary_ids is not None:
                explicit_primary_ids = {
                    bubble_id
                    for bubble_id in explicit_primary_ids
                    if any(
                        isinstance(item, dict)
                        and _safe_text(item.get("id")) == bubble_id
                        and _is_ideation_bubble_visible_state(item.get("display_state"))
                        for item in (next_graph.get("bubbles") or [])
                    )
                }
                core_ids = {*core_ids, *explicit_primary_ids}
    if decay_profile == "demo_balance":
        protected_minimum_ids = _demo_balance_minimum_side_protected_ids(next_graph)
        _mark_demo_balance_overflow_bubbles_exiting(next_graph, cycle, core_ids, protected_minimum_ids)
    _apply_ideation_bubble_layout_zones(next_graph, core_ids)
    _apply_ideation_bubble_visual_state(next_graph, core_ids, primary_ids=explicit_primary_ids)
    if explicit_primary_ids is not None and metrics is not None:
        current_primary_ids = {
            _safe_text(bubble.get("id"))
            for bubble in (next_graph.get("bubbles") or [])
            if isinstance(bubble, dict) and _safe_text(bubble.get("emphasis")) == "primary"
        }
        metrics["primary_count"] = len(current_primary_ids)
        metrics["promote_count"] = len(current_primary_ids - previous_primary_ids)
        metrics["demote_count"] = len(previous_primary_ids - current_primary_ids)
    _apply_ideation_bubble_server_layout(next_graph)
    if mark_processed:
        processed_ids = _dedup_preserve(
            [
                *(next_graph.get("processed_utterance_ids") or []),
                *[_safe_text(row.get("id")) for row in rows if _safe_text(row.get("id"))],
            ],
            limit=IDEATION_BUBBLE_GRAPH_PROCESSED_IDS_LIMIT,
        )
        next_graph["processed_utterance_ids"] = processed_ids
    next_graph["update_cycle"] = cycle
    next_graph["updated_at"] = now

    def sort_key(item: dict[str, Any]) -> tuple[int, int, float, str]:
        state_rank = {"active": 0, "dimmed": 1, "exiting": 2, "archived": 3}.get(
            _normalize_ideation_bubble_state(item.get("display_state")),
            3,
        )
        return (
            state_rank,
            -_safe_nonnegative_int(item.get("count"), 1),
            -_safe_float(item.get("importance"), 0.0),
            _safe_text(item.get("label")),
        )

    next_graph["bubbles"] = sorted(
        [item for item in (next_graph.get("bubbles") or []) if isinstance(item, dict)],
        key=sort_key,
    )[:IDEATION_BUBBLE_GRAPH_MAX_BUBBLES]
    return _normalize_canvas_ideation_bubble_graph(next_graph)


def _summary_document_status_label(status: str) -> str:
    if status == "final":
        return "확정"
    if status == "review":
        return "검토 중"
    return "초안"


def _summary_document_source_signature(groups: list[dict[str, Any]]) -> str:
    signature_payload = [
        {
            "id": group.get("group_id"),
            "title": group.get("title"),
            "status": group.get("status"),
            "rationale": group.get("rationale"),
            "nodes": [
                {
                    "id": node.get("id"),
                    "title": node.get("title"),
                    "body": node.get("body"),
                    "source_group_id": node.get("source_group_id"),
                }
                for node in group.get("nodes") or []
            ],
        }
        for group in groups
    ]
    return _stable_short_id(_canvas_llm_signature({"version": 1, "groups": signature_payload}))


def _summary_document_groups(payload: SummaryDocumentGenerateInput, workspace: dict[str, Any]) -> list[dict[str, Any]]:
    node_by_id: dict[str, dict[str, Any]] = {}
    for node in payload.nodes or []:
        node_id = _safe_text(node.id)
        title = _safe_text(node.title)
        body = _safe_text(node.body)
        if not node_id or not (title or body):
            continue
        node_by_id[node_id] = {
            "id": node_id,
            "source_group_id": _safe_text(node.source_group_id),
            "title": title or "구조화 노드",
            "body": body,
            "status": _safe_text(node.status, "draft"),
            "depth": int(node.depth or 0),
        }

    problem_group_by_id = {
        _safe_text(group.get("group_id")): group
        for group in (workspace.get("problem_groups") or [])
        if isinstance(group, dict) and _safe_text(group.get("group_id"))
    }

    groups: list[dict[str, Any]] = []
    for index, group in enumerate(payload.groups or [], start=1):
        status = _safe_text(group.status, "draft")
        if status not in {"draft", "review", "final"}:
            status = "draft"
        group_nodes = [node_by_id[node_id] for node_id in group.node_ids if node_id in node_by_id]
        if not group_nodes and not _safe_text(group.title):
            continue

        source_group_ids = _dedup_preserve(
            [_safe_text(node.get("source_group_id")) for node in group_nodes if _safe_text(node.get("source_group_id"))],
            limit=80,
        )
        source_summary_items: list[str] = []
        evidence_utterance_ids: list[str] = []
        for source_group_id in source_group_ids:
            source_group = problem_group_by_id.get(source_group_id)
            if not isinstance(source_group, dict):
                continue
            source_summary_items.extend(
                _safe_text(item)
                for item in (source_group.get("source_summary_items") or [])
                if _safe_text(item)
            )
            evidence_utterance_ids.extend(
                _safe_text(item)
                for item in (source_group.get("evidence_utterance_ids") or [])
                if _safe_text(item)
            )

        groups.append(
            {
                "group_id": _safe_text(group.id) or f"summary-group-{index}",
                "title": _safe_text(group.title) or f"정리 항목 {index}",
                "status": status,
                "status_label": _summary_document_status_label(status),
                "rationale": _safe_text(group.rationale),
                "created_by": _safe_text(group.created_by, "user"),
                "nodes": group_nodes[:80],
                "source_group_ids": source_group_ids,
                "source_summary_items": _dedup_preserve(source_summary_items, limit=12),
                "evidence_utterance_ids": _dedup_preserve(evidence_utterance_ids, limit=80),
            }
        )

    return groups[:24]


def _summary_document_group_tokens(group: dict[str, Any]) -> set[str]:
    text = " ".join(
        [
            _safe_text(group.get("title")),
            _safe_text(group.get("rationale")),
            " ".join(_safe_text(item) for item in group.get("source_summary_items") or []),
            " ".join(
                f"{_safe_text(node.get('title'))} {_safe_text(node.get('body'))}"
                for node in group.get("nodes") or []
                if isinstance(node, dict)
            ),
        ]
    )
    return set(_problem_taxonomy_tokens(text))


def _summary_document_evidence_for_group(rows: list[dict[str, str]], group: dict[str, Any]) -> list[dict[str, str]]:
    evidence_ids = {_safe_text(item) for item in (group.get("evidence_utterance_ids") or []) if _safe_text(item)}
    tokens = _summary_document_group_tokens(group)
    scored: list[tuple[int, int, dict[str, str]]] = []
    for index, row in enumerate(rows):
        text = _safe_text(row.get("text"))
        if not text:
            continue
        row_id = _safe_text(row.get("id"))
        score = 8 if row_id and row_id in evidence_ids else 0
        if tokens:
            score += len(tokens & set(_problem_taxonomy_tokens(text)))
        if score <= 0:
            continue
        scored.append((score, index, row))

    if not scored:
        return []

    evidence: list[dict[str, str]] = []
    seen: set[str] = set()
    for _score, _index, row in sorted(scored, key=lambda item: (-item[0], item[1])):
        key = _safe_text(row.get("id")) or _safe_text(row.get("text"))
        if not key or key in seen:
            continue
        seen.add(key)
        evidence.append(
            {
                "utterance_id": _safe_text(row.get("id")),
                "speaker": _safe_text(row.get("speaker"), "참가자"),
                "timestamp": _safe_text(row.get("timestamp")),
                "text": _truncate_text(row.get("text"), 220),
            }
        )
        if len(evidence) >= 5:
            break
    return evidence


def _summary_document_sections(groups: list[dict[str, Any]], rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [
        {
            "group_id": _safe_text(group.get("group_id")),
            "title": _safe_text(group.get("title"), "요약 그룹"),
            "status": _safe_text(group.get("status"), "draft"),
            "status_label": _safe_text(group.get("status_label"), _summary_document_status_label(_safe_text(group.get("status")))),
            "rationale": _safe_text(group.get("rationale")),
            "node_titles": [
                _safe_text(node.get("title"))
                for node in group.get("nodes") or []
                if isinstance(node, dict) and _safe_text(node.get("title"))
            ][:40],
            "evidence": _summary_document_evidence_for_group(rows, group),
        }
        for group in groups
    ]


def _summary_document_group_bullets(group: dict[str, Any], limit: int = 5) -> list[str]:
    node_points = [
        _safe_text(node.get("body") or node.get("title"))
        for node in group.get("nodes") or []
        if isinstance(node, dict) and _safe_text(node.get("body") or node.get("title"))
    ]
    source_items = [_safe_text(item) for item in group.get("source_summary_items") or [] if _safe_text(item)]
    rationale = _safe_text(group.get("rationale"))
    return [_to_summary_point(item, max_len=None) for item in _dedup_preserve([*source_items, *node_points, rationale], limit=limit)]


def _summary_table_default_columns(block_id: str) -> list[dict[str, str]]:
    return [
        {"id": f"col-{_stable_short_id(f'{block_id}:item')}", "title": "항목", "type": "text"},
        {"id": f"col-{_stable_short_id(f'{block_id}:content')}", "title": "내용", "type": "text"},
    ]


def _normalize_summary_table_columns(raw_columns: Any, block_id: str) -> list[dict[str, str]]:
    if not isinstance(raw_columns, list):
        return _summary_table_default_columns(block_id)
    columns: list[dict[str, str]] = []
    used_ids: set[str] = set()
    for index, column in enumerate(raw_columns[:8]):
        raw_id = ""
        column_type = "text"
        if isinstance(column, dict):
            title = _safe_text(
                column.get("title")
                or column.get("name")
                or column.get("header")
                or column.get("text")
                or column.get("id")
            )
            raw_id = _safe_text(column.get("id"))
            column_type = _safe_text(column.get("type"), "text")
        else:
            title = _safe_text(column)
        if not title:
            continue
        column_id = raw_id or f"col-{_stable_short_id(f'{block_id}:{index}:{title}')}"
        if column_id in used_ids:
            column_id = f"{column_id}-{index}"
        used_ids.add(column_id)
        columns.append({"id": column_id, "title": title, "type": column_type})
    return columns or _summary_table_default_columns(block_id)


def _blank_summary_table_row(columns: list[dict[str, str]], row_id: str) -> dict[str, Any]:
    return {
        "id": row_id,
        "cells": {_safe_text(column.get("id")): "" for column in columns if _safe_text(column.get("id"))},
    }


def _normalize_summary_table_rows(raw_rows: Any, columns: list[dict[str, str]], block_id: str) -> list[dict[str, Any]]:
    if not isinstance(raw_rows, list):
        return [_blank_summary_table_row(columns, f"row-{_stable_short_id(f'{block_id}:blank')}")]
    rows: list[dict[str, Any]] = []
    for row_index, row in enumerate(raw_rows):
        raw_id = ""
        cells: dict[str, str] = {}
        if isinstance(row, list):
            for cell_index, column in enumerate(columns):
                column_id = _safe_text(column.get("id"))
                if not column_id:
                    continue
                cells[column_id] = _safe_text(row[cell_index] if cell_index < len(row) else "")
        elif isinstance(row, dict):
            raw_id = _safe_text(row.get("id"))
            source_cells = row.get("cells") if isinstance(row.get("cells"), dict) else row
            if not isinstance(source_cells, dict):
                continue
            for column in columns:
                column_id = _safe_text(column.get("id"))
                column_title = _safe_text(column.get("title"))
                if not column_id:
                    continue
                cells[column_id] = _safe_text(source_cells.get(column_id) or source_cells.get(column_title))
        else:
            continue
        if not any(_safe_text(value) for value in cells.values()):
            continue
        row_id = raw_id or f"row-{_stable_short_id(f'{block_id}:{row_index}:{json.dumps(cells, ensure_ascii=False, sort_keys=True)}')}"
        rows.append({"id": row_id, "cells": cells})
        if len(rows) >= 40:
            break
    return rows or [_blank_summary_table_row(columns, f"row-{_stable_short_id(f'{block_id}:blank')}")]


def _normalize_summary_document_blocks(
    raw_blocks: Any,
    structured: dict[str, Any] | None = None,
    markdown: str = "",
) -> list[dict[str, Any]]:
    placeholder_texts = {
        "...",
        "…",
        "-",
        "실제 회의 흐름에 근거한 항목",
        "회의에서 실제로 정리된 방향",
        "회의에서 실제로 남은 질문",
        "짧은 핵심 논의",
        "그 논의가 나온 근거",
    }

    def stable_block_id(prefix: str, seed: str) -> str:
        return f"{prefix}-{_stable_short_id(seed or prefix)}"

    def is_placeholder_text(value: Any) -> bool:
        text = _safe_text(value)
        return not text or text in placeholder_texts

    def filter_meaningful_table_rows(
        rows: list[dict[str, Any]],
        columns: list[dict[str, str]],
    ) -> list[dict[str, Any]]:
        status_ids = {
            _safe_text(column.get("id"))
            for column in columns
            if _safe_text(column.get("title")) == "상태" or _safe_text(column.get("id")) == "col-status"
        }
        next_rows: list[dict[str, Any]] = []
        for row in rows:
            cells = row.get("cells") if isinstance(row, dict) and isinstance(row.get("cells"), dict) else {}
            has_content = any(
                not is_placeholder_text(value)
                for key, value in cells.items()
                if _safe_text(key) not in status_ids
            )
            if has_content:
                next_rows.append(row)
        return next_rows

    def block_has_content(block: dict[str, Any]) -> bool:
        block_type = _safe_text(block.get("type"))
        if block_type == "paragraph":
            return not is_placeholder_text(block.get("text"))
        if block_type == "bullets":
            return any(not is_placeholder_text(item) for item in block.get("items") or [])
        if block_type == "table":
            rows = block.get("rows") if isinstance(block.get("rows"), list) else []
            columns = block.get("columns") if isinstance(block.get("columns"), list) else []
            return bool(filter_meaningful_table_rows(rows, columns))
        return block_type == "heading" and not is_placeholder_text(block.get("text"))

    def prune_empty_sections(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        cleaned: list[dict[str, Any]] = []
        for index, block in enumerate(blocks):
            block_type = _safe_text(block.get("type"))
            if block_type == "table":
                columns = block.get("columns") if isinstance(block.get("columns"), list) else []
                rows = block.get("rows") if isinstance(block.get("rows"), list) else []
                next_rows = filter_meaningful_table_rows(rows, columns)
                if not next_rows:
                    continue
                block = {**block, "rows": next_rows}
            elif block_type == "bullets":
                items = [item for item in block.get("items") or [] if not is_placeholder_text(item)]
                if not items:
                    continue
                block = {**block, "items": items}
            elif block_type == "paragraph" and is_placeholder_text(block.get("text")):
                continue

            if block_type == "heading":
                level = _safe_nonnegative_int(block.get("level"), 2) or 2
                if level > 1:
                    has_section_content = False
                    for next_block in blocks[index + 1:]:
                        next_type = _safe_text(next_block.get("type"))
                        if next_type == "heading":
                            next_level = _safe_nonnegative_int(next_block.get("level"), 2) or 2
                            if next_level <= level:
                                break
                        if block_has_content(next_block) and next_type != "heading":
                            has_section_content = True
                            break
                    if not has_section_content:
                        continue
            cleaned.append(block)

        deduped: list[dict[str, Any]] = []
        for index, block in enumerate(cleaned):
            block_type = _safe_text(block.get("type"))
            if block_type == "heading":
                level = _safe_nonnegative_int(block.get("level"), 2) or 2
                if level > 1:
                    next_block = next((item for item in cleaned[index + 1:] if _safe_text(item.get("type")) != "paragraph"), None)
                    next_title = _safe_text(next_block.get("title")) if isinstance(next_block, dict) and _safe_text(next_block.get("type")) == "table" else ""
                    if next_title and _safe_text(block.get("text")) == next_title:
                        continue
                    previous = deduped[-1] if deduped else None
                    if isinstance(previous, dict) and _safe_text(previous.get("type")) == "heading" and _safe_text(previous.get("text")) == _safe_text(block.get("text")):
                        continue
            deduped.append(block)
        return deduped

    def normalize_table_title(value: Any) -> str:
        title = _safe_text(value)
        return "핵심 논의 사항" if title in {"핵심 결정 사항", "핵심결정사항"} else title

    def compact_table_cell(value: Any, limit: int) -> str:
        text = re.sub(r"\s+", " ", _safe_text(value)).strip()
        return _truncate_text(text, limit)

    def normalize_discussion_table(
        block_id: str,
        title: str,
        columns: list[dict[str, str]],
        rows: list[dict[str, Any]],
    ) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
        if title != "핵심 논의 사항" and block_id != "table-discussions":
            return columns, rows

        def column_id_by_title(*titles: str) -> str:
            title_set = {_safe_text(title) for title in titles if _safe_text(title)}
            for column in columns:
                column_id = _safe_text(column.get("id"))
                column_title = _safe_text(column.get("title"))
                if column_id in title_set or column_title in title_set:
                    return column_id
            return ""

        topic_id = column_id_by_title("col-topic", "항목")
        discussion_id = column_id_by_title("col-discussion", "논의 내용")
        evidence_id = column_id_by_title("col-evidence", "근거", "논의 근거")
        status_id = column_id_by_title("col-status", "상태")
        next_columns = [
            {"id": "col-discussion", "title": "논의 내용", "type": "text"},
            {"id": "col-evidence", "title": "논의 근거", "type": "text"},
            {"id": "col-status", "title": "상태", "type": "select"},
        ]
        next_rows: list[dict[str, Any]] = []
        for row_index, row in enumerate(rows):
            cells = row.get("cells") if isinstance(row, dict) and isinstance(row.get("cells"), dict) else {}
            old_topic = _safe_text(cells.get(topic_id)) if topic_id else ""
            old_discussion = _safe_text(cells.get(discussion_id)) if discussion_id else ""
            old_evidence = _safe_text(cells.get(evidence_id)) if evidence_id else ""
            discussion = old_topic or old_discussion
            evidence = old_discussion if old_topic and old_discussion and old_discussion != old_topic else old_evidence
            status = _safe_text(cells.get(status_id)) if status_id else ""
            if not discussion and not evidence:
                continue
            next_rows.append(
                {
                    "id": _safe_text(row.get("id") if isinstance(row, dict) else "", f"row-{row_index + 1}"),
                    "cells": {
                        "col-discussion": compact_table_cell(discussion, 34),
                        "col-evidence": compact_table_cell(evidence, 72),
                        "col-status": compact_table_cell(status or "검토 필요", 12),
                    },
                }
            )
            if len(next_rows) >= 6:
                break
        return next_columns, next_rows

    def normalize_block(raw: Any, index: int) -> dict[str, Any] | None:
        if not isinstance(raw, dict):
            return None
        block_type = _safe_text(raw.get("type"))
        block_id = _safe_text(raw.get("id"), stable_block_id("block", json.dumps(raw, ensure_ascii=False, sort_keys=True)))
        if block_type == "heading":
            text = _safe_text(raw.get("text"))
            if not text:
                return None
            level = _safe_nonnegative_int(raw.get("level"), 2)
            level = min(3, max(1, level or 2))
            return {"id": block_id, "type": "heading", "text": text, "level": level}
        if block_type == "paragraph":
            text = _safe_text(raw.get("text"))
            return {"id": block_id, "type": "paragraph", "text": text} if text else None
        if block_type == "bullets":
            items = [_safe_text(item) for item in raw.get("items") or [] if not is_placeholder_text(item)][:20]
            return {"id": block_id, "type": "bullets", "items": items} if items else None
        if block_type == "table":
            columns = _normalize_summary_table_columns(raw.get("columns"), block_id)
            title = normalize_table_title(raw.get("title"))
            rows = _normalize_summary_table_rows(raw.get("rows"), columns, block_id)
            columns, rows = normalize_discussion_table(block_id, title, columns, rows)
            rows = filter_meaningful_table_rows(rows, columns)
            if not rows:
                return None
            return {
                "id": block_id or stable_block_id("table", str(index)),
                "type": "table",
                "title": title,
                "columns": columns,
                "rows": rows,
            }
        return None

    direct_blocks = [
        block
        for block in (normalize_block(raw, index) for index, raw in enumerate(raw_blocks or []))
        if block
    ] if isinstance(raw_blocks, list) else []
    if direct_blocks:
        return prune_empty_sections(direct_blocks)[:80]

    structured_blocks = _build_summary_document_blocks(structured or {})
    if structured_blocks:
        return prune_empty_sections(structured_blocks)

    return prune_empty_sections(_summary_markdown_to_document_blocks(markdown))


def _build_summary_document_blocks(structured: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(structured, dict):
        return []
    conclusion = structured.get("conclusion") if isinstance(structured.get("conclusion"), dict) else {}
    title = _safe_text(conclusion.get("title"), "회의 핵심 결론")
    summary = _safe_text(conclusion.get("summary") or structured.get("key_summary") or structured.get("meeting_overview"))
    blocks: list[dict[str, Any]] = []
    if title:
        blocks.append({"id": "heading-conclusion", "type": "heading", "text": title, "level": 1})
    if summary:
        blocks.append({"id": "paragraph-summary", "type": "paragraph", "text": summary})

    groups = conclusion.get("groups") if isinstance(conclusion.get("groups"), list) else []
    rows: list[list[str]] = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        bullets = [_safe_text(item) for item in group.get("bullets") or [] if _safe_text(item)]
        rows.append(
            [
                _safe_text(group.get("title"), "정리 항목"),
                _safe_text(group.get("status_label"), _summary_document_status_label(_safe_text(group.get("status"), "draft"))),
                "\n".join(bullets),
            ]
        )
    if rows:
        columns = [
            {"id": "col-summary-item", "title": "정리 항목", "type": "text"},
            {"id": "col-status", "title": "상태", "type": "text"},
            {"id": "col-core-content", "title": "핵심 내용", "type": "text"},
        ]
        blocks.append(
            {
                "id": "table-problem-solution",
                "type": "table",
                "title": "문제정의 & 해결 방향",
                "columns": columns,
                "rows": _normalize_summary_table_rows(rows[:40], columns, "table-problem-solution"),
            }
        )

    pending_items = [_safe_text(item) for item in structured.get("pending_items") or [] if _safe_text(item)]
    if pending_items:
        columns = [
            {"id": "col-action-item", "title": "할 일", "type": "text"},
            {"id": "col-owner", "title": "담당", "type": "text"},
            {"id": "col-note", "title": "비고", "type": "text"},
        ]
        blocks.append(
            {
                "id": "table-next-actions",
                "type": "table",
                "title": "앞으로 할 일",
                "columns": columns,
                "rows": _normalize_summary_table_rows(
                    [[item, "추가 확인 필요", ""] for item in pending_items[:40]],
                    columns,
                    "table-next-actions",
                ),
            }
        )
    return blocks


def _summary_markdown_to_document_blocks(markdown: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    paragraph: list[str] = []
    bullets: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph
        text = _safe_text(" ".join(paragraph))
        if text:
            blocks.append({"id": f"paragraph-{len(blocks) + 1}", "type": "paragraph", "text": text})
        paragraph = []

    def flush_bullets() -> None:
        nonlocal bullets
        items = [_safe_text(item) for item in bullets if _safe_text(item)]
        if items:
            blocks.append({"id": f"bullets-{len(blocks) + 1}", "type": "bullets", "items": items})
        bullets = []

    for raw_line in _safe_text(markdown).splitlines():
        line = _safe_text(raw_line)
        if not line:
            flush_paragraph()
            flush_bullets()
            continue
        heading_match = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading_match:
            flush_paragraph()
            flush_bullets()
            blocks.append(
                {
                    "id": f"heading-{len(blocks) + 1}",
                    "type": "heading",
                    "text": _safe_text(heading_match.group(2)),
                    "level": min(3, max(1, len(heading_match.group(1)))),
                }
            )
            continue
        bullet_match = re.match(r"^(?:[-*]|\d+[.)])\s+(.+)$", line)
        if bullet_match:
            flush_paragraph()
            bullets.append(_safe_text(bullet_match.group(1)))
            continue
        flush_bullets()
        paragraph.append(line)

    flush_paragraph()
    flush_bullets()
    return blocks[:80]


def _summary_document_blocks_to_markdown(blocks: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        block_type = _safe_text(block.get("type"))
        if block_type == "heading":
            level = min(3, max(1, _safe_nonnegative_int(block.get("level"), 2) or 2))
            text = _safe_text(block.get("text"), "제목")
            chunks.append(f"{'#' * level} {text}")
        elif block_type == "paragraph":
            text = _safe_text(block.get("text"))
            if text:
                chunks.append(text)
        elif block_type == "bullets":
            items = [_safe_text(item) for item in block.get("items") or [] if _safe_text(item)]
            if items:
                chunks.append("\n".join(f"- {item}" for item in items))
        elif block_type == "table":
            block_id = _safe_text(block.get("id"), f"table-{len(chunks) + 1}")
            columns = _normalize_summary_table_columns(block.get("columns"), block_id)
            rows = _normalize_summary_table_rows(block.get("rows"), columns, block_id)

            def cell(value: str) -> str:
                return _safe_text(value).replace("\n", "<br>").replace("|", "\\|") or " "

            title = _safe_text(block.get("title"))
            table_lines = []
            if title:
                table_lines.append(f"### {title}")
            table_lines.append("| " + " | ".join(cell(_safe_text(column.get("title"))) for column in columns) + " |")
            table_lines.append("| " + " | ".join("---" for _ in columns) + " |")
            for row in rows:
                cells = row.get("cells") if isinstance(row.get("cells"), dict) else {}
                table_lines.append("| " + " | ".join(cell(cells.get(_safe_text(column.get("id")), "")) for column in columns) + " |")
            chunks.append("\n".join(table_lines))
    return "\n\n".join(chunk for chunk in chunks if _safe_text(chunk)).strip()


def _build_demo_balance_structured_from_blocks(
    classification: dict[str, Any],
    document_blocks: list[dict[str, Any]],
    fallback: dict[str, Any],
    report_meta: Any = None,
) -> dict[str, Any]:
    base = _normalize_summary_structured_document({}, fallback)
    meta = report_meta if isinstance(report_meta, dict) else {}
    first_heading = ""
    first_paragraph = ""
    bullets: list[str] = []
    for block in document_blocks or []:
        if not isinstance(block, dict):
            continue
        block_type = _safe_text(block.get("type"))
        if block_type == "heading" and not first_heading:
            first_heading = _safe_text(block.get("text"))
        elif block_type == "paragraph" and not first_paragraph:
            first_paragraph = _safe_text(block.get("text"))
        elif block_type == "bullets":
            bullets.extend(_safe_text(item) for item in block.get("items") or [] if _safe_text(item))

    verdict = _safe_text(meta.get("verdict")) or "최종 판정"
    summary = _safe_text(meta.get("summary")) or first_paragraph or _safe_text(base.get("key_summary"))
    option_a = _safe_text(classification.get("option_a"), "A")
    option_b = _safe_text(classification.get("option_b"), "B")
    main_opinions = _normalize_demo_balance_main_opinions(classification.get("main_opinions"))
    a_items = [
        _safe_text(item.get("text") or item.get("title"))
        for item in main_opinions.get("a", [])
        if isinstance(item, dict) and _safe_text(item.get("text") or item.get("title"))
    ][:6]
    b_items = [
        _safe_text(item.get("text") or item.get("title"))
        for item in main_opinions.get("b", [])
        if isinstance(item, dict) and _safe_text(item.get("text") or item.get("title"))
    ][:6]
    conclusion_bullets = bullets[:8] or ([summary] if summary else [])
    return _normalize_summary_structured_document(
        {
            **base,
            "meeting_overview": _safe_text(base.get("meeting_overview"))
            or f"{option_a}와 {option_b}를 비교한 밸런스 게임입니다.",
            "key_summary": summary,
            "idea_groups": [
                {"group_id": "demo-balance-a", "title": f"A. {option_a}", "items": a_items},
                {"group_id": "demo-balance-b", "title": f"B. {option_b}", "items": b_items},
            ],
            "discussion_flows": [
                {
                    "group_id": "demo-balance",
                    "title": "A/B 의견 비교",
                    "opinions": [
                        {"label": f"A. {option_a}", "text": "; ".join(a_items[:3])},
                        {"label": f"B. {option_b}", "text": "; ".join(b_items[:3])},
                    ],
                    "conclusion": verdict,
                }
            ],
            "flow_sections": [
                {
                    "section_id": "demo-balance-flow",
                    "group_id": "demo-balance",
                    "title": "A/B 선택지 비교",
                    "time_range": "",
                    "trigger": "참가자들이 A/B 중 하나를 선택하고 이유를 제시함",
                    "narrative": summary,
                    "key_points": conclusion_bullets[:5],
                    "opinions": [
                        {"label": f"A. {option_a}", "text": "; ".join(a_items[:3])},
                        {"label": f"B. {option_b}", "text": "; ".join(b_items[:3])},
                    ],
                    "settlement": verdict,
                    "open_questions": [],
                }
            ],
            "pending_items": [],
            "conclusion": {
                "title": first_heading or "최종 판정",
                "summary": summary,
                "groups": [
                    {
                        "group_id": "winner",
                        "title": verdict,
                        "status": "final",
                        "status_label": "확정",
                        "bullets": conclusion_bullets,
                    }
                ],
            },
        },
        fallback,
    )


def _build_summary_document_structured(
    meeting_topic: str,
    groups: list[dict[str, Any]],
    sections: list[dict[str, Any]],
) -> dict[str, Any]:
    title = _safe_text(meeting_topic, "회의")
    group_titles = [_safe_text(group.get("title")) for group in groups if _safe_text(group.get("title"))]
    primary_topics = ", ".join(group_titles[:3]) if group_titles else "주요 논의"
    section_by_group_id = {
        _safe_text(section.get("group_id")): section
        for section in sections
        if isinstance(section, dict) and _safe_text(section.get("group_id"))
    }
    key_points = _dedup_preserve(
        [
            item
            for group in groups
            for item in _summary_document_group_bullets(group, limit=2)
            if _safe_text(item)
        ],
        limit=4,
    )
    key_summary = (
        " ".join(key_points[:2])
        if key_points
        else f"{title} 회의에서는 {primary_topics}를 중심으로 논의가 정리되었습니다."
    )

    idea_groups: list[dict[str, Any]] = []
    discussion_flows: list[dict[str, Any]] = []
    flow_sections: list[dict[str, Any]] = []
    conclusion_groups: list[dict[str, Any]] = []
    pending_items: list[str] = []
    for index, group in enumerate(groups, start=1):
        group_id = _safe_text(group.get("group_id"))
        group_title = _safe_text(group.get("title"), "정리 항목")
        section = section_by_group_id.get(group_id, {})
        bullets = _summary_document_group_bullets(group, limit=5)
        if not bullets:
            bullets = [f"{group_title}을 중심으로 논의가 정리되었습니다."]
        idea_groups.append(
            {
                "group_id": group_id,
                "title": group_title,
                "items": bullets[:4],
            }
        )
        evidence_texts = [
            _safe_text(item.get("text"))
            for item in (section.get("evidence") or [])
            if isinstance(item, dict) and _safe_text(item.get("text"))
        ]
        opinion_sources = _dedup_preserve([*evidence_texts, *bullets], limit=2)
        discussion_flows.append(
            {
                "group_id": group_id,
                "title": group_title,
                "opinions": [
                    {"label": f"{chr(65 + index)} 의견", "text": _truncate_text(text, 140)}
                    for index, text in enumerate(opinion_sources)
                ],
                "conclusion": _safe_text(
                    (bullets[-1] if bullets else "") or group.get("rationale"),
                    f"{group_title}에 대한 후속 정리가 필요합니다.",
                ),
            }
        )
        trigger = _safe_text((group.get("source_summary_items") or [None])[0]) or bullets[0]
        settlement = _safe_text(group.get("rationale")) or (bullets[-1] if bullets else "")
        open_questions = [] if _safe_text(group.get("status"), "draft") == "final" else [f"{group_title}에 대한 추가 확인과 합의가 필요합니다."]
        flow_sections.append(
            {
                "section_id": f"flow-{index}",
                "group_id": group_id,
                "title": group_title,
                "time_range": "",
                "trigger": _to_summary_point(trigger, max_len=None),
                "narrative": " ".join(_to_summary_point(item, max_len=None) for item in bullets[:3]),
                "key_points": bullets[:6],
                "opinions": [
                    {"label": f"{chr(65 + opinion_index)} 의견", "text": _truncate_text(text, 180)}
                    for opinion_index, text in enumerate(opinion_sources)
                ],
                "settlement": _to_summary_point(settlement, max_len=None),
                "open_questions": open_questions,
            }
        )
        status = _safe_text(group.get("status"), "draft")
        if status != "final":
            pending_items.append(group_title)
        conclusion_groups.append(
            {
                "group_id": group_id,
                "title": group_title,
                "status": status,
                "status_label": _safe_text(group.get("status_label"), _summary_document_status_label(status)),
                "bullets": bullets,
            }
        )

    return {
        "meeting_overview": f"{title} 회의에서는 {primary_topics}를 중심으로 논의했습니다.",
        "attendee_summary": "",
        "key_summary": key_summary,
        "idea_groups": idea_groups,
        "discussion_flows": discussion_flows,
        "flow_sections": flow_sections,
        "pending_items": _dedup_preserve(pending_items, limit=10),
        "conclusion": {
            "title": f"{primary_topics} 정리",
            "summary": key_summary,
            "groups": conclusion_groups,
        },
    }


def _normalize_summary_structured_document(raw: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}

    def text_list(value: Any, limit: int) -> list[str]:
        return [_safe_text(item) for item in (value or []) if _safe_text(item)][:limit] if isinstance(value, list) else []

    def normalize_idea_groups(value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        groups: list[dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            title = _safe_text(item.get("title"))
            items = text_list(item.get("items") or item.get("bullets"), 8)
            if not title and not items:
                continue
            groups.append(
                {
                    "group_id": _safe_text(item.get("group_id") or item.get("groupId")),
                    "title": title or "주요 아이디어",
                    "items": items,
                }
            )
            if len(groups) >= 24:
                break
        return groups

    def normalize_discussion_flows(value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        flows: list[dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            title = _safe_text(item.get("title"))
            opinions: list[dict[str, str]] = []
            for opinion in item.get("opinions") or []:
                if not isinstance(opinion, dict):
                    continue
                text = _safe_text(opinion.get("text"))
                if text:
                    opinions.append({"label": _safe_text(opinion.get("label"), "의견"), "text": text})
                if len(opinions) >= 4:
                    break
            conclusion = _safe_text(item.get("conclusion") or item.get("summary"))
            if not title and not opinions and not conclusion:
                continue
            flows.append(
                {
                    "group_id": _safe_text(item.get("group_id") or item.get("groupId")),
                    "title": title or "논의 흐름",
                    "opinions": opinions,
                    "conclusion": conclusion,
                }
            )
            if len(flows) >= 24:
                break
        return flows

    def normalize_flow_sections(value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        sections: list[dict[str, Any]] = []
        for index, item in enumerate(value, start=1):
            if not isinstance(item, dict):
                continue
            title = _safe_text(item.get("title"))
            key_points = text_list(item.get("key_points") or item.get("keyPoints") or item.get("items") or item.get("bullets"), 8)
            open_questions = text_list(
                item.get("open_questions") or item.get("openQuestions") or item.get("pending_items") or item.get("pendingItems"),
                8,
            )
            opinions: list[dict[str, str]] = []
            for opinion in item.get("opinions") or []:
                if not isinstance(opinion, dict):
                    continue
                text = _safe_text(opinion.get("text"))
                if text:
                    opinions.append({"label": _safe_text(opinion.get("label"), "의견"), "text": text})
                if len(opinions) >= 4:
                    break
            trigger = _safe_text(item.get("trigger") or item.get("why") or item.get("context"))
            narrative = _safe_text(item.get("narrative") or item.get("summary") or item.get("body"))
            settlement = _safe_text(item.get("settlement") or item.get("conclusion") or item.get("decision"))
            if not title and not trigger and not narrative and not key_points and not opinions and not settlement and not open_questions:
                continue
            sections.append(
                {
                    "section_id": _safe_text(item.get("section_id") or item.get("sectionId"), f"flow-{index}"),
                    "group_id": _safe_text(item.get("group_id") or item.get("groupId")),
                    "title": title or "논의 흐름",
                    "time_range": _safe_text(item.get("time_range") or item.get("timeRange")),
                    "trigger": trigger,
                    "narrative": narrative,
                    "key_points": key_points,
                    "opinions": opinions,
                    "settlement": settlement,
                    "open_questions": open_questions,
                }
            )
            if len(sections) >= 24:
                break
        return sections

    def normalize_conclusion_groups(value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        groups: list[dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            title = _safe_text(item.get("title"))
            bullets = text_list(item.get("bullets") or item.get("items"), 8)
            if not title and not bullets:
                continue
            status = _safe_text(item.get("status"), "draft")
            if status not in {"draft", "review", "final"}:
                status = "draft"
            groups.append(
                {
                    "group_id": _safe_text(item.get("group_id") or item.get("groupId")),
                    "title": title or "정리 항목",
                    "status": status,
                    "status_label": _safe_text(item.get("status_label") or item.get("statusLabel"), _summary_document_status_label(status)),
                    "bullets": bullets,
                }
            )
            if len(groups) >= 24:
                break
        return groups

    conclusion = source.get("conclusion") if isinstance(source.get("conclusion"), dict) else {}
    normalized = {
        "meeting_overview": _safe_text(source.get("meeting_overview") or source.get("meetingOverview")),
        "attendee_summary": _safe_text(source.get("attendee_summary") or source.get("attendeeSummary")),
        "key_summary": _safe_text(source.get("key_summary") or source.get("keySummary")),
        "idea_groups": normalize_idea_groups(source.get("idea_groups") or source.get("ideaGroups")),
        "discussion_flows": normalize_discussion_flows(source.get("discussion_flows") or source.get("discussionFlows")),
        "flow_sections": normalize_flow_sections(source.get("flow_sections") or source.get("flowSections")),
        "pending_items": text_list(source.get("pending_items") or source.get("pendingItems"), 12),
        "conclusion": {
            "title": _safe_text(conclusion.get("title")),
            "summary": _safe_text(conclusion.get("summary")),
            "groups": normalize_conclusion_groups(conclusion.get("groups")),
        },
    }

    fallback_conclusion = fallback.get("conclusion") if isinstance(fallback.get("conclusion"), dict) else {}
    if not normalized["meeting_overview"]:
        normalized["meeting_overview"] = _safe_text(fallback.get("meeting_overview"))
    if not normalized["attendee_summary"]:
        normalized["attendee_summary"] = _safe_text(fallback.get("attendee_summary"))
    if not normalized["key_summary"]:
        normalized["key_summary"] = _safe_text(fallback.get("key_summary"))
    if not normalized["idea_groups"]:
        normalized["idea_groups"] = fallback.get("idea_groups") if isinstance(fallback.get("idea_groups"), list) else []
    if not normalized["discussion_flows"]:
        normalized["discussion_flows"] = fallback.get("discussion_flows") if isinstance(fallback.get("discussion_flows"), list) else []
    if not normalized["flow_sections"]:
        normalized["flow_sections"] = fallback.get("flow_sections") if isinstance(fallback.get("flow_sections"), list) else []
    if not normalized["pending_items"]:
        normalized["pending_items"] = fallback.get("pending_items") if isinstance(fallback.get("pending_items"), list) else []
    if not normalized["conclusion"]["title"]:
        normalized["conclusion"]["title"] = _safe_text(fallback_conclusion.get("title"))
    if not normalized["conclusion"]["summary"]:
        normalized["conclusion"]["summary"] = _safe_text(fallback_conclusion.get("summary"))
    if not normalized["conclusion"]["groups"]:
        normalized["conclusion"]["groups"] = fallback_conclusion.get("groups") if isinstance(fallback_conclusion.get("groups"), list) else []
    return normalized


def _build_summary_document_local_markdown(meeting_topic: str, groups: list[dict[str, Any]]) -> str:
    title = _safe_text(meeting_topic, "회의")
    group_titles = [_safe_text(group.get("title")) for group in groups if _safe_text(group.get("title"))]
    flow_intro = ", ".join(group_titles[:3]) if group_titles else "주요 논점"
    lines = [
        f"# {title} 요약",
        "",
        "## 전체 흐름",
        f"회의는 {flow_intro}을 중심으로 진행되었고, 각 논점의 주장과 근거를 확인한 뒤 남은 쟁점을 정리하는 흐름으로 마무리되었습니다.",
    ]
    for index, group in enumerate(groups, start=1):
        status_label = _safe_text(group.get("status_label"), "확정")
        status_suffix = "" if group.get("status") == "final" else f" ({status_label})"
        group_title = _safe_text(group.get("title"), f"정리 항목 {index}")
        lines.extend(["", f"## {index}. {group_title}{status_suffix}"])
        node_titles = [
            _safe_text(node.get("title"))
            for node in group.get("nodes") or []
            if isinstance(node, dict) and _safe_text(node.get("title"))
        ]
        source_items = [_safe_text(item) for item in group.get("source_summary_items") or [] if _safe_text(item)]
        rationale = _safe_text(group.get("rationale"))
        flow_items = _dedup_preserve([*source_items, *node_titles, rationale], limit=4)
        if source_items or flow_items:
            lines.extend(["", "### 논점이 나온 이유"])
            lines.append(_to_summary_point((source_items[0] if source_items else flow_items[0]), max_len=None))
        if flow_items:
            lines.extend(["", "### 핵심 논의"])
            lines.extend(f"- {item}" for item in flow_items)
        lines.extend(["", "### 정리된 결론"])
        conclusion = rationale or (source_items[0] if source_items else f"{group_title}을 중심으로 논의가 정리되었습니다.")
        lines.append(_to_summary_point(conclusion, max_len=None))
        if group.get("status") != "final":
            lines.extend(["", "### 남은 확인 사항", f"- {group_title}에 대한 추가 확인과 합의가 필요합니다."])
    return "\n".join(lines).strip()


def _build_demo_balance_summary_prompt(
    payload: SummaryDocumentGenerateInput,
    groups: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    context: dict[str, Any],
    *,
    conclusion_only: bool = False,
    current_structured: dict[str, Any] | None = None,
) -> str:
    demo_config = _normalize_canvas_demo_config(payload.demo_config)
    demo_balance_classification = _normalize_canvas_demo_balance_classification(
        context.get("demo_balance_classification") or payload.demo_balance_classification
    )
    rows = context.get("rows") if isinstance(context.get("rows"), list) else []
    opinions = [
        opinion
        for opinion in (demo_balance_classification.get("opinions") or [])
        if isinstance(opinion, dict)
    ]
    valid_a_opinions = [opinion for opinion in opinions if opinion.get("valid") and opinion.get("choice") == "a"]
    valid_b_opinions = [opinion for opinion in opinions if opinion.get("valid") and opinion.get("choice") == "b"]
    unclassified_opinions = [opinion for opinion in opinions if not opinion.get("valid") or opinion.get("choice") not in {"a", "b"}]
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "demo_config": demo_config,
        "mode": "demo_balance",
        "source_policy": {
            "valid_opinion_rule": "demo_balance_classification의 valid=true 의견만 유효 의견으로 집계한다.",
            "unclassified_rule": "미분류는 참고 의견으로만 다루고 A/B 유효 비율에는 넣지 않는다.",
            "winner_rule": "판정은 유효 의견 수, 반복 근거, 근거의 설득력을 함께 보고 A 우세/B 우세/무승부 중 하나로 판단한다.",
        },
        "classification": {
            "option_a": demo_balance_classification.get("option_a"),
            "option_b": demo_balance_classification.get("option_b"),
            "valid_a_count": demo_balance_classification.get("valid_a_count"),
            "valid_b_count": demo_balance_classification.get("valid_b_count"),
            "unclassified_count": demo_balance_classification.get("unclassified_count"),
            "summary": demo_balance_classification.get("summary"),
            "main_opinions": demo_balance_classification.get("main_opinions"),
            "valid_a_opinions": valid_a_opinions,
            "valid_b_opinions": valid_b_opinions,
            "unclassified_opinions": unclassified_opinions[:24],
        },
        "raw_utterances_for_reference": _problem_taxonomy_prompt_rows(rows[:80], 220) if not opinions else [],
        "current_structured": current_structured or {},
    }
    title_hint = "최종 판정 문서" if conclusion_only else "시연 토론 요약 및 판정 리포트"
    return (
        "너는 3분 내외의 A/B 밸런스 게임 토론을 정리하고 판정하는 AI 심판이다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        f"- 오른쪽 문서 편집기에 들어갈 {title_hint}를 만든다.\n"
        "- classification의 A/B 유효 의견 전체를 기준으로 각 선택지의 주요 근거를 정리한다.\n"
        "- 유효 의견 비율, A/B 핵심 근거, 설득력 Matrix, 최종 판정만 간결하게 만든다.\n"
        "- 무승부가 가능하다. 근거의 질과 비율이 비슷하면 무승부로 판단한다.\n"
        "- 입력에 없는 사실, 참가자 수, 명시되지 않은 투표 결과를 발명하지 않는다.\n"
        "- 화자명, timestamp, 긴 원문 인용은 넣지 않는다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "document_blocks": [\n'
        '    {"id":"heading-demo-report","type":"heading","level":1,"text":"A vs B 판정 리포트"},\n'
        '    {"id":"paragraph-demo-summary","type":"paragraph","text":"이번 세션의 핵심 판정을 1~2문장으로 요약"},\n'
        '    {"id":"table-valid-ratio","type":"table","title":"유효 의견 비율","columns":[{"id":"col-choice","title":"선택지","type":"text"},{"id":"col-valid","title":"유효 의견","type":"text"},{"id":"col-ratio","title":"비율","type":"text"},{"id":"col-main","title":"주요 근거","type":"text"}],"rows":[]},\n'
        '    {"id":"table-score-matrix","type":"table","title":"설득력 Matrix","columns":[{"id":"col-criterion","title":"평가 기준","type":"text"},{"id":"col-a-score","title":"A 점수","type":"text"},{"id":"col-b-score","title":"B 점수","type":"text"},{"id":"col-reason","title":"판단 이유","type":"text"}],"rows":[]},\n'
        '    {"id":"heading-winner","type":"heading","level":2,"text":"최종 판정"},\n'
        '    {"id":"bullets-winner","type":"bullets","items":["A 우세/B 우세/무승부 중 하나와 이유"]}\n'
        "  ],\n"
        '  "report_meta": {"verdict":"A 우세|B 우세|무승부","summary":"판정 요약 1문장","option_a_ratio":"0%","option_b_ratio":"0%"}\n'
        "}\n\n"
        "[작성 규칙]\n"
        "- document_blocks의 첫 블록은 heading level 1, 두 번째 블록은 paragraph다.\n"
        "- 표는 가능한 한 짧게 쓴다. 셀 하나에 여러 문장을 넣지 않는다.\n"
        "- 유효 의견 비율 표에는 A, B, 미분류/무효를 넣는다. A/B 비율은 valid_a_count + valid_b_count 기준으로 계산하고, 미분류는 별도 행으로 표시한다.\n"
        "- 설득력 Matrix 기준은 근거 명확성, 현실성, 일관성, 공감 가능성, 반박 대응력 중 회의에 맞는 4~5개를 사용한다.\n"
        "- 점수는 1~5점 숫자로 쓰고, 총점만으로 승자를 정하지 말고 발화 근거를 함께 본다.\n"
        "- 최종 판정은 'A 우세', 'B 우세', '무승부' 중 하나를 명확히 쓴다.\n"
        "- A/B가 명시되지 않은 발화를 억지로 유효 의견에 넣지 않는다.\n"
        "- document_blocks는 4~7개 정도로 짧게 만든다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _build_summary_document_prompt(
    payload: SummaryDocumentGenerateInput,
    groups: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    context: dict[str, Any],
) -> str:
    if _is_demo_balance_config(payload.demo_config):
        return _build_demo_balance_summary_prompt(payload, groups, sections, context)

    overview_summaries = context.get("overview_summaries") if isinstance(context.get("overview_summaries"), list) else []
    chunk_summaries = context.get("chunk_summaries") if isinstance(context.get("chunk_summaries"), list) else []
    rows = context.get("rows") if isinstance(context.get("rows"), list) else []
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "context_policy": {
            "total_utterance_count": int(context.get("total_utterance_count") or 0),
            "included_raw_utterance_count": int(context.get("included_utterance_count") or len(rows)),
            "included_chunk_summary_count": int(context.get("included_chunk_summary_count") or len(chunk_summaries)),
            "overview_summary_count": len(overview_summaries),
            "note": "문서 본문에는 원문 발언을 직접 인용하지 않는다. 근거 발언은 별도 evidence UI에서만 보여준다.",
        },
        "structure_groups": [
            {
                "group_id": group.get("group_id"),
                "title": group.get("title"),
                "status": group.get("status"),
                "status_label": group.get("status_label"),
                "rationale": group.get("rationale"),
                "nodes": [
                    {
                        "title": node.get("title"),
                        "body": node.get("body"),
                    }
                    for node in group.get("nodes") or []
                    if isinstance(node, dict)
                ][:40],
                "source_summary_items": group.get("source_summary_items", [])[:8],
            }
            for group in groups
        ],
        "overview_summaries": overview_summaries,
        "chunk_summaries": chunk_summaries,
        "evidence_hints": [
            {
                "group_id": section.get("group_id"),
                "evidence_summaries": [
                    _truncate_text(item.get("text"), 160)
                    for item in section.get("evidence") or []
                    if isinstance(item, dict) and _safe_text(item.get("text"))
                ],
            }
            for section in sections
        ],
        "raw_utterances_for_nuance_only": _problem_taxonomy_prompt_rows(rows[:24], 360),
    }
    return (
        "너는 회의가 끝난 뒤 사람들이 다시 읽을 수 있는 최종 회의 요약 문서를 쓰는 AI 퍼실리테이터다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 2단계 구조화에서 입력된 모든 그룹을 상태와 무관하게 기준으로 삼아 문서형 요약을 작성한다.\n"
        "- 사람들이 회의가 끝난 뒤 읽었을 때 논점이 어떻게 등장했고, 어떤 주장과 근거를 거쳐 왜 이런 결론이 나왔는지 이해할 수 있어야 한다.\n"
        "- 단순 항목 요약이 아니라 회의 진행 순서에 가까운 흐름 문서로 재구성한다.\n"
        "- 웹 LLM 서비스의 Markdown 요약처럼 제목, 하위 제목, bullet을 적절히 사용한다.\n"
        "- 각 그룹의 status_label은 참고 정보다. 확정되지 않은 그룹도 빠뜨리지 말고, 필요한 경우 본문에 상태를 자연스럽게 드러낸다.\n"
        "- 원문 발언의 직접 인용, 화자명, timestamp는 문서 본문에 넣지 않는다. 근거 발언은 UI에서 별도로 접어 보여준다.\n"
        "- 새로운 사실, 결정, 원인, 해결책을 발명하지 않는다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "markdown": "# 회의 요약\\n\\n## 전체 흐름\\n...\\n\\n## 1. 목적지 경복궁 설정\\n...",\n'
        '  "document_blocks": [\n'
        '    {"id":"heading-1","type":"heading","text":"최종 결론 제목","level":1},\n'
        '    {"id":"paragraph-1","type":"paragraph","text":"핵심 결론 1~2문장"},\n'
        '    {"id":"table-1","type":"table","title":"회의 성격에 맞는 표 제목","columns":[{"id":"col-item","title":"항목","type":"text"},{"id":"col-content","title":"내용","type":"text"}],"rows":[{"id":"row-1","cells":{"col-item":"셀 값","col-content":"셀 값"}}]}\n'
        "  ],\n"
        '  "structured": {\n'
        '    "meeting_overview": "회의 개요 1문장",\n'
        '    "attendee_summary": "참석자/논의 범위 요약",\n'
        '    "key_summary": "핵심 요약 1~2문장",\n'
        '    "idea_groups": [{"group_id":"...","title":"...","items":["짧은 bullet"]}],\n'
        '    "discussion_flows": [{"group_id":"...","title":"...","opinions":[{"label":"A 의견","text":"..."},{"label":"B 의견","text":"..."}],"conclusion":"정리 문장"}],\n'
        '    "flow_sections": [{"section_id":"flow-1","group_id":"...","title":"짧은 논점 제목","time_range":"","trigger":"이 논점이 등장한 이유","narrative":"주장과 근거가 어떻게 이어졌는지 2~4문장으로 설명","key_points":["핵심 주장 또는 근거"],"opinions":[{"label":"한쪽 의견","text":"..."},{"label":"다른 의견","text":"..."}],"settlement":"회의가 정리한 방향","open_questions":["남은 확인 사항"]}],\n'
        '    "pending_items": ["보류 또는 추가 확인 항목"],\n'
        '    "conclusion": {"title":"결론 제목","summary":"결론 요약","groups":[{"group_id":"...","title":"...","status":"final","status_label":"확정","bullets":["결론 bullet"]}]}\n'
        "  }\n"
        "}\n\n"
        "[규칙]\n"
        "- markdown은 한국어 Markdown 문자열 하나다.\n"
        "- document_blocks는 오른쪽 결론 문서 편집기의 원본이다. heading, paragraph, bullets, table 블록을 사용한다.\n"
        "- table 블록은 의미 있을 때 1~3개 만든다. columns는 id/title/type 객체 배열이고 rows는 id/cells 객체 배열이다.\n"
        "- table의 column id는 col-purpose, col-owner처럼 영문 소문자/하이픈으로 안정적으로 만들고, row cells의 key는 반드시 column id와 일치시킨다.\n"
        "- 컬럼명은 회의 성격에 맞게 직접 정하고, 3~6개 컬럼으로 제한한다.\n"
        "- table은 결정 사항, 쟁점 비교, 우선순위, 실행 항목, 담당자, 추가 확인 사항처럼 표가 더 읽기 쉬운 정보에만 사용한다.\n"
        "- table rows의 빈 셀은 만들지 말고 모르면 '추가 확인 필요'라고 적는다.\n"
        "- structured는 화면 표시용이다. 원문을 그대로 복사하지 말고 짧고 읽기 좋은 문장으로 정리한다.\n"
        "- flow_sections는 좌측 정리 카드의 핵심 데이터다. 각 섹션은 논점이 등장한 이유, 핵심 주장/근거, 의견 차이, 정리된 방향, 남은 확인 사항을 구분한다.\n"
        "- 문서에는 # 제목 1개, ## 흐름별 섹션, 필요한 경우 ### 논점이 나온 이유 / 핵심 논의 / 정리된 결론 / 남은 확인 사항을 둔다.\n"
        "- 각 흐름 섹션은 2~4문장 narrative와 bullet 2~5개 정도로 작성한다. 너무 짧은 라벨 나열만 반환하지 않는다.\n"
        "- 결론은 flow_sections에서 실제로 정리된 방향만 압축한다. 결론 카드에 들어갈 내용은 상세 플로우를 반복하지 않는다.\n"
        "- 원문 그대로의 긴 인용은 금지한다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _build_summary_conclusion_prompt(
    payload: SummaryConclusionGenerateInput,
    groups: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    current_structured: dict[str, Any],
    context: dict[str, Any],
) -> str:
    if _is_demo_balance_config(payload.demo_config):
        return _build_demo_balance_summary_prompt(
            payload,
            groups,
            sections,
            context,
            conclusion_only=True,
            current_structured=current_structured,
        )

    conclusion = current_structured.get("conclusion") if isinstance(current_structured.get("conclusion"), dict) else {}
    overview_summaries = context.get("overview_summaries") if isinstance(context.get("overview_summaries"), list) else []
    chunk_summaries = context.get("chunk_summaries") if isinstance(context.get("chunk_summaries"), list) else []
    rows = context.get("rows") if isinstance(context.get("rows"), list) else []
    input_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "source_policy": {
            "note": "이번 출력은 오른쪽 결론 편집 문서만 다시 만드는 용도다.",
            "primary_source": "전체 STT 전사 내용을 압축한 overview_summaries와 chunk_summaries를 우선 근거로 삼는다.",
            "secondary_source": "current_summary.flow_sections와 structure_groups는 정리 방향과 구조를 이해하기 위한 참고자료다.",
            "do_not_repeat": "좌측 정리 카드의 narrative를 그대로 반복하지 말고, 전체 전사 맥락에서 핵심 논의/근거/정리된 방향/보류 사항/후속 조치만 문서화한다.",
        },
        "transcript_context": {
            "context_policy": {
                "total_utterance_count": int(context.get("total_utterance_count") or len(rows)),
                "included_raw_utterance_count": int(context.get("included_utterance_count") or len(rows)),
                "total_chunk_summary_count": int(context.get("chunk_summary_count") or len(chunk_summaries)),
                "included_chunk_summary_count": int(context.get("included_chunk_summary_count") or len(chunk_summaries)),
                "overview_summary_count": len(overview_summaries),
                "note": "overview_summaries는 긴 회의 전체 흐름을 압축한 개요, chunk_summaries는 구간별 요약, raw_utterances_for_nuance_only는 표현 뉘앙스 확인용 선별 원문이다.",
            },
            "overview_summaries": overview_summaries,
            "chunk_summaries": chunk_summaries,
            "raw_utterances_for_nuance_only": _problem_taxonomy_prompt_rows(rows[:36], 320),
        },
        "current_summary": {
            "meeting_overview": _safe_text(current_structured.get("meeting_overview")),
            "key_summary": _safe_text(current_structured.get("key_summary")),
            "flow_sections": [
                {
                    "group_id": section.get("group_id"),
                    "title": section.get("title"),
                    "trigger": section.get("trigger"),
                    "narrative": section.get("narrative"),
                    "key_points": section.get("key_points", [])[:8],
                    "opinions": section.get("opinions", [])[:4],
                    "settlement": section.get("settlement"),
                    "open_questions": section.get("open_questions", [])[:8],
                }
                for section in current_structured.get("flow_sections") or []
                if isinstance(section, dict)
            ][:24],
            "pending_items": current_structured.get("pending_items", [])[:12]
            if isinstance(current_structured.get("pending_items"), list)
            else [],
            "existing_conclusion": conclusion,
        },
        "structure_groups": [
            {
                "group_id": group.get("group_id"),
                "title": group.get("title"),
                "status": group.get("status"),
                "status_label": group.get("status_label"),
                "rationale": group.get("rationale"),
                "nodes": [
                    {
                        "title": node.get("title"),
                        "body": node.get("body"),
                    }
                    for node in group.get("nodes") or []
                    if isinstance(node, dict)
                ][:40],
                "source_summary_items": group.get("source_summary_items", [])[:8],
            }
            for group in groups
        ],
        "evidence_hints": [
            {
                "group_id": section.get("group_id"),
                "evidence_summaries": [
                    _truncate_text(item.get("text"), 140)
                    for item in section.get("evidence") or []
                    if isinstance(item, dict) and _safe_text(item.get("text"))
                ][:6],
            }
            for section in sections
        ],
    }
    return (
        "너는 회의가 끝난 뒤 참가자들이 공유하고 수정할 수 있는 Notion 스타일의 최종 결론 문서를 만드는 AI 퍼실리테이터다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- 오른쪽 결론 카드에 들어갈 최종 문서만 작성한다.\n"
        "- 결론은 좌측 정리 결과만 보고 쓰지 말고, 전체 STT 전사 압축 맥락을 우선 근거로 작성한다.\n"
        "- 좌측 정리 카드의 회의 흐름을 그대로 반복하지 않는다.\n"
        "- 회의에서 실제로 논의된 핵심 사항, 정리된 방향, 합의된 판단, 남은 쟁점, 후속 실행 항목을 중심으로 문서를 구성한다.\n"
        "- 확정된 결정이 적은 회의라도 '결정 사항'을 억지로 만들지 말고, 핵심 논의 사항과 보류/검토 상태를 중심으로 정리한다.\n"
        "- 후속 실행 항목이 있더라도 핵심 논의 사항, 논의 흐름, 주요 쟁점과 관점, 정리된 방향, 남은 질문 중 전사에서 근거가 있는 섹션은 생략하지 않는다.\n"
        "- 후속 실행 항목은 문서의 보조 섹션이며, 회의 내용 요약 섹션을 대체하면 안 된다.\n"
        "- 결과는 사용자가 블록 단위로 수정할 수 있어야 하므로 document_blocks를 가장 중요한 출력으로 작성한다.\n"
        "- 표가 더 읽기 쉬운 정보는 반드시 table 블록으로 만든다.\n"
        "- 확정되지 않은 내용은 확정처럼 쓰지 말고 '검토 필요', '추가 확인 필요', '미정'으로 표시한다.\n"
        "- 입력에 없는 사실, 담당자, 일정, 수치, 결정은 만들지 않는다.\n"
        "- 화자명, timestamp, 긴 원문 인용은 넣지 않는다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "document_blocks": [\n'
        '    {"id":"heading-conclusion","type":"heading","level":1,"text":"최종 결론 제목"},\n'
        '    {"id":"paragraph-summary","type":"paragraph","text":"회의 결론을 1~2문장으로 압축한 문단"},\n'
        '    {"id":"table-discussions","type":"table","title":"핵심 논의 사항","columns":[{"id":"col-discussion","title":"논의 내용","type":"text"},{"id":"col-evidence","title":"논의 근거","type":"text"},{"id":"col-status","title":"상태","type":"select"}],"rows":[{"id":"row-1","cells":{"col-discussion":"짧은 핵심 논의","col-evidence":"그 논의가 나온 근거","col-status":"검토 필요"}}]},\n'
        '    {"id":"heading-flow","type":"heading","level":2,"text":"논의 흐름"},\n'
        '    {"id":"bullets-flow","type":"bullets","items":["실제 회의 흐름에 근거한 항목"]},\n'
        '    {"id":"table-issues","type":"table","title":"주요 쟁점과 관점","columns":[{"id":"col-issue","title":"쟁점","type":"text"},{"id":"col-perspectives","title":"관점","type":"text"},{"id":"col-direction","title":"정리 방향","type":"text"}],"rows":[{"id":"row-1","cells":{"col-issue":"...","col-perspectives":"...","col-direction":"..."}}]},\n'
        '    {"id":"heading-direction","type":"heading","level":2,"text":"정리된 방향"},\n'
        '    {"id":"bullets-direction","type":"bullets","items":["회의에서 실제로 정리된 방향"]},\n'
        '    {"id":"heading-open-questions","type":"heading","level":2,"text":"남은 질문"},\n'
        '    {"id":"bullets-open-questions","type":"bullets","items":["회의에서 실제로 남은 질문"]}\n'
        "  ],\n"
        '  "conclusion": {"title":"결론 제목","summary":"결론 요약 1~2문장","groups":[{"group_id":"...","title":"정리 항목 제목","status":"final","status_label":"확정","bullets":["실제 결론 bullet"]}]}\n'
        "}\n\n"
        "[블록 규칙]\n"
        "- document_blocks는 반드시 2개 이상 만든다.\n"
        "- 첫 블록은 반드시 heading level 1이다.\n"
        "- 두 번째 블록은 반드시 paragraph이며, 전체 결론을 1~2문장으로 요약한다.\n"
        "- heading, paragraph, bullets, table 타입만 사용한다.\n"
        "- table은 1~3개까지 만들 수 있다.\n"
        "- table이 필요 없는 회의라면 만들지 않아도 되지만, 핵심 논의 사항/쟁점 비교/후속 실행/우선순위/추가 확인 사항이 있으면 table을 사용한다.\n"
        "- 첫 번째 표 제목은 '핵심 결정 사항'이 아니라 '핵심 논의 사항'을 우선 사용한다.\n"
        "- 핵심 논의 사항 표에는 '항목' 컬럼을 만들지 않는다. '논의 내용', '논의 근거', '상태' 3개 컬럼만 사용한다.\n"
        "- 핵심 논의 사항의 '논의 내용'은 기존 항목처럼 짧은 핵심 주제나 판단을 쓴다. 34자 이내로 쓴다.\n"
        "- 핵심 논의 사항의 '논의 근거'는 해당 논의가 나온 이유나 회의 내 근거를 72자 이내의 한 문장으로 쓴다.\n"
        "- document_blocks는 가능한 경우 다음 순서를 따른다: 제목, 전체 요약, 핵심 논의 사항, 논의 흐름, 주요 쟁점과 관점, 정리된 방향, 남은 질문, 후속 실행 항목.\n"
        "- 각 섹션은 전사 근거가 있을 때만 만든다. 근거가 없는 섹션은 생략하되, 후속 실행 항목이 있다는 이유로 다른 근거 있는 섹션을 생략하지 않는다.\n"
        "- 내용이 없는 섹션 heading만 만들지 않는다. 예시 placeholder 문구를 실제 출력에 넣지 않는다.\n"
        "- '실제 회의 흐름에 근거한 항목', '회의에서 실제로 남은 질문', '회의에서 실제로 정리된 방향' 같은 안내 문구를 그대로 쓰지 않는다.\n"
        "- table 블록에 title이 있으면 같은 제목의 heading 블록을 바로 앞에 만들지 않는다. 예: '주요 쟁점과 관점' heading과 같은 title의 table을 동시에 만들지 않는다.\n"
        "- 후속 실행 항목 표가 필요하면 문서 마지막 쪽에 둔다. 실제 할 일, 담당, 목적, 상태가 명확하지 않으면 만들지 않는다.\n"
        "- 후속 실행 항목이 없으면 빈 table이나 '추가 확인 필요'만 반복되는 table을 만들지 않는다.\n"
        "- table columns는 객체 배열로 만든다. 각 column은 id, title, type을 가진다.\n"
        "- column id는 같은 table 안에서 중복되면 안 된다.\n"
        "- row id는 같은 table 안에서 중복되면 안 된다.\n"
        "- row.cells의 key는 반드시 columns의 id와 일치해야 한다.\n"
        "- table의 빈 셀은 만들지 않는다. 모르면 '추가 확인 필요'라고 쓴다.\n"
        "- select 타입 셀에는 '확정', '검토 필요', '추가 확인 필요', '대기', '완료', '미정' 중 가장 적절한 값을 쓴다.\n"
        "- columns는 회의 성격에 맞게 직접 정하되 3~6개로 제한한다.\n"
        "- rows는 표마다 1~6개로 제한한다. 핵심 논의 사항 표는 가장 중요한 3~5개만 남긴다.\n"
        "- 모든 table 셀은 화면에서 읽기 쉽게 짧게 쓴다. 한 셀에 여러 문장을 넣지 않는다.\n\n"
        "[결론 작성 규칙]\n"
        "- transcript_context의 overview_summaries와 chunk_summaries를 가장 우선 근거로 삼는다.\n"
        "- 전체 전사 맥락에서 회의가 어떤 순서로 흘렀는지, 어떤 쟁점이 생겼는지, 어떤 방향으로 정리됐는지 먼저 정리한 뒤 후속 실행 항목을 분리한다.\n"
        "- flow_sections의 settlement는 보조 근거로 사용하되, narrative를 그대로 반복하지 않는다.\n"
        "- settlement가 없으면 key_points와 open_questions, transcript_context를 함께 보고 결론/후속 확인 사항을 분리한다.\n"
        "- open_questions는 확정 결론이 아니라 후속 확인 사항으로 분리한다.\n"
        "- '논의가 있었다', '요약을 제시했다', '중요성이 언급됐다' 같은 메타 문장은 쓰지 않는다.\n"
        "- 좋은 문장: '방문지는 흥미만이 아니라 이동 부담과 학습 효과를 함께 비교해야 한다는 방향으로 정리됐다.'\n"
        "- 나쁜 문장: '방문지 선택 기준에 대한 논의가 있었다.'\n"
        "- 각 bullet은 실제 논의 내용, 판단, 근거, 결정, 보류 사항 중 하나를 담아야 한다.\n"
        "- conclusion.groups의 status는 final, review, draft 중 하나를 쓴다. 확정되지 않은 내용은 review 또는 draft로 둔다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _normalize_summary_document_markdown(parsed: Any, fallback_markdown: str) -> str:
    markdown = ""
    if isinstance(parsed, dict):
        markdown = _safe_text(parsed.get("markdown") or parsed.get("document"))
    else:
        markdown = _safe_text(parsed)
    markdown = re.sub(r"^```(?:markdown|md|json)?\s*", "", markdown.strip(), flags=re.IGNORECASE)
    markdown = re.sub(r"\s*```$", "", markdown).strip()
    return markdown or fallback_markdown


def _build_ideation_suggestions_prompt(payload: IdeationSuggestionGenerateInput) -> str:
    serialized = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "topic": {
            "id": _safe_text(payload.topic.id),
            "title": _safe_text(payload.topic.title),
            "body": _safe_text(payload.topic.body),
            "keywords": [_safe_text(item) for item in (payload.topic.keywords or []) if _safe_text(item)][:8],
        },
        "child_items": [
            {
                "id": _safe_text(item.id),
                "kind": _safe_text(item.kind, "note"),
                "title": _safe_text(item.title),
                "body": _safe_text(item.body),
                "keywords": [_safe_text(keyword) for keyword in (item.keywords or []) if _safe_text(keyword)][:8],
            }
            for item in (payload.child_items or [])
            if _safe_text(item.title) or _safe_text(item.body)
        ][:12],
    }
    return (
        "너는 아이디어 단계의 topic을 보고 회의에서 추가로 검토할 아이디어를 제안하는 AI다. 출력은 JSON 하나만 반환한다.\n\n"
        "[목표]\n"
        "- topic과 하위 아이디어/메모를 바탕으로 아직 카드로 만들지 않은 새 아이디어를 제안한다.\n"
        "- 기존 내용을 다른 말로 반복하지 말고, 서로 구분되는 제안을 만든다.\n"
        "- 회의 참가자가 선택적으로 채택할 참고 제안처럼 낮은 위계로 쓸 수 있게 짧게 작성한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(serialized, ensure_ascii=False, indent=2)}\n\n"
        "[출력 JSON 스키마]\n"
        "{\n"
        '  "suggestions": [\n'
        '    {"text": "추천 아이디어 1"},\n'
        '    {"text": "추천 아이디어 2"}\n'
        "  ]\n"
        "}\n\n"
        "[규칙]\n"
        "- suggestions는 2~5개.\n"
        "- 각 text는 한국어 1문장 또는 짧은 명사구.\n"
        "- 기존 child_items의 title/body와 의미가 거의 같은 제안은 제외한다.\n"
        "- 너무 추상적인 표현 대신 바로 카드로 채택 가능한 아이디어로 쓴다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다."
    )


def _build_local_ideation_suggestions(payload: IdeationSuggestionGenerateInput) -> list[dict[str, str]]:
    topic_title = _safe_text(payload.topic.title, "선택한 topic")
    topic_keywords = [_safe_text(item) for item in (payload.topic.keywords or []) if _safe_text(item)]
    child_titles = [_safe_text(item.title) for item in (payload.child_items or []) if _safe_text(item.title)]
    anchors = _dedup_preserve([*topic_keywords, *child_titles, topic_title], limit=5)
    if not anchors:
        anchors = [topic_title]
    candidates = [
        f"{anchors[0]}를 빠르게 검증할 수 있는 사용자 시나리오를 만든다.",
        f"{anchors[min(1, len(anchors) - 1)]} 관점에서 비교 가능한 대안을 정리한다.",
        f"{topic_title}에 대한 실행 우선순위를 정하는 판단 기준을 만든다.",
    ]
    return [
        {
            "id": f"ideation-suggestion-{index + 1}",
            "text": text,
            "status": "draft",
        }
        for index, text in enumerate(_dedup_preserve(candidates, limit=3))
        if _safe_text(text)
    ]


def _build_agenda_markdown(rt: RuntimeStore) -> str:
    lines: list[str] = []
    lines.append("# 회의 안건/발언 구조")
    lines.append("")
    lines.append(f"- 생성 시각: {_now_ts()}")
    lines.append(f"- 회의 목표: {_safe_text(rt.meeting_goal, '-')}")
    lines.append(f"- 전사 수: {len(rt.transcript)}")
    lines.append(f"- 안건 수: {len(rt.agenda_outcomes)}")
    lines.append("")

    if not rt.agenda_outcomes:
        lines.append("## 안건 없음")
        lines.append("")
        lines.append("현재 분석된 안건이 없습니다.")
        return "\n".join(lines).strip() + "\n"

    speaker_alias: dict[str, str] = {}
    speaker_seq = 0
    for turn in rt.transcript:
        name = _safe_text(turn.get("speaker"), "화자")
        if name in speaker_alias:
            continue
        speaker_seq += 1
        speaker_alias[name] = f"화자{speaker_seq}"

    lines.append("## 화자 약어")
    lines.append("")
    for name, alias in speaker_alias.items():
        lines.append(f"- {alias}: {name}")
    lines.append("")

    total_turns = len(rt.transcript)
    agenda_outline_rows: list[str] = []
    for idx, row in enumerate(rt.agenda_outcomes, start=1):
        agenda_id = _safe_text(row.get("agenda_id"), f"agenda-{idx}")
        title = _safe_text(row.get("agenda_title"), "안건 제목 미정")
        state = _normalize_agenda_state(row.get("agenda_state"))
        flow = _normalize_flow_type(row.get("flow_type"))
        start_id = int(row.get("start_turn_id") or row.get("_start_turn_id") or 0)
        end_id = int(row.get("end_turn_id") or row.get("_end_turn_id") or 0)
        if start_id <= 0:
            start_id = 1
        if end_id < start_id:
            end_id = min(total_turns, start_id)
        end_id = min(total_turns, end_id)

        lines.append(f"## 안건 {idx}. {title}")
        lines.append("")
        lines.append(f"- agenda_id: `{agenda_id}`")
        lines.append(f"- 상태: `{state}`")
        lines.append(f"- 흐름: `{flow}`")
        lines.append(f"- turn 범위: `{start_id} ~ {end_id}`")
        summary = _md_text(row.get("summary"))
        if summary:
            lines.append(f"- 요약: {summary}")
        lines.append("")
        agenda_outline_rows.append(f"- 안건 {idx}: {title} (`{state}`, turn {start_id}~{end_id})")

        utterances: list[tuple[int, dict[str, Any]]] = []
        if 1 <= start_id <= end_id <= total_turns:
            for turn_id in range(start_id, end_id + 1):
                utterances.append((turn_id, rt.transcript[turn_id - 1]))
        else:
            seen_ids: set[int] = set()
            for ref in list(row.get("summary_references") or []):
                if not isinstance(ref, dict):
                    continue
                tid = int(ref.get("turn_id") or 0)
                if tid <= 0 or tid > total_turns or tid in seen_ids:
                    continue
                seen_ids.add(tid)
                utterances.append((tid, rt.transcript[tid - 1]))
            utterances.sort(key=lambda x: x[0])

        lines.append(f"### 발언 ({len(utterances)})")
        if not utterances:
            lines.append("- 매핑된 발언이 없습니다.")
        else:
            for turn_id, turn in utterances:
                speaker = _safe_text(turn.get("speaker"), "화자")
                speaker_short = speaker_alias.get(speaker, "화자")
                text = _md_text(turn.get("text"))
                lines.append(f"- ({turn_id}) **{speaker_short}**: {text}")
        lines.append("")

    lines.append("## 안건 목록 요약")
    lines.append("")
    lines.extend(agenda_outline_rows if agenda_outline_rows else ["- 안건 없음"])
    lines.append("")

    return "\n".join(lines).strip() + "\n"


def _snapshot_runtime_for_analysis(rt: RuntimeStore) -> RuntimeStore:
    snap = RuntimeStore()
    snap.meeting_goal = _safe_text(rt.meeting_goal)
    snap.window_size = int(rt.window_size)
    snap.transcript = [dict(row) for row in rt.transcript]
    snap.agenda_outcomes = copy.deepcopy(rt.agenda_outcomes)
    snap.llm_enabled = bool(rt.llm_enabled)
    snap.last_analyzed_count = int(rt.last_analyzed_count)
    snap.agenda_seq = int(rt.agenda_seq)
    snap.stt_chunk_seq = int(rt.stt_chunk_seq)
    snap.used_local_fallback = bool(rt.used_local_fallback)
    snap.last_analysis_warning = _safe_text(rt.last_analysis_warning)
    snap.last_tick_mode = _safe_text(rt.last_tick_mode, "windowed")
    snap.last_title_refine_attempts = int(rt.last_title_refine_attempts)
    snap.last_title_refine_success = int(rt.last_title_refine_success)
    snap.last_llm_parsed_json = copy.deepcopy(rt.last_llm_parsed_json) if isinstance(rt.last_llm_parsed_json, dict) else {}
    snap.last_llm_parsed_at = _safe_text(rt.last_llm_parsed_at)
    snap.analysis_generation = int(rt.analysis_generation)
    snap.transcript_version = int(rt.transcript_version)
    snap.llm_io_seq = int(rt.llm_io_seq)
    snap.llm_io_logs = copy.deepcopy(rt.llm_io_logs) if isinstance(rt.llm_io_logs, list) else []
    return snap


def _apply_analysis_result(rt: RuntimeStore, snap: RuntimeStore) -> None:
    rt.agenda_outcomes = copy.deepcopy(snap.agenda_outcomes)
    rt.last_analyzed_count = int(snap.last_analyzed_count)
    rt.agenda_seq = int(snap.agenda_seq)
    rt.used_local_fallback = bool(snap.used_local_fallback)
    rt.last_analysis_warning = _safe_text(snap.last_analysis_warning)
    rt.last_tick_mode = _safe_text(snap.last_tick_mode, "windowed")
    rt.last_title_refine_attempts = int(snap.last_title_refine_attempts)
    rt.last_title_refine_success = int(snap.last_title_refine_success)
    rt.last_llm_parsed_json = copy.deepcopy(snap.last_llm_parsed_json) if isinstance(snap.last_llm_parsed_json, dict) else {}
    rt.last_llm_parsed_at = _safe_text(snap.last_llm_parsed_at)
    rt.llm_io_seq = int(snap.llm_io_seq)
    rt.llm_io_logs = copy.deepcopy(snap.llm_io_logs) if isinstance(snap.llm_io_logs, list) else []


def _enqueue_analysis(
    rt: RuntimeStore,
    force: bool,
    mode: str,
    source: str = "",
    skip_interval: bool = False,
    target_count: int = 0,
) -> tuple[bool, int, str]:
    rt.analysis_task_seq += 1
    task_id = int(rt.analysis_task_seq)
    task = {
        "id": task_id,
        "force": bool(force),
        "mode": "full_document" if _safe_text(mode) == "full_document" else "windowed",
        "source": _safe_text(source),
        "enqueued_at": _now_ts(),
        "generation": int(rt.analysis_generation),
        "transcript_version": int(rt.transcript_version),
        "skip_interval": bool(skip_interval),
        "target_count": int(max(0, target_count)),
    }
    try:
        ANALYSIS_QUEUE.put_nowait(task)
    except queue.Full:
        return False, task_id, "analysis queue is full"
    rt.analysis_queued += 1
    rt.analysis_last_enqueued_id = task_id
    rt.analysis_last_enqueued_at = _safe_text(task.get("enqueued_at"))
    return True, task_id, ""


def _enqueue_windowed_with_backpressure(rt: RuntimeStore, source: str = "") -> tuple[bool, int, str, bool]:
    transcript_count = len(rt.transcript)
    if rt.analysis_next_windowed_target < SUMMARY_INTERVAL:
        rt.analysis_next_windowed_target = SUMMARY_INTERVAL

    enqueued = 0
    last_task_id = 0
    while rt.analysis_next_windowed_target <= transcript_count:
        ok, task_id, err = _enqueue_analysis(
            rt,
            force=False,
            mode="windowed",
            source=source,
            skip_interval=True,
            target_count=rt.analysis_next_windowed_target,
        )
        if not ok:
            return (enqueued > 0), int(last_task_id), _safe_text(err), False
        enqueued += 1
        last_task_id = int(task_id)
        rt.analysis_next_windowed_target += SUMMARY_INTERVAL

    if enqueued <= 0:
        delta = transcript_count - int(rt.last_analyzed_count)
        return False, 0, f"waiting interval: {delta}/{SUMMARY_INTERVAL}", True
    return True, int(last_task_id), "", False


def _analysis_worker_loop() -> None:
    while True:
        task = ANALYSIS_QUEUE.get()
        try:
            task_gen = int(task.get("generation") or 0)
            snap: RuntimeStore | None = None
            with RT.lock:
                current_gen = int(RT.analysis_generation)
                if task_gen != current_gen:
                    RT.analysis_queued = max(0, int(RT.analysis_queued) - 1)
                    continue
                RT.analysis_inflight = True
                RT.analysis_last_started_id = int(task.get("id") or 0)
                RT.analysis_last_started_at = _now_ts()
                RT.analysis_last_error = ""
                snap = _snapshot_runtime_for_analysis(RT)
                target_count = int(task.get("target_count") or 0)
                if snap is not None and target_count > 0:
                    target_count = max(1, min(target_count, len(snap.transcript)))
                    snap.transcript = list(snap.transcript[:target_count])
                    if snap.last_analyzed_count > target_count:
                        snap.last_analyzed_count = target_count
            try:
                if snap is not None:
                    _run_analysis(
                        snap,
                        force=bool(task.get("force")),
                        mode=_safe_text(task.get("mode"), "windowed"),
                        skip_interval=bool(task.get("skip_interval")),
                    )
            except Exception as exc:
                with RT.lock:
                    RT.analysis_last_error = _safe_text(exc)
                    RT.last_analysis_warning = f"analysis worker 오류: {exc}"
            finally:
                with RT.lock:
                    if task_gen == int(RT.analysis_generation) and snap is not None and not _safe_text(RT.analysis_last_error):
                        _apply_analysis_result(RT, snap)
                        rt_count = len(RT.transcript)
                        next_target = ((int(RT.last_analyzed_count) // SUMMARY_INTERVAL) + 1) * SUMMARY_INTERVAL
                        RT.analysis_next_windowed_target = max(SUMMARY_INTERVAL, min(next_target, rt_count + SUMMARY_INTERVAL))
                    RT.analysis_inflight = False
                    RT.analysis_last_done_id = int(task.get("id") or 0)
                    RT.analysis_last_done_at = _now_ts()
                    RT.analysis_queued = max(0, int(RT.analysis_queued) - 1)
        finally:
            ANALYSIS_QUEUE.task_done()


def _ensure_analysis_worker_started() -> None:
    global ANALYSIS_WORKER_STARTED
    if ANALYSIS_WORKER_STARTED:
        return
    t = threading.Thread(target=_analysis_worker_loop, daemon=True, name="analysis-worker")
    t.start()
    ANALYSIS_WORKER_STARTED = True


def _replay_status(rt: RuntimeStore) -> dict[str, Any]:
    total = len(rt.replay_rows)
    cursor = max(0, min(int(rt.replay_index), total))
    remaining = max(0, total - cursor)
    return {
        "queued_total": total,
        "queued_cursor": cursor,
        "queued_remaining": remaining,
        "done": bool(total > 0 and remaining == 0),
        "source": _safe_text(rt.replay_source),
        "loaded_at": _safe_text(rt.replay_loaded_at),
    }


def _agenda_stack_from_outcomes(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    stack: list[dict[str, str]] = []
    for row in rows:
        st = _safe_text(row.get("agenda_state"), "PROPOSED").upper()
        if st not in {"PROPOSED", "ACTIVE", "CLOSING", "CLOSED"}:
            st = "PROPOSED"
        stack.append({"title": _safe_text(row.get("agenda_title"), "아젠다 미정"), "status": st})
    return stack


def _active_agenda(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    for row in rows:
        if _safe_text(row.get("agenda_state")).upper() in {"ACTIVE", "CLOSING"}:
            return row
    return None


def _refresh_analysis(rt: RuntimeStore) -> dict[str, Any]:
    outcomes = []
    for row in rt.agenda_outcomes:
        if not isinstance(row, dict):
            continue
        summary_items = list(row.get("_summary_items") or [])
        summary = " • ".join(summary_items[-4:]) if summary_items else _safe_text(row.get("summary"))
        key_utterances = list(row.get("key_utterances") or [])
        outcomes.append(
            {
                "agenda_id": _safe_text(row.get("agenda_id")),
                "agenda_title": _safe_text(row.get("agenda_title"), "아젠다 미정"),
                "agenda_state": _safe_text(row.get("agenda_state"), "PROPOSED"),
                "flow_type": _safe_text(row.get("flow_type")),
                "key_utterances": key_utterances,
                "agenda_summary_items": summary_items,
                "summary": summary,
                "summary_references": list(row.get("summary_references") or []),
                "agenda_keywords": list(row.get("agenda_keywords") or []),
                "opinion_groups": list(row.get("opinion_groups") or []),
                "decision_results": list(row.get("decision_results") or []),
                "action_items": list(row.get("action_items") or []),
                "start_turn_id": int(row.get("start_turn_id") or row.get("_start_turn_id") or 0),
                "end_turn_id": int(row.get("end_turn_id") or row.get("_end_turn_id") or 0),
            }
        )

    active = _active_agenda(outcomes)
    candidates = [
        {"title": _safe_text(row.get("agenda_title")), "confidence": 0.7}
        for row in outcomes
        if _safe_text(row.get("agenda_state")).upper() == "PROPOSED"
    ]
    return {
        "agenda": {
            "active": {
                "title": _safe_text((active or {}).get("agenda_title"), ""),
                "confidence": 0.82 if active else 0.0,
            },
            "candidates": candidates[:6],
        },
        "agenda_outcomes": outcomes,
        "evidence_gate": {"claims": []},
    }


def _state_response(rt: RuntimeStore) -> dict[str, Any]:
    client = get_client()
    _ensure_minimum_agenda(rt)
    analysis = _refresh_analysis(rt)
    return {
        "meeting_goal": rt.meeting_goal,
        "initial_context": "",
        "window_size": rt.window_size,
        "transcript": list(rt.transcript),
        "agenda_stack": _agenda_stack_from_outcomes(analysis["agenda_outcomes"]),
        "llm_enabled": rt.llm_enabled,
        "llm_status": client.status(),
        "analysis_runtime": {
            "tick_mode": _safe_text(rt.last_tick_mode, "windowed"),
            "transcript_count": len(rt.transcript),
            "llm_window_turns": rt.window_size,
            "engine_window_turns": rt.window_size,
            "control_plane_source": "gemini",
            "control_plane_reason": rt.last_analysis_warning or ("full_document_once" if rt.last_tick_mode == "full_document" else "summary_every_4_turns"),
            "used_local_fallback": bool(rt.used_local_fallback),
            "title_refine_attempts": int(rt.last_title_refine_attempts),
            "title_refine_success": int(rt.last_title_refine_success),
            "last_llm_json_available": bool(rt.last_llm_parsed_json),
            "last_llm_json_at": _safe_text(rt.last_llm_parsed_at),
            "analysis_worker": _analysis_worker_status(rt),
            "llm_io_count": len(rt.llm_io_logs),
        },
        "replay": _replay_status(rt),
        "llm_io_logs": list(rt.llm_io_logs[-80:]),
        "analysis": analysis,
    }


def _create_agenda(rt: RuntimeStore, title: str, state: str = "ACTIVE") -> dict[str, Any]:
    rt.agenda_seq += 1
    row = {
        "agenda_id": f"agenda-{rt.agenda_seq}",
        "agenda_title": _strip_leading_timestamp(title) or f"안건 {rt.agenda_seq}",
        "agenda_state": state,
        "flow_type": "",
        "key_utterances": [],
        "summary": "",
        "_summary_items": [],
        "summary_references": [],
        "agenda_keywords": [],
        "opinion_groups": [],
        "decision_results": [],
        "action_items": [],
        "start_turn_id": 0,
        "end_turn_id": 0,
    }
    rt.agenda_outcomes.append(row)
    return row


def _ensure_active_agenda(rt: RuntimeStore, title: str) -> dict[str, Any]:
    active = _active_agenda(rt.agenda_outcomes)
    if active is None:
        return _create_agenda(rt, title, "ACTIVE")
    return active


def _ensure_minimum_agenda(rt: RuntimeStore) -> None:
    if rt.agenda_outcomes or not rt.transcript:
        return
    title = _clean_agenda_title("", rt.meeting_goal, []) or "안건 제목 미정"
    row = _create_agenda(rt, title, "ACTIVE")
    row["start_turn_id"] = 1
    row["end_turn_id"] = len(rt.transcript)
    recent = rt.transcript[max(0, len(rt.transcript) - 4) :]
    for t in recent:
        line = f"[{_safe_text(t.get('timestamp'), _now_ts())}] {_safe_text(t.get('text'))}"
        if line:
            row.setdefault("_summary_items", []).append(line)
            row.setdefault("key_utterances", []).append(line)


def _extract_refs(rt: RuntimeStore, evidence_turn_ids: list[int], recent_turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for idx in evidence_turn_ids:
        try:
            pos = int(idx) - 1
        except Exception:
            continue
        if pos < 0 or pos >= len(rt.transcript):
            continue
        t = rt.transcript[pos]
        refs.append(
            {
                "turn_id": pos + 1,
                "speaker": _safe_text(t.get("speaker"), "화자"),
                "timestamp": _safe_text(t.get("timestamp"), _now_ts()),
                "quote": _safe_text(t.get("text")),
                "why": "",
            }
        )
    if refs:
        return refs
    if recent_turns:
        t = recent_turns[-1]
        return [
            {
                "turn_id": int(t.get("turn_id") or 0),
                "speaker": _safe_text(t.get("speaker"), "화자"),
                "timestamp": _safe_text(t.get("timestamp"), _now_ts()),
                "quote": _safe_text(t.get("text")),
                "why": "",
            }
        ]
    return []


def _format_line_from_turn(turn: dict[str, Any], max_chars: int = 180) -> str:
    ts = _safe_text(turn.get("timestamp"), _now_ts())
    text = _strip_leading_timestamp(turn.get("text")).replace("\n", " ").strip()
    if len(text) > max_chars:
        text = text[: max_chars - 1] + "…"
    return f"[{ts}] {text}"


def _ref_from_turn(turn: dict[str, Any], why: str = "요약 근거") -> dict[str, Any]:
    return {
        "turn_id": int(turn.get("turn_id") or 0),
        "speaker": _safe_text(turn.get("speaker"), "화자"),
        "timestamp": _safe_text(turn.get("timestamp"), _now_ts()),
        "quote": _strip_leading_timestamp(turn.get("text")),
        "why": _safe_text(why, "요약 근거"),
    }


def _pick_key_refs(turns: list[dict[str, Any]], keywords: list[str], max_items: int = 6) -> list[dict[str, Any]]:
    scored: list[tuple[float, int, dict[str, Any]]] = []
    kw = [k.lower() for k in keywords[:8]]
    for idx, t in enumerate(turns):
        text = _strip_leading_timestamp(t.get("text"))
        if len(text) < 8:
            continue
        low = text.lower()
        score = min(len(text), 120) / 120.0
        score += sum(2.0 for token in kw if token and token in low)
        if DECISION_PAT.search(text):
            score += 1.4
        if ACTION_PAT.search(text):
            score += 1.0
        scored.append((score, idx, _ref_from_turn(t)))
    if not scored:
        return []
    scored.sort(key=lambda x: (-x[0], x[1]))
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for _, _, ref in scored:
        key = f"{ref.get('timestamp')}|{ref.get('quote')}"
        if key in seen:
            continue
        out.append(ref)
        seen.add(key)
        if len(out) >= max_items:
            break
    return out


def _segment_turns(turns: list[dict[str, Any]]) -> list[tuple[int, int]]:
    n = len(turns)
    if n == 0:
        return []
    if n <= 40:
        return [(0, n)]

    min_seg = 24
    max_seg = 140
    target = max(2, n // 95)
    target_gap = max(min_seg, n // target)
    win = 16

    bounds = [0]
    last = 0
    i = min_seg
    while i < n - min_seg:
        dist = i - last
        prev_txt = " ".join(_strip_leading_timestamp(t.get("text")) for t in turns[max(last, i - win) : i])
        next_txt = " ".join(_strip_leading_timestamp(t.get("text")) for t in turns[i : min(n, i + win)])
        sim = _text_similarity(prev_txt, next_txt)
        cue = bool(TRANSITION_PAT.search(_strip_leading_timestamp(turns[i].get("text")))) or bool(
            TRANSITION_PAT.search(_strip_leading_timestamp(turns[i - 1].get("text")))
        )
        reached_target = dist >= target_gap
        too_long = dist >= max_seg

        should_split = False
        if too_long:
            should_split = True
        elif sim < 0.22 and dist >= min_seg:
            should_split = True
        elif cue and sim < 0.42 and reached_target:
            should_split = True
        elif reached_target and sim < 0.30:
            should_split = True

        if should_split:
            bounds.append(i)
            last = i
            i += max(4, min_seg // 2)
            continue
        i += 1

    bounds.append(n)
    segments: list[tuple[int, int]] = []
    for s, e in zip(bounds[:-1], bounds[1:]):
        if e <= s:
            continue
        if segments and (e - s) < min_seg:
            ps, _ = segments[-1]
            segments[-1] = (ps, e)
        else:
            segments.append((s, e))

    if len(segments) <= 1 and n >= 120:
        pieces = max(2, min(4, n // 180 + 1))
        step = max(1, n // pieces)
        segments = []
        for p in range(pieces):
            s = p * step
            e = n if p == pieces - 1 else min(n, (p + 1) * step)
            if e > s:
                segments.append((s, e))

    dynamic_cap = max(3, target * 2)
    while len(segments) > dynamic_cap:
        lengths = [(idx, seg[1] - seg[0]) for idx, seg in enumerate(segments)]
        idx = min(lengths, key=lambda x: x[1])[0]
        if idx == 0:
            merged = (segments[0][0], segments[1][1])
            segments = [merged] + segments[2:]
        elif idx == len(segments) - 1:
            merged = (segments[-2][0], segments[-1][1])
            segments = segments[:-2] + [merged]
        else:
            left_len = segments[idx - 1][1] - segments[idx - 1][0]
            right_len = segments[idx + 1][1] - segments[idx + 1][0]
            if left_len <= right_len:
                merged = (segments[idx - 1][0], segments[idx][1])
                segments = segments[: idx - 1] + [merged] + segments[idx + 1 :]
            else:
                merged = (segments[idx][0], segments[idx + 1][1])
                segments = segments[:idx] + [merged] + segments[idx + 2 :]

    return segments


def _pick_key_utterances(turns: list[dict[str, Any]], keywords: list[str], max_items: int = 20) -> list[str]:
    scored: list[tuple[float, int, str]] = []
    kw = [k.lower() for k in keywords[:8]]
    for idx, t in enumerate(turns):
        text = _strip_leading_timestamp(t.get("text"))
        if len(text) < 8:
            continue
        low = text.lower()
        score = min(len(text), 120) / 120.0
        score += sum(2.0 for token in kw if token and token in low)
        if DECISION_PAT.search(text):
            score += 1.4
        if ACTION_PAT.search(text):
            score += 1.0
        scored.append((score, idx, _format_line_from_turn(t)))
    if not scored:
        return []
    scored.sort(key=lambda x: (-x[0], x[1]))
    picked: list[str] = []
    seen: set[str] = set()
    for _, _, line in scored:
        if line in seen:
            continue
        picked.append(line)
        seen.add(line)
        if len(picked) >= max_items:
            break
    return picked


def _extract_decisions_from_turns(turns: list[dict[str, Any]], max_items: int = 6) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for t in turns:
        text = _strip_leading_timestamp(t.get("text"))
        if not text or not DECISION_PAT.search(text):
            continue
        key = text[:120]
        if key in seen:
            continue
        seen.add(key)
        out.append({"opinions": [_format_line_from_turn(t)], "conclusion": key})
        if len(out) >= max_items:
            break
    return out


def _extract_actions_from_turns(turns: list[dict[str, Any]], max_items: int = 10) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for t in turns:
        text = _strip_leading_timestamp(t.get("text"))
        if not text:
            continue
        if not ACTION_PAT.search(text) and not DUE_PAT.search(text):
            continue
        due = ""
        m = DUE_PAT.search(text)
        if m:
            due = _safe_text(m.group(1))
        owner = _safe_text(t.get("speaker"), "-")
        task = text[:160]
        dedup = f"{task}|{owner}|{due}"
        if dedup in seen:
            continue
        seen.add(dedup)
        out.append(
            {
                "item": task,
                "owner": owner,
                "due": due,
                "reasons": [
                    {
                        "speaker": owner,
                        "timestamp": _safe_text(t.get("timestamp"), _now_ts()),
                        "quote": text,
                        "why": "발화 기반 추출",
                    }
                ],
            }
        )
        if len(out) >= max_items:
            break
    return out


def _agenda_turn_overlap_ratio(
    left_start: int,
    left_end: int,
    right_start: int,
    right_end: int,
) -> float:
    if left_start <= 0 or left_end < left_start or right_start <= 0 or right_end < right_start:
        return 0.0
    overlap = min(left_end, right_end) - max(left_start, right_start) + 1
    if overlap <= 0:
        return 0.0
    base = max(1, min(left_end - left_start + 1, right_end - right_start + 1))
    return float(overlap) / float(base)


def _reuse_previous_agenda_ids(
    previous_outcomes: list[dict[str, Any]],
    cleaned_outcomes: list[dict[str, Any]],
) -> list[str]:
    assigned_ids: list[str] = []
    used_prev_indexes: set[int] = set()

    for row_idx, row in enumerate(cleaned_outcomes):
        row_title = _safe_text(row.get("agenda_title"))
        row_start = int(row.get("_start_turn_id") or 0)
        row_end = int(row.get("_end_turn_id") or 0)
        best_prev_idx = -1
        best_score = 0.0

        for prev_idx, prev in enumerate(previous_outcomes):
            if prev_idx in used_prev_indexes:
                continue

            prev_id = _safe_text(prev.get("agenda_id"))
            if not prev_id:
                continue

            prev_title = _safe_text(prev.get("agenda_title"))
            prev_start = int(prev.get("start_turn_id") or 0)
            prev_end = int(prev.get("end_turn_id") or 0)
            title_score = 1.0 if row_title and row_title == prev_title else _text_similarity(row_title, prev_title)
            overlap_score = _agenda_turn_overlap_ratio(row_start, row_end, prev_start, prev_end)
            order_bonus = max(0.0, 0.25 - abs(prev_idx - row_idx) * 0.08)
            score = (title_score * 0.65) + (overlap_score * 0.85) + order_bonus

            if score > best_score:
                best_score = score
                best_prev_idx = prev_idx

        if best_prev_idx >= 0 and best_score >= 0.45:
            used_prev_indexes.add(best_prev_idx)
            assigned_ids.append(_safe_text(previous_outcomes[best_prev_idx].get("agenda_id")))
        else:
            assigned_ids.append("")

    return assigned_ids


def _max_agenda_sequence(agenda_rows: list[dict[str, Any]]) -> int:
    max_seq = 0
    for row in agenda_rows:
        agenda_id = _safe_text(row.get("agenda_id"))
        match = re.match(r"^agenda-(\d+)$", agenda_id)
        if not match:
            continue
        max_seq = max(max_seq, int(match.group(1)))
    return max_seq


def _dedup_preserve(items: list[str], limit: int = 10) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        txt = _safe_text(item)
        if not txt or txt in seen:
            continue
        out.append(txt)
        seen.add(txt)
        if len(out) >= limit:
            break
    return out


def _slice_turns_by_id_range(turns: list[dict[str, Any]], start_id: int, end_id: int) -> list[dict[str, Any]]:
    if not turns:
        return []
    s = int(start_id or 0)
    e = int(end_id or 0)
    if s <= 0 and e <= 0:
        return list(turns)
    if e > 0 and e < s:
        e = s
    out: list[dict[str, Any]] = []
    for t in turns:
        tid = int(t.get("turn_id") or 0)
        if tid <= 0:
            continue
        if s > 0 and tid < s:
            continue
        if e > 0 and tid > e:
            continue
        out.append(t)
    return out


def _sample_turns_for_title(seg_turns: list[dict[str, Any]], max_items: int = 140) -> list[dict[str, Any]]:
    if len(seg_turns) <= max_items:
        return list(seg_turns)
    if max_items <= 0:
        return []

    head = min(20, max_items // 4)
    tail = min(20, max_items // 4)
    mid = max(0, max_items - head - tail)
    n = len(seg_turns)

    idxs: set[int] = set()
    for i in range(head):
        idxs.add(i)
    for i in range(n - tail, n):
        if i >= 0:
            idxs.add(i)

    if mid > 0:
        span_start = head
        span_end = max(span_start, n - tail)
        span = max(1, span_end - span_start)
        for i in range(mid):
            pos = span_start + int((i / max(1, mid - 1)) * (span - 1))
            idxs.add(pos)

    ordered = sorted(idxs)
    return [seg_turns[i] for i in ordered if 0 <= i < n]


def _request_agenda_title_with_llm(
    rt: RuntimeStore,
    client: Any,
    meeting_goal: str,
    turns: list[dict[str, Any]],
    start_turn_id: int,
    end_turn_id: int,
    summary_items: list[str],
    key_utterances: list[str],
    keywords: list[str],
) -> str:
    seg_turns = _slice_turns_by_id_range(turns, start_turn_id, end_turn_id)
    if not seg_turns:
        seg_turns = list(turns)
    if not seg_turns:
        return ""

    sampled = _sample_turns_for_title(seg_turns, max_items=140)
    lines: list[str] = []
    for t in sampled:
        tid = int(t.get("turn_id") or 0)
        ts = _safe_text(t.get("timestamp"), _now_ts())
        speaker = _safe_text(t.get("speaker"), "화자")
        text = _strip_leading_timestamp(t.get("text"))
        if not text:
            continue
        lines.append(f"- turn_id={tid} | {ts} | {speaker} | {text}")
    if not lines:
        return ""

    summary_ctx: list[str] = []
    for item in summary_items[:8]:
        _, body = _split_ts_prefix(item)
        point = _to_summary_point(body, max_len=None)
        if point:
            summary_ctx.append(f"- {point}")

    key_ctx: list[str] = []
    for item in key_utterances[:8]:
        _, body = _split_ts_prefix(item)
        point = _to_summary_point(body, max_len=None)
        if point:
            key_ctx.append(f"- {point}")

    prompt = f"""
너는 회의 안건 제목 생성기다. 출력은 JSON 객체 하나만 반환한다.

[입력]
- 회의 목표: {_safe_text(meeting_goal, "미정")}
- 안건 구간: turn_id {start_turn_id}~{end_turn_id}
- 안건 키워드: {", ".join([_safe_text(k) for k in keywords[:6]]) or "없음"}
- 안건 요약 포인트:
{chr(10).join(summary_ctx) if summary_ctx else "- 없음"}
- 안건 핵심 발언:
{chr(10).join(key_ctx) if key_ctx else "- 없음"}
- 안건 구간 발화(시간순):
{chr(10).join(lines)}

[규칙]
1) 위 안건 구간 전체를 관통하는 상위 논지를 한국어 한 문장으로 요약한다.
2) 발화 한 줄을 그대로 복사하지 않는다.
3) 단어 나열, "A · B 논의", "안건 N" 같은 형식 문구를 금지한다.
4) 자연스러운 한 문장 제목으로 작성한다.

[출력 JSON]
{{
  "agenda_title": "string"
}}
""".strip()

    try:
        parsed = _call_llm_json(
            rt=rt,
            client=client,
            prompt=prompt,
            stage="title_refine.segment",
            temperature=0.05,
            max_tokens=220,
        )
    except Exception:
        return ""

    candidate = _safe_text(parsed.get("agenda_title") or parsed.get("title"))
    candidate = _to_summary_point(candidate, max_len=None)
    candidate = _safe_text(candidate).strip(" .,!?:;/|")
    if not candidate:
        return ""
    if _is_low_quality_title(candidate, meeting_goal):
        return ""
    return _safe_text(candidate[:80], "")


def _refresh_low_quality_titles_with_llm(
    client: Any,
    rt: RuntimeStore,
    turns: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    refreshed: list[dict[str, Any]] = []
    attempts = 0
    success = 0
    for row in outcomes:
        item = dict(row)
        title = _safe_text(item.get("agenda_title"))
        if (not title) or _is_low_quality_title(title, rt.meeting_goal):
            attempts += 1
            regenerated = _request_agenda_title_with_llm(
                rt=rt,
                client=client,
                meeting_goal=rt.meeting_goal,
                turns=turns,
                start_turn_id=int(item.get("_start_turn_id") or item.get("start_turn_id") or 0),
                end_turn_id=int(item.get("_end_turn_id") or item.get("end_turn_id") or 0),
                summary_items=[_safe_text(x) for x in (item.get("_summary_items") or [])],
                key_utterances=[_safe_text(x) for x in (item.get("key_utterances") or [])],
                keywords=[_safe_text(x) for x in (item.get("agenda_keywords") or [])],
            )
            if regenerated:
                item["agenda_title"] = regenerated
                success += 1
        refreshed.append(item)
    return refreshed, attempts, success


def _compact_summary_line(text: str, max_len: int = 90) -> str:
    s = _strip_leading_timestamp(text)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^(음|어|네|예|일단|그러면|그럼|근데|그러니까)\s+", "", s)
    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    return _safe_text(s)


def _enrich_outcome_summary(
    rt: RuntimeStore,
    row: dict[str, Any],
    turns: list[dict[str, Any]],
) -> dict[str, Any]:
    out = dict(row)
    start_id = int(out.get("_start_turn_id") or out.get("start_turn_id") or 0)
    end_id = int(out.get("_end_turn_id") or out.get("end_turn_id") or 0)
    seg_turns = _slice_turns_by_id_range(turns, start_id, end_id)
    if not seg_turns:
        return out

    keywords = _dedup_preserve([_safe_text(k) for k in out.get("agenda_keywords") or []], limit=6)
    if len(keywords) < 3:
        extra = _top_keywords_from_rows(seg_turns, rt.meeting_goal, limit=6)
        keywords = _dedup_preserve(keywords + extra, limit=6)
    out["agenda_keywords"] = keywords

    refs = _pick_key_refs(seg_turns, keywords, max_items=8)

    key_utterances = _dedup_preserve([_safe_text(x) for x in out.get("key_utterances") or []], limit=20)
    if len(key_utterances) < 3:
        auto_key = [f"[{_safe_text(r.get('timestamp'))}] {_safe_text(r.get('quote'))}" for r in refs[:12]]
        key_utterances = _dedup_preserve(key_utterances + auto_key, limit=20)
    out["key_utterances"] = key_utterances

    summary_items = _normalize_summary_item_lines([_safe_text(x) for x in out.get("_summary_items") or []])
    summary_refs = [dict(x) for x in (out.get("summary_references") or []) if isinstance(x, dict)]

    has_min_summary = len(summary_items) >= 2
    has_min_refs = len(summary_refs) >= 2
    if (not has_min_summary) or (not has_min_refs):
        auto_items: list[str] = []
        auto_refs: list[dict[str, Any]] = []
        for idx, ref in enumerate(refs[:12]):
            quote = _to_summary_point(_safe_text(ref.get("quote")))
            if not quote:
                continue
            ts = _safe_text(ref.get("timestamp"), _now_ts())
            auto_items.append(f"[{ts}] {quote}")
            auto_refs.append(
                {
                    "turn_id": int(ref.get("turn_id") or 0),
                    "speaker": _safe_text(ref.get("speaker"), "화자"),
                    "timestamp": ts,
                    "quote": _safe_text(ref.get("quote")),
                    "why": quote,
                }
            )
            if idx >= 9:
                break

        if not has_min_summary:
            summary_items = _dedup_preserve(summary_items + auto_items, limit=20)
        if not has_min_refs:
            summary_refs = summary_refs + auto_refs

    if not summary_refs:
        summary_refs = [_ref_from_turn(seg_turns[-1], why="요약 근거")]
    out["_summary_items"] = _normalize_summary_item_lines(summary_items)
    out["summary_references"] = summary_refs[:24]
    if not _safe_text(out.get("summary")):
        out["summary"] = " • ".join(x.split("] ", 1)[-1] for x in out["_summary_items"][:10])
    out["agenda_title"] = _finalize_agenda_title(
        out.get("agenda_title"),
        rt.meeting_goal,
        [_safe_text(k) for k in out.get("agenda_keywords") or []],
        out.get("_summary_items") or [],
        out.get("key_utterances") or [],
    )
    return out


def _build_local_outcomes(rt: RuntimeStore, turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segments = _segment_turns(turns)
    if not segments and turns:
        segments = [(0, len(turns))]

    global_df = _doc_freq(turns)
    global_turn_count = len(turns)
    outcomes: list[dict[str, Any]] = []
    used_titles: set[str] = set()

    for seg_idx, (s, e) in enumerate(segments):
        seg_turns = turns[s:e]
        if not seg_turns:
            continue
        keywords = _top_keywords_from_rows(
            seg_turns,
            rt.meeting_goal,
            limit=6,
            global_doc_freq=global_df,
            global_turn_count=global_turn_count,
        )

        key_refs = _pick_key_refs(seg_turns, keywords, max_items=8)
        key_utterances = [f"[{_safe_text(r.get('timestamp'))}] {_safe_text(r.get('quote'))}" for r in key_refs]
        summary_refs = key_refs[:10] if key_refs else [_ref_from_turn(seg_turns[-1])]
        summary_items = [f"[{_safe_text(r.get('timestamp'))}] {_to_summary_point(_safe_text(r.get('quote')))}" for r in summary_refs]
        summary_items = _normalize_summary_item_lines(summary_items)

        seed_candidates = [t.get("text") for t in seg_turns[:6]] + [t.get("text") for t in seg_turns[-6:]]
        seed_title = _extractive_title_from_candidates([_safe_text(x) for x in seed_candidates], rt.meeting_goal)
        title = _finalize_agenda_title(seed_title, rt.meeting_goal, keywords, summary_items, key_utterances)
        if not _safe_text(title):
            title = f"안건 {seg_idx + 1}"
        if title in used_titles:
            title = f"{title} #{seg_idx + 1}"
        used_titles.add(title)

        summary = " • ".join(item.split("] ", 1)[-1] for item in summary_items[:10])
        decisions = _extract_decisions_from_turns(seg_turns, max_items=4)
        actions = _extract_actions_from_turns(seg_turns, max_items=6)

        flow_type = "discussion"
        if decisions:
            flow_type = "decision"
        elif actions:
            flow_type = "action-planning"

        outcomes.append(
            {
                "agenda_title": _strip_leading_timestamp(title) or f"안건 {seg_idx + 1}",
                "agenda_state": "ACTIVE" if seg_idx == len(segments) - 1 else "CLOSED",
                "flow_type": flow_type,
                "key_utterances": _dedup_preserve(key_utterances, limit=20),
                "_summary_items": _dedup_preserve(summary_items, limit=20),
                "summary_references": summary_refs,
                "summary": _safe_text(summary),
                "agenda_keywords": _dedup_preserve(keywords, limit=6),
                "opinion_groups": [],
                "decision_results": decisions,
                "action_items": actions,
                "_start_turn_id": int(seg_turns[0].get("turn_id", 1) or 1),
                "_end_turn_id": int(seg_turns[-1].get("turn_id", 1) or 1),
            }
        )

    return outcomes


def _normalize_outcome_ranges(
    outcomes: list[dict[str, Any]],
    min_turn_id: int,
    max_turn_id: int,
) -> list[dict[str, Any]]:
    cleaned = [dict(row) for row in outcomes if isinstance(row, dict)]
    if not cleaned:
        return []
    cleaned.sort(key=lambda x: int(x.get("_start_turn_id") or x.get("start_turn_id") or 10**9))

    lo = int(min_turn_id or 1)
    hi = int(max(max_turn_id, lo))
    prev_end = lo - 1

    for idx, row in enumerate(cleaned):
        start_id = int(row.get("_start_turn_id") or row.get("start_turn_id") or 0)
        end_id = int(row.get("_end_turn_id") or row.get("end_turn_id") or 0)

        if start_id <= 0:
            start_id = prev_end + 1 if prev_end >= lo else lo
        start_id = max(start_id, prev_end + 1, lo)
        start_id = min(start_id, hi)

        if end_id < start_id:
            end_id = start_id
        end_id = max(start_id, min(end_id, hi))

        row["_start_turn_id"] = start_id
        row["_end_turn_id"] = end_id
        prev_end = end_id

    for idx, row in enumerate(cleaned[:-1]):
        next_start = int(cleaned[idx + 1].get("_start_turn_id") or 0)
        start_id = int(row.get("_start_turn_id") or 0)
        end_id = int(row.get("_end_turn_id") or 0)
        if next_start > 0 and end_id >= next_start:
            row["_end_turn_id"] = max(start_id, next_start - 1)

    if cleaned:
        cleaned[0]["_start_turn_id"] = lo
        last_start = int(cleaned[-1].get("_start_turn_id") or lo)
        cleaned[-1]["_end_turn_id"] = max(last_start, hi)

    return cleaned


def _refine_outcomes_by_density(
    rt: RuntimeStore,
    outcomes: list[dict[str, Any]],
    turns: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], str]:
    if not outcomes or not turns:
        return outcomes, ""

    turn_ids = [int(t.get("turn_id") or 0) for t in turns if int(t.get("turn_id") or 0) > 0]
    if not turn_ids:
        return outcomes, ""

    min_turn = min(turn_ids)
    max_turn = max(turn_ids)
    total_turns = max_turn - min_turn + 1
    if total_turns <= 0:
        return outcomes, ""

    normalized = _normalize_outcome_ranges(outcomes, min_turn, max_turn)
    if not normalized:
        return outcomes, ""

    # 대화 길이에 맞춰 최소 안건 수와 최대 안건 폭을 동적으로 조정한다.
    expected_min = 1 if total_turns < 90 else max(2, min(10, round(total_turns / 90)))
    max_span = 120 if total_turns < 220 else max(130, min(240, int(total_turns * 0.33)))
    split_min_span = 75 if total_turns < 220 else max(85, int(total_turns * 0.14))

    turn_map = {int(t.get("turn_id") or 0): t for t in turns}
    adjusted: list[dict[str, Any]] = []
    split_rows = 0

    for row in normalized:
        start_id = int(row.get("_start_turn_id") or 0)
        end_id = int(row.get("_end_turn_id") or 0)
        span = end_id - start_id + 1
        need_more = len(normalized) < expected_min
        should_split = span > max_span or (need_more and span >= split_min_span)

        if not should_split:
            adjusted.append(row)
            continue

        seg_turns = [turn_map[i] for i in range(start_id, end_id + 1) if i in turn_map]
        if len(seg_turns) < 40:
            adjusted.append(row)
            continue

        local_rows = _build_local_outcomes(rt, seg_turns)
        local_rows = _normalize_outcome_ranges(local_rows, start_id, end_id)
        if len(local_rows) <= 1:
            adjusted.append(row)
            continue

        base_state = _normalize_agenda_state(row.get("agenda_state"))
        for idx, local in enumerate(local_rows):
            merged = dict(local)
            if base_state in {"ACTIVE", "CLOSING"}:
                merged["agenda_state"] = "ACTIVE" if idx == len(local_rows) - 1 else "CLOSED"
            elif base_state == "CLOSED":
                merged["agenda_state"] = "CLOSED"
            else:
                merged["agenda_state"] = base_state
            adjusted.append(merged)
        split_rows += len(local_rows) - 1

    adjusted = _normalize_outcome_ranges(adjusted, min_turn, max_turn)
    if not adjusted:
        return normalized, ""

    if len(adjusted) < expected_min and total_turns >= 160:
        local_all = _build_local_outcomes(rt, turns)
        local_all = _normalize_outcome_ranges(local_all, min_turn, max_turn)
        if len(local_all) > len(adjusted):
            return local_all, f"LLM 안건 수가 적어 로컬 경계 보정 적용({len(local_all)}개)"

    if split_rows > 0:
        return adjusted, f"과대 안건 범위 자동 분할 적용(+{split_rows})"

    return adjusted, ""


def _apply_outcomes(rt: RuntimeStore, outcomes: list[dict[str, Any]]) -> None:
    cleaned = [dict(row) for row in outcomes if isinstance(row, dict)]
    if not cleaned:
        return
    cleaned.sort(key=lambda x: int(x.get("_start_turn_id") or 10**9))

    prev_end = 0
    for idx, row in enumerate(cleaned):
        start_id = int(row.get("_start_turn_id") or row.get("start_turn_id") or 0)
        end_id = int(row.get("_end_turn_id") or row.get("end_turn_id") or 0)
        if start_id <= 0:
            start_id = prev_end + 1 if prev_end > 0 else (idx + 1)
        if end_id < start_id:
            end_id = start_id
        row["_start_turn_id"] = start_id
        row["_end_turn_id"] = end_id
        prev_end = max(prev_end, end_id)

    for idx, row in enumerate(cleaned):
        if idx >= len(cleaned) - 1:
            continue
        next_start = int(cleaned[idx + 1].get("_start_turn_id") or 0)
        end_id = int(row.get("_end_turn_id") or 0)
        start_id = int(row.get("_start_turn_id") or 0)
        if next_start > 0 and (end_id <= start_id or end_id >= next_start):
            row["_end_turn_id"] = max(start_id, next_start - 1)

    active_idx = -1
    for idx, row in enumerate(cleaned):
        if _normalize_agenda_state(row.get("agenda_state")) in {"ACTIVE", "CLOSING"}:
            active_idx = idx
            break
    if active_idx < 0 and cleaned:
        active_idx = len(cleaned) - 1

    for idx, row in enumerate(cleaned):
        if idx == active_idx:
            row["agenda_state"] = "ACTIVE"
        elif _normalize_agenda_state(row.get("agenda_state")) == "ACTIVE":
            row["agenda_state"] = "CLOSED"
        else:
            row["agenda_state"] = _normalize_agenda_state(row.get("agenda_state"))

    previous_outcomes = [copy.deepcopy(item) for item in rt.agenda_outcomes if isinstance(item, dict)]
    reused_agenda_ids = _reuse_previous_agenda_ids(previous_outcomes, cleaned)

    rt.agenda_outcomes = []
    rt.agenda_seq = 0
    for row_idx, row in enumerate(cleaned):
        created = _create_agenda(rt, _safe_text(row.get("agenda_title"), "안건 제목 미정"), _normalize_agenda_state(row.get("agenda_state")))
        reused_agenda_id = _safe_text(reused_agenda_ids[row_idx] if row_idx < len(reused_agenda_ids) else "")
        if reused_agenda_id:
            created["agenda_id"] = reused_agenda_id
        created["flow_type"] = _safe_text(row.get("flow_type"))
        created["key_utterances"] = _dedup_preserve(list(row.get("key_utterances") or []), limit=20)
        created["_summary_items"] = _dedup_preserve(list(row.get("_summary_items") or []), limit=20)
        created["summary_references"] = list(row.get("summary_references") or [])
        created["summary"] = _safe_text(row.get("summary"))
        created["agenda_keywords"] = _dedup_preserve(list(row.get("agenda_keywords") or []), limit=6)
        created["opinion_groups"] = list(row.get("opinion_groups") or [])
        created["decision_results"] = list(row.get("decision_results") or [])
        created["action_items"] = list(row.get("action_items") or [])
        created["start_turn_id"] = int(row.get("_start_turn_id") or 0)
        created["end_turn_id"] = int(row.get("_end_turn_id") or 0)
    rt.agenda_seq = max(rt.agenda_seq, _max_agenda_sequence(rt.agenda_outcomes))


def _to_ids(raw_ids: Any) -> list[int]:
    out: list[int] = []
    for x in raw_ids or []:
        try:
            out.append(int(str(x)))
        except Exception:
            continue
    return out


def _build_agenda_outline_prompt(rt: RuntimeStore, turns: list[dict[str, Any]], current_agenda_title: str, mode: str = "windowed") -> str:
    meeting_goal = _safe_text(rt.meeting_goal, "미정")
    turn_count = len(turns)
    agenda_hint_min = 1 if turn_count < 90 else max(2, min(10, round(turn_count / 100)))
    agenda_hint_max = max(agenda_hint_min, min(12, agenda_hint_min + 3))
    lines = []
    for turn in turns:
        text = _strip_leading_timestamp(turn.get("text"))
        lines.append(
            f"- turn_id={turn['turn_id']} | {turn['timestamp']} | {turn['speaker']} | {text}"
        )
    transcript_block = "\n".join(lines)

    return f"""
너는 회의 아젠다 구간 분할기다. 출력은 반드시 JSON 하나만 반환한다.

[입력]
- 전체 회의 목표: {meeting_goal}
- 현재 진행 안건: {current_agenda_title or "없음"}
- 분석 모드: {mode}
- 발화 목록(시간순):
{transcript_block}

[중요 규칙]
1) 안건은 "흐름 전환 시점" 기준으로 순서대로 나눈다. 즉, 주제가 전환될 때마다 새 안건을 만든다.
2) 안건 제목은 해당 안건 구간의 모든 발언을 관통하는 "상위 논지"를 한국어 한 문장으로 요약해 작성한다. 단어 나열/문장 복사는 금지한다.
3) 현재 진행 안건이 이미 있으면, 정말로 주제가 크게 바뀌었을 때만 새 ACTIVE 안건으로 둔다.
4) 각 안건은 start_turn_id/end_turn_id를 반드시 포함하고, 안건 간 구간은 시간순/비중첩으로 작성한다.
5) 분석 모드가 full_document이면, 발화 전체를 끝까지 보고 안건을 한 번에 완성한다. 중간 단계 안건 생성은 금지한다.
6) full_document에서는 총 발화 수({turn_count})를 고려해 안건 수를 동적으로 잡아라. 권장 안건 수는 {agenda_hint_min}~{agenda_hint_max}개이며, 마지막 안건만 과도하게 길어지지 않게 분할한다.
7) 이 단계에서는 상세 필드(키워드, 핵심발언, 요약, 근거, 의사결정, 액션아이템)를 생성하지 않는다.

[출력 JSON 스키마]
{{
  "active_agenda_title": "string",
  "agendas": [
    {{
      "agenda_title": "string",
      "agenda_state": "PROPOSED|ACTIVE|CLOSING|CLOSED",
      "start_turn_id": 1,
      "end_turn_id": 20,
      "flow_type": "discussion|decision|action-planning"
    }}
  ]
}}
""".strip()


def _build_agenda_detail_prompt(
    rt: RuntimeStore,
    agenda_title: str,
    agenda_state: str,
    flow_type: str,
    start_turn_id: int,
    end_turn_id: int,
    seg_turns: list[dict[str, Any]],
) -> str:
    meeting_goal = _safe_text(rt.meeting_goal, "미정")
    lines = []
    for turn in seg_turns:
        text = _strip_leading_timestamp(turn.get("text"))
        lines.append(
            f"- turn_id={turn['turn_id']} | {turn['timestamp']} | {turn['speaker']} | {text}"
        )
    transcript_block = "\n".join(lines)

    return f"""
너는 회의 안건 상세 추출기다. 출력은 반드시 JSON 하나만 반환한다.

[입력]
- 전체 회의 목표: {meeting_goal}
- 안건 제목: {_safe_text(agenda_title, "미정")}
- 안건 상태: {_safe_text(agenda_state, "PROPOSED")}
- 안건 흐름 타입: {_safe_text(flow_type, "discussion")}
- 안건 turn 범위: {start_turn_id}~{end_turn_id}
- 안건 구간 발화(시간순):
{transcript_block}

[중요 규칙]
1) 아래 출력 필드만 채운다.
2) evidence_turn_ids, key_utterance_turn_ids는 반드시 입력 turn_id만 사용한다.
3) agenda_keywords는 3~6개 핵심 용어로 작성한다.
4) key_utterance_turn_ids는 핵심 발언 turn_id를 3~10개로 선택한다.
5) agenda_summary_items는 2개 이상 작성하고, 각 항목에 evidence_turn_ids를 포함한다.
6) summary는 위 summary_items를 1~3문장으로 종합한 안건 요약이다.
7) decision_results는 확정된 결론만 포함한다. 없으면 빈 배열.
8) action_items는 누가/무엇/기한/근거를 포함한다. 없으면 빈 배열.
9) 원문 장문 인용은 금지하고, 요약 문장으로 작성한다.
10) opinion_groups를 반드시 작성한다. 안건 내 유사 의견을 묶어 2~8개 그룹으로 정리한다.
11) 각 opinion_groups 항목은 type, summary, evidence_turn_ids를 포함해야 한다.
12) type은 proposal|concern|question|agree|disagree|info 중 하나만 사용한다.

[출력 JSON 스키마]
{{
  "agenda_keywords": ["string", "string"],
  "key_utterance_turn_ids": [1,2,3],
  "agenda_summary_items": [
    {{"summary": "string", "evidence_turn_ids": [1,2]}}
  ],
  "summary": "string",
  "opinion_groups": [
    {{
      "type": "proposal|concern|question|agree|disagree|info",
      "summary": "string",
      "evidence_turn_ids": [1,2]
    }}
  ],
  "decision_results": [
    {{
      "conclusion": "string",
      "opinions": ["string"],
      "evidence_turn_ids": [1,2]
    }}
  ],
  "action_items": [
    {{
      "item": "string",
      "owner": "string",
      "due": "string",
      "reason": "string",
      "evidence_turn_ids": [1,2]
    }}
  ]
}}
""".strip()


def _build_windowed_shift_prompt(
    rt: RuntimeStore,
    current_title: str,
    current_flow_type: str,
    current_start_turn_id: int,
    recent_turns: list[dict[str, Any]],
) -> str:
    meeting_goal = _safe_text(rt.meeting_goal, "미정")
    lines = []
    for turn in recent_turns:
        text = _strip_leading_timestamp(turn.get("text"))
        lines.append(
            f"- turn_id={turn['turn_id']} | {turn['timestamp']} | {turn['speaker']} | {text}"
        )
    transcript_block = "\n".join(lines)
    return f"""
너는 실시간 회의 안건 전환 감지기다. 출력은 JSON 하나만 반환한다.

[입력]
- 회의 목표: {meeting_goal}
- 현재 ACTIVE 안건: {_safe_text(current_title, "없음")}
- 현재 안건 흐름 타입: {_safe_text(current_flow_type, "discussion")}
- 현재 안건 시작 turn_id: {int(current_start_turn_id or 1)}
- 최근 발화:
{transcript_block}

[규칙]
1) 최근 발화가 현재 안건과 동일 흐름이면 shifted=false.
2) 주제 전환이 충분히 명확하면 shifted=true.
3) shifted=true일 때만 new_agenda_title/new_flow_type/shift_turn_id를 채운다.
4) shift_turn_id는 입력 turn_id 중 하나여야 한다.
5) new_agenda_title은 상위 논지 한 문장으로 작성한다.

[출력 JSON]
{{
  "shifted": true,
  "shift_turn_id": 120,
  "new_agenda_title": "string",
  "new_flow_type": "discussion|decision|action-planning",
  "reason": "string"
}}
""".strip()


def _extract_detail_fields_from_parsed(
    rt: RuntimeStore,
    turns: list[dict[str, Any]],
    seg_turns: list[dict[str, Any]],
    detail_parsed: dict[str, Any],
) -> dict[str, Any]:
    keywords = _dedup_preserve([_safe_text(x) for x in (detail_parsed.get("agenda_keywords") or []) if _safe_text(x)], limit=8)
    key_refs = _extract_refs(rt, _to_ids(detail_parsed.get("key_utterance_turn_ids")), turns)
    key_utterances = _dedup_preserve([f"[{r['timestamp']}] {r['quote']}" for r in key_refs], limit=8)

    summary_items: list[str] = []
    summary_references: list[dict[str, Any]] = []
    for it in detail_parsed.get("agenda_summary_items") or []:
        if not isinstance(it, dict):
            continue
        txt = _to_summary_point(_safe_text(it.get("summary")))
        if not txt:
            continue
        refs = _extract_refs(rt, _to_ids(it.get("evidence_turn_ids")), turns)
        if refs:
            summary_items.append(f"[{refs[0]['timestamp']}] {txt}")
            for ref in refs[:6]:
                summary_references.append(
                    {
                        "turn_id": int(ref.get("turn_id") or 0),
                        "speaker": ref["speaker"],
                        "timestamp": ref["timestamp"],
                        "quote": ref["quote"],
                        "why": txt,
                    }
                )
        else:
            summary_items.append(txt)
    if not summary_items:
        from_keys: list[str] = []
        for line in key_utterances[:10]:
            ts, body = _split_ts_prefix(line)
            point = _to_summary_point(body)
            if not point:
                continue
            from_keys.append(f"[{ts}] {point}" if ts else point)
        summary_items = from_keys
    summary_items = _normalize_summary_item_lines(summary_items)
    if not summary_references:
        for ref in key_refs[:10]:
            summary_references.append(
                {
                    "turn_id": int(ref.get("turn_id") or 0),
                    "speaker": ref["speaker"],
                    "timestamp": ref["timestamp"],
                    "quote": ref["quote"],
                    "why": "핵심 발언",
                }
            )

    if not keywords:
        keywords = _top_keywords_from_rows(seg_turns, rt.meeting_goal, limit=6)
    if not key_utterances and seg_turns:
        key_utterances = [_format_line_from_turn(seg_turns[-1])]

    opinion_groups: list[dict[str, Any]] = []
    for it in detail_parsed.get("opinion_groups") or []:
        if not isinstance(it, dict):
            continue
        typ = _safe_text(it.get("type"), "info").lower()
        if typ not in {"proposal", "concern", "question", "agree", "disagree", "info"}:
            typ = "info"
        summary_txt = _to_summary_point(_safe_text(it.get("summary")), max_len=None)
        if not summary_txt:
            continue
        ids = _to_ids(it.get("evidence_turn_ids"))
        refs = _extract_refs(rt, ids, seg_turns)
        turn_ids = _dedup_preserve([str(int(r.get("turn_id") or 0)) for r in refs if int(r.get("turn_id") or 0) > 0], limit=12)
        evidence_ids = [int(x) for x in turn_ids if str(x).isdigit()]
        if not evidence_ids:
            evidence_ids = [tid for tid in ids if tid > 0][:12]
        opinion_groups.append(
            {
                "type": typ,
                "summary": summary_txt,
                "evidence_turn_ids": evidence_ids,
            }
        )

    decisions: list[dict[str, Any]] = []
    for it in detail_parsed.get("decision_results") or []:
        if not isinstance(it, dict):
            continue
        conclusion = _safe_text(it.get("conclusion"))
        if not conclusion:
            continue
        opinions = [_safe_text(x) for x in (it.get("opinions") or []) if _safe_text(x)]
        refs = _extract_refs(rt, _to_ids(it.get("evidence_turn_ids")), turns)
        for r in refs[:3]:
            opinions.append(f"[{r['timestamp']}] {r['quote']}")
        decisions.append({"opinions": _dedup_preserve(opinions, 5), "conclusion": conclusion})

    actions: list[dict[str, Any]] = []
    for it in detail_parsed.get("action_items") or []:
        if not isinstance(it, dict):
            continue
        item = _safe_text(it.get("item"))
        if not item:
            continue
        owner = _safe_text(it.get("owner"), "-")
        due = _safe_text(it.get("due"))
        reason = _safe_text(it.get("reason"))
        refs = _extract_refs(rt, _to_ids(it.get("evidence_turn_ids")), turns)
        reasons = []
        for r in refs:
            reasons.append(
                {
                    "speaker": r["speaker"],
                    "timestamp": r["timestamp"],
                    "quote": r["quote"],
                    "why": reason,
                }
            )
        actions.append({"item": item, "owner": owner, "due": due, "reasons": reasons})

    summary = _to_summary_point(_safe_text(detail_parsed.get("summary")), max_len=None)
    if not summary:
        summary = " • ".join(x.split("] ", 1)[-1] for x in summary_items[:10])

    return {
        "agenda_keywords": _dedup_preserve(keywords, limit=6),
        "key_utterances": _dedup_preserve(key_utterances, limit=20),
        "_summary_items": _dedup_preserve(summary_items, limit=20),
        "summary_references": summary_references[:24],
        "summary": _safe_text(summary),
        "opinion_groups": opinion_groups[:12],
        "decision_results": decisions,
        "action_items": actions,
    }


def _merge_agenda_fields(target: dict[str, Any], fields: dict[str, Any]) -> None:
    target["agenda_keywords"] = _dedup_preserve(
        list(target.get("agenda_keywords") or []) + list(fields.get("agenda_keywords") or []),
        limit=6,
    )
    target["key_utterances"] = _dedup_preserve(
        list(target.get("key_utterances") or []) + list(fields.get("key_utterances") or []),
        limit=20,
    )
    target["_summary_items"] = _dedup_preserve(
        list(target.get("_summary_items") or []) + list(fields.get("_summary_items") or []),
        limit=20,
    )
    refs = [dict(x) for x in (target.get("summary_references") or []) if isinstance(x, dict)] + [
        dict(x) for x in (fields.get("summary_references") or []) if isinstance(x, dict)
    ]
    dedup_refs: list[dict[str, Any]] = []
    seen_ref: set[str] = set()
    for ref in refs:
        key = f"{int(ref.get('turn_id') or 0)}|{_safe_text(ref.get('quote'))}"
        if key in seen_ref:
            continue
        seen_ref.add(key)
        dedup_refs.append(ref)
        if len(dedup_refs) >= 24:
            break
    target["summary_references"] = dedup_refs
    if _safe_text(fields.get("summary")):
        target["summary"] = _safe_text(fields.get("summary"))

    if fields.get("opinion_groups") is not None:
        target["opinion_groups"] = list(fields.get("opinion_groups") or [])

    dec_src = list(target.get("decision_results") or []) + list(fields.get("decision_results") or [])
    dec_out: list[dict[str, Any]] = []
    seen_dec: set[str] = set()
    for d in dec_src:
        if not isinstance(d, dict):
            continue
        key = _safe_text(d.get("conclusion"))
        if not key or key in seen_dec:
            continue
        seen_dec.add(key)
        dec_out.append(d)
    target["decision_results"] = dec_out

    act_src = list(target.get("action_items") or []) + list(fields.get("action_items") or [])
    act_out: list[dict[str, Any]] = []
    seen_act: set[str] = set()
    for a in act_src:
        if not isinstance(a, dict):
            continue
        key = f"{_safe_text(a.get('item'))}|{_safe_text(a.get('owner'))}|{_safe_text(a.get('due'))}"
        if not _safe_text(a.get("item")) or key in seen_act:
            continue
        seen_act.add(key)
        act_out.append(a)
    target["action_items"] = act_out


def _run_realtime_window_analysis(rt: RuntimeStore, client: Any) -> bool:
    if not rt.transcript:
        return False

    turns: list[dict[str, Any]] = []
    for i, row in enumerate(rt.transcript, start=1):
        turns.append(
            {
                "turn_id": i,
                "timestamp": _safe_text(row.get("timestamp"), _now_ts()),
                "speaker": _safe_text(row.get("speaker"), "화자"),
                "text": _safe_text(row.get("text")),
            }
        )
    max_turn = len(turns)
    if max_turn <= 0:
        return False

    active = _active_agenda(rt.agenda_outcomes)
    if active is None:
        seed = _extractive_title_from_candidates([_strip_leading_timestamp(t.get("text")) for t in turns[-8:]], rt.meeting_goal)
        active = _create_agenda(rt, _safe_text(seed, "안건 진행"), "ACTIVE")
        active["start_turn_id"] = max(1, max_turn - min(7, max_turn - 1))
        active["end_turn_id"] = max_turn
        active["flow_type"] = "discussion"

    active_start = int(active.get("start_turn_id") or 1)
    active_end = int(active.get("end_turn_id") or active_start)
    if active_end < active_start:
        active_end = active_start
    active["start_turn_id"] = active_start
    active["end_turn_id"] = max(active_end, max_turn)

    recent_window = max(40, min(160, rt.window_size * 10))
    recent_turns = turns[max(0, len(turns) - recent_window) :]
    shift_prompt = _build_windowed_shift_prompt(
        rt=rt,
        current_title=_safe_text(active.get("agenda_title")),
        current_flow_type=_normalize_flow_type(active.get("flow_type")),
        current_start_turn_id=active_start,
        recent_turns=recent_turns,
    )
    try:
        shift_parsed = _call_llm_json(
            rt=rt,
            client=client,
            prompt=shift_prompt,
            stage="realtime.shift",
            temperature=0.05,
            max_tokens=700,
        )
    except Exception as exc:
        return _run_local_fallback(rt, force=False, reason=f"실시간 안건 전환 감지 실패: {exc}", mode="windowed")

    shifted = _boolify(shift_parsed.get("shifted"), False)
    shift_turn_id = int(shift_parsed.get("shift_turn_id") or 0)
    recent_ids = {int(t.get("turn_id") or 0) for t in recent_turns}
    if shift_turn_id not in recent_ids:
        shift_turn_id = max_turn
    if shift_turn_id <= active_start:
        shifted = False
    shift_guard_reason = ""
    active_title = _safe_text(active.get("agenda_title"))
    candidate_title = _safe_text(shift_parsed.get("new_agenda_title"))
    active_span = max(0, max_turn - active_start + 1)
    if shifted and not candidate_title:
        shifted = False
        shift_guard_reason = "전환 차단: 새 안건 제목 비어 있음"
    if shifted and (not _topic_far_enough(active_title, candidate_title)):
        shifted = False
        shift_guard_reason = "전환 차단: 현재 안건과 제목 유사"
    if shifted and active_span < REALTIME_MIN_SHIFT_SPAN:
        shifted = False
        shift_guard_reason = f"전환 차단: 안건 길이 {active_span}turn < {REALTIME_MIN_SHIFT_SPAN}turn"

    title_refine_attempts = 0
    title_refine_success = 0

    if shifted:
        prev_end = max(active_start, min(max_turn, shift_turn_id - 1))
        active["end_turn_id"] = prev_end
        active["agenda_state"] = "CLOSED"

        prev_turns = _slice_turns_by_id_range(turns, active_start, prev_end)
        prev_detail: dict[str, Any] = {}
        if prev_turns:
            try:
                prev_prompt = _build_agenda_detail_prompt(
                    rt=rt,
                    agenda_title=_safe_text(active.get("agenda_title")),
                    agenda_state="CLOSED",
                    flow_type=_normalize_flow_type(active.get("flow_type")),
                    start_turn_id=active_start,
                    end_turn_id=prev_end,
                    seg_turns=prev_turns,
                )
                prev_detail = _call_llm_json(
                    rt=rt,
                    client=client,
                    prompt=prev_prompt,
                    stage="realtime.prev_detail",
                    temperature=0.1,
                    max_tokens=2200,
                )
            except Exception:
                prev_detail = {}
        prev_fields = _extract_detail_fields_from_parsed(rt, turns, prev_turns or recent_turns, prev_detail or {})
        _merge_agenda_fields(active, prev_fields)

        title = _safe_text(active.get("agenda_title"))
        if (not title) or _is_low_quality_title(title, rt.meeting_goal):
            title_refine_attempts += 1
            regenerated = _request_agenda_title_with_llm(
                client=client,
                meeting_goal=rt.meeting_goal,
                turns=turns,
                start_turn_id=active_start,
                end_turn_id=prev_end,
                summary_items=list(active.get("_summary_items") or []),
                key_utterances=list(active.get("key_utterances") or []),
                keywords=list(active.get("agenda_keywords") or []),
            )
            if regenerated:
                active["agenda_title"] = regenerated
                title_refine_success += 1

        new_title = _safe_text(shift_parsed.get("new_agenda_title"))
        new_flow = _normalize_flow_type(shift_parsed.get("new_flow_type"))
        new_row = _create_agenda(rt, _safe_text(new_title, "새 안건"), "ACTIVE")
        new_row["flow_type"] = new_flow
        new_row["start_turn_id"] = shift_turn_id
        new_row["end_turn_id"] = max_turn

        new_turns = _slice_turns_by_id_range(turns, shift_turn_id, max_turn)
        new_detail: dict[str, Any] = {}
        if new_turns:
            try:
                new_prompt = _build_agenda_detail_prompt(
                    rt=rt,
                    agenda_title=_safe_text(new_row.get("agenda_title")),
                    agenda_state="ACTIVE",
                    flow_type=new_flow,
                    start_turn_id=shift_turn_id,
                    end_turn_id=max_turn,
                    seg_turns=new_turns,
                )
                new_detail = _call_llm_json(
                    rt=rt,
                    client=client,
                    prompt=new_prompt,
                    stage="realtime.new_detail",
                    temperature=0.1,
                    max_tokens=2200,
                )
            except Exception:
                new_detail = {}
        new_fields = _extract_detail_fields_from_parsed(rt, turns, new_turns or recent_turns, new_detail or {})
        _merge_agenda_fields(new_row, new_fields)

        if (not _safe_text(new_row.get("agenda_title"))) or _is_low_quality_title(_safe_text(new_row.get("agenda_title")), rt.meeting_goal):
            title_refine_attempts += 1
            regenerated = _request_agenda_title_with_llm(
                client=client,
                meeting_goal=rt.meeting_goal,
                turns=turns,
                start_turn_id=shift_turn_id,
                end_turn_id=max_turn,
                summary_items=list(new_row.get("_summary_items") or []),
                key_utterances=list(new_row.get("key_utterances") or []),
                keywords=list(new_row.get("agenda_keywords") or []),
            )
            if regenerated:
                new_row["agenda_title"] = regenerated
                title_refine_success += 1
    else:
        active["agenda_state"] = "ACTIVE"
        active["end_turn_id"] = max_turn
        seg_start = max(active_start, max_turn - recent_window + 1)
        seg_turns = _slice_turns_by_id_range(turns, seg_start, max_turn)
        detail_parsed: dict[str, Any] = {}
        if seg_turns:
            try:
                prompt = _build_agenda_detail_prompt(
                    rt=rt,
                    agenda_title=_safe_text(active.get("agenda_title")),
                    agenda_state="ACTIVE",
                    flow_type=_normalize_flow_type(active.get("flow_type")),
                    start_turn_id=seg_start,
                    end_turn_id=max_turn,
                    seg_turns=seg_turns,
                )
                detail_parsed = _call_llm_json(
                    rt=rt,
                    client=client,
                    prompt=prompt,
                    stage="realtime.active_detail",
                    temperature=0.1,
                    max_tokens=2000,
                )
            except Exception:
                detail_parsed = {}
        fields = _extract_detail_fields_from_parsed(rt, turns, seg_turns or recent_turns, detail_parsed or {})
        _merge_agenda_fields(active, fields)

    rt.last_analyzed_count = len(rt.transcript)
    rt.used_local_fallback = False
    rt.last_tick_mode = "windowed"
    rt.last_title_refine_attempts = int(title_refine_attempts)
    rt.last_title_refine_success = int(title_refine_success)
    warn = (
        f"실시간 모드: {'안건 전환 감지' if shifted else '현재 안건 유지'} | "
        f"안건 제목 재요청 {title_refine_success}/{title_refine_attempts} 성공"
    )
    if shift_guard_reason:
        warn = f"{warn} | {shift_guard_reason}"
    rt.last_analysis_warning = warn
    rt.last_llm_parsed_json = {
        "pipeline": "windowed_realtime",
        "shift": shift_parsed,
        "agenda_count": len(rt.agenda_outcomes),
        "active_agenda_title": _safe_text((_active_agenda(rt.agenda_outcomes) or {}).get("agenda_title")),
    }
    rt.last_llm_parsed_at = _now_ts()
    return True


def _run_local_fallback(rt: RuntimeStore, force: bool = False, reason: str = "", mode: str = "windowed") -> bool:
    if not rt.transcript:
        return False
    if mode != "full_document" and (not force) and (len(rt.transcript) - rt.last_analyzed_count) < SUMMARY_INTERVAL:
        return False

    turns: list[dict[str, Any]] = []
    for i, row in enumerate(rt.transcript, start=1):
        turns.append(
            {
                "turn_id": i,
                "timestamp": _safe_text(row.get("timestamp"), _now_ts()),
                "speaker": _safe_text(row.get("speaker"), "화자"),
                "text": _safe_text(row.get("text")),
            }
        )
    outcomes = _build_local_outcomes(rt, turns)
    if outcomes:
        _apply_outcomes(rt, outcomes)

    rt.last_analyzed_count = len(rt.transcript)
    rt.used_local_fallback = True
    rt.last_analysis_warning = reason or "LLM 비활성/실패로 로컬 폴백 분석 사용"
    rt.last_tick_mode = "full_document" if mode == "full_document" else "windowed"
    rt.last_title_refine_attempts = 0
    rt.last_title_refine_success = 0
    return True


def _run_analysis(rt: RuntimeStore, force: bool = False, mode: str = "windowed", skip_interval: bool = False) -> bool:
    if not rt.transcript:
        rt.used_local_fallback = True
        rt.last_analysis_warning = "전사 데이터가 없어 분석할 수 없습니다."
        rt.last_tick_mode = "full_document" if mode == "full_document" else "windowed"
        rt.last_title_refine_attempts = 0
        rt.last_title_refine_success = 0
        return False
    if mode != "full_document" and (not force) and (not skip_interval) and (len(rt.transcript) - rt.last_analyzed_count) < SUMMARY_INTERVAL:
        return False
    if not rt.llm_enabled:
        return _run_local_fallback(rt, force=force, reason="LLM 미연결", mode=mode)

    client = get_client()
    if not client.connected:
        return _run_local_fallback(rt, force=force, reason="LLM 연결 끊김", mode=mode)

    if mode == "windowed" and not force:
        return _run_realtime_window_analysis(rt, client)

    full_document = mode == "full_document"
    base_idx = 0 if (force or full_document) else max(0, len(rt.transcript) - max(220, rt.window_size * 10))
    turns: list[dict[str, Any]] = []
    for i, row in enumerate(rt.transcript[base_idx:], start=base_idx + 1):
        turns.append(
            {
                "turn_id": i,
                "timestamp": _safe_text(row.get("timestamp")),
                "speaker": _safe_text(row.get("speaker")),
                "text": _safe_text(row.get("text")),
            }
        )

    # 1단계: 전체 전사 기준 안건 구간(제목/상태/흐름)만 먼저 추출
    active = _active_agenda(rt.agenda_outcomes)
    current_title = _safe_text((active or {}).get("agenda_title"))
    outline_prompt = _build_agenda_outline_prompt(rt, turns, current_title, mode=mode)
    try:
        outline_parsed = _call_llm_json(
            rt=rt,
            client=client,
            prompt=outline_prompt,
            stage="full.outline",
            temperature=0.1,
            max_tokens=2800,
        )
    except Exception as exc:
        return _run_local_fallback(rt, force=force, reason=f"LLM 1차(안건 구간) 오류: {exc}", mode=mode)

    raw_agendas = outline_parsed.get("agendas") or []
    if not isinstance(raw_agendas, list) or not raw_agendas:
        return _run_local_fallback(rt, force=force, reason="LLM 1차 응답에서 agendas가 비어 로컬 폴백 사용", mode=mode)

    turn_ids = [int(t.get("turn_id") or 0) for t in turns if int(t.get("turn_id") or 0) > 0]
    if not turn_ids:
        return _run_local_fallback(rt, force=force, reason="안건 구간 계산용 turn_id 없음", mode=mode)
    min_turn = min(turn_ids)
    max_turn = max(turn_ids)

    outline_rows: list[dict[str, Any]] = []
    for idx, agenda in enumerate(raw_agendas):
        if not isinstance(agenda, dict):
            continue
        row = {
            "agenda_title": _safe_text(agenda.get("agenda_title")),
            "agenda_state": _normalize_agenda_state(agenda.get("agenda_state")),
            "flow_type": _safe_text(agenda.get("flow_type"), "discussion"),
            "_start_turn_id": int(agenda.get("start_turn_id") or 0),
            "_end_turn_id": int(agenda.get("end_turn_id") or 0),
        }
        if row["_start_turn_id"] <= 0:
            row["_start_turn_id"] = min_turn + idx
        if row["_end_turn_id"] < row["_start_turn_id"]:
            row["_end_turn_id"] = row["_start_turn_id"]
        outline_rows.append(row)

    if not outline_rows:
        return _run_local_fallback(rt, force=force, reason="LLM 1차 안건 파싱 실패", mode=mode)

    outline_rows = _normalize_outcome_ranges(outline_rows, min_turn, max_turn)
    outline_rows, refine_note = _refine_outcomes_by_density(rt, outline_rows, turns)
    if not outline_rows:
        return _run_local_fallback(rt, force=force, reason="1차 안건 구간 보정 실패", mode=mode)

    # 2단계: 안건 구간별 상세 필드 개별 요청
    active_title = _safe_text(outline_parsed.get("active_agenda_title"))
    active_title_norm = active_title.strip().lower()
    outcomes: list[dict[str, Any]] = []
    title_refine_attempts = 0
    title_refine_success = 0
    detail_attempts = 0
    detail_success = 0
    detail_logs: list[dict[str, Any]] = []

    for idx, agenda in enumerate(outline_rows):
        start_turn_id = int(agenda.get("_start_turn_id") or agenda.get("start_turn_id") or 0)
        end_turn_id = int(agenda.get("_end_turn_id") or agenda.get("end_turn_id") or 0)
        seg_turns = _slice_turns_by_id_range(turns, start_turn_id, end_turn_id)
        if not seg_turns:
            seg_turns = list(turns)

        raw_title = _safe_text(agenda.get("agenda_title"))
        state = _normalize_agenda_state(agenda.get("agenda_state"))
        flow_type = _safe_text(agenda.get("flow_type"), "discussion")

        detail_attempts += 1
        detail_parsed: dict[str, Any] = {}
        detail_error = ""
        try:
            detail_prompt = _build_agenda_detail_prompt(
                rt=rt,
                agenda_title=raw_title,
                agenda_state=state,
                flow_type=flow_type,
                start_turn_id=start_turn_id,
                end_turn_id=end_turn_id,
                seg_turns=seg_turns,
            )
            detail_parsed = _call_llm_json(
                rt=rt,
                client=client,
                prompt=detail_prompt,
                stage=f"full.detail.{idx + 1}",
                temperature=0.1,
                max_tokens=3200,
            )
            detail_success += 1
        except Exception as exc:
            detail_error = str(exc)
            detail_parsed = {}

        detail_logs.append(
            {
                "agenda_index": idx + 1,
                "start_turn_id": start_turn_id,
                "end_turn_id": end_turn_id,
                "title_seed": raw_title,
                "error": detail_error,
                "response": detail_parsed,
            }
        )

        keywords = _dedup_preserve([_safe_text(x) for x in (detail_parsed.get("agenda_keywords") or []) if _safe_text(x)], limit=8)
        key_refs = _extract_refs(rt, _to_ids(detail_parsed.get("key_utterance_turn_ids")), turns)
        key_utterances = _dedup_preserve([f"[{r['timestamp']}] {r['quote']}" for r in key_refs], limit=8)

        summary_items: list[str] = []
        summary_references: list[dict[str, Any]] = []
        for it in detail_parsed.get("agenda_summary_items") or []:
            if not isinstance(it, dict):
                continue
            txt = _to_summary_point(_safe_text(it.get("summary")))
            if not txt:
                continue
            refs = _extract_refs(rt, _to_ids(it.get("evidence_turn_ids")), turns)
            if refs:
                summary_items.append(f"[{refs[0]['timestamp']}] {txt}")
                for ref in refs[:6]:
                    summary_references.append(
                        {
                            "turn_id": int(ref.get("turn_id") or 0),
                            "speaker": ref["speaker"],
                            "timestamp": ref["timestamp"],
                            "quote": ref["quote"],
                            "why": txt,
                        }
                    )
            else:
                summary_items.append(txt)
        if not summary_items:
            from_keys: list[str] = []
            for line in key_utterances[:10]:
                ts, body = _split_ts_prefix(line)
                point = _to_summary_point(body)
                if not point:
                    continue
                from_keys.append(f"[{ts}] {point}" if ts else point)
            summary_items = from_keys
        summary_items = _normalize_summary_item_lines(summary_items)
        if not summary_references:
            for ref in key_refs[:10]:
                summary_references.append(
                    {
                        "turn_id": 0,
                        "speaker": ref["speaker"],
                        "timestamp": ref["timestamp"],
                        "quote": ref["quote"],
                        "why": "핵심 발언",
                    }
                )

        opinion_groups: list[dict[str, Any]] = []
        for it in detail_parsed.get("opinion_groups") or []:
            if not isinstance(it, dict):
                continue
            typ = _safe_text(it.get("type"), "info").lower()
            if typ not in {"proposal", "concern", "question", "agree", "disagree", "info"}:
                typ = "info"
            summary_txt = _to_summary_point(_safe_text(it.get("summary")), max_len=None)
            if not summary_txt:
                continue
            ids = _to_ids(it.get("evidence_turn_ids"))
            refs = _extract_refs(rt, ids, seg_turns)
            turn_ids = _dedup_preserve([str(int(r.get("turn_id") or 0)) for r in refs if int(r.get("turn_id") or 0) > 0], limit=12)
            evidence_ids = [int(x) for x in turn_ids if str(x).isdigit()]
            if not evidence_ids:
                evidence_ids = [tid for tid in ids if tid > 0][:12]
            opinion_groups.append(
                {
                    "type": typ,
                    "summary": summary_txt,
                    "evidence_turn_ids": evidence_ids,
                }
            )

        decisions: list[dict[str, Any]] = []
        for it in detail_parsed.get("decision_results") or []:
            if not isinstance(it, dict):
                continue
            conclusion = _safe_text(it.get("conclusion"))
            if not conclusion:
                continue
            opinions = [_safe_text(x) for x in (it.get("opinions") or []) if _safe_text(x)]
            refs = _extract_refs(rt, _to_ids(it.get("evidence_turn_ids")), turns)
            for r in refs[:3]:
                opinions.append(f"[{r['timestamp']}] {r['quote']}")
            decisions.append({"opinions": _dedup_preserve(opinions, 5), "conclusion": conclusion})

        actions: list[dict[str, Any]] = []
        for it in detail_parsed.get("action_items") or []:
            if not isinstance(it, dict):
                continue
            item = _safe_text(it.get("item"))
            if not item:
                continue
            owner = _safe_text(it.get("owner"), "-")
            due = _safe_text(it.get("due"))
            reason = _safe_text(it.get("reason"))
            refs = _extract_refs(rt, _to_ids(it.get("evidence_turn_ids")), turns)
            reasons = []
            for r in refs:
                reasons.append(
                    {
                        "speaker": r["speaker"],
                        "timestamp": r["timestamp"],
                        "quote": r["quote"],
                        "why": reason,
                    }
                )
            actions.append({"item": item, "owner": owner, "due": due, "reasons": reasons})

        if not keywords:
            keywords = _top_keywords_from_rows(seg_turns, rt.meeting_goal, limit=6)
        if not key_utterances and turns:
            pick_idx = min(len(turns) - 1, idx * max(1, len(turns) // max(1, len(outline_rows))))
            key_utterances = [_format_line_from_turn(turns[pick_idx])]

        all_ids = _to_ids(detail_parsed.get("key_utterance_turn_ids"))
        for s_item in detail_parsed.get("agenda_summary_items") or []:
            if isinstance(s_item, dict):
                all_ids.extend(_to_ids(s_item.get("evidence_turn_ids")))
        if start_turn_id <= 0:
            start_turn_id = min(all_ids) if all_ids else (idx + 1) * 1000
        if end_turn_id < start_turn_id:
            end_turn_id = max(all_ids) if all_ids else start_turn_id

        need_title_refine = (not _safe_text(raw_title)) or _is_low_quality_title(raw_title, rt.meeting_goal)
        if need_title_refine:
            title_refine_attempts += 1
            regenerated = _request_agenda_title_with_llm(
                client=client,
                meeting_goal=rt.meeting_goal,
                turns=turns,
                start_turn_id=start_turn_id,
                end_turn_id=end_turn_id,
                summary_items=summary_items,
                key_utterances=key_utterances,
                keywords=keywords,
            )
            if regenerated:
                raw_title = regenerated
                title_refine_success += 1

        title = _finalize_agenda_title(raw_title, rt.meeting_goal, keywords, summary_items, key_utterances)
        if (not _safe_text(title)) or _is_low_quality_title(title, rt.meeting_goal):
            title_refine_attempts += 1
            regenerated = _request_agenda_title_with_llm(
                client=client,
                meeting_goal=rt.meeting_goal,
                turns=turns,
                start_turn_id=start_turn_id,
                end_turn_id=end_turn_id,
                summary_items=summary_items,
                key_utterances=key_utterances,
                keywords=keywords,
            )
            if regenerated:
                title = regenerated
                title_refine_success += 1

        direct_match = active_title_norm and title.strip().lower() == active_title_norm
        sim_match = active_title and _text_similarity(active_title, title) >= 0.55
        if direct_match or sim_match:
            state = "ACTIVE"

        summary = _to_summary_point(_safe_text(detail_parsed.get("summary")), max_len=None)
        if not summary:
            summary = " • ".join(x.split("] ", 1)[-1] for x in summary_items[:10])

        outcomes.append(
            {
                "agenda_title": _strip_leading_timestamp(title) or f"안건 {idx + 1}",
                "agenda_state": state,
                "flow_type": flow_type,
                "key_utterances": _dedup_preserve(key_utterances, limit=20),
                "_summary_items": _dedup_preserve(summary_items, limit=20),
                "summary_references": summary_references[:24],
                "summary": _safe_text(summary),
                "agenda_keywords": _dedup_preserve(keywords, limit=6),
                "opinion_groups": opinion_groups[:12],
                "decision_results": decisions,
                "action_items": actions,
                "_start_turn_id": start_turn_id,
                "_end_turn_id": end_turn_id,
            }
        )

    if not outcomes:
        return _run_local_fallback(rt, force=force, reason="LLM agendas 파싱 실패", mode=mode)

    enriched: list[dict[str, Any]] = []
    for row in outcomes:
        enriched.append(_enrich_outcome_summary(rt, row, turns))
    outcomes = enriched
    outcomes, post_attempts, post_success = _refresh_low_quality_titles_with_llm(client, rt, turns, outcomes)
    title_refine_attempts += post_attempts
    title_refine_success += post_success

    rt.last_llm_parsed_json = {
        "pipeline": "two_stage",
        "outline": outline_parsed,
        "details": detail_logs,
    }
    rt.last_llm_parsed_at = _now_ts()

    _apply_outcomes(rt, outcomes)

    rt.last_analyzed_count = len(rt.transcript)
    rt.used_local_fallback = False
    notes: list[str] = []
    if _safe_text(refine_note):
        notes.append(_safe_text(refine_note))
    notes.append(f"안건 상세 추출 {detail_success}/{detail_attempts} 성공")
    notes.append(f"안건 제목 재요청 {title_refine_success}/{title_refine_attempts} 성공")
    rt.last_analysis_warning = " | ".join(notes)
    rt.last_tick_mode = "full_document" if mode == "full_document" else "windowed"
    rt.last_title_refine_attempts = int(title_refine_attempts)
    rt.last_title_refine_success = int(title_refine_success)
    return True


def _append_turn(rt: RuntimeStore, speaker: str, text: str, timestamp: str | None = None) -> None:
    body = _safe_text(text)
    if not body:
        return
    rt.transcript.append(
        {
            "speaker": _safe_text(speaker, "화자"),
            "text": body,
            "timestamp": _safe_text(timestamp, _now_ts()),
        }
    )
    rt.transcript_version += 1


def _append_many_turns(rt: RuntimeStore, rows: list[dict[str, str]]) -> int:
    before = len(rt.transcript)
    for row in rows:
        _append_turn(rt, row.get("speaker", "화자"), row.get("text", ""), row.get("timestamp"))
    return len(rt.transcript) - before


async def _collect_rows_from_uploads(files: list[UploadFile]) -> dict[str, Any]:
    files_scanned = 0
    files_parsed = 0
    files_skipped = 0
    parse_errors: list[dict[str, str]] = []
    file_stats: list[dict[str, Any]] = []
    all_rows: list[dict[str, str]] = []
    applied_goal = None

    for upload in files:
        files_scanned += 1
        try:
            blob = await upload.read()
            raw = blob.decode("utf-8")
        except UnicodeDecodeError:
            try:
                raw = blob.decode("utf-8-sig")
            except Exception:
                files_skipped += 1
                parse_errors.append({"file": upload.filename or "upload.json", "error": "decode failed"})
                continue
        except Exception:
            files_skipped += 1
            parse_errors.append({"file": upload.filename or "upload.json", "error": "read failed"})
            continue

        data = _extract_json(raw)
        if not data:
            files_skipped += 1
            parse_errors.append({"file": upload.filename or "upload.json", "error": "json parse failed"})
            continue
        ok_payload, payload_reason = _looks_like_meeting_payload(data)
        if not ok_payload:
            files_skipped += 1
            parse_errors.append({"file": upload.filename or "upload.json", "error": payload_reason})
            continue
        goal, rows = _parse_meeting_json_payload(data)
        if not rows:
            files_skipped += 1
            parse_errors.append({"file": upload.filename or "upload.json", "error": "utterance rows extracted = 0"})
            continue

        if goal and not applied_goal:
            applied_goal = goal
        all_rows.extend(rows)
        files_parsed += 1
        file_stats.append({"file": upload.filename or "upload.json", "rows": len(rows)})

    return {
        "rows": all_rows,
        "files_scanned": files_scanned,
        "files_parsed": files_parsed,
        "files_skipped": files_skipped,
        "file_stats": file_stats,
        "parse_errors": parse_errors[:20],
        "applied_goal": applied_goal,
    }


def _load_whisper_model():
    print(f"[STT][backend] loading whisper model name={WHISPER_MODEL_NAME}", flush=True)
    try:
        import whisper
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("whisper 패키지가 없습니다. `pip install openai-whisper` 후 다시 실행하세요.") from exc
    model = whisper.load_model(WHISPER_MODEL_NAME)
    print(f"[STT][backend] whisper model loaded name={WHISPER_MODEL_NAME}", flush=True)
    return model


_WHISPER_MODEL = None
_WHISPER_LOCK = threading.Lock()


def _get_whisper_model():
    global _WHISPER_MODEL
    with _WHISPER_LOCK:
        if _WHISPER_MODEL is None:
            _WHISPER_MODEL = _load_whisper_model()
        return _WHISPER_MODEL


def _transcribe_with_whisper(data: bytes, suffix: str) -> str:
    print(
        f"[STT][backend] transcribe function enter bytes={len(data)} suffix={suffix} "
        "prompt=False",
        flush=True,
    )
    model = _get_whisper_model()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        kwargs = {"language": WHISPER_LANGUAGE, "task": "transcribe", "verbose": False}
        try:
            import torch

            kwargs["fp16"] = bool(torch.cuda.is_available())
        except Exception:
            kwargs["fp16"] = False
        print(
            f"[STT][backend] whisper.transcribe start path={tmp_path} "
            f"language={WHISPER_LANGUAGE} fp16={kwargs.get('fp16')} prompt=False",
            flush=True,
        )
        result = model.transcribe(tmp_path, **kwargs)
        print(
            f"[STT][backend] whisper.transcribe done chars={len(_safe_text((result or {}).get('text')))}",
            flush=True,
        )
        return _safe_text((result or {}).get("text"))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _strip_stt_prompt_leakage(text: str) -> str:
    clean = re.sub(r"\s+", " ", _safe_text(text)).strip()
    if not clean:
        return ""
    return re.sub(
        r"^\s*(?:회의\s*목표\s*(?:는|:)|관련\s*맥락\s*(?:은|:))\s*",
        "",
        clean,
        flags=re.IGNORECASE,
    ).strip()


def _normalize_stt_refine_context(raw: Any, limit: int = 4) -> list[dict[str, str]]:
    rows = raw if isinstance(raw, list) else []
    normalized: list[dict[str, str]] = []
    for row in rows[-limit:]:
        if not isinstance(row, dict):
            continue
        text = _strip_stt_prompt_leakage(row.get("text") or "")
        if not text:
            continue
        normalized.append({
            "speaker": _safe_text(row.get("speaker"), "참가자")[:80],
            "text": _truncate_text(text, 260),
            "timestamp": _safe_text(row.get("timestamp"))[:80],
        })
    return normalized


def _normalize_stt_context_terms(raw: Any, limit: int = 40) -> list[str]:
    values = raw if isinstance(raw, list) else []
    terms: list[str] = []
    for item in values:
        text = re.sub(r"\s+", " ", _safe_text(item)).strip()
        if not text or len(text) > 40:
            continue
        if text not in terms:
            terms.append(text)
        if len(terms) >= limit:
            break
    return terms


def _normalize_stt_correction_hints(raw: Any, limit: int = 20) -> list[dict[str, str]]:
    values = raw if isinstance(raw, list) else []
    hints: list[dict[str, str]] = []
    for item in values[-limit:]:
        if not isinstance(item, dict):
            continue
        raw_text = re.sub(r"\s+", " ", _safe_text(item.get("raw") or item.get("from"))).strip()
        corrected = re.sub(r"\s+", " ", _safe_text(item.get("corrected") or item.get("to"))).strip()
        if not raw_text or not corrected or raw_text == corrected:
            continue
        hints.append({"raw": raw_text[:80], "corrected": corrected[:80]})
    return hints


def _normalize_stt_context_pack(raw: Any) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    pack: dict[str, Any] = {}
    for key in ("stage", "meeting_goal", "meeting_goal_context", "current_focus"):
        value = _safe_text(source.get(key))
        if value:
            pack[key] = _truncate_text(value, 600 if key != "current_focus" else 220)
    recent = _normalize_stt_refine_context(source.get("recent_utterances"), limit=4)
    if recent:
        pack["recent_utterances"] = recent
    terms = _normalize_stt_context_terms(source.get("key_terms"), limit=40)
    if terms:
        pack["key_terms"] = terms
    hints = _normalize_stt_correction_hints(source.get("correction_hints"), limit=20)
    if hints:
        pack["correction_hints"] = hints
    return pack


def _parse_stt_context_pack(raw: str) -> dict[str, Any]:
    text = _safe_text(raw)
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except Exception:
        return {}
    return _normalize_stt_context_pack(parsed)


def _summarize_stt_context_pack(pack: dict[str, Any]) -> dict[str, Any]:
    return {
        "recent_utterance_count": len(pack.get("recent_utterances") or []),
        "key_term_count": len(pack.get("key_terms") or []),
        "correction_hint_count": len(pack.get("correction_hints") or []),
        "has_current_focus": bool(pack.get("current_focus")),
        "has_meeting_goal": bool(pack.get("meeting_goal")),
        "has_meeting_goal_context": bool(pack.get("meeting_goal_context")),
    }


def _refine_transcript_text_with_llm(
    raw_text: str,
    *,
    meeting_goal: str = "",
    meeting_goal_context: str = "",
    context_pack: dict[str, Any] | None = None,
) -> tuple[str, bool, str, dict[str, Any]]:
    raw = _safe_text(raw_text)
    fallback = _strip_stt_prompt_leakage(raw)
    if not raw:
        return "", False, "", {}

    normalized_pack = _normalize_stt_context_pack(context_pack or {})
    clean_goal = _safe_text(meeting_goal)
    clean_context = _safe_text(meeting_goal_context)
    if clean_goal and not normalized_pack.get("meeting_goal"):
        normalized_pack["meeting_goal"] = clean_goal
    if clean_context and not normalized_pack.get("meeting_goal_context"):
        normalized_pack["meeting_goal_context"] = clean_context

    input_payload = {
        "raw_transcript": _truncate_text(raw, 1200),
    }
    if normalized_pack:
        input_payload["context_pack"] = normalized_pack

    prompt = (
        "너는 Whisper STT 결과를 회의록에 바로 넣기 좋게 다듬는 후처리기다. 출력은 JSON 하나만 반환한다.\n\n"
        "[입력 JSON]\n"
        f"{json.dumps(input_payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "[목표]\n"
        "- raw_transcript의 실제 발화 의미를 보존하면서 한국어 문장만 가볍게 정리한다.\n"
        "- context_pack은 STT 보정을 위한 짧은 문맥 패키지다. 발화에 없는 내용을 추가하지 않는다.\n"
        "- key_terms와 correction_hints는 고유명사, 제품명, 인명, 반복 주제어 보정을 위한 가장 강한 힌트다.\n"
        "- current_focus는 현재 논점 요약이고, recent_utterances는 직전 흐름 확인용이다. recent_utterances를 그대로 이어 쓰지 않는다.\n"
        "- Whisper prompt가 새어 나온 듯한 '회의 목표는', '회의 목표:', '관련 맥락은', '관련 맥락:' 같은 앞부분은 제거한다.\n\n"
        "[규칙]\n"
        "- 음, 어, 그, 저, 네 같은 불필요한 군말과 명백한 반복만 줄인다.\n"
        "- 발음이 비슷하고 key_terms/correction_hints/current_focus에서 반복된 단어라면 그 단어로 보정한다.\n"
        "- 문맥상 확실하지 않은 고유명사/숫자/사실은 추측해서 고치지 말고 raw_transcript에 가까운 표현을 유지한다.\n"
        "- 원문에 없는 주장, 숫자, 이름, 결론을 만들지 않는다.\n"
        "- 말투를 과하게 요약하지 말고, 발화자가 말한 내용이 이어지도록 1~2문장으로 정리한다.\n"
        "- 전사 신뢰도가 낮아 의미를 알 수 없으면 빈 문자열을 반환한다.\n"
        "- corrections에는 실제로 보정한 단어만 넣는다. 불확실한 단어는 uncertain_terms에 넣는다.\n"
        "- context_terms에는 이후 STT 보정에 유용한 고유명사/제품명/핵심 명사만 0~8개 넣는다.\n"
        "- 불필요한 설명 없이 JSON만 반환한다.\n\n"
        "[출력 JSON]\n"
        '{"text":"정제된 전사 문장","corrections":[{"raw":"잘못 들린 표현","corrected":"보정 표현"}],"uncertain_terms":["불확실한 표현"],"confidence":0.82,"context_terms":["핵심 용어"]}'
    )

    client, llm_ready, warning = _ensure_llm_ready(RT)
    if not llm_ready or client is None:
        return fallback, False, warning, {
            "confidence": 0.0,
            "corrections": [],
            "uncertain_terms": [],
            "context_terms": [],
            "context_pack_summary": _summarize_stt_context_pack(normalized_pack),
        }

    try:
        parsed = _call_llm_json(
            rt=RT,
            client=client,
            prompt=prompt,
            stage="stt.transcript_refine",
            temperature=0.05,
            max_tokens=240,
        )
        refined = _strip_stt_prompt_leakage(
            parsed.get("text") or parsed.get("refined_text") or parsed.get("transcript") or ""
        )
        corrections = [
            {
                "raw": _truncate_text(_safe_text(item.get("raw") or item.get("from")), 80),
                "corrected": _truncate_text(_safe_text(item.get("corrected") or item.get("to")), 80),
            }
            for item in (parsed.get("corrections") if isinstance(parsed.get("corrections"), list) else [])
            if isinstance(item, dict)
            and _safe_text(item.get("raw") or item.get("from"))
            and _safe_text(item.get("corrected") or item.get("to"))
        ][:8]
        uncertain_terms = _normalize_stt_context_terms(parsed.get("uncertain_terms"), limit=8)
        context_terms = _normalize_stt_context_terms(parsed.get("context_terms"), limit=8)
        confidence = max(0, min(1, _safe_float(parsed.get("confidence"), 0.7)))
        meta = {
            "confidence": confidence,
            "corrections": corrections,
            "uncertain_terms": uncertain_terms,
            "context_terms": context_terms,
            "context_pack_summary": _summarize_stt_context_pack(normalized_pack),
        }
        if refined:
            return refined, True, "", meta
        return fallback, True, "LLM 정제 결과가 비어 원문 정리 결과를 사용했습니다.", meta
    except Exception as exc:
        return fallback, False, f"STT 정제 LLM 실패: {exc}", {
            "confidence": 0.0,
            "corrections": [],
            "uncertain_terms": [],
            "context_terms": [],
            "context_pack_summary": _summarize_stt_context_pack(normalized_pack),
        }


def _ensure_llm_ready(rt: RuntimeStore) -> tuple[Any, bool, str]:
    client = get_client()
    if bool(rt.llm_enabled) and bool(client.connected):
        return client, True, ""

    if not _safe_text(getattr(client, "api_key", "")):
        rt.llm_enabled = False
        rt.llm_connect_retry_after_monotonic = time.monotonic() + 300
        rt.llm_connect_retry_note = "LLM API 키가 없어 로컬 결과를 사용했습니다."
        return client, False, "LLM API 키가 없어 로컬 결과를 사용했습니다."

    now_monotonic = time.monotonic()
    retry_after = float(getattr(rt, "llm_connect_retry_after_monotonic", 0.0) or 0.0)
    if not bool(client.connected) and retry_after > now_monotonic:
        remaining = max(1, round(retry_after - now_monotonic))
        note = _safe_text(
            getattr(rt, "llm_connect_retry_note", ""),
            "LLM 연결 재시도 대기 중입니다.",
        )
        return client, False, f"{note} ({remaining}초 후 재시도)"

    try:
        result = client.connect()
        rt.llm_enabled = bool(result.get("ok"))
        if rt.llm_enabled and client.connected:
            rt.llm_connect_retry_after_monotonic = 0.0
            rt.llm_connect_retry_note = ""
            return client, True, ""
        note = _safe_text(result.get("message"), "LLM 연결 실패로 로컬 결과를 사용했습니다.")
        rt.llm_connect_retry_after_monotonic = time.monotonic() + 60
        rt.llm_connect_retry_note = note
        return client, False, note
    except Exception as exc:
        rt.llm_enabled = False
        note = f"LLM 자동 연결 실패: {exc}"
        rt.llm_connect_retry_after_monotonic = time.monotonic() + 60
        rt.llm_connect_retry_note = note
        return client, False, note


def _fallback_stt_flow_summary(turns: list[SttFlowSummaryTurnInput], max_chars: int = 30) -> str:
    text = " ".join(_safe_text(turn.text) for turn in turns if _safe_text(turn.text))
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^(음|어|네|예|일단|그러면|그럼|근데|그러니까)\s+", "", text)
    if not text:
        return "현재 발언 정리 중"
    return _safe_text(text[:max_chars], "현재 발언 정리 중").strip(" .,!?:;/|")


def _generate_stt_flow_summary(payload: SttFlowSummaryInput) -> dict[str, Any]:
    max_chars = int(payload.max_chars or 30)
    turns = [turn for turn in payload.turns if _safe_text(turn.text)]
    if not turns:
        return {
            "ok": True,
            "summary": "현재 발언 정리 중",
            "used_llm": False,
            "warning": "요약할 발화가 없습니다.",
        }

    lines = []
    for index, turn in enumerate(turns, start=1):
        speaker = _safe_text(turn.speaker, f"화자 {index}")
        text = _safe_text(turn.text)
        lines.append(f"{index}. {speaker}: {text}")

    prompt = f"""
너는 회의 실시간 발언 흐름 요약기다. 출력은 JSON 객체 하나만 반환한다.

[입력 발화]
{chr(10).join(lines)}

[목표]
- 위 발화들이 지금 어떤 발언 흐름인지 한국어로 요약한다.
- 참가자에게 현재 논의 방향을 빠르게 보여주는 짧은 문구여야 한다.

[규칙]
1) summary는 반드시 {max_chars}자 이내.
2) "요약", "논의 중", "발언 중" 같은 형식 문구로 채우지 않는다.
3) 발화 원문을 그대로 복사하지 않는다.
4) 시간 정보, 화자명, 따옴표, 마침표는 쓰지 않는다.
5) 핵심 명사와 행동/의도를 포함한다.

[출력 JSON]
{{
  "summary": "string"
}}
""".strip()

    client, llm_ready, warning = _ensure_llm_ready(RT)
    if llm_ready:
        try:
            parsed = _call_llm_json(
                rt=RT,
                client=client,
                prompt=prompt,
                stage="stt.flow_summary",
                temperature=0.15,
                max_tokens=120,
            )
            summary = _safe_text(parsed.get("summary"))
            summary = re.sub(r"\s+", " ", summary).strip().strip(" .,!?:;/|\"'")
            if summary:
                return {
                    "ok": True,
                    "summary": _safe_text(summary[:max_chars], "현재 발언 정리 중"),
                    "used_llm": True,
                    "warning": "",
                }
        except Exception as exc:
            warning = f"LLM 요약 실패: {exc}"

    return {
        "ok": True,
        "summary": _fallback_stt_flow_summary(turns, max_chars=max_chars),
        "used_llm": False,
        "warning": warning,
    }


def _normalize_canvas_node_positions(
    payload: dict[str, dict[str, Any]] | None,
) -> dict[str, dict[str, dict[str, float]]]:
    normalized: dict[str, dict[str, dict[str, float]]] = {}
    if not isinstance(payload, dict):
        return normalized

    for raw_stage, raw_nodes in payload.items():
        stage = _normalize_canvas_stage(_safe_text(raw_stage))
        if stage not in {"ideation", "problem-definition", "solution"}:
            continue
        if not isinstance(raw_nodes, dict):
            continue

        stage_nodes: dict[str, dict[str, float]] = {}
        for raw_node_id, raw_position in raw_nodes.items():
            node_id = _safe_text(raw_node_id)
            if not node_id or not isinstance(raw_position, dict):
                continue
            if stage == "ideation" and not node_id.startswith("agenda-"):
                continue

            try:
                x = float(raw_position.get("x", 0) or 0)
                y = float(raw_position.get("y", 0) or 0)
            except (TypeError, ValueError):
                continue

            stage_nodes[node_id] = {"x": x, "y": y}

        if stage_nodes:
            normalized[stage] = stage_nodes

    return normalized


_CANVAS_ARTIFACT_KEYS = {
    "problem-definition:explore",
    "problem-definition:structure",
    "solution:summary",
}
_CANVAS_ARTIFACT_GENERATION_STALE_SECONDS = 5 * 60


def _parse_canvas_artifact_generation_time(raw: Any) -> float | None:
    text = _safe_text(raw)
    if not text:
        return None
    if "T" in text:
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.timestamp()
        except ValueError:
            return None
    try:
        parsed_time = time.strptime(text, "%H:%M:%S")
    except ValueError:
        return None
    return float(parsed_time.tm_hour * 3600 + parsed_time.tm_min * 60 + parsed_time.tm_sec)


def _is_canvas_artifact_generation_stale(entry: dict[str, Any], now_text: str) -> bool:
    if _safe_text(entry.get("status")) != "generating":
        return False
    started_or_updated_at = _safe_text(entry.get("updated_at")) or _safe_text(entry.get("started_at"))
    started_seconds = _parse_canvas_artifact_generation_time(started_or_updated_at)
    now_seconds = _parse_canvas_artifact_generation_time(now_text)
    if started_seconds is None or now_seconds is None:
        return True
    age_seconds = now_seconds - started_seconds
    if age_seconds < 0:
        age_seconds += 24 * 60 * 60
    return age_seconds >= _CANVAS_ARTIFACT_GENERATION_STALE_SECONDS


def _normalize_canvas_artifact_generation(raw: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, dict):
        return {}

    normalized: dict[str, dict[str, Any]] = {}
    for raw_key, raw_value in raw.items():
        if hasattr(raw_value, "model_dump"):
            try:
                raw_value = raw_value.model_dump()
            except Exception:
                raw_value = {}
        if not isinstance(raw_value, dict):
            continue
        key = _safe_text(raw_value.get("artifact_key") or raw_key)
        if not key or key not in _CANVAS_ARTIFACT_KEYS:
            continue
        status = _safe_text(raw_value.get("status"))
        if status not in {"idle", "generating", "ready", "failed"}:
            status = "idle"
        try:
            version = max(0, int(raw_value.get("version") or 0))
        except (TypeError, ValueError):
            version = 0
        normalized[key] = {
            "artifact_key": key,
            "status": status,
            "generation_id": _safe_text(raw_value.get("generation_id")),
            "started_by": _safe_text(raw_value.get("started_by")),
            "started_at": _safe_text(raw_value.get("started_at")),
            "updated_at": _safe_text(raw_value.get("updated_at")),
            "finished_at": _safe_text(raw_value.get("finished_at")),
            "error": _safe_text(raw_value.get("error")),
            "phase": _safe_text(raw_value.get("phase")),
            "detail": _safe_text(raw_value.get("detail")),
            "retryable": bool(raw_value.get("retryable")),
            "version": version,
            "input_transcript_revision": _safe_nonnegative_int(raw_value.get("input_transcript_revision")),
        }
    return normalized


def _should_accept_problem_structure_patch(
    current: dict[str, Any],
    incoming: dict[str, Any],
) -> bool:
    current_revision = _safe_nonnegative_int(current.get("revision"))
    incoming_revision = _safe_nonnegative_int(incoming.get("revision"))
    if current_revision > 0 and incoming_revision < current_revision:
        return False
    if (
        current_revision > 0
        and incoming_revision == current_revision
        and current.get("groups")
        and not incoming.get("groups")
    ):
        return False
    return True


def _should_accept_artifact_scoped_workspace_patch(
    current_map: dict[str, dict[str, Any]],
    incoming_map: dict[str, dict[str, Any]],
    artifact_key: str,
) -> bool:
    incoming = incoming_map.get(artifact_key)
    if not incoming:
        return True

    current = current_map.get(artifact_key) or {}
    current_version = _safe_nonnegative_int(current.get("version"))
    incoming_version = _safe_nonnegative_int(incoming.get("version"))
    if current_version > incoming_version:
        return False

    current_generation_id = _safe_text(current.get("generation_id"))
    incoming_generation_id = _safe_text(incoming.get("generation_id"))
    if (
        current_version == incoming_version
        and current_generation_id
        and incoming_generation_id
        and current_generation_id != incoming_generation_id
        and _safe_text(incoming.get("status")) != "generating"
    ):
        return False

    if (
        current_version == incoming_version
        and _safe_text(current.get("status")) == "ready"
        and _safe_text(incoming.get("status")) != "ready"
        and (not current_generation_id or not incoming_generation_id or current_generation_id == incoming_generation_id)
    ):
        return False

    return True


def _should_accept_ideation_bubble_graph_patch(
    current: dict[str, Any],
    incoming: dict[str, Any],
) -> bool:
    current_cycle = _safe_nonnegative_int(current.get("update_cycle"))
    incoming_cycle = _safe_nonnegative_int(incoming.get("update_cycle"))
    if current_cycle > incoming_cycle:
        return False
    if current_cycle < incoming_cycle:
        return True

    current_layout_revision = _safe_nonnegative_int(current.get("layout_revision"))
    incoming_layout_revision = _safe_nonnegative_int(incoming.get("layout_revision"))
    if current_layout_revision > incoming_layout_revision:
        return False
    if current_layout_revision < incoming_layout_revision:
        return True

    current_updated_at = _parse_canvas_artifact_generation_time(current.get("updated_at"))
    incoming_updated_at = _parse_canvas_artifact_generation_time(incoming.get("updated_at"))
    if current_updated_at is not None and incoming_updated_at is not None:
        return incoming_updated_at >= current_updated_at

    return True


def _finish_canvas_artifact_generation_entry(
    current: dict[str, Any],
    artifact_key: str,
    status: str,
    generation_id: str,
    requested_by: str,
    saved_at: str,
    error: str = "",
    phase: str = "",
    detail: str = "",
    retryable: bool = False,
) -> dict[str, Any]:
    previous_version = _safe_nonnegative_int(current.get("version"))
    next_version = previous_version + 1 if status == "ready" else previous_version
    return {
        "artifact_key": artifact_key,
        "status": status,
        "generation_id": generation_id or _safe_text(current.get("generation_id")),
        "started_by": _safe_text(current.get("started_by")) or requested_by,
        "started_at": _safe_text(current.get("started_at")) or saved_at,
        "updated_at": saved_at,
        "finished_at": saved_at,
        "error": error if status == "failed" else "",
        "phase": _safe_text(phase) if status == "failed" else "",
        "detail": _safe_text(detail) if status == "failed" else "",
        "retryable": bool(retryable) if status == "failed" else False,
        "version": next_version,
        "input_transcript_revision": _safe_nonnegative_int(current.get("input_transcript_revision")),
    }


def _merge_canvas_artifact_generation_patch(
    current_map: dict[str, dict[str, Any]],
    incoming_map: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    merged = copy.deepcopy(current_map)
    for key, incoming in incoming_map.items():
        current = current_map.get(key) or {}
        current_version = _safe_nonnegative_int(current.get("version"))
        incoming_version = _safe_nonnegative_int(incoming.get("version"))
        if current_version > incoming_version:
            continue
        current_generation_id = _safe_text(current.get("generation_id"))
        incoming_generation_id = _safe_text(incoming.get("generation_id"))
        if (
            current_version == incoming_version
            and current_generation_id
            and incoming_generation_id
            and current_generation_id != incoming_generation_id
            and _safe_text(incoming.get("status")) != "generating"
        ):
            continue
        if (
            current_version == incoming_version
            and _safe_text(current.get("status")) == "ready"
            and _safe_text(incoming.get("status")) != "ready"
            and (not current_generation_id or not incoming_generation_id or current_generation_id == incoming_generation_id)
        ):
            continue
        merged[key] = copy.deepcopy(incoming)
    return merged


def _summarize_canvas_node_positions_for_debug(
    payload: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {
            "ideation": 0,
            "problem_definition": 0,
            "solution": 0,
            "sample_ideation": [],
        }

    ideation = payload.get("ideation") if isinstance(payload.get("ideation"), dict) else {}
    problem_definition = (
        payload.get("problem-definition")
        if isinstance(payload.get("problem-definition"), dict)
        else {}
    )
    solution = payload.get("solution") if isinstance(payload.get("solution"), dict) else {}
    top_ideation_nodes = sorted(
        ideation.items(),
        key=lambda item: (
            float(item[1].get("y", 0) or 0) if isinstance(item[1], dict) else 0.0,
            float(item[1].get("x", 0) or 0) if isinstance(item[1], dict) else 0.0,
        ),
    )[:4]

    return {
        "ideation": len(ideation),
        "problem_definition": len(problem_definition),
        "solution": len(solution),
        "top_ideation_nodes": top_ideation_nodes,
    }


app = FastAPI(title="Meeting STT + Agenda MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
_ensure_analysis_worker_started()


@app.middleware("http")
async def enforce_ip_whitelist(request, call_next):
    client_ip = extract_client_ip(request.headers, request.client.host if request.client else None)
    if not is_ip_allowed(client_ip, IP_WHITELIST):
        return JSONResponse(status_code=403, content={"detail": "IP not allowed"})
    return await call_next(request)


@app.get("/api/health")
def get_health():
    return {
        "ok": True,
        "whisper_model": WHISPER_MODEL_NAME,
        "whisper_language": WHISPER_LANGUAGE,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "deps": {
            "fastapi": importlib.util.find_spec("fastapi") is not None,
            "python_multipart": importlib.util.find_spec("multipart") is not None,
            "whisper": importlib.util.find_spec("whisper") is not None,
            "dotenv": importlib.util.find_spec("dotenv") is not None,
            "numpy": importlib.util.find_spec("numpy") is not None,
        },
    }


@app.post("/api/llm/connect")
def post_llm_connect():
    with RT.lock:
        client = get_client()
        RT.llm_connect_retry_after_monotonic = 0.0
        RT.llm_connect_retry_note = ""
        result = client.connect()
        RT.llm_enabled = bool(result.get("ok"))
        if not RT.llm_enabled:
            RT.llm_connect_retry_after_monotonic = time.monotonic() + 60
            RT.llm_connect_retry_note = _safe_text(result.get("message"), "LLM 연결 실패")
        queue_ok = False
        queue_err = ""
        queued_task_id = 0
        if RT.llm_enabled:
            queue_ok, queued_task_id, queue_err = _enqueue_analysis(RT, force=True, mode="full_document", source="llm_connect")
            if not queue_ok:
                RT.analysis_last_error = _safe_text(queue_err)
        return {
            "enabled": RT.llm_enabled,
            "result": result,
            "llm_status": client.status(),
            "queued_analysis": {"ok": queue_ok, "task_id": queued_task_id, "error": queue_err},
            "state": _state_response(RT),
        }


@app.post("/api/llm/disconnect")
def post_llm_disconnect():
    with RT.lock:
        client = get_client()
        result = client.disconnect()
        RT.llm_enabled = False
        return {
            "enabled": False,
            "result": result,
            "llm_status": client.status(),
            "state": _state_response(RT),
        }


@app.post("/api/llm/ping")
def post_llm_ping():
    client = get_client()
    result = client.ping()
    return {"result": result, "llm_status": client.status()}


@app.post("/api/stt/flow-summary")
def post_stt_flow_summary(payload: SttFlowSummaryInput):
    return _generate_stt_flow_summary(payload)


@app.post("/api/stt/refine-transcript")
def post_stt_refine_transcript(payload: SttTranscriptRefineInput):
    text, refine_used_llm, refine_warning, refine_meta = _refine_transcript_text_with_llm(
        payload.raw_text,
        meeting_goal=payload.meeting_goal,
        meeting_goal_context=payload.meeting_goal_context,
        context_pack=payload.context_pack,
    )
    return {
        "text": _safe_text(text),
        "raw_text": _safe_text(payload.raw_text),
        "refined_text": _safe_text(text),
        "refine_used_llm": refine_used_llm,
        "refine_warning": refine_warning,
        "confidence": refine_meta.get("confidence"),
        "corrections": refine_meta.get("corrections") or [],
        "uncertain_terms": refine_meta.get("uncertain_terms") or [],
        "context_terms": refine_meta.get("context_terms") or [],
        "context_pack_summary": refine_meta.get("context_pack_summary") or {},
    }


@app.post("/api/transcript/import-json-dir")
def post_import_json_dir(payload: ImportDirInput):
    with RT.lock:
        folder = Path(payload.folder)
        target = folder if folder.is_absolute() else (ROOT / folder)
        files = []
        if target.exists() and target.is_dir():
            pattern = "**/*.json" if payload.recursive else "*.json"
            files = list(target.glob(pattern))[: payload.max_files]

        if payload.reset_state:
            RT.reset()

        files_scanned = 0
        files_parsed = 0
        files_skipped = 0
        rows_loaded = 0
        file_stats = []
        parse_errors: list[dict[str, str]] = []
        applied_goal = None

        for path in files:
            files_scanned += 1
            try:
                raw = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                try:
                    raw = path.read_text(encoding="utf-8-sig")
                except Exception as exc:
                    files_skipped += 1
                    parse_errors.append({"file": str(path), "error": f"decode failed: {exc}"})
                    continue
            except Exception:
                files_skipped += 1
                parse_errors.append({"file": str(path), "error": "read failed"})
                continue
            data = _extract_json(raw)
            if not data:
                files_skipped += 1
                parse_errors.append({"file": str(path), "error": "json parse failed"})
                continue
            ok_payload, payload_reason = _looks_like_meeting_payload(data)
            if not ok_payload:
                files_skipped += 1
                parse_errors.append({"file": str(path), "error": payload_reason})
                continue
            goal, rows = _parse_meeting_json_payload(data)
            if not rows:
                files_skipped += 1
                parse_errors.append({"file": str(path), "error": "utterance rows extracted = 0"})
                continue
            if goal and not applied_goal:
                applied_goal = goal
            added = _append_many_turns(RT, rows)
            rows_loaded += added
            files_parsed += 1
            file_stats.append({"file": str(path), "rows": added})

        if applied_goal:
            RT.meeting_goal = applied_goal

        ticked = False
        queue_err = ""
        queued_task_id = 0
        if payload.auto_tick and RT.transcript:
            ticked, queued_task_id, queue_err = _enqueue_analysis(RT, force=True, mode="full_document", source="import_json_dir")
            if not ticked:
                RT.analysis_last_error = _safe_text(queue_err)

        return {
            "state": _state_response(RT),
            "import_debug": {
                "folder": str(target),
                "files_scanned": files_scanned,
                "files_parsed": files_parsed,
                "files_skipped": files_skipped,
                "rows_loaded": rows_loaded,
                "meeting_goal": RT.meeting_goal or "",
                "added": rows_loaded,
                "reset_state": bool(payload.reset_state),
                "auto_tick": bool(payload.auto_tick),
                "ticked": bool(ticked),
                "queued_task_id": int(queued_task_id),
                "queue_error": _safe_text(queue_err),
                "analysis_mode": "none" if not RT.llm_enabled else "full_document_once",
                "meeting_goal_applied": bool(applied_goal),
                "warning": "" if files_parsed > 0 else ("파싱된 JSON 파일이 없습니다." + (f" 예: {parse_errors[0]['error']}" if parse_errors else "")),
                "file_stats": file_stats,
                "parse_errors": parse_errors[:20],
            },
        }


@app.post("/api/transcript/import-json-files")
async def post_import_json_files(
    files: list[UploadFile] = File(default=[]),
    reset_state: str = Form(default="true"),
    auto_tick: str = Form(default="true"),
):
    parsed = await _collect_rows_from_uploads(files)
    with RT.lock:
        do_reset = _boolify(reset_state, True)
        do_tick = _boolify(auto_tick, True)
        if do_reset:
            RT.reset()

        rows_loaded = _append_many_turns(RT, parsed["rows"])

        if parsed["applied_goal"]:
            RT.meeting_goal = parsed["applied_goal"]

        ticked = False
        queue_err = ""
        queued_task_id = 0
        if do_tick and RT.transcript:
            ticked, queued_task_id, queue_err = _enqueue_analysis(RT, force=True, mode="full_document", source="import_json_files")
            if not ticked:
                RT.analysis_last_error = _safe_text(queue_err)

        return {
            "state": _state_response(RT),
            "import_debug": {
                "folder": "<uploaded>",
                "files_scanned": int(parsed["files_scanned"]),
                "files_parsed": int(parsed["files_parsed"]),
                "files_skipped": int(parsed["files_skipped"]),
                "rows_loaded": rows_loaded,
                "meeting_goal": RT.meeting_goal or "",
                "added": rows_loaded,
                "reset_state": do_reset,
                "auto_tick": do_tick,
                "ticked": bool(ticked),
                "queued_task_id": int(queued_task_id),
                "queue_error": _safe_text(queue_err),
                "analysis_mode": "none" if not RT.llm_enabled else "full_document_once",
                "meeting_goal_applied": bool(parsed["applied_goal"]),
                "warning": ""
                if int(parsed["files_parsed"]) > 0
                else ("파싱된 JSON 파일이 없습니다." + (f" 예: {parsed['parse_errors'][0]['error']}" if parsed["parse_errors"] else "")),
                "file_stats": list(parsed["file_stats"]),
                "parse_errors": list(parsed["parse_errors"]),
            },
        }


@app.post("/api/transcript/replay/import-json-files")
async def post_replay_import_json_files(
    files: list[UploadFile] = File(default=[]),
    reset_state: str = Form(default="true"),
    apply_goal: str = Form(default="true"),
):
    parsed = await _collect_rows_from_uploads(files)
    with RT.lock:
        do_reset = _boolify(reset_state, True)
        do_apply_goal = _boolify(apply_goal, True)
        if do_reset:
            RT.reset()

        RT.replay_rows = list(parsed["rows"])
        RT.replay_index = 0
        RT.replay_source = "upload_json_files"
        RT.replay_loaded_at = _now_ts() if RT.replay_rows else ""

        if do_apply_goal and parsed["applied_goal"]:
            RT.meeting_goal = parsed["applied_goal"]

        return {
            "state": _state_response(RT),
            "replay_debug": {
                "queued_total": len(RT.replay_rows),
                "queued_cursor": int(RT.replay_index),
                "queued_remaining": max(0, len(RT.replay_rows) - int(RT.replay_index)),
                "done": False,
                "source": _safe_text(RT.replay_source),
                "loaded_at": _safe_text(RT.replay_loaded_at),
                "files_scanned": int(parsed["files_scanned"]),
                "files_parsed": int(parsed["files_parsed"]),
                "files_skipped": int(parsed["files_skipped"]),
                "meeting_goal_applied": bool(do_apply_goal and parsed["applied_goal"]),
                "warning": ""
                if int(parsed["files_parsed"]) > 0
                else ("파싱된 JSON 파일이 없습니다." + (f" 예: {parsed['parse_errors'][0]['error']}" if parsed["parse_errors"] else "")),
                "file_stats": list(parsed["file_stats"]),
                "parse_errors": list(parsed["parse_errors"]),
            },
        }


@app.post("/api/transcript/replay/step")
def post_replay_step(payload: ReplayStepInput):
    with RT.lock:
        total = len(RT.replay_rows)
        cursor = max(0, min(int(RT.replay_index), total))
        if total <= 0 or cursor >= total:
            RT.replay_index = total
            return {
                "state": _state_response(RT),
                "replay_debug": {
                    "added": 0,
                    "requested": int(payload.lines),
                    "analyzed": False,
                    "queued_total": total,
                    "queued_cursor": int(RT.replay_index),
                    "queued_remaining": 0,
                    "done": True,
                    "warning": "주입할 replay 큐가 없습니다.",
                },
            }

        take = max(1, min(int(payload.lines), 100))
        end = min(total, cursor + take)
        batch = RT.replay_rows[cursor:end]
        added = _append_many_turns(RT, batch)
        RT.replay_index = end

        analyzed = False
        queued_task_id = 0
        queue_error = ""
        deferred = False
        if payload.auto_analyze and added > 0:
            analyzed, queued_task_id, queue_error, deferred = _enqueue_windowed_with_backpressure(RT, source="replay_step")
            if (not analyzed) and (not deferred) and _safe_text(queue_error):
                RT.analysis_last_error = _safe_text(queue_error)

        remaining = max(0, total - int(RT.replay_index))
        done = remaining == 0
        return {
            "state": _state_response(RT),
            "replay_debug": {
                "added": added,
                "requested": take,
                "analyzed": bool(analyzed or deferred),
                "queued_task_id": int(queued_task_id),
                "queue_error": _safe_text(queue_error),
                "deferred": bool(deferred),
                "queued_total": total,
                "queued_cursor": int(RT.replay_index),
                "queued_remaining": remaining,
                "done": done,
                "warning": "",
            },
        }


def _canvas_idea_processed_ids(workspace: dict[str, Any]) -> set[str]:
    processed = {
        _safe_text(item)
        for item in (workspace.get("idea_processed_utterance_ids") or [])
        if _safe_text(item)
    }
    for item in workspace.get("canvas_items") or []:
        if not isinstance(item, dict):
            continue
        for key in ("evidence_utterance_ids", "ignored_utterance_ids"):
            for utterance_id in item.get(key) or []:
                if _safe_text(utterance_id):
                    processed.add(_safe_text(utterance_id))
    return processed


def _canvas_problem_processed_ids(workspace: dict[str, Any]) -> set[str]:
    processed = {
        _safe_text(item)
        for item in (workspace.get("problem_processed_utterance_ids") or [])
        if _safe_text(item)
    }
    for group in workspace.get("problem_groups") or []:
        if not isinstance(group, dict):
            continue
        for item in group.get("discussion_items") or []:
            if not isinstance(item, dict):
                continue
            for key in ("evidence_utterance_ids", "ignored_utterance_ids"):
                for utterance_id in item.get(key) or []:
                    if _safe_text(utterance_id):
                        processed.add(_safe_text(utterance_id))
    return processed


def _normalize_problem_discussion_llm_result(raw: Any, fallback_ids: list[str]) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    raw_title = raw.get("title")
    raw_body = raw.get("summary") or raw.get("body") or raw.get("content")
    source_text = f"{raw_title or ''} {raw_body or ''}"
    keywords = _normalize_idea_keywords(raw.get("keywords") or [], source_text, 6)
    title = _clean_idea_title(raw_title, keywords, "문제 의견")
    body = _clean_idea_summary(raw_body, title, keywords)
    refined = _normalize_refined_utterances(
        raw.get("refinedUtterances") or raw.get("refined_utterances") or [],
        limit=8,
    )
    evidence_ids = _dedup_preserve(
        [
            _safe_text(value)
            for value in (raw.get("evidenceUtteranceIds") or raw.get("evidence_utterance_ids") or fallback_ids)
            if _safe_text(value)
        ],
        limit=400,
    )
    ignored_ids = _dedup_preserve(
        [
            _safe_text(value)
            for value in (raw.get("ignoredUtteranceIds") or raw.get("ignored_utterance_ids") or [])
            if _safe_text(value)
        ],
        limit=400,
    )
    return {
        "title": title,
        "body": body,
        "keywords": keywords,
        "key_evidence": [_safe_text(value) for value in (raw.get("keyEvidence") or raw.get("key_evidence") or []) if _safe_text(value)][:8],
        "refined_utterances": refined,
        "evidence_utterance_ids": evidence_ids or fallback_ids,
        "ignored_utterance_ids": ignored_ids,
    }


def _build_problem_discussion_prompt(
    payload: CanvasProblemDiscussionWorkspaceStartInput,
    group: dict[str, Any],
) -> str:
    target_rows = [_idea_assimilation_utterance_dict(item) for item in payload.target_utterances]
    context_rows = [_idea_assimilation_utterance_dict(item) for item in (payload.context_utterances or [])[-6:]]
    prompt_payload = {
        "meeting_topic": _safe_text(payload.meeting_topic),
        "problem_group": {
            "group_id": _safe_text(group.get("group_id")),
            "topic": _safe_text(group.get("topic")),
            "insight_lens": _safe_text(group.get("insight_lens")),
            "conclusion": _safe_text(group.get("conclusion")),
            "keywords": [_safe_text(value) for value in (group.get("keywords") or []) if _safe_text(value)][:8],
        },
        "context_utterances": context_rows,
        "target_transcript_text": "\n".join(
            f"{row.get('speaker')}: {row.get('text')}" for row in target_rows if _safe_text(row.get("text"))
        ),
        "target_utterances": target_rows,
    }
    return (
        "너는 문제정의 단계에서 특정 문제정의 노드 아래에 붙일 의견/근거 노드를 생성한다. JSON 하나만 반환한다.\n"
        "규칙:\n"
        "- target_transcript_text에서 나온 의미만 사용한다. 배경 정보는 보조로만 사용한다.\n"
        "- title은 10~24자 정도의 짧은 명사구로 쓴다.\n"
        "- summary는 노드 본문에 들어갈 content이며, 문장형 설명보다 핵심 대상 + 문제/근거/조건의 압축 구문을 우선한다.\n"
        "- summary는 최대 2줄, 각 줄은 12~42자 정도로 쓴다.\n"
        "- keywords는 3~6개, 중심 의미 명사구만 넣는다.\n"
        "- refinedUtterances는 summary에 직접 영향을 준 주요 발화만 14~38자 한 줄 요약으로 넣는다.\n"
        "- 잡담, 맞장구, 회의 진행 멘트는 제외한다.\n"
        "- JSON만 반환한다.\n\n"
        "반환 형식:\n"
        "{\"title\":\"...\",\"summary\":\"...\",\"keywords\":[\"...\"],\"keyEvidence\":[\"...\"],"
        "\"refinedUtterances\":[{\"utterance_id\":\"...\",\"speaker\":\"...\",\"text\":\"...\",\"timestamp\":\"...\"}],"
        "\"evidenceUtteranceIds\":[\"...\"],\"ignoredUtteranceIds\":[\"...\"]}\n\n"
        f"input={json.dumps(prompt_payload, ensure_ascii=False)}"
    )


def _compute_problem_discussion_result(
    payload: CanvasProblemDiscussionWorkspaceStartInput,
    group: dict[str, Any],
) -> dict[str, Any]:
    fallback_ids = [_safe_text(item.id) for item in (payload.target_utterances or []) if _safe_text(item.id)]
    client, llm_ready, warning = _ensure_llm_ready(RT)
    if not llm_ready:
        return {
            "ok": False,
            "used_llm": False,
            "warning": warning or "LLM 미연결",
            "update": None,
        }
    try:
        parsed = _call_llm_json(
            RT,
            client,
            prompt=_build_problem_discussion_prompt(payload, group),
            stage="canvas_problem_discussion",
            temperature=0.18,
            max_tokens=1000,
        )
        raw = parsed.get("update") if isinstance(parsed, dict) and isinstance(parsed.get("update"), dict) else parsed
        update = _normalize_problem_discussion_llm_result(raw, fallback_ids)
        if not update:
            return {
                "ok": False,
                "used_llm": True,
                "warning": "LLM JSON 형식이 예상과 달라 의견 노드를 생성하지 않았습니다.",
                "update": None,
            }
        return {
            "ok": True,
            "used_llm": True,
            "warning": _safe_text(parsed.get("warning")) if isinstance(parsed, dict) else "",
            "update": update,
        }
    except Exception as exc:
        _append_llm_io_log(RT, direction="error", stage="canvas_problem_discussion", payload=str(exc), meta={})
        return {
            "ok": False,
            "used_llm": False,
            "warning": f"문제정의 의견 LLM 생성 실패: {exc}",
            "update": None,
        }


def _canvas_idea_existing_ideas_from_workspace(
    workspace: dict[str, Any],
    pending_item_id: str = "",
    selected_agenda_id: str = "",
) -> list[CanvasIdeaAssimilationIdeaInput]:
    ideas: list[CanvasIdeaAssimilationIdeaInput] = []
    agenda_filter = _safe_text(selected_agenda_id)
    for item in workspace.get("canvas_items") or []:
        if not isinstance(item, dict):
            continue
        if _safe_text(item.get("id")) == pending_item_id:
            continue
        if _safe_text(item.get("kind"), "note") == "topic":
            continue
        if _safe_text(item.get("kind"), "note") == "comment":
            continue
        if bool(item.get("ai_pending")):
            continue
        if agenda_filter and _safe_text(item.get("agenda_id")) != agenda_filter:
            continue
        ideas.append(
            CanvasIdeaAssimilationIdeaInput(
                id=_safe_text(item.get("id")),
                title=_safe_text(item.get("title")),
                summary=_safe_text(item.get("body") or item.get("title")),
                keywords=[_safe_text(value) for value in (item.get("keywords") or []) if _safe_text(value)],
                key_evidence=[_safe_text(value) for value in (item.get("key_evidence") or []) if _safe_text(value)],
                refined_utterances=[
                    CanvasRefinedUtteranceInput(
                        utterance_id=_safe_text(value.get("utterance_id") or value.get("utteranceId") or value.get("id")),
                        speaker=_safe_text(value.get("speaker"), "참가자"),
                        text=_safe_text(value.get("text")),
                        timestamp=_safe_text(value.get("timestamp")),
                    )
                    for value in (item.get("refined_utterances") or [])
                    if isinstance(value, dict) and _safe_text(value.get("text"))
                ],
                evidence_utterance_ids=[
                    _safe_text(value) for value in (item.get("evidence_utterance_ids") or []) if _safe_text(value)
                ],
                user_edited=bool(item.get("user_edited")),
            )
        )
    return ideas


def _save_canvas_workspace_runtime(meeting_id: str, workspace: dict[str, Any]) -> None:
    normalized_meeting_id = _safe_text(meeting_id)
    if not normalized_meeting_id:
        return
    workspace["meeting_id"] = normalized_meeting_id
    workspace["saved_at"] = _now_ts()
    with RT.lock:
        RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(workspace)
    _save_canvas_workspace_to_db(normalized_meeting_id, workspace)


def _mark_canvas_idea_job(
    meeting_id: str,
    job_id: str,
    **fields: Any,
) -> dict[str, Any]:
    normalized_meeting_id = _safe_text(meeting_id)
    with RT.lock:
        meeting_jobs = RT.canvas_idea_jobs_by_meeting.setdefault(normalized_meeting_id, {})
        current = meeting_jobs.get(job_id) if isinstance(meeting_jobs.get(job_id), dict) else {}
        current = {
            **current,
            **fields,
            "job_id": job_id,
            "meeting_id": normalized_meeting_id,
            "updated_at": _now_ts(),
        }
        meeting_jobs[job_id] = current
        return copy.deepcopy(current)


def _canvas_idea_job_response(job: dict[str, Any], workspace: dict[str, Any] | None = None) -> dict[str, Any]:
    response = {
        "ok": True,
        "job_id": _safe_text(job.get("job_id")),
        "meeting_id": _safe_text(job.get("meeting_id")),
        "status": _safe_text(job.get("status"), "idle"),
        "detail": _safe_text(job.get("detail")),
        "used_llm": bool(job.get("used_llm")),
        "warning": _safe_text(job.get("warning")),
        "pending_item_id": _safe_text(job.get("pending_item_id")),
        "target_count": int(job.get("target_count") or 0),
        "created_at": _safe_text(job.get("created_at")),
        "updated_at": _safe_text(job.get("updated_at")),
    }
    if isinstance(workspace, dict):
        response["workspace"] = _canvas_workspace_response(workspace)
    elif isinstance(job.get("workspace"), dict):
        response["workspace"] = _canvas_workspace_response(job["workspace"])
    target_signature = _safe_text(job.get("target_signature"))
    if target_signature:
        response["target_signature"] = target_signature
    return response


def _mark_canvas_problem_job(
    meeting_id: str,
    job_id: str,
    **fields: Any,
) -> dict[str, Any]:
    normalized_meeting_id = _safe_text(meeting_id)
    with RT.lock:
        meeting_jobs = RT.canvas_problem_jobs_by_meeting.setdefault(normalized_meeting_id, {})
        current = meeting_jobs.get(job_id) if isinstance(meeting_jobs.get(job_id), dict) else {}
        current = {
            **current,
            **fields,
            "job_id": job_id,
            "meeting_id": normalized_meeting_id,
            "updated_at": _now_ts(),
        }
        meeting_jobs[job_id] = current
        return copy.deepcopy(current)


def _canvas_problem_job_response(job: dict[str, Any], workspace: dict[str, Any] | None = None) -> dict[str, Any]:
    response = {
        "ok": True,
        "job_id": _safe_text(job.get("job_id")),
        "meeting_id": _safe_text(job.get("meeting_id")),
        "status": _safe_text(job.get("status"), "idle"),
        "detail": _safe_text(job.get("detail")),
        "used_llm": bool(job.get("used_llm")),
        "warning": _safe_text(job.get("warning")),
        "pending_item_id": _safe_text(job.get("pending_item_id")),
        "target_count": int(job.get("target_count") or 0),
        "created_at": _safe_text(job.get("created_at")),
        "updated_at": _safe_text(job.get("updated_at")),
    }
    if isinstance(workspace, dict):
        response["workspace"] = _canvas_workspace_response(workspace)
    elif isinstance(job.get("workspace"), dict):
        response["workspace"] = _canvas_workspace_response(job["workspace"])
    target_signature = _safe_text(job.get("target_signature"))
    if target_signature:
        response["target_signature"] = target_signature
    return response


def _apply_idea_update_to_canvas_item(item: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
    user_edited = bool(item.get("user_edited"))
    next_evidence_ids = _dedup_preserve(
        [_safe_text(value) for value in (item.get("evidence_utterance_ids") or [])]
        + [_safe_text(value) for value in (update.get("evidenceUtteranceIds") or [])],
        limit=400,
    )
    next_ignored_ids = _dedup_preserve(
        [_safe_text(value) for value in (item.get("ignored_utterance_ids") or [])]
        + [_safe_text(value) for value in (update.get("ignoredUtteranceIds") or [])],
        limit=400,
    )
    existing_keywords = _normalize_idea_keywords(
        item.get("keywords") or [],
        f"{item.get('title') or ''} {item.get('body') or ''}",
        8,
    )
    update_keywords = _normalize_idea_keywords(
        update.get("keywords") or [],
        f"{update.get('title') or ''} {update.get('summary') or ''}",
        8,
    )
    next_keywords = (
        _dedup_preserve(existing_keywords + update_keywords, limit=8)
        if user_edited
        else (update_keywords or existing_keywords)
    )
    next_key_evidence = _dedup_preserve(
        [_safe_text(value) for value in (item.get("key_evidence") or [])]
        + [_safe_text(value) for value in (update.get("keyEvidence") or [])],
        limit=8,
    )
    next_refined = _normalize_refined_utterances(
        list(item.get("refined_utterances") or []) + list(update.get("refinedUtterances") or []),
        limit=120,
    )
    next_item = {
        **item,
        "title": _safe_text(item.get("title")) if user_edited else (_safe_text(update.get("title")) or _safe_text(item.get("title"))),
        "body": _safe_text(item.get("body")) if user_edited else (_safe_text(update.get("summary")) or _safe_text(item.get("body"))),
        "keywords": next_keywords,
        "key_evidence": next_key_evidence,
        "refined_utterances": next_refined,
        "evidence_utterance_ids": next_evidence_ids,
        "ignored_utterance_ids": next_ignored_ids,
        "ai_generated": bool(item.get("ai_generated")) or bool(update),
        "ai_pending": False,
        "manual_position": False,
    }
    next_item.pop("x", None)
    next_item.pop("y", None)
    return next_item


def _idea_update_merge_allowed(item: dict[str, Any], update: dict[str, Any]) -> bool:
    target_text = " ".join(
        [
            _safe_text(item.get("title")),
            _safe_text(item.get("body")),
            " ".join(_safe_text(value) for value in (item.get("keywords") or []) if _safe_text(value)),
        ]
    )
    update_text = " ".join(
        [
            _safe_text(update.get("title")),
            _safe_text(update.get("summary")),
            " ".join(_safe_text(value) for value in (update.get("keywords") or []) if _safe_text(value)),
        ]
    )
    target_keywords = set(_normalize_idea_keywords(item.get("keywords") or [], target_text, 8))
    update_keywords = set(_normalize_idea_keywords(update.get("keywords") or [], update_text, 8))
    if target_keywords and update_keywords:
        overlap = len(target_keywords & update_keywords) / max(1, min(len(target_keywords), len(update_keywords)))
        if overlap >= 0.45:
            return True

    if _text_similarity(target_text, update_text) >= 0.28:
        return True
    return False


def _canvas_idea_item_text(item: dict[str, Any]) -> str:
    child_text = " ".join(
        _canvas_idea_item_text(child)
        for child in (item.get("merged_children") or [])[:12]
        if isinstance(child, dict)
    )
    refined_text = " ".join(
        _safe_text(row.get("text"))
        for row in (item.get("refined_utterances") or [])[:12]
        if isinstance(row, dict)
    )
    return " ".join(
        [
            _safe_text(item.get("title")),
            _safe_text(item.get("body")),
            " ".join(_safe_text(value) for value in (item.get("keywords") or []) if _safe_text(value)),
            " ".join(_safe_text(value) for value in (item.get("key_evidence") or []) if _safe_text(value)),
            refined_text,
            child_text,
        ]
    )


def _canvas_idea_leaf_ids(item: dict[str, Any]) -> list[str]:
    explicit = [_safe_text(value) for value in (item.get("compacted_from_ids") or []) if _safe_text(value)]
    if explicit:
        return explicit
    child_ids: list[str] = []
    for child in item.get("merged_children") or []:
        if isinstance(child, dict):
            child_ids.extend(_canvas_idea_leaf_ids(child))
    return _dedup_preserve(child_ids or [_safe_text(item.get("id"))], limit=400)


def _canvas_idea_source_count(item: dict[str, Any]) -> int:
    return max(1, len(_canvas_idea_leaf_ids(item)))


def _canvas_idea_child_snapshot(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _safe_text(item.get("id")),
        "agenda_id": _safe_text(item.get("agenda_id")),
        "point_id": _safe_text(item.get("point_id")),
        "kind": _safe_text(item.get("kind"), "note"),
        "title": _safe_text(item.get("title")),
        "body": _safe_text(item.get("body")),
        "keywords": [_safe_text(value) for value in (item.get("keywords") or []) if _safe_text(value)][:8],
        "key_evidence": [_safe_text(value) for value in (item.get("key_evidence") or []) if _safe_text(value)][:8],
        "refined_utterances": _normalize_refined_utterances(item.get("refined_utterances") or [], limit=80),
        "evidence_utterance_ids": [
            _safe_text(value) for value in (item.get("evidence_utterance_ids") or []) if _safe_text(value)
        ][:400],
        "ignored_utterance_ids": [
            _safe_text(value) for value in (item.get("ignored_utterance_ids") or []) if _safe_text(value)
        ][:400],
        "merged_children": _normalize_canvas_merged_children(item.get("merged_children") or []),
        "compacted_from_ids": _canvas_idea_leaf_ids(item),
        "compaction_level": _safe_nonnegative_int(item.get("compaction_level")),
        "ai_generated": bool(item.get("ai_generated")),
        "user_edited": bool(item.get("user_edited")),
    }


def _canvas_idea_visible_items(workspace: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in (workspace.get("canvas_items") or [])
        if isinstance(item, dict)
        and _safe_text(item.get("id"))
        and bool(item.get("ai_generated"))
        and not bool(item.get("ai_pending"))
        and (_safe_text(item.get("title")) or _safe_text(item.get("body")))
    ]


def _is_canvas_topic_item(item: dict[str, Any]) -> bool:
    return _safe_text(item.get("kind"), "note") == "topic"


def _is_canvas_clusterable_item(item: dict[str, Any]) -> bool:
    return (
        isinstance(item, dict)
        and _safe_text(item.get("id"))
        and not _is_canvas_topic_item(item)
        and not bool(item.get("ai_pending"))
        and (_safe_text(item.get("title")) or _safe_text(item.get("body")))
    )


def _is_canvas_topic_clustering_candidate(item: dict[str, Any]) -> bool:
    return (
        _is_canvas_clusterable_item(item)
        or (
            _is_canvas_topic_item(item)
            and not bool(item.get("user_edited"))
            and (_safe_text(item.get("title")) or _safe_text(item.get("body")))
        )
    )


def _canvas_direct_child_items(workspace: dict[str, Any], agenda_id: str) -> list[dict[str, Any]]:
    normalized_agenda_id = _safe_text(agenda_id)
    return [
        item
        for item in (workspace.get("canvas_items") or [])
        if isinstance(item, dict)
        and _safe_text(item.get("agenda_id")) == normalized_agenda_id
        and not _safe_text(item.get("parent_topic_id"))
        and (_is_canvas_topic_item(item) or _is_canvas_clusterable_item(item))
    ]


def _canvas_topic_nodes_for_agenda(workspace: dict[str, Any], agenda_id: str) -> list[dict[str, Any]]:
    normalized_agenda_id = _safe_text(agenda_id)
    return [
        item
        for item in (workspace.get("canvas_items") or [])
        if isinstance(item, dict)
        and _safe_text(item.get("agenda_id")) == normalized_agenda_id
        and _is_canvas_topic_item(item)
    ]


def _canvas_topic_child_ids(workspace: dict[str, Any], topic_id: str) -> list[str]:
    normalized_topic_id = _safe_text(topic_id)
    topic = next(
        (
            item
            for item in (workspace.get("canvas_items") or [])
            if isinstance(item, dict) and _safe_text(item.get("id")) == normalized_topic_id
        ),
        None,
    )
    explicit = [
        _safe_text(value)
        for value in ((topic or {}).get("child_item_ids") or [])
        if _safe_text(value)
    ]
    derived = [
        _safe_text(item.get("id"))
        for item in (workspace.get("canvas_items") or [])
        if isinstance(item, dict) and _safe_text(item.get("parent_topic_id")) == normalized_topic_id
    ]
    return _dedup_preserve(explicit + derived, limit=400)


def _canvas_topic_descendant_ids(workspace: dict[str, Any], topic_id: str) -> set[str]:
    descendants: set[str] = set()
    pending = list(_canvas_topic_child_ids(workspace, topic_id))

    while pending:
        child_id = _safe_text(pending.pop(0))
        if not child_id or child_id in descendants:
            continue
        descendants.add(child_id)
        child = next(
            (
                item
                for item in (workspace.get("canvas_items") or [])
                if isinstance(item, dict) and _safe_text(item.get("id")) == child_id
            ),
            None,
        )
        if child and _is_canvas_topic_item(child):
            pending.extend(_canvas_topic_child_ids(workspace, child_id))

    return descendants


def _canvas_topic_leaf_child_ids(workspace: dict[str, Any], topic_id: str) -> list[str]:
    leaves: list[str] = []
    pending = list(_canvas_topic_child_ids(workspace, topic_id))
    seen: set[str] = set()

    while pending:
        child_id = _safe_text(pending.pop(0))
        if not child_id or child_id in seen:
            continue
        seen.add(child_id)
        child = next(
            (
                item
                for item in (workspace.get("canvas_items") or [])
                if isinstance(item, dict) and _safe_text(item.get("id")) == child_id
            ),
            None,
        )
        if child and _is_canvas_topic_item(child):
            pending.extend(_canvas_topic_child_ids(workspace, child_id))
            continue
        if child:
            leaves.append(child_id)

    return _dedup_preserve(leaves, limit=400)


def _canvas_idea_create_stack_value(workspace: dict[str, Any]) -> int:
    stored = _safe_nonnegative_int(workspace.get("idea_create_stack"))
    if stored > 0:
        return stored
    return sum(_canvas_idea_source_count(item) for item in _canvas_idea_visible_items(workspace))


def _canvas_idea_visible_target(workspace: dict[str, Any]) -> int:
    return 3 + (_canvas_idea_create_stack_value(workspace) // 2)


def _canvas_topic_cluster_target(workspace: dict[str, Any]) -> int:
    return 3 + (_canvas_idea_create_stack_value(workspace) // 4)


def _canvas_idea_compaction_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_text = _canvas_idea_item_text(left)
    right_text = _canvas_idea_item_text(right)
    score = _text_similarity(left_text, right_text)
    left_keywords = set(_normalize_idea_keywords(left.get("keywords") or [], left_text, 8))
    right_keywords = set(_normalize_idea_keywords(right.get("keywords") or [], right_text, 8))
    if left_keywords and right_keywords:
        score = max(score, len(left_keywords & right_keywords) / max(1, len(left_keywords | right_keywords)))
    if _safe_text(left.get("agenda_id")) and _safe_text(left.get("agenda_id")) == _safe_text(right.get("agenda_id")):
        score += 0.05
    return score


def _pick_canvas_idea_compaction_pair(items: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    candidates = [item for item in items if not bool(item.get("user_edited"))]
    if len(candidates) < 2:
        return None

    best_pair: tuple[dict[str, Any], dict[str, Any]] | None = None
    best_score = -1.0
    for left_index, left in enumerate(candidates):
        for right in candidates[left_index + 1 :]:
            score = _canvas_idea_compaction_similarity(left, right)
            if score > best_score:
                best_score = score
                best_pair = (left, right)
    return best_pair


def _build_idea_compaction_prompt(left: dict[str, Any], right: dict[str, Any]) -> str:
    ideas = []
    for item in (left, right):
        ideas.append(
            {
                "id": _safe_text(item.get("id")),
                "title": _safe_text(item.get("title")),
                "content": _safe_text(item.get("body")),
                "keywords": [_safe_text(value) for value in (item.get("keywords") or []) if _safe_text(value)][:8],
                "key_evidence": [_safe_text(value) for value in (item.get("key_evidence") or []) if _safe_text(value)][:8],
                "refined_utterances": _normalize_refined_utterances(item.get("refined_utterances") or [], limit=8),
                "source_node_count": _canvas_idea_source_count(item),
            }
        )

    return (
        "아래 두 개의 아이디어 노드는 의미가 유사해서 canvas에서 하나의 상위 아이디어 노드로 압축하려고 한다.\n"
        "원본 노드는 시스템이 하위 근거로 보존하므로, 너는 상위 노드에 표시할 title/content/keywords/keyEvidence만 재작성한다.\n"
        "규칙:\n"
        "- 두 노드의 공통 의미를 중심으로 압축한다.\n"
        "- content는 1~2줄, 문장형 설명보다 핵심 대상 + 방향/문제/조건의 압축 구문을 우선한다.\n"
        "- keywords는 3~6개, 일반어/메타어를 제외하고 의미 중심 명사구로 쓴다.\n"
        "- keyEvidence는 상위 노드를 이해하는 데 필요한 핵심 근거만 최대 4개로 쓴다.\n"
        "- 없는 내용을 만들지 말고, 두 노드에 있는 내용만 사용한다.\n"
        "- JSON만 반환한다.\n\n"
        "반환 형식:\n"
        "{\"title\":\"...\",\"summary\":\"...\",\"keywords\":[\"...\"],\"keyEvidence\":[\"...\"]}\n\n"
        f"nodes={json.dumps(ideas, ensure_ascii=False)}"
    )


def _compute_idea_compaction_update(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any] | None:
    fallback_ids = _dedup_preserve(
        [
            _safe_text(value)
            for item in (left, right)
            for value in (item.get("evidence_utterance_ids") or [])
            if _safe_text(value)
        ],
        limit=400,
    )
    client, llm_ready, _ = _ensure_llm_ready(RT)
    if not llm_ready:
        return None

    try:
        parsed = _call_llm_json(
            RT,
            client,
            prompt=_build_idea_compaction_prompt(left, right),
            stage="canvas_idea_compaction",
            temperature=0.18,
            max_tokens=900,
        )
    except Exception as exc:
        _append_llm_io_log(RT, direction="error", stage="canvas_idea_compaction", payload=str(exc), meta={})
        return None

    raw = parsed.get("update") if isinstance(parsed, dict) and isinstance(parsed.get("update"), dict) else parsed
    if not isinstance(raw, dict):
        return None
    update = _normalize_idea_assimilation_update(
        {
            **raw,
            "action": "create",
            "evidenceUtteranceIds": raw.get("evidenceUtteranceIds") or raw.get("evidence_utterance_ids") or fallback_ids,
        },
        fallback_ids,
    )
    return update


def _apply_canvas_idea_compaction_pair(
    workspace: dict[str, Any],
    left: dict[str, Any],
    right: dict[str, Any],
    update: dict[str, Any],
) -> None:
    left_id = _safe_text(left.get("id"))
    right_id = _safe_text(right.get("id"))
    if not left_id or not right_id or left_id == right_id:
        return

    canvas_items = [
        copy.deepcopy(item)
        for item in (workspace.get("canvas_items") or [])
        if isinstance(item, dict)
    ]
    item_indices = {_safe_text(item.get("id")): index for index, item in enumerate(canvas_items) if _safe_text(item.get("id"))}
    if item_indices.get(right_id, 10**9) < item_indices.get(left_id, 10**9):
        left, right = right, left
        left_id, right_id = right_id, left_id

    combined_refined = _normalize_refined_utterances(
        list(update.get("refinedUtterances") or [])
        + list(left.get("refined_utterances") or [])
        + list(right.get("refined_utterances") or []),
        limit=120,
    )
    combined_evidence_ids = _dedup_preserve(
        [_safe_text(value) for value in (left.get("evidence_utterance_ids") or []) if _safe_text(value)]
        + [_safe_text(value) for value in (right.get("evidence_utterance_ids") or []) if _safe_text(value)]
        + [_safe_text(value) for value in (update.get("evidenceUtteranceIds") or []) if _safe_text(value)],
        limit=400,
    )
    combined_ignored_ids = _dedup_preserve(
        [_safe_text(value) for value in (left.get("ignored_utterance_ids") or []) if _safe_text(value)]
        + [_safe_text(value) for value in (right.get("ignored_utterance_ids") or []) if _safe_text(value)]
        + [_safe_text(value) for value in (update.get("ignoredUtteranceIds") or []) if _safe_text(value)],
        limit=400,
    )
    combined_children = _normalize_canvas_merged_children(
        [_canvas_idea_child_snapshot(left), _canvas_idea_child_snapshot(right)],
        limit=80,
    )
    compacted_from_ids = _dedup_preserve(_canvas_idea_leaf_ids(left) + _canvas_idea_leaf_ids(right), limit=400)
    parent = {
        **left,
        "title": _safe_text(update.get("title")) or _safe_text(left.get("title")),
        "body": _safe_text(update.get("summary")) or _safe_text(left.get("body")),
        "keywords": _normalize_idea_keywords(update.get("keywords") or [], f"{update.get('title') or ''} {update.get('summary') or ''}", 8)
        or _dedup_preserve(
            [_safe_text(value) for value in (left.get("keywords") or []) if _safe_text(value)]
            + [_safe_text(value) for value in (right.get("keywords") or []) if _safe_text(value)],
            limit=8,
        ),
        "key_evidence": _dedup_preserve(
            [_safe_text(value) for value in (update.get("keyEvidence") or []) if _safe_text(value)]
            + [_safe_text(value) for value in (left.get("key_evidence") or []) if _safe_text(value)]
            + [_safe_text(value) for value in (right.get("key_evidence") or []) if _safe_text(value)],
            limit=8,
        ),
        "refined_utterances": combined_refined,
        "evidence_utterance_ids": combined_evidence_ids,
        "ignored_utterance_ids": combined_ignored_ids,
        "merged_children": combined_children,
        "compacted_from_ids": compacted_from_ids,
        "compaction_level": max(
            _safe_nonnegative_int(left.get("compaction_level")),
            _safe_nonnegative_int(right.get("compaction_level")),
        )
        + 1,
        "ai_generated": True,
        "user_edited": False,
        "ai_pending": False,
        "manual_position": False,
    }
    parent.pop("x", None)
    parent.pop("y", None)

    workspace["canvas_items"] = [
        parent if _safe_text(item.get("id")) == left_id else item
        for item in canvas_items
        if _safe_text(item.get("id")) != right_id
    ]
    workspace["node_positions"] = _normalize_canvas_node_positions(workspace.get("node_positions") or {})


def _maybe_compact_canvas_idea_nodes(workspace: dict[str, Any]) -> dict[str, Any]:
    visible_items = _canvas_idea_visible_items(workspace)
    target = _canvas_idea_visible_target(workspace)
    if len(visible_items) < CANVAS_IDEA_COMPACTION_MIN_VISIBLE or len(visible_items) <= target:
        return {"merged": 0, "target": target, "visible": len(visible_items)}

    merged = 0
    while merged < CANVAS_IDEA_COMPACTION_MAX_MERGES_PER_JOB:
        visible_items = _canvas_idea_visible_items(workspace)
        if len(visible_items) <= target:
            break
        pair = _pick_canvas_idea_compaction_pair(visible_items)
        if not pair:
            break
        update = _compute_idea_compaction_update(pair[0], pair[1])
        if not update:
            break
        _apply_canvas_idea_compaction_pair(workspace, pair[0], pair[1], update)
        merged += 1

    return {"merged": merged, "target": target, "visible": len(_canvas_idea_visible_items(workspace))}


def _build_canvas_topic_clustering_prompt(
    workspace: dict[str, Any],
    agenda_id: str,
    top_level_items: list[dict[str, Any]],
    candidate_items: list[dict[str, Any]],
) -> str:
    target = _canvas_topic_cluster_target(workspace)

    def node_payload(item: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "id": _safe_text(item.get("id")),
            "kind": _safe_text(item.get("kind"), "note"),
            "title": _safe_text(item.get("title")),
            "content": _safe_text(item.get("body")),
            "keywords": [_safe_text(value) for value in (item.get("keywords") or []) if _safe_text(value)][:8],
            "refined_utterances": _normalize_refined_utterances(item.get("refined_utterances") or [], limit=6),
            "parent_topic_locked": bool(item.get("parent_topic_locked")),
            "created_by": _safe_text(item.get("created_by")),
            "user_edited": bool(item.get("user_edited")),
        }
        if _is_canvas_topic_item(item):
            payload["child_count"] = len(_canvas_topic_child_ids(workspace, _safe_text(item.get("id"))))
        return payload

    payload = {
        "agenda_id": _safe_text(agenda_id),
        "visibleTarget": target,
        "directChildCount": len(top_level_items),
        "nodes": [node_payload(item) for item in candidate_items],
    }
    return (
        "회의 canvas의 그룹 분류 바로 아래 1차 노드 수가 visibleTarget을 넘었다.\n"
        "너는 아래 direct child 노드 중 의미가 가장 유사한 2개만 골라 계층적 topic으로 묶어야 한다.\n"
        "규칙:\n"
        "- 카운트 기준은 topic node 개수가 아니라 그룹 분류 바로 아래에 있는 1차 노드 전체 개수다.\n"
        "- nodes는 모두 그룹 분류 바로 아래 direct child 후보이다.\n"
        "- 반드시 가장 유사한 2개만 pair로 반환한다. 3개 이상 선택 금지.\n"
        "- 서로 의미가 충분히 유사하지 않으면 pair를 빈 배열로 반환한다.\n"
        "- kind=topic인 노드도 후보가 될 수 있다. topic끼리 유사하면 topic들을 하위에 넣는 것이 아니라 하나의 새 topic으로 통합한다.\n"
        "- topic node 아래에는 다른 topic node가 들어가면 안 된다. topic pair를 고르더라도 서버가 기존 topic의 실제 하위 아이디어만 새 topic 아래로 평탄화한다.\n"
        "- title/body/keywords는 선택한 pair 2개를 대표하는 topic 문구로 작성한다.\n"
        "- title은 10~24자 정도의 짧은 명사구로 쓴다. '요약', '정리', '논의', '관련' 같은 메타어를 쓰지 않는다.\n"
        "- body는 topic 노드 본문에 들어갈 content다. 완성형 설명문이 아니라 핵심 대상 + 방향/문제/조건만 남긴 압축 구문이어야 한다.\n"
        "- body는 최대 2줄로 작성하고, 각 줄은 12~36자 정도의 짧은 명사구/핵심 구문으로 쓴다.\n"
        "- body에 '~합니다', '~됩니다', '~할 수 있습니다', '~로 보입니다' 같은 문장형 어미를 피한다.\n"
        "- keywords는 3~6개로 작성하고, pair 전체의 중심 의미를 이루는 명사구만 넣는다.\n"
        "- 서버가 pair를 검증한 뒤 새 topic 생성 또는 기존 topic 업데이트를 결정한다.\n"
        "- JSON만 반환한다.\n\n"
        "반환 형식:\n"
        "{"
        "\"pair\":[\"node-id-1\",\"node-id-2\"],"
        "\"title\":\"...\","
        "\"body\":\"...\","
        "\"keywords\":[\"...\"]"
        "}\n\n"
        f"input={json.dumps(payload, ensure_ascii=False)}"
    )


def _normalize_topic_cluster_title(raw: Any, fallback: str = "") -> str:
    text = _strip_idea_reference_text(raw, collapse_whitespace=False)
    if not text:
        return fallback
    text = re.sub(r"^(?:주제|topic|제목|요약|정리)\s*[:：-]\s*", "", text, flags=re.IGNORECASE)
    return _to_summary_point(text, 24)


def _normalize_topic_cluster_body(raw: Any, fallback: str = "") -> str:
    text = _safe_text(raw)
    if isinstance(raw, list):
        text = "\n".join(_safe_text(item) for item in raw if _safe_text(item))
    text = _strip_idea_reference_text(text, collapse_whitespace=False)
    text = re.sub(r"^(?:내용|본문|요약|summary|content|body)\s*[:：-]\s*", "", text, flags=re.IGNORECASE)
    candidates = [
        _to_summary_point(part, 42)
        for part in re.split(r"\n+|\s*/\s*|[;；]+", text)
        if _safe_text(part)
    ]
    candidates = [
        item
        for item in candidates
        if item
        and item.lower() not in IDEA_KEYWORD_NOISE
        and not re.fullmatch(r"(없음|해당 없음|n/?a)", item, flags=re.IGNORECASE)
    ]
    if not candidates and fallback:
        candidates = [_to_summary_point(fallback, 42)]
    return "\n".join(_dedup_preserve(candidates, limit=2))


def _build_canvas_topic_summary_prompt(
    meeting_topic: str,
    topic: dict[str, Any],
    child_items: list[dict[str, Any]],
) -> str:
    def child_payload(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": _safe_text(item.get("id")),
            "kind": _safe_text(item.get("kind"), "note"),
            "title": _safe_text(item.get("title")),
            "content": _safe_text(item.get("body")),
            "keywords": [_safe_text(value) for value in (item.get("keywords") or []) if _safe_text(value)][:8],
            "refined_utterances": _normalize_refined_utterances(item.get("refined_utterances") or [], limit=8),
        }

    payload = {
        "meeting_topic": _safe_text(meeting_topic),
        "draft_topic": {
            "id": _safe_text(topic.get("id")),
            "title": _safe_text(topic.get("title")),
            "content": _safe_text(topic.get("body")),
            "keywords": [_safe_text(value) for value in (topic.get("keywords") or []) if _safe_text(value)][:8],
        },
        "children": [child_payload(item) for item in child_items],
    }
    return (
        "너는 회의 아이디어 canvas의 topic node 내부를 정리하는 분석기다. JSON 하나만 반환한다.\n"
        "입력된 children은 사용자가 직접 묶은 아이디어들이다. draft_topic은 참고만 하고 그대로 복사하지 않는다.\n"
        "규칙:\n"
        "- title은 children 전체를 대표하는 10~24자 정도의 짧은 명사구로 쓴다.\n"
        "- title에 '요약', '정리', '논의', '관련', '묶음', '토픽' 같은 메타어를 쓰지 않는다.\n"
        "- body는 topic node content다. 완성형 문장이 아니라 핵심 대상 + 방향/문제/조건만 남긴 압축 구문이어야 한다.\n"
        "- body는 최대 2줄, 각 줄 12~36자 정도의 짧은 명사구/핵심 구문으로 쓴다.\n"
        "- '~합니다', '~됩니다', '~할 수 있습니다', '~로 보입니다' 같은 문장형 어미를 피한다.\n"
        "- keywords는 children 전체를 대표하는 명사구 3~6개만 쓴다.\n"
        "- children에 없는 내용을 새로 만들지 않는다.\n"
        "- JSON만 반환한다.\n\n"
        "반환 형식:\n"
        "{"
        "\"title\":\"...\","
        "\"body\":\"...\","
        "\"keywords\":[\"...\"]"
        "}\n\n"
        f"input={json.dumps(payload, ensure_ascii=False)}"
    )


def _compute_canvas_topic_summary_update(
    meeting_topic: str,
    topic: dict[str, Any],
    child_items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    client, llm_ready, _ = _ensure_llm_ready(RT)
    if not llm_ready or not child_items:
        return None
    try:
        parsed = _call_llm_json(
            RT,
            client,
            prompt=_build_canvas_topic_summary_prompt(meeting_topic, topic, child_items),
            stage="canvas_topic_summary",
            temperature=0.14,
            max_tokens=700,
        )
    except Exception as exc:
        _append_llm_io_log(RT, direction="error", stage="canvas_topic_summary", payload=str(exc), meta={})
        return None
    if not isinstance(parsed, dict):
        return None
    title = _normalize_topic_cluster_title(parsed.get("title"), _safe_text(topic.get("title"), "AI 주제"))
    body = _normalize_topic_cluster_body(parsed.get("body") or parsed.get("summary"), title)
    keywords = _normalize_idea_keywords(parsed.get("keywords") or [], f"{title} {body}", 6)
    if not title and not body and not keywords:
        return None
    return {
        "title": title,
        "body": body,
        "keywords": keywords,
    }


def _finalize_canvas_topic_summary_workspace_job(
    meeting_id: str,
    job_id: str,
    topic_item_id: str,
    meeting_topic: str,
) -> None:
    try:
        latest_workspace = _clone_runtime_workspace_state(
            meeting_id,
            _warm_canvas_workspace_cache(RT, meeting_id),
            _now_ts(),
        )
        canvas_items = [
            copy.deepcopy(item)
            for item in (latest_workspace.get("canvas_items") or [])
            if isinstance(item, dict)
        ]
        topic_id = _safe_text(topic_item_id)
        topic = next((item for item in canvas_items if _safe_text(item.get("id")) == topic_id), None)
        if not topic or not _is_canvas_topic_item(topic):
            raise RuntimeError("정리할 topic node를 찾을 수 없습니다.")

        child_ids = _canvas_topic_leaf_child_ids({"canvas_items": canvas_items}, topic_id)
        child_id_set = set(child_ids)
        child_items = [
            item
            for item in canvas_items
            if _safe_text(item.get("id")) in child_id_set and not _is_canvas_topic_item(item)
        ]
        update = _compute_canvas_topic_summary_update(meeting_topic, topic, child_items)
        if not update:
            warning = "LLM 응답을 받지 못해 topic 내용을 생성하지 못했습니다."
            latest_workspace["canvas_items"] = [
                {
                    **item,
                    "ai_pending": False,
                    "body": _safe_text(item.get("body")) or "AI topic 정리에 실패했습니다.",
                }
                if _safe_text(item.get("id")) == topic_id
                else item
                for item in canvas_items
            ]
            _save_canvas_workspace_runtime(meeting_id, latest_workspace)
            _mark_canvas_idea_job(
                meeting_id,
                job_id,
                status="error",
                detail=warning,
                workspace=copy.deepcopy(latest_workspace),
                used_llm=False,
                warning=warning,
                pending_item_id=topic_id,
                failed_at_epoch=time.time(),
            )
            return

        latest_workspace["canvas_items"] = [
            {
                **item,
                "title": _safe_text(update.get("title")) or _safe_text(item.get("title")),
                "body": _safe_text(update.get("body")) or _safe_text(item.get("body")),
                "keywords": [_safe_text(value) for value in (update.get("keywords") or []) if _safe_text(value)][:6],
                "ai_pending": False,
                "ai_generated": True,
                "user_edited": False,
                "manual_position": False,
            }
            if _safe_text(item.get("id")) == topic_id
            else item
            for item in canvas_items
        ]
        _save_canvas_workspace_runtime(meeting_id, latest_workspace)
        _mark_canvas_idea_job(
            meeting_id,
            job_id,
            status="completed",
            detail="AI topic 정리 완료",
            workspace=copy.deepcopy(latest_workspace),
            used_llm=True,
            warning="",
            pending_item_id=topic_id,
        )
    except Exception as exc:
        latest_workspace = _clone_runtime_workspace_state(
            meeting_id,
            _warm_canvas_workspace_cache(RT, meeting_id),
            _now_ts(),
        )
        latest_workspace["canvas_items"] = [
            {
                **item,
                "ai_pending": False,
                "body": _safe_text(item.get("body")) or "AI topic 정리에 실패했습니다.",
            }
            if isinstance(item, dict) and _safe_text(item.get("id")) == _safe_text(topic_item_id)
            else item
            for item in (latest_workspace.get("canvas_items") or [])
        ]
        _save_canvas_workspace_runtime(meeting_id, latest_workspace)
        _mark_canvas_idea_job(
            meeting_id,
            job_id,
            status="error",
            detail=f"AI topic 정리 실패: {exc}",
            workspace=copy.deepcopy(latest_workspace),
            used_llm=False,
            warning=_safe_text(exc),
            pending_item_id=_safe_text(topic_item_id),
            failed_at_epoch=time.time(),
        )


def _compute_canvas_topic_clustering_result(
    workspace: dict[str, Any],
    agenda_id: str,
    top_level_items: list[dict[str, Any]],
    candidate_items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    client, llm_ready, _ = _ensure_llm_ready(RT)
    if not llm_ready or not candidate_items:
        return None
    try:
        parsed = _call_llm_json(
            RT,
            client,
            prompt=_build_canvas_topic_clustering_prompt(
                workspace,
                agenda_id,
                top_level_items,
                candidate_items,
            ),
            stage="canvas_topic_clustering",
            temperature=0.16,
            max_tokens=900,
        )
    except Exception as exc:
        _append_llm_io_log(RT, direction="error", stage="canvas_topic_clustering", payload=str(exc), meta={})
        return None
    return parsed if isinstance(parsed, dict) else None


def _apply_canvas_topic_clustering_result(
    workspace: dict[str, Any],
    agenda_id: str,
    result: dict[str, Any],
) -> int:
    canvas_items = [
        copy.deepcopy(item)
        for item in (workspace.get("canvas_items") or [])
        if isinstance(item, dict)
    ]
    items_by_id = {_safe_text(item.get("id")): item for item in canvas_items if _safe_text(item.get("id"))}
    direct_child_ids = {
        item_id
        for item_id in [
            _safe_text(item.get("id"))
            for item in _canvas_direct_child_items({"canvas_items": canvas_items}, agenda_id)
        ]
        if item_id
    }
    movable_ids = {
        item_id
        for item_id, item in items_by_id.items()
        if _safe_text(item.get("agenda_id")) == _safe_text(agenda_id)
        and _is_canvas_topic_clustering_candidate(item)
        and not bool(item.get("parent_topic_locked"))
        and item_id in direct_child_ids
    }

    raw_pair = result.get("pair") or result.get("nodeIds") or result.get("node_ids")
    if not isinstance(raw_pair, list):
        return 0
    pair_ids = _dedup_preserve(
        [_safe_text(value) for value in raw_pair if _safe_text(value) in movable_ids],
        limit=2,
    )
    if len(pair_ids) != 2:
        return 0

    left_item = items_by_id.get(pair_ids[0])
    right_item = items_by_id.get(pair_ids[1])
    if not left_item or not right_item:
        return 0
    if pair_ids[0] in _canvas_topic_descendant_ids({"canvas_items": canvas_items}, pair_ids[1]):
        return 0
    if pair_ids[1] in _canvas_topic_descendant_ids({"canvas_items": canvas_items}, pair_ids[0]):
        return 0

    title = _normalize_topic_cluster_title(result.get("title"), "AI 주제")
    body = _normalize_topic_cluster_body(result.get("body") or result.get("summary"), title or "관련 아이디어 묶음")
    keywords = _normalize_idea_keywords(result.get("keywords") or [], f"{title} {body}", 6)
    topic_pair_ids = [item_id for item_id in pair_ids if _is_canvas_topic_item(items_by_id.get(item_id) or {})]

    created_topics: list[dict[str, Any]] = []
    created_topic_insert_index: int | None = None
    removed_topic_ids: set[str] = set()
    now_ms = int(time.time() * 1000)

    assignments: dict[str, str] = {}
    topic_updates: dict[str, dict[str, Any]] = {}
    source_workspace = {"canvas_items": canvas_items}

    if len(topic_pair_ids) == 1:
        topic_id = topic_pair_ids[0]
        child_id = pair_ids[0] if pair_ids[1] == topic_id else pair_ids[1]
        nested_topic_ids = {
            descendant_id
            for descendant_id in _canvas_topic_descendant_ids(source_workspace, topic_id)
            if _is_canvas_topic_item(items_by_id.get(descendant_id) or {})
        }
        for nested_topic_id in nested_topic_ids:
            removed_topic_ids.add(nested_topic_id)
            for leaf_child_id in _canvas_topic_leaf_child_ids(source_workspace, nested_topic_id):
                if leaf_child_id not in removed_topic_ids:
                    assignments[leaf_child_id] = topic_id
        assignments[child_id] = topic_id
        topic_updates[topic_id] = {
            "title": title,
            "body": body,
            "keywords": keywords,
        }
    elif len(topic_pair_ids) == 2:
        removed_topic_ids.update(topic_pair_ids)
        leaf_child_ids: list[str] = []
        for source_topic_id in topic_pair_ids:
            removed_topic_ids.update(
                descendant_id
                for descendant_id in _canvas_topic_descendant_ids(source_workspace, source_topic_id)
                if _is_canvas_topic_item(items_by_id.get(descendant_id) or {})
            )
            leaf_child_ids.extend(_canvas_topic_leaf_child_ids(source_workspace, source_topic_id))
        leaf_child_ids = _dedup_preserve(
            [child_id for child_id in leaf_child_ids if child_id and child_id not in removed_topic_ids],
            limit=400,
        )
        if not leaf_child_ids:
            return 0
        topic_id = f"ai-topic-{now_ms}-0-{uuid4().hex[:6]}"
        topic = {
            "id": topic_id,
            "agenda_id": _safe_text(agenda_id),
            "point_id": "",
            "kind": "topic",
            "title": title,
            "body": body,
            "keywords": keywords,
            "key_evidence": [],
            "refined_utterances": [],
            "evidence_utterance_ids": [],
            "ignored_utterance_ids": [],
            "child_item_ids": leaf_child_ids,
            "topic_collapsed": True,
            "created_by": "ai",
            "ai_generated": True,
            "user_edited": False,
            "manual_position": False,
        }
        created_topics.append(topic)
        items_by_id[topic_id] = topic
        for child_id in leaf_child_ids:
            assignments[child_id] = topic_id
    else:
        topic_id = f"ai-topic-{now_ms}-0-{uuid4().hex[:6]}"
        topic = {
            "id": topic_id,
            "agenda_id": _safe_text(agenda_id),
            "point_id": "",
            "kind": "topic",
            "title": title,
            "body": body,
            "keywords": keywords,
            "key_evidence": [],
            "refined_utterances": [],
            "evidence_utterance_ids": [],
            "ignored_utterance_ids": [],
            "child_item_ids": pair_ids,
            "topic_collapsed": True,
            "created_by": "ai",
            "ai_generated": True,
            "user_edited": False,
            "manual_position": False,
        }
        created_topics.append(topic)
        items_by_id[topic_id] = topic
        for child_id in pair_ids:
            assignments[child_id] = topic_id

    if created_topics:
        original_indices = [
            index
            for index, item in enumerate(canvas_items)
            if _safe_text(item.get("id")) in pair_ids
        ]
        if original_indices:
            created_topic_insert_index = min(original_indices)

    if not assignments and not created_topics:
        return 0

    assigned_by_topic: dict[str, list[str]] = {}
    for child_id, topic_id in assignments.items():
        assigned_by_topic.setdefault(topic_id, []).append(child_id)

    topic_lookup_items = created_topics + canvas_items

    def build_next_item(item: dict[str, Any]) -> dict[str, Any] | None:
        item_id = _safe_text(item.get("id"))
        if not item_id:
            return None
        if item_id in removed_topic_ids:
            return None
        next_item = copy.deepcopy(items_by_id.get(item_id, item))
        if item_id in assignments:
            next_item["parent_topic_id"] = assignments[item_id]
            next_item["parent_topic_source"] = "ai"
            next_item["parent_topic_locked"] = False
            next_item["manual_position"] = False
        if _is_canvas_topic_item(next_item):
            current_children = [
                child_id
                for child_id in _canvas_topic_leaf_child_ids({"canvas_items": topic_lookup_items}, item_id)
                if child_id not in removed_topic_ids
            ]
            next_children = _dedup_preserve(current_children + assigned_by_topic.get(item_id, []), limit=400)
            next_item["child_item_ids"] = next_children
            next_item.setdefault("topic_collapsed", True)
            if not bool(next_item.get("user_edited")):
                raw_update = topic_updates.get(item_id)
                if raw_update:
                    if _safe_text(raw_update.get("title")):
                        next_item["title"] = _safe_text(raw_update.get("title"))
                    if _safe_text(raw_update.get("body")):
                        next_item["body"] = _safe_text(raw_update.get("body"))
                    raw_keywords = raw_update.get("keywords")
                    if isinstance(raw_keywords, list) and raw_keywords:
                        next_item["keywords"] = [_safe_text(value) for value in raw_keywords if _safe_text(value)][:6]
        return next_item

    next_items: list[dict[str, Any]] = []
    inserted_created_topics = False
    for index, item in enumerate(canvas_items):
        if created_topic_insert_index == index and not inserted_created_topics:
            for topic in created_topics:
                next_topic = build_next_item(topic)
                if next_topic:
                    next_items.append(next_topic)
            inserted_created_topics = True
        next_item = build_next_item(item)
        if next_item:
            next_items.append(next_item)

    if created_topics and not inserted_created_topics:
        for topic in created_topics:
            next_topic = build_next_item(topic)
            if next_topic:
                next_items.append(next_topic)

    workspace["canvas_items"] = next_items
    return len(assignments) + len(created_topics)


def _maybe_cluster_canvas_topic_nodes(workspace: dict[str, Any]) -> dict[str, Any]:
    target = _canvas_topic_cluster_target(workspace)
    changed = 0
    for _ in range(CANVAS_TOPIC_CLUSTER_MAX_PASSES_PER_JOB):
        pass_changed = 0
        agenda_ids = _dedup_preserve(
            [
                _safe_text(item.get("agenda_id"))
                for item in (workspace.get("canvas_items") or [])
                if isinstance(item, dict) and _safe_text(item.get("agenda_id"))
            ],
            limit=100,
        )
        for agenda_id in agenda_ids:
            top_level_items = _canvas_direct_child_items(workspace, agenda_id)
            if len(top_level_items) <= target:
                continue
            candidate_items = [
                item
                for item in top_level_items
                if _is_canvas_topic_clustering_candidate(item)
                and not bool(item.get("parent_topic_locked"))
            ]
            if len(candidate_items) < 1:
                continue
            if len(candidate_items) < 2:
                continue
            result = _compute_canvas_topic_clustering_result(
                workspace,
                agenda_id,
                top_level_items,
                candidate_items,
            )
            if not result:
                continue
            pass_changed += _apply_canvas_topic_clustering_result(workspace, agenda_id, result)
        changed += pass_changed
        if pass_changed <= 0:
            break
    return {"changed": changed, "target": target}


def _finalize_canvas_idea_workspace_job(
    meeting_id: str,
    job_id: str,
    pending_item_id: str,
    payload: CanvasIdeaAssimilationInput,
) -> None:
    try:
        result = _compute_idea_assimilation_result(payload)
        latest_workspace = _clone_runtime_workspace_state(
            meeting_id,
            _warm_canvas_workspace_cache(RT, meeting_id),
            _now_ts(),
        )
        canvas_items = [
            copy.deepcopy(item)
            for item in (latest_workspace.get("canvas_items") or [])
            if isinstance(item, dict)
        ]
        pending_item = next((item for item in canvas_items if _safe_text(item.get("id")) == pending_item_id), None)
        base_items = [item for item in canvas_items if _safe_text(item.get("id")) != pending_item_id]
        target_ids = [_safe_text(item.id) for item in (payload.target_utterances or []) if _safe_text(item.id)]
        starting_create_stack = _canvas_idea_create_stack_value(latest_workspace)
        created_node_count = 0
        clustering_result: dict[str, Any] = {"changed": 0, "target": _canvas_topic_cluster_target(latest_workspace)}

        if not bool(result.get("used_llm")):
            positions = copy.deepcopy(latest_workspace.get("node_positions") or {})
            ideation_positions = dict(positions.get("ideation") or {})
            ideation_positions.pop(f"canvas-item-{pending_item_id}", None)
            positions["ideation"] = ideation_positions
            latest_workspace["canvas_items"] = base_items
            latest_workspace["node_positions"] = positions
            _save_canvas_workspace_runtime(meeting_id, latest_workspace)
            warning = _safe_text(result.get("warning"), "LLM 응답을 받지 못해 아이디어 노드를 생성하지 않았습니다.")
            _mark_canvas_idea_job(
                meeting_id,
                job_id,
                status="error",
                detail=warning,
                workspace=copy.deepcopy(latest_workspace),
                used_llm=False,
                warning=warning,
                failed_at_epoch=time.time(),
            )
            return

        updates = [
            update
            for update in (result.get("updates") or [])
            if isinstance(update, dict) and _safe_text(update.get("action")) in {"merge", "create"}
        ]
        items_by_id = {_safe_text(item.get("id")): item for item in base_items if _safe_text(item.get("id"))}
        guarded_updates: list[dict[str, Any]] = []
        for update in updates:
            if _safe_text(update.get("action")) != "merge":
                guarded_updates.append(update)
                continue
            target_item = items_by_id.get(_safe_text(update.get("targetIdeaId")))
            if target_item and _idea_update_merge_allowed(target_item, update):
                guarded_updates.append(update)
                continue
            guarded_updates.append({**update, "action": "create", "targetIdeaId": ""})
        updates = guarded_updates

        if not updates:
            latest_workspace["canvas_items"] = base_items
            positions = copy.deepcopy(latest_workspace.get("node_positions") or {})
            ideation_positions = dict(positions.get("ideation") or {})
            ideation_positions.pop(f"canvas-item-{pending_item_id}", None)
            positions["ideation"] = ideation_positions
            latest_workspace["node_positions"] = positions
            latest_workspace["idea_processed_utterance_ids"] = _dedup_preserve(
                list(latest_workspace.get("idea_processed_utterance_ids") or []) + target_ids,
                limit=1000,
            )
        else:
            next_items = list(base_items)
            create_updates = [update for update in updates if _safe_text(update.get("action")) == "create"]
            for update in updates:
                if _safe_text(update.get("action")) != "merge":
                    continue
                target_id = _safe_text(update.get("targetIdeaId"))
                next_items = [
                    _apply_idea_update_to_canvas_item(item, update)
                    if _safe_text(item.get("id")) == target_id
                    else item
                    for item in next_items
                ]

            for create_index, update in enumerate(create_updates):
                if create_index == 0 and isinstance(pending_item, dict):
                    created_id = pending_item_id
                    created_item = _apply_idea_update_to_canvas_item(pending_item, update)
                else:
                    created_id = f"ai-idea-{int(time.time() * 1000)}-{create_index}-{uuid4().hex[:6]}"
                    created_item = _apply_idea_update_to_canvas_item(
                        {
                            "id": created_id,
                            "agenda_id": _safe_text(getattr(payload, "selected_agenda_id", "")),
                            "point_id": "",
                            "kind": "note",
                            "title": "AI 아이디어",
                            "body": "",
                            "keywords": [],
                            "key_evidence": [],
                            "refined_utterances": [],
                            "evidence_utterance_ids": [],
                            "ignored_utterance_ids": [],
                            "merged_children": [],
                            "compacted_from_ids": [],
                            "compaction_level": 0,
                            "parent_topic_id": "",
                            "parent_topic_source": "",
                            "parent_topic_locked": False,
                            "child_item_ids": [],
                            "topic_collapsed": False,
                            "created_by": "ai",
                            "manual_position": False,
                            "ai_generated": True,
                            "user_edited": False,
                            "ai_pending": False,
                        },
                        update,
                    )
                next_items.append(created_item)

            created_node_count = len(create_updates)
            if not create_updates and isinstance(pending_item, dict):
                positions = copy.deepcopy(latest_workspace.get("node_positions") or {})
                ideation_positions = dict(positions.get("ideation") or {})
                ideation_positions.pop(f"canvas-item-{pending_item_id}", None)
                positions["ideation"] = ideation_positions
                latest_workspace["node_positions"] = positions

            latest_workspace["canvas_items"] = next_items
            latest_workspace["idea_processed_utterance_ids"] = _dedup_preserve(
                list(latest_workspace.get("idea_processed_utterance_ids") or []) + target_ids,
                limit=1000,
            )
            if created_node_count > 0:
                latest_workspace["idea_create_stack"] = starting_create_stack + created_node_count

        if created_node_count > 0:
            clustering_result = _maybe_cluster_canvas_topic_nodes(latest_workspace)

        _save_canvas_workspace_runtime(meeting_id, latest_workspace)
        clustered_count = _safe_nonnegative_int(clustering_result.get("changed"))
        detail = (
            f"AI 아이디어 정리 완료 · {clustered_count}개 topic 분류 반영"
            if clustered_count > 0
            else "AI 아이디어 정리 완료"
        )
        _mark_canvas_idea_job(
            meeting_id,
            job_id,
            status="completed",
            detail=detail,
            workspace=copy.deepcopy(latest_workspace),
            used_llm=bool(result.get("used_llm")),
            warning=_safe_text(result.get("warning")),
        )
    except Exception as exc:
        latest_workspace = _clone_runtime_workspace_state(
            meeting_id,
            _warm_canvas_workspace_cache(RT, meeting_id),
            _now_ts(),
        )
        latest_workspace["canvas_items"] = [
            {**item, "ai_pending": False, "body": "AI 정리에 실패했습니다."}
            if isinstance(item, dict) and _safe_text(item.get("id")) == pending_item_id
            else item
            for item in (latest_workspace.get("canvas_items") or [])
        ]
        _save_canvas_workspace_runtime(meeting_id, latest_workspace)
        _mark_canvas_idea_job(
            meeting_id,
            job_id,
            status="error",
            detail=f"AI 아이디어 정리 실패: {exc}",
            workspace=copy.deepcopy(latest_workspace),
            warning=_safe_text(exc),
            failed_at_epoch=time.time(),
        )


def _finalize_canvas_problem_discussion_workspace_job(
    meeting_id: str,
    job_id: str,
    group_id: str,
    pending_item_id: str,
    payload: CanvasProblemDiscussionWorkspaceStartInput,
) -> None:
    try:
        latest_workspace = _clone_runtime_workspace_state(
            meeting_id,
            _warm_canvas_workspace_cache(RT, meeting_id),
            _now_ts(),
        )
        groups = [
            copy.deepcopy(group)
            for group in (latest_workspace.get("problem_groups") or [])
            if isinstance(group, dict)
        ]
        target_group = next((group for group in groups if _safe_text(group.get("group_id")) == group_id), None)
        if not target_group:
            raise RuntimeError("선택된 문제정의 그룹을 찾을 수 없습니다.")

        result = _compute_problem_discussion_result(payload, target_group)
        target_ids = [_safe_text(item.id) for item in (payload.target_utterances or []) if _safe_text(item.id)]
        if not bool(result.get("ok")):
            warning = _safe_text(result.get("warning"), "문제정의 의견 LLM 응답을 받지 못했습니다.")
            next_groups = []
            for group in groups:
                group = copy.deepcopy(group)
                group["discussion_items"] = [
                    item
                    for item in (group.get("discussion_items") or [])
                    if isinstance(item, dict) and _safe_text(item.get("id")) != pending_item_id
                ]
                next_groups.append(group)
            latest_workspace["problem_groups"] = next_groups
            _save_canvas_workspace_runtime(meeting_id, latest_workspace)
            _mark_canvas_problem_job(
                meeting_id,
                job_id,
                status="error",
                detail=warning,
                workspace=copy.deepcopy(latest_workspace),
                used_llm=bool(result.get("used_llm")),
                warning=warning,
                failed_at_epoch=time.time(),
            )
            return

        update = result.get("update") if isinstance(result.get("update"), dict) else {}
        next_groups = []
        found_pending = False
        for group in groups:
            group = copy.deepcopy(group)
            next_discussions = []
            for item in group.get("discussion_items") or []:
                if not isinstance(item, dict):
                    continue
                if _safe_text(item.get("id")) != pending_item_id:
                    next_discussions.append(item)
                    continue
                found_pending = True
                next_discussions.append(
                    {
                        **item,
                        "target_node_id": _safe_text(item.get("target_node_id")),
                        "target_node_label": _safe_text(item.get("target_node_label")),
                        "target_node_kind": _safe_text(item.get("target_node_kind")),
                        "title": _safe_text(update.get("title"), "문제 의견"),
                        "body": _safe_text(update.get("body")),
                        "keywords": update.get("keywords") or [],
                        "key_evidence": update.get("key_evidence") or [],
                        "refined_utterances": update.get("refined_utterances") or [],
                        "evidence_utterance_ids": update.get("evidence_utterance_ids") or target_ids,
                        "ignored_utterance_ids": update.get("ignored_utterance_ids") or [],
                        "ai_pending": False,
                        "ai_generated": True,
                        "user_edited": False,
                    }
                )
            group["discussion_items"] = next_discussions
            next_groups.append(group)
        if not found_pending:
            fallback_group_id = group_id
            next_groups = [
                {
                    **group,
                    "discussion_items": [
                        *(group.get("discussion_items") or []),
                        {
                            "id": pending_item_id,
                            "parent_group_id": fallback_group_id,
                            "target_node_id": "",
                            "target_node_label": "",
                            "target_node_kind": "",
                            "title": _safe_text(update.get("title"), "문제 의견"),
                            "body": _safe_text(update.get("body")),
                            "keywords": update.get("keywords") or [],
                            "key_evidence": update.get("key_evidence") or [],
                            "refined_utterances": update.get("refined_utterances") or [],
                            "evidence_utterance_ids": update.get("evidence_utterance_ids") or target_ids,
                            "ignored_utterance_ids": update.get("ignored_utterance_ids") or [],
                            "ai_pending": False,
                            "ai_generated": True,
                            "user_edited": False,
                            "created_by": "ai",
                            "created_at": _now_ts(),
                        },
                    ],
                }
                if _safe_text(group.get("group_id")) == fallback_group_id
                else group
                for group in next_groups
            ]

        latest_workspace["problem_groups"] = next_groups
        latest_workspace["problem_processed_utterance_ids"] = _dedup_preserve(
            list(latest_workspace.get("problem_processed_utterance_ids") or []) + target_ids,
            limit=1000,
        )
        _save_canvas_workspace_runtime(meeting_id, latest_workspace)
        _mark_canvas_problem_job(
            meeting_id,
            job_id,
            status="completed",
            detail="AI 문제정의 의견 정리 완료",
            workspace=copy.deepcopy(latest_workspace),
            used_llm=bool(result.get("used_llm")),
            warning=_safe_text(result.get("warning")),
        )
    except Exception as exc:
        latest_workspace = _clone_runtime_workspace_state(
            meeting_id,
            _warm_canvas_workspace_cache(RT, meeting_id),
            _now_ts(),
        )
        latest_workspace["problem_groups"] = [
            {
                **group,
                "discussion_items": [
                    item
                    for item in (group.get("discussion_items") or [])
                    if isinstance(item, dict) and _safe_text(item.get("id")) != pending_item_id
                ],
            }
            if isinstance(group, dict)
            else group
            for group in (latest_workspace.get("problem_groups") or [])
        ]
        _save_canvas_workspace_runtime(meeting_id, latest_workspace)
        _mark_canvas_problem_job(
            meeting_id,
            job_id,
            status="error",
            detail=f"문제정의 의견 정리 실패: {exc}",
            workspace=copy.deepcopy(latest_workspace),
            warning=_safe_text(exc),
            failed_at_epoch=time.time(),
        )


@app.post("/api/canvas/problem-discussion-workspace/start")
def post_canvas_problem_discussion_workspace_start(payload: CanvasProblemDiscussionWorkspaceStartInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")

    workspace = _clone_runtime_workspace_state(
        normalized_meeting_id,
        _warm_canvas_workspace_cache(RT, normalized_meeting_id),
        _now_ts(),
    )
    groups = [
        copy.deepcopy(group)
        for group in (workspace.get("problem_groups") or [])
        if isinstance(group, dict)
    ]
    if not groups:
        job = {
            "job_id": "",
            "meeting_id": normalized_meeting_id,
            "status": "idle",
            "detail": "문제정의 그룹이 없어 의견 정리를 대기합니다.",
            "updated_at": _now_ts(),
        }
        return _canvas_problem_job_response(job, workspace)

    selected_group_id = _safe_text(payload.selected_group_id) or _safe_text(groups[0].get("group_id"))
    selected_group = next((group for group in groups if _safe_text(group.get("group_id")) == selected_group_id), groups[0])
    selected_group_id = _safe_text(selected_group.get("group_id"))
    processed_ids = _canvas_problem_processed_ids(workspace)
    target_rows = [
        item
        for item in (payload.target_utterances or [])
        if _safe_text(item.id) and _safe_text(item.text) and _safe_text(item.id) not in processed_ids
    ]
    target_text_length = sum(len(_strip_leading_timestamp(_safe_text(item.text))) for item in target_rows)
    if not target_rows or target_text_length < 30:
        job = {
            "job_id": "",
            "meeting_id": normalized_meeting_id,
            "status": "idle",
            "detail": f"문제정의 의견 정리 대기 중 · {len(target_rows)}개 발화",
            "target_count": len(target_rows),
            "updated_at": _now_ts(),
        }
        return _canvas_problem_job_response(job, workspace)

    with RT.lock:
        meeting_jobs = RT.canvas_problem_jobs_by_meeting.setdefault(normalized_meeting_id, {})
        running_job = next(
            (
                copy.deepcopy(job)
                for job in meeting_jobs.values()
                if isinstance(job, dict) and _safe_text(job.get("status")) == "processing"
            ),
            None,
        )
    if running_job:
        job_workspace = running_job.get("workspace") if isinstance(running_job.get("workspace"), dict) else workspace
        return _canvas_problem_job_response(running_job, job_workspace)

    job_id = uuid4().hex
    pending_item_id = f"ai-problem-note-{job_id[:10]}"
    pending_item = {
        "id": pending_item_id,
        "parent_group_id": selected_group_id,
        "target_node_id": "",
        "target_node_label": "",
        "target_node_kind": "",
        "title": "의견 정리 중",
        "body": "",
        "keywords": [],
        "key_evidence": [],
        "refined_utterances": [],
        "evidence_utterance_ids": [_safe_text(item.id) for item in target_rows if _safe_text(item.id)][:400],
        "ignored_utterance_ids": [],
        "ai_pending": True,
        "ai_generated": True,
        "user_edited": False,
        "created_by": "ai",
        "created_at": _now_ts(),
    }

    next_groups = []
    for group in groups:
        if _safe_text(group.get("group_id")) == selected_group_id:
            group = copy.deepcopy(group)
            group["discussion_items"] = [*(group.get("discussion_items") or []), pending_item]
        next_groups.append(group)
    workspace["problem_groups"] = next_groups
    _save_canvas_workspace_runtime(normalized_meeting_id, workspace)

    discussion_payload = CanvasProblemDiscussionWorkspaceStartInput(
        meeting_id=normalized_meeting_id,
        meeting_topic=_safe_text(payload.meeting_topic, "회의 주제"),
        selected_group_id=selected_group_id,
        context_utterances=payload.context_utterances,
        target_utterances=target_rows,
    )
    target_signature = "|".join([_safe_text(item.id) for item in target_rows if _safe_text(item.id)])
    job = _mark_canvas_problem_job(
        normalized_meeting_id,
        job_id,
        status="processing",
        detail="AI가 문제정의 의견을 생성 중",
        pending_item_id=pending_item_id,
        target_count=len(target_rows),
        target_signature=target_signature,
        created_at=_now_ts(),
        workspace=copy.deepcopy(workspace),
    )
    threading.Thread(
        target=_finalize_canvas_problem_discussion_workspace_job,
        args=(normalized_meeting_id, job_id, selected_group_id, pending_item_id, discussion_payload),
        daemon=True,
        name=f"canvas-problem-note-{job_id[:8]}",
    ).start()
    return _canvas_problem_job_response(job, workspace)


@app.get("/api/canvas/problem-discussion-workspace/jobs/{job_id}")
def get_canvas_problem_discussion_workspace_job(job_id: str, meeting_id: str):
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_job_id = _safe_text(job_id)
    if not normalized_meeting_id or not normalized_job_id:
        raise HTTPException(status_code=400, detail="meeting_id and job_id are required")
    with RT.lock:
        job = copy.deepcopy(
            (RT.canvas_problem_jobs_by_meeting.get(normalized_meeting_id) or {}).get(normalized_job_id) or {}
        )
    if not job:
        return _canvas_problem_job_response(
            {
                "job_id": normalized_job_id,
                "meeting_id": normalized_meeting_id,
                "status": "missing",
                "detail": "작업 정보를 찾을 수 없습니다.",
                "updated_at": _now_ts(),
            },
            _warm_canvas_workspace_cache(RT, normalized_meeting_id),
        )
    workspace = job.get("workspace") if isinstance(job.get("workspace"), dict) else _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    return _canvas_problem_job_response(job, workspace)


@app.post("/api/canvas/problem-taxonomy")
def post_canvas_problem_taxonomy(payload: ProblemTaxonomyGenerateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    snapshot_rows = _resolve_problem_taxonomy_utterance_rows(payload.meeting_id, payload.utterances)
    signature_payload = _payload_to_primitive(payload)
    if isinstance(signature_payload, dict):
        signature_payload["utterances"] = []
    signature = _canvas_llm_signature(
        {
            "payload": signature_payload,
            "utterance_snapshot_signature": _canvas_llm_signature(snapshot_rows),
            "conclusion_policy": "section_body_compression_v1",
            "taxonomy_policy": "demo_balance_direct_ab_summary_v2"
            if _is_demo_balance_config(payload.demo_config)
            else "outline_reveal_v6",
        }
    )

    def _compute() -> dict[str, Any]:
        if _is_demo_balance_config(payload.demo_config):
            return _build_demo_balance_problem_taxonomy_result(payload)

        groups = _build_problem_taxonomy_groups_local(payload)
        used_llm = False
        warning = ""

        client, llm_ready, llm_note = _ensure_llm_ready(RT)
        if llm_ready:
            try:
                root_payload = _problem_taxonomy_root_payload(payload)
                taxonomy_context, context_warning = _build_problem_taxonomy_context(RT, root_payload, client, llm_ready)
                if context_warning:
                    warning = context_warning

                outline_groups = _get_or_create_problem_taxonomy_outline_groups(
                    RT,
                    payload,
                    client,
                    taxonomy_context,
                )
                outline_scope_groups, outline_scope_resolved = _select_problem_taxonomy_outline_scope_groups(
                    payload,
                    outline_groups,
                )
                if outline_groups and outline_scope_resolved and outline_scope_groups:
                    groups = copy.deepcopy(outline_scope_groups)
                    used_llm = True
                    RT.last_llm_parsed_json = {
                        "stage": "canvas_problem_taxonomy_outline",
                        "groups": copy.deepcopy(groups),
                        "outline_group_count": len(outline_groups),
                    }
                    RT.last_llm_parsed_at = _now_ts()
                else:
                    fallback_context = taxonomy_context if not _safe_text(payload.parent_group_id) else _build_problem_taxonomy_context(RT, payload, client, llm_ready)[0]
                    parsed = _call_llm_json(
                        RT,
                        client,
                        prompt=_build_problem_taxonomy_prompt(payload, fallback_context),
                        stage="canvas_problem_taxonomy",
                        temperature=0.15,
                        max_tokens=2400,
                    )
                    parsed_groups = parsed.get("groups") if isinstance(parsed, dict) else None
                    llm_groups = _normalize_problem_taxonomy_llm_groups(payload, parsed_groups)
                    if llm_groups:
                        groups = llm_groups
                        used_llm = True
                        RT.last_llm_parsed_json = {
                            "stage": "canvas_problem_taxonomy",
                            "groups": copy.deepcopy(groups),
                        }
                        RT.last_llm_parsed_at = _now_ts()
                    elif isinstance(parsed_groups, list):
                        groups = []
                        used_llm = True
                    else:
                        warning = f"{warning} LLM JSON 형식이 예상과 달라 로컬 분류를 사용했습니다.".strip()
            except Exception as exc:
                warning = f"문제정의 분류 LLM 생성 실패: {exc}"
        elif not groups:
            warning = llm_note or "LLM 미연결 상태이며 로컬 분류를 만들 충분한 발화가 없습니다."
        else:
            warning = llm_note or "LLM 미연결 상태로 로컬 분류를 사용했습니다."

        group_count_before_dedupe = len(groups)
        groups = _filter_problem_taxonomy_duplicate_groups(payload, groups)
        groups = _dedupe_problem_taxonomy_conclusions(groups)
        skipped_group_count = group_count_before_dedupe - len(groups)
        if skipped_group_count > 0:
            dedupe_note = f"이미 생성된 분류와 겹치는 {skipped_group_count}개를 제외했습니다."
            warning = f"{warning} {dedupe_note}".strip() if warning else dedupe_note

        return {
            "ok": True,
            "used_llm": used_llm,
            "warning": warning,
            "generated_at": _now_ts(),
            "groups": groups,
        }

    return _run_canvas_llm_cached_request(
        RT,
        normalized_meeting_id,
        "problem_taxonomy",
        signature,
        _compute,
    )


@app.post("/api/canvas/problem-grouping-rationale")
def post_canvas_problem_grouping_rationale(payload: ProblemGroupingRationaleGenerateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    group_id = _safe_text(payload.group.group_id)
    snapshot_rows = _resolve_problem_taxonomy_utterance_rows(payload.meeting_id, payload.utterances)
    signature_payload = _payload_to_primitive(payload)
    if isinstance(signature_payload, dict):
        signature_payload["utterances"] = []
    signature = _canvas_llm_signature(
        {
            "payload": signature_payload,
            "utterance_snapshot_signature": _canvas_llm_signature(snapshot_rows),
        }
    )

    def _compute() -> dict[str, Any]:
        local_result = _build_problem_grouping_rationale_local(payload)
        rationale = _safe_text(local_result.get("rationale"))
        basis_items = [
            _safe_text(item)
            for item in local_result.get("basis_items", [])
            if _safe_text(item)
        ][:5]
        used_llm = False
        warning = ""

        client, llm_ready, llm_note = _ensure_llm_ready(RT)
        if llm_ready:
            try:
                parsed = _call_llm_json(
                    RT,
                    client,
                    prompt=_build_problem_grouping_rationale_prompt(payload),
                    stage="canvas_problem_grouping_rationale",
                    temperature=0.15,
                    max_tokens=420,
                )
                candidate = _safe_text(parsed.get("rationale")) if isinstance(parsed, dict) else ""
                candidate_basis = parsed.get("basis_items") if isinstance(parsed, dict) else []
                parsed_basis = [
                    _safe_text(item)
                    for item in (candidate_basis if isinstance(candidate_basis, list) else [])
                    if _safe_text(item)
                ][:5]
                if candidate:
                    rationale = candidate
                    basis_items = parsed_basis or basis_items
                    used_llm = True
                    RT.last_llm_parsed_json = {
                        "stage": "canvas_problem_grouping_rationale",
                        "group_id": group_id,
                        "rationale": rationale,
                        "basis_items": basis_items,
                    }
                    RT.last_llm_parsed_at = _now_ts()
                else:
                    warning = "LLM JSON 형식이 예상과 달라 로컬 분류 기준을 사용했습니다."
            except Exception as exc:
                warning = f"분류 기준 LLM 생성 실패: {exc}"
        else:
            warning = llm_note or "LLM 미연결 상태로 로컬 분류 기준을 사용했습니다."

        return {
            "ok": True,
            "used_llm": used_llm,
            "warning": warning,
            "generated_at": _now_ts(),
            "group_id": group_id,
            "rationale": rationale,
            "basis_items": basis_items,
        }

    return _run_canvas_llm_cached_request(
        RT,
        normalized_meeting_id,
        f"problem_grouping_rationale:{group_id}",
        signature,
        _compute,
    )


@app.post("/api/canvas/problem-structure")
def post_canvas_problem_structure(payload: ProblemStructureGenerateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    method = _normalize_problem_structure_method(payload.method)
    signature = _canvas_llm_signature(
        {
            "meeting_topic": payload.meeting_topic,
            "method": method,
            "nodes": [_problem_structure_node_dict(item) for item in payload.nodes or []],
            "existing_groups": [
                {
                    "id": _safe_text(group.id),
                    "title": _safe_text(group.title),
                    "node_ids": [_safe_text(item) for item in group.node_ids or [] if _safe_text(item)],
                    "rationale": _safe_text(group.rationale),
                }
                for group in payload.existing_groups or []
            ],
            "max_groups": payload.max_groups,
        }
    )

    def _compute() -> dict[str, Any]:
        groups = _build_problem_structure_groups_local(payload)
        used_llm = False
        warning = ""

        if not payload.nodes:
            return {
                "ok": True,
                "used_llm": False,
                "warning": "구조화할 노드가 없습니다.",
                "generated_at": _now_ts(),
                "groups": [],
            }

        client, llm_ready, llm_note = _ensure_llm_ready(RT)
        if llm_ready:
            try:
                parsed = _call_llm_json(
                    RT,
                    client,
                    prompt=_build_problem_structure_prompt(payload),
                    stage="canvas_problem_structure",
                    temperature=0.15,
                    max_tokens=1800,
                )
                parsed_groups = parsed.get("groups") if isinstance(parsed, dict) else None
                llm_groups = _normalize_problem_structure_llm_groups(payload, parsed_groups)
                if llm_groups:
                    groups = llm_groups
                    used_llm = True
                    RT.last_llm_parsed_json = {
                        "stage": "canvas_problem_structure",
                        "method": method,
                        "groups": copy.deepcopy(groups),
                    }
                    RT.last_llm_parsed_at = _now_ts()
                elif isinstance(parsed_groups, list):
                    warning = "LLM이 유효한 구조화 그룹을 만들지 못해 로컬 묶음을 사용했습니다."
                else:
                    warning = "LLM JSON 형식이 예상과 달라 로컬 묶음을 사용했습니다."
            except Exception as exc:
                warning = f"문제정의 구조화 LLM 생성 실패: {exc}"
        else:
            warning = llm_note or "LLM 미연결 상태로 로컬 구조화 묶음을 사용했습니다."

        return {
            "ok": True,
            "used_llm": used_llm,
            "warning": warning,
            "generated_at": _now_ts(),
            "groups": groups,
        }

    return _run_canvas_llm_cached_request(
        RT,
        normalized_meeting_id,
        "problem_structure",
        signature,
        _compute,
    )


@app.post("/api/canvas/summary-document")
def post_canvas_summary_document(payload: SummaryDocumentGenerateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id) if normalized_meeting_id else {}
    demo_balance_mode = _is_demo_balance_config(payload.demo_config)
    groups = _summary_document_groups(payload, workspace)
    source_signature = _summary_document_source_signature(groups)
    demo_balance_classification = _normalize_canvas_demo_balance_classification(
        payload.demo_balance_classification or workspace.get("demo_balance_classification")
    )
    signature = _canvas_llm_signature(
        {
            "version": "demo_balance_document_blocks_v3" if demo_balance_mode else 7,
            "meeting_topic": _safe_text(payload.meeting_topic),
            "demo_config": _normalize_canvas_demo_config(payload.demo_config),
            "demo_balance_classification": demo_balance_classification,
            "source_signature": source_signature,
            "refresh_chunk_summaries": bool(payload.refresh_chunk_summaries),
        }
    )

    def _compute() -> dict[str, Any]:
        started_at = time.perf_counter()
        rows = _resolve_problem_taxonomy_utterance_rows(normalized_meeting_id, [])
        sections = _summary_document_sections(groups, rows)
        fallback_markdown = _build_summary_document_local_markdown(payload.meeting_topic, groups)
        fallback_structured = _build_summary_document_structured(payload.meeting_topic, groups, sections)
        fallback_document_blocks = _build_summary_document_blocks(fallback_structured)
        structured = fallback_structured
        document_blocks = fallback_document_blocks
        used_llm = False
        warning = ""
        llm_error: dict[str, Any] = {}
        prompt_chars = 0
        llm_ms = 0

        if not groups:
            return {
                "ok": True,
                "used_llm": False,
                "warning": "요약 문서에 포함할 2단계 구조화 그룹이 없습니다.",
                "generated_at": _now_ts(),
                "source_signature": source_signature,
                "markdown": "",
                "document_blocks": [],
                "sections": [],
                "structured": fallback_structured,
            }

        client, llm_ready, llm_note = _ensure_llm_ready(RT)
        taxonomy_context: dict[str, Any] = {
            "rows": rows,
            "chunk_summaries": [],
            "overview_summaries": [],
            "total_utterance_count": len(rows),
            "included_utterance_count": len(rows),
            "included_chunk_summary_count": 0,
            "overview_summary_count": 0,
            "demo_balance_classification": demo_balance_classification,
        }
        if llm_ready:
            try:
                if demo_balance_mode:
                    taxonomy_context = {
                        "rows": rows,
                        "chunk_summaries": [],
                        "overview_summaries": [],
                        "total_utterance_count": len(rows),
                        "included_utterance_count": len(rows),
                        "included_chunk_summary_count": 0,
                        "overview_summary_count": 0,
                        "demo_balance_classification": demo_balance_classification,
                    }
                else:
                    taxonomy_payload = ProblemTaxonomyGenerateInput(
                        meeting_id=normalized_meeting_id,
                        meeting_topic=_safe_text(payload.meeting_topic),
                        refresh_chunk_summaries=bool(payload.refresh_chunk_summaries),
                        max_groups=6,
                    )
                    taxonomy_context, context_warning = _build_problem_taxonomy_context(
                        RT,
                        taxonomy_payload,
                        client,
                        llm_ready,
                    )
                    taxonomy_context["demo_balance_classification"] = demo_balance_classification
                    if context_warning:
                        warning = context_warning
            except Exception as exc:
                warning = f"요약 문서용 chunk context 생성 실패: {exc}"

        markdown = fallback_markdown
        if llm_ready and client is not None:
            try:
                prompt = _build_summary_document_prompt(payload, groups, sections, taxonomy_context)
                prompt_chars = len(prompt)
                llm_started_at = time.perf_counter()
                parsed = _call_llm_json(
                    RT,
                    client,
                    prompt=prompt,
                    stage="canvas_demo_balance_summary_document" if demo_balance_mode else "canvas_summary_document",
                    temperature=0.18,
                    max_tokens=1800 if demo_balance_mode else 3600,
                )
                llm_ms = int((time.perf_counter() - llm_started_at) * 1000)
                if demo_balance_mode:
                    document_blocks = _normalize_summary_document_blocks(
                        parsed.get("document_blocks") if isinstance(parsed, dict) else [],
                        fallback_structured,
                        "",
                    )
                    markdown = _summary_document_blocks_to_markdown(document_blocks)
                    structured = _build_demo_balance_structured_from_blocks(
                        demo_balance_classification,
                        document_blocks,
                        fallback_structured,
                        parsed.get("report_meta") if isinstance(parsed, dict) else {},
                    )
                else:
                    markdown = _normalize_summary_document_markdown(parsed, fallback_markdown)
                    structured = _normalize_summary_structured_document(
                        parsed.get("structured") if isinstance(parsed, dict) else {},
                        fallback_structured,
                    )
                    document_blocks = _normalize_summary_document_blocks(
                        parsed.get("document_blocks") if isinstance(parsed, dict) else [],
                        structured,
                        markdown,
                    )
                    if not markdown:
                        markdown = _summary_document_blocks_to_markdown(document_blocks)
                used_llm = True
                RT.last_llm_parsed_json = {
                    "stage": "canvas_demo_balance_summary_document" if demo_balance_mode else "canvas_summary_document",
                    "source_signature": source_signature,
                    "markdown": markdown,
                    "document_blocks": document_blocks,
                    "structured": structured,
                }
                RT.last_llm_parsed_at = _now_ts()
            except Exception as exc:
                llm_ms = int((time.perf_counter() - llm_started_at) * 1000) if "llm_started_at" in locals() else 0
                llm_error = _build_llm_error_payload(
                    stage="canvas_demo_balance_summary_document" if demo_balance_mode else "canvas_summary_document",
                    error_type=type(exc).__name__,
                    error_preview=repr(exc),
                    client=client,
                    elapsed_ms=llm_ms,
                )
                if demo_balance_mode:
                    print(
                        "[canvas demo balance summary document llm failed]",
                        {
                            "meeting_id": normalized_meeting_id,
                            "prompt_chars": prompt_chars,
                            "elapsed_ms": llm_ms,
                            "llm_error": llm_error,
                        },
                        flush=True,
                    )
                    warning = _demo_llm_retryable_warning("요약 문서", exc)
                    return {
                        "ok": False,
                        "used_llm": False,
                        "retryable": True,
                        "warning": warning,
                        "llm_error": llm_error,
                        "generated_at": _now_ts(),
                        "source_signature": source_signature,
                        "markdown": "",
                        "document_blocks": [],
                        "sections": sections,
                        "structured": fallback_structured,
                    }
                else:
                    warning = f"{warning} 요약 문서 LLM 생성 실패: {exc}".strip()
        elif not warning:
            warning = llm_note or "LLM 미연결 상태로 로컬 요약 문서를 만들었습니다."
            if demo_balance_mode:
                llm_error = _build_llm_error_payload(
                    stage="canvas_demo_balance_summary_document",
                    error_type="llm_not_ready",
                    error_preview=llm_note or "LLM client is not ready",
                    client=client,
                    elapsed_ms=0,
                )
                return {
                    "ok": False,
                    "used_llm": False,
                    "retryable": True,
                    "warning": "요약 문서 모델 연결이 준비되지 않았습니다. 다시 생성해 주세요.",
                    "llm_error": llm_error,
                    "generated_at": _now_ts(),
                    "source_signature": source_signature,
                    "markdown": "",
                    "document_blocks": [],
                    "sections": sections,
                    "structured": fallback_structured,
                }

        if demo_balance_mode:
            print(
                "[canvas demo balance summary document]",
                {
                    "meeting_id": normalized_meeting_id,
                    "rows_count": len(rows),
                    "prompt_chars": prompt_chars,
                    "used_llm": used_llm,
                    "llm_ms": llm_ms,
                    "total_ms": int((time.perf_counter() - started_at) * 1000),
                    "document_blocks": len(document_blocks),
                },
            )

        return {
            "ok": True,
            "used_llm": used_llm,
            "retryable": False,
            "warning": warning,
            "llm_error": llm_error,
            "generated_at": _now_ts(),
            "source_signature": source_signature,
            "markdown": markdown,
            "document_blocks": document_blocks,
            "sections": sections,
            "structured": structured,
        }

    return _run_canvas_llm_cached_request(
        RT,
        normalized_meeting_id,
        "summary_document",
        signature,
        _compute,
    )


@app.post("/api/canvas/summary-conclusion")
def post_canvas_summary_conclusion(payload: SummaryConclusionGenerateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id) if normalized_meeting_id else {}
    demo_balance_mode = _is_demo_balance_config(payload.demo_config)
    groups = _summary_document_groups(payload, workspace)
    source_signature = _summary_document_source_signature(groups)
    demo_balance_classification = _normalize_canvas_demo_balance_classification(
        payload.demo_balance_classification or workspace.get("demo_balance_classification")
    )
    current_summary = payload.current_summary if isinstance(payload.current_summary, dict) else {}
    current_structured_raw = current_summary.get("structured") if isinstance(current_summary.get("structured"), dict) else {}
    signature_rows = _resolve_problem_taxonomy_utterance_rows(normalized_meeting_id, [])
    utterance_signature = _canvas_llm_signature(
        [
            {
                "id": row.get("id"),
                "speaker": row.get("speaker"),
                "text": row.get("text"),
                "timestamp": row.get("timestamp"),
            }
            for row in signature_rows
        ]
    )
    signature = _canvas_llm_signature(
        {
            "version": "demo_balance_conclusion_blocks_v3" if demo_balance_mode else 8,
            "meeting_topic": _safe_text(payload.meeting_topic),
            "demo_config": _normalize_canvas_demo_config(payload.demo_config),
            "demo_balance_classification": demo_balance_classification,
            "source_signature": source_signature,
            "utterance_signature": utterance_signature,
            "current_structured": current_structured_raw,
            "refresh_chunk_summaries": bool(payload.refresh_chunk_summaries),
            "regenerate_nonce": _safe_text(payload.regenerate_nonce),
        }
    )

    def _compute() -> dict[str, Any]:
        started_at = time.perf_counter()
        rows = signature_rows
        sections = _summary_document_sections(groups, rows)
        fallback_structured = _build_summary_document_structured(payload.meeting_topic, groups, sections)
        base_structured = _normalize_summary_structured_document(current_structured_raw, fallback_structured)
        current_blocks = current_summary.get("document_blocks") or current_summary.get("documentBlocks")
        current_markdown = _safe_text(current_summary.get("markdown"))
        fallback_document_blocks = _normalize_summary_document_blocks(
            current_blocks,
            base_structured,
            current_markdown,
        )
        fallback_markdown = current_markdown or _summary_document_blocks_to_markdown(fallback_document_blocks)
        structured = base_structured
        document_blocks = fallback_document_blocks
        markdown = fallback_markdown
        used_llm = False
        warning = ""
        llm_error: dict[str, Any] = {}
        prompt_chars = 0
        llm_ms = 0

        if not groups:
            return {
                "ok": True,
                "used_llm": False,
                "warning": "결론 문서에 포함할 2단계 구조화 그룹이 없습니다.",
                "generated_at": _now_ts(),
                "source_signature": source_signature,
                "markdown": "",
                "document_blocks": [],
                "sections": [],
                "structured": structured,
            }

        client, llm_ready, llm_note = _ensure_llm_ready(RT)
        transcript_context: dict[str, Any] = {
            "rows": rows,
            "chunk_summaries": [],
            "overview_summaries": [],
            "total_utterance_count": len(rows),
            "included_utterance_count": len(rows),
            "included_chunk_summary_count": 0,
            "overview_summary_count": 0,
            "demo_balance_classification": demo_balance_classification,
        }
        if llm_ready:
            try:
                if demo_balance_mode:
                    transcript_context = {
                        "rows": rows,
                        "chunk_summaries": [],
                        "overview_summaries": [],
                        "total_utterance_count": len(rows),
                        "included_utterance_count": len(rows),
                        "included_chunk_summary_count": 0,
                        "overview_summary_count": 0,
                        "demo_balance_classification": demo_balance_classification,
                    }
                else:
                    taxonomy_payload = ProblemTaxonomyGenerateInput(
                        meeting_id=normalized_meeting_id,
                        meeting_topic=_safe_text(payload.meeting_topic),
                        refresh_chunk_summaries=bool(payload.refresh_chunk_summaries),
                        max_groups=6,
                    )
                    transcript_context, context_warning = _build_problem_taxonomy_context(
                        RT,
                        taxonomy_payload,
                        client,
                        llm_ready,
                    )
                    transcript_context["demo_balance_classification"] = demo_balance_classification
                    if context_warning:
                        warning = context_warning
            except Exception as exc:
                warning = f"결론 문서용 전체 전사 context 생성 실패: {exc}"

        if llm_ready and client is not None:
            try:
                prompt = _build_summary_conclusion_prompt(payload, groups, sections, base_structured, transcript_context)
                prompt_chars = len(prompt)
                llm_started_at = time.perf_counter()
                parsed = _call_llm_json(
                    RT,
                    client,
                    prompt=prompt,
                    stage="canvas_demo_balance_summary_conclusion" if demo_balance_mode else "canvas_summary_conclusion",
                    temperature=0.16,
                    max_tokens=1800 if demo_balance_mode else 5200,
                )
                llm_ms = int((time.perf_counter() - llm_started_at) * 1000)
                if isinstance(parsed, dict):
                    if demo_balance_mode:
                        document_blocks = _normalize_summary_document_blocks(
                            parsed.get("document_blocks"),
                            base_structured,
                            "",
                        )
                        markdown = _summary_document_blocks_to_markdown(document_blocks)
                        structured = _build_demo_balance_structured_from_blocks(
                            demo_balance_classification,
                            document_blocks,
                            base_structured,
                            parsed.get("report_meta"),
                        )
                    else:
                        parsed_structured = parsed.get("structured") if isinstance(parsed.get("structured"), dict) else {}
                        parsed_conclusion = parsed.get("conclusion") if isinstance(parsed.get("conclusion"), dict) else {}
                        structured_source = parsed_structured if parsed_structured else {"conclusion": parsed_conclusion}
                        normalized_structured = _normalize_summary_structured_document(structured_source, base_structured)
                        structured = {
                            **base_structured,
                            "conclusion": normalized_structured.get("conclusion") or base_structured.get("conclusion", {}),
                        }
                        markdown = _normalize_summary_document_markdown(parsed, "")
                        document_blocks = _normalize_summary_document_blocks(
                            parsed.get("document_blocks"),
                            structured,
                            markdown,
                        )
                else:
                    markdown = _normalize_summary_document_markdown(parsed, fallback_markdown)
                    document_blocks = _normalize_summary_document_blocks([], structured, markdown)
                if not markdown:
                    markdown = _summary_document_blocks_to_markdown(document_blocks)
                used_llm = True
                RT.last_llm_parsed_json = {
                    "stage": "canvas_demo_balance_summary_conclusion" if demo_balance_mode else "canvas_summary_conclusion",
                    "source_signature": source_signature,
                    "markdown": markdown,
                    "document_blocks": document_blocks,
                    "structured": structured,
                }
                RT.last_llm_parsed_at = _now_ts()
            except Exception as exc:
                llm_ms = int((time.perf_counter() - llm_started_at) * 1000) if "llm_started_at" in locals() else 0
                llm_error = _build_llm_error_payload(
                    stage="canvas_demo_balance_summary_conclusion" if demo_balance_mode else "canvas_summary_conclusion",
                    error_type=type(exc).__name__,
                    error_preview=repr(exc),
                    client=client,
                    elapsed_ms=llm_ms,
                )
                if demo_balance_mode:
                    print(
                        "[canvas demo balance summary conclusion llm failed]",
                        {
                            "meeting_id": normalized_meeting_id,
                            "prompt_chars": prompt_chars,
                            "elapsed_ms": llm_ms,
                            "llm_error": llm_error,
                        },
                        flush=True,
                    )
                    warning = _demo_llm_retryable_warning("결론 문서", exc)
                    return {
                        "ok": False,
                        "used_llm": False,
                        "retryable": True,
                        "warning": warning,
                        "llm_error": llm_error,
                        "generated_at": _now_ts(),
                        "source_signature": source_signature,
                        "markdown": "",
                        "document_blocks": [],
                        "sections": sections,
                        "structured": structured,
                    }
                else:
                    warning = f"결론 문서 LLM 생성 실패: {exc}"
        else:
            warning = llm_note or "LLM 미연결 상태로 기존 결론 문서를 유지했습니다."
            if demo_balance_mode:
                llm_error = _build_llm_error_payload(
                    stage="canvas_demo_balance_summary_conclusion",
                    error_type="llm_not_ready",
                    error_preview=llm_note or "LLM client is not ready",
                    client=client,
                    elapsed_ms=0,
                )
                return {
                    "ok": False,
                    "used_llm": False,
                    "retryable": True,
                    "warning": "결론 문서 모델 연결이 준비되지 않았습니다. 다시 생성해 주세요.",
                    "llm_error": llm_error,
                    "generated_at": _now_ts(),
                    "source_signature": source_signature,
                    "markdown": "",
                    "document_blocks": [],
                    "sections": sections,
                    "structured": structured,
                }

        if demo_balance_mode:
            print(
                "[canvas demo balance summary conclusion]",
                {
                    "meeting_id": normalized_meeting_id,
                    "rows_count": len(rows),
                    "prompt_chars": prompt_chars,
                    "used_llm": used_llm,
                    "llm_ms": llm_ms,
                    "total_ms": int((time.perf_counter() - started_at) * 1000),
                    "document_blocks": len(document_blocks),
                },
            )

        return {
            "ok": True,
            "used_llm": used_llm,
            "retryable": False,
            "warning": warning,
            "llm_error": llm_error,
            "generated_at": _now_ts(),
            "source_signature": source_signature,
            "markdown": markdown,
            "document_blocks": document_blocks,
            "sections": sections,
            "structured": structured,
        }

    return _run_canvas_llm_cached_request(
        RT,
        normalized_meeting_id,
        "summary_conclusion",
        signature,
        _compute,
    )


@app.post("/api/canvas/quick-ask")
def post_canvas_quick_ask(payload: CanvasQuickAskInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    question = _safe_text(payload.question)
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    rows = _resolve_canvas_quick_ask_rows(payload, normalized_meeting_id)
    fallback_answer = _build_canvas_quick_ask_local_answer(question, rows)
    used_llm = False
    warning = ""
    answer = fallback_answer

    client, llm_ready, llm_note = _ensure_llm_ready(RT)
    if llm_ready and client is not None:
        try:
            parsed = _call_llm_json(
                RT,
                client,
                prompt=_build_canvas_quick_ask_prompt(payload, rows),
                stage="canvas_quick_ask",
                temperature=0.2,
                max_tokens=1200,
            )
            answer = _normalize_canvas_quick_ask_answer(parsed, fallback_answer)
            used_llm = True
            RT.last_llm_parsed_json = {
                "stage": "canvas_quick_ask",
                "question": question,
                "answer": answer,
            }
            RT.last_llm_parsed_at = _now_ts()
        except Exception as exc:
            warning = f"LLM 질문 응답 실패: {exc}"
            answer = fallback_answer
    else:
        warning = llm_note or "LLM 미연결 상태라 로컬 회의 기록 검색 결과를 표시했습니다."

    return {
        "ok": True,
        "used_llm": used_llm,
        "warning": warning,
        "generated_at": _now_ts(),
        "answer": answer,
    }


@app.post("/api/canvas/ideation-keywords")
def post_canvas_ideation_keywords(payload: IdeationKeywordExtractInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    rows = _ideation_keyword_rows(payload)
    context_cache = _ideation_context_cache_text(payload)
    existing_keyword_rows = _ideation_existing_keyword_rows(payload)
    max_keywords = int(payload.max_keywords or 18)
    signature = _canvas_llm_signature(
        {
            "version": 5,
            "meeting_topic": _safe_text(payload.meeting_topic),
            "meeting_goal": _safe_text(payload.meeting_goal),
            "meeting_goal_context": _safe_text(payload.meeting_goal_context),
            "max_keywords": max_keywords,
            "existing_keywords": existing_keyword_rows,
            "context_cache": context_cache,
            "rows": rows,
        }
    )

    def _compute() -> dict[str, Any]:
        fallback_keywords: list[dict[str, Any]] = []
        used_llm = False
        warning = ""
        keywords = fallback_keywords
        merge_keywords: list[dict[str, str]] = []
        remove_keywords: list[str] = []

        if not rows:
            return {
                "ok": True,
                "used_llm": False,
                "warning": "명사 버블을 추출할 아이디어 단계 발화가 없습니다.",
                "generated_at": _now_ts(),
                "source_signature": signature,
                "merge_keywords": [],
                "remove_keywords": [],
                "keywords": [],
            }

        client, llm_ready, llm_note = _ensure_llm_ready(RT)
        if llm_ready and client is not None:
            try:
                parsed = _call_llm_json(
                    RT,
                    client,
                    prompt=_build_ideation_keyword_extract_prompt(payload, rows),
                    stage="canvas_ideation_keyword_extract",
                    temperature=0.08,
                    max_tokens=1400,
                )
                used_llm = True
                normalized_keywords = _normalize_ideation_keyword_items(
                    parsed,
                    fallback_keywords,
                    max_keywords,
                    existing_keyword_rows,
                )
                merge_keywords, remove_keywords = _normalize_ideation_keyword_operations(
                    parsed,
                    existing_keyword_rows,
                    normalized_keywords,
                )
                if normalized_keywords or merge_keywords or remove_keywords:
                    keywords = normalized_keywords
                    RT.last_llm_parsed_json = {
                        "stage": "canvas_ideation_keyword_extract",
                        "source_signature": signature,
                        "merge_keywords": copy.deepcopy(merge_keywords),
                        "remove_keywords": copy.deepcopy(remove_keywords),
                        "keywords": copy.deepcopy(keywords),
                    }
                    RT.last_llm_parsed_at = _now_ts()
                else:
                    keywords = []
                    warning = "이번 발화에서는 추가하거나 정리할 핵심 명사 버블이 없었습니다."
            except Exception as exc:
                warning = f"아이디어 명사 추출 LLM 실패: {exc}"
        else:
            warning = llm_note or "LLM 미연결 상태라 새 버블을 만들지 않았습니다."

        return {
            "ok": bool(used_llm),
            "used_llm": used_llm,
            "warning": warning,
            "generated_at": _now_ts(),
            "source_signature": signature,
            "merge_keywords": merge_keywords,
            "remove_keywords": remove_keywords,
            "keywords": keywords,
        }

    return _run_canvas_llm_cached_request(
        RT,
        normalized_meeting_id,
        "ideation_keywords",
        signature,
        _compute,
    )


@app.post("/api/canvas/ideation-bubble-graph/update")
def post_canvas_ideation_bubble_graph_update(payload: IdeationBubbleGraphUpdateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")
    normalized_input_rows = _normalize_problem_taxonomy_utterance_rows(payload.utterances)[-180:]
    payload_demo_config = _normalize_canvas_demo_config(payload.demo_config)
    is_payload_demo_balance = _is_demo_balance_config(payload_demo_config)
    requested_update_mode = _safe_text(payload.update_mode).lower()
    update_mode = (
        "local_fast_keywords"
        if is_payload_demo_balance and requested_update_mode == "local_fast_keywords"
        else
        "realtime_text_batch"
        if is_payload_demo_balance and requested_update_mode == "realtime_text_batch"
        else "fast_keywords"
        if is_payload_demo_balance and requested_update_mode == "fast_keywords"
        else "consolidate"
        if is_payload_demo_balance
        else "normal"
    )
    request_started = time.perf_counter()
    print(
        "[canvas ideation bubble graph request]",
        {
            "meeting_id": normalized_meeting_id,
            "input_rows": len(normalized_input_rows),
            "demo": is_payload_demo_balance,
            "update_mode": update_mode,
            "max_keywords": payload.max_keywords,
        },
        flush=True,
    )
    llm_stage = "canvas_ideation_bubble_graph_update"
    route_model, route_thinking_level = _llm_route_for_stage(llm_stage)
    llm_route = {
        "stage": llm_stage,
        "model": route_model,
        "thinking_level": route_thinking_level,
    }

    def _llm_trace_payload(client: Any = None) -> dict[str, Any]:
        if client is None or not hasattr(client, "status"):
            return {}
        try:
            status_payload = client.status()
            diagnostics = status_payload if isinstance(status_payload, dict) else {}
        except Exception:
            return {}
        trace = diagnostics.get("last_generate_trace")
        return copy.deepcopy(trace) if isinstance(trace, dict) else {}

    def _llm_error_payload(
        *,
        error_type: str,
        error_preview: Any,
        elapsed_ms: int | None = None,
        client: Any = None,
    ) -> dict[str, Any]:
        diagnostics: dict[str, Any] = {}
        if client is not None and hasattr(client, "status"):
            try:
                status_payload = client.status()
                diagnostics = status_payload if isinstance(status_payload, dict) else {}
            except Exception:
                diagnostics = {}
        return {
            "stage": llm_stage,
            "model": _safe_text(diagnostics.get("last_model") or route_model),
            "http_status": _safe_nonnegative_int(diagnostics.get("last_http_status"), 0),
            "error_type": _safe_text(error_type),
            "error_preview": _safe_text(error_preview or diagnostics.get("last_error"))[:500],
            "elapsed_ms": elapsed_ms,
        }

    def _response(
        graph: dict[str, Any],
        used_llm: bool,
        warning: str,
        signature: str,
        workspace: dict[str, Any] | None = None,
        reason: str = "",
        llm_error: dict[str, Any] | None = None,
        refined_transcripts: list[dict[str, Any]] | None = None,
        ignored_utterance_ids: list[str] | None = None,
        rename_keywords: list[dict[str, str]] | None = None,
        keyword_count: int = 0,
        rename_count: int = 0,
        merge_count: int = 0,
        remove_count: int = 0,
        move_count: int = 0,
        refine_count: int = 0,
        input_bubble_count: int = 0,
        primary_count: int = 0,
        promote_count: int = 0,
        demote_count: int = 0,
        affinity_update_count: int = 0,
        processed_count: int = 0,
        alias_merge_count: int = 0,
        canonicalized_count: int = 0,
        local_cleanup_count: int = 0,
        slow_backoff_ms: int = 0,
        used_local: bool = False,
        extractor_route: dict[str, Any] | None = None,
        raw_directives: dict[str, Any] | None = None,
        llm_request_payload: dict[str, Any] | None = None,
        llm_response_payload: dict[str, Any] | None = None,
        llm_id_map: dict[str, str] | None = None,
        llm_trace: dict[str, Any] | None = None,
        ignored_refine_count: int = 0,
        timing_ms: dict[str, Any] | None = None,
        broadcast_steps: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        workspace_payload = workspace or _warm_canvas_workspace_cache(RT, normalized_meeting_id)
        response_graph = _normalize_canvas_ideation_bubble_graph(graph)
        _ensure_demo_balance_anchor_bubbles(
            response_graph,
            _normalize_canvas_demo_config(workspace_payload.get("demo_config") or payload_demo_config),
        )
        _ensure_ideation_bubble_graph_server_layout(response_graph)
        workspace_payload["ideation_bubble_graph"] = response_graph
        state_counts = _ideation_bubble_state_counts(response_graph)
        layout_debug = _bubble_debug_compact_bubbles(response_graph, limit=24)
        response_timing = {
            key: _safe_nonnegative_int(value, 0)
            for key, value in (timing_ms or {}).items()
            if _safe_text(key)
        }
        response_timing["backend_total_ms"] = round((time.perf_counter() - request_started) * 1000)
        return {
            "ok": bool(used_llm or used_local),
            "used_llm": used_llm,
            "used_local": used_local,
            "reason": _safe_text(reason),
            "warning": warning,
            "update_mode": update_mode,
            "llm_route": llm_route,
            "llm_error": llm_error or {},
            "raw_directives": raw_directives or {},
            "llm_request": llm_request_payload or {},
            "llm_response": llm_response_payload or {},
            "llm_id_map": llm_id_map or {},
            "llm_trace": llm_trace or {},
            "ignored_refine_count": _safe_nonnegative_int(ignored_refine_count),
            "timing": response_timing,
            "extractor_route": extractor_route or {},
            "layout_debug": layout_debug,
            "broadcast_steps": broadcast_steps or [],
            "refined_transcripts": refined_transcripts or [],
            "ignored_utterance_ids": ignored_utterance_ids or [],
            "rename_keywords": rename_keywords or [],
            "keyword_count": _safe_nonnegative_int(keyword_count),
            "rename_count": _safe_nonnegative_int(rename_count),
            "merge_count": _safe_nonnegative_int(merge_count),
            "remove_count": _safe_nonnegative_int(remove_count),
            "move_count": _safe_nonnegative_int(move_count),
            "refine_count": _safe_nonnegative_int(refine_count),
            "input_bubble_count": _safe_nonnegative_int(input_bubble_count),
            "primary_count": _safe_nonnegative_int(primary_count),
            "promote_count": _safe_nonnegative_int(promote_count),
            "demote_count": _safe_nonnegative_int(demote_count),
            "affinity_update_count": _safe_nonnegative_int(affinity_update_count),
            "alias_merge_count": _safe_nonnegative_int(alias_merge_count),
            "canonicalized_count": _safe_nonnegative_int(canonicalized_count),
            "local_cleanup_count": _safe_nonnegative_int(local_cleanup_count),
            "slow_backoff_ms": _safe_nonnegative_int(slow_backoff_ms),
            "overlap_resolved_count": _safe_nonnegative_int(response_graph.get("layout_overlap_resolved_count"), 0),
            "processed_count": _safe_nonnegative_int(processed_count),
            "active_count": state_counts.get("active", 0),
            "dimmed_count": state_counts.get("dimmed", 0),
            "exiting_count": state_counts.get("exiting", 0),
            "archived_count": state_counts.get("archived", 0),
            "provisional_count": state_counts.get("provisional", 0),
            "generated_at": _now_ts(),
            "source_signature": signature,
            "bubble_graph": response_graph,
            "workspace": _canvas_workspace_response(workspace_payload),
        }

    if is_payload_demo_balance and requested_update_mode == "local_fast_keywords":
        workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
        graph = _normalize_canvas_ideation_bubble_graph(workspace.get("ideation_bubble_graph"))
        demo_config = _normalize_canvas_demo_config(payload.demo_config or workspace.get("demo_config"))
        if not _is_demo_balance_config(demo_config):
            signature = _canvas_llm_signature(
                {
                    "version": 1,
                    "meeting_id": normalized_meeting_id,
                    "update_mode": update_mode,
                    "rows": normalized_input_rows,
                }
            )
            return _response(
                graph,
                False,
                "demo_balance 모드가 아니라 로컬 fast 버블을 실행하지 않았습니다.",
                signature,
                workspace,
                reason="not_demo_balance",
            )
        anchors_changed = _ensure_demo_balance_anchor_bubbles(graph, demo_config)
        rows = [
            row
            for row in normalized_input_rows[-6:]
            if _safe_text(row.get("id")) and _safe_text(row.get("text"))
        ]
        existing_inputs = _ideation_bubble_existing_keyword_inputs(graph)
        max_keywords = min(4, max(1, int(payload.max_keywords or 4)))
        extract_payload = IdeationKeywordExtractInput(
            meeting_id=normalized_meeting_id,
            meeting_topic=_safe_text(payload.meeting_topic),
            meeting_goal=_safe_text(payload.meeting_goal),
            meeting_goal_context=_safe_text(payload.meeting_goal_context),
            demo_config=demo_config,
            utterances=[ProblemTaxonomyUtteranceInput(**row) for row in rows],
            context_cache=_safe_text(payload.context_cache),
            existing_keywords=existing_inputs,
            max_keywords=max_keywords,
        )
        existing_keyword_rows = _ideation_existing_keyword_rows(extract_payload)
        signature = _canvas_llm_signature(
            {
                "version": 1,
                "meeting_id": normalized_meeting_id,
                "meeting_topic": _safe_text(payload.meeting_topic),
                "meeting_goal": _safe_text(payload.meeting_goal),
                "meeting_goal_context": _safe_text(payload.meeting_goal_context),
                "demo_config": demo_config,
                "update_mode": update_mode,
                "graph_cycle": _safe_nonnegative_int(graph.get("update_cycle"), 0),
                "existing_keywords": existing_keyword_rows,
                "rows": rows,
            }
        )
        if not rows:
            return _response(
                graph,
                False,
                "로컬 fast 버블로 처리할 발화가 없습니다.",
                signature,
                workspace,
                reason="no_rows",
            )

        normalized_keywords, extractor_route = _extract_demo_local_fast_keywords(
            extract_payload,
            rows,
            max_keywords=max_keywords,
        )
        if not normalized_keywords:
            cleanup_graph = _normalize_canvas_ideation_bubble_graph(graph)
            _normalize_demo_balance_graph_affinities(cleanup_graph)
            previous_bubble_count = len(cleanup_graph.get("bubbles") or [])
            _prune_exiting_ideation_bubbles(cleanup_graph)
            cleanup_cycle = _safe_nonnegative_int(cleanup_graph.get("update_cycle"), 0) + 1
            cleanup_core_ids = _ideation_bubble_core_ids(cleanup_graph)
            cleanup_protected_ids = _demo_balance_minimum_side_protected_ids(cleanup_graph)
            cleanup_metrics = {
                "local_cleanup_count": _apply_demo_balance_local_provisional_cleanup(
                    cleanup_graph,
                    set(),
                    cleanup_core_ids,
                    cleanup_cycle,
                    cleanup_protected_ids,
                )
            }
            cleanup_changed = (
                anchors_changed
                or cleanup_metrics["local_cleanup_count"] > 0
                or len(cleanup_graph.get("bubbles") or []) != previous_bubble_count
            )
            if cleanup_changed:
                cleanup_graph["update_cycle"] = cleanup_cycle
                cleanup_graph["updated_at"] = _now_ts()
                cleanup_core_ids = _ideation_bubble_core_ids(cleanup_graph)
                cleanup_protected_ids = _demo_balance_minimum_side_protected_ids(cleanup_graph)
                _mark_demo_balance_overflow_bubbles_exiting(cleanup_graph, cleanup_cycle, cleanup_core_ids, cleanup_protected_ids)
                _apply_ideation_bubble_layout_zones(cleanup_graph, cleanup_core_ids)
                cleanup_primary_ids = _resolve_ideation_primary_keyword_ids(
                    cleanup_graph,
                    _demo_balance_primary_anchor_texts(demo_config),
                    limit=2,
                )
                _apply_ideation_bubble_visual_state(cleanup_graph, cleanup_core_ids | cleanup_primary_ids, primary_ids=cleanup_primary_ids)
                _apply_ideation_bubble_server_layout(cleanup_graph)
                saved_at = _now_ts()
                next_workspace = _clone_runtime_workspace_state(normalized_meeting_id, workspace, saved_at)
                next_workspace["ideation_bubble_graph"] = cleanup_graph
                next_workspace["demo_config"] = demo_config
                with RT.lock:
                    RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(next_workspace)
                _save_canvas_workspace_to_db(normalized_meeting_id, next_workspace)
                _write_bubble_debug_event(
                    normalized_meeting_id,
                    "local_fast_cleanup_without_keywords",
                    {
                        "update_mode": update_mode,
                        "reason": "cleanup",
                        "rows": _bubble_debug_compact_rows(rows),
                        "extractor_route": extractor_route,
                        "state_counts": _ideation_bubble_state_counts(cleanup_graph),
                        "graph_cycle": cleanup_graph.get("update_cycle"),
                        "graph_bubbles": _bubble_debug_compact_bubbles(cleanup_graph),
                    },
                )
                return _response(
                    cleanup_graph,
                    False,
                    "",
                    signature,
                    next_workspace,
                    reason="cleanup",
                    keyword_count=0,
                    local_cleanup_count=cleanup_metrics["local_cleanup_count"],
                    used_local=True,
                    extractor_route=extractor_route,
                )
            print(
                "[canvas ideation bubble graph local fast no keywords]",
                {
                    "meeting_id": normalized_meeting_id,
                    "rows": len(rows),
                    "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
                    "extractor_route": extractor_route,
                },
                flush=True,
            )
            _write_bubble_debug_event(
                normalized_meeting_id,
                "local_fast_no_keywords",
                {
                    "update_mode": update_mode,
                    "reason": "no_keywords",
                    "rows": _bubble_debug_compact_rows(rows),
                    "extractor_route": extractor_route,
                    "state_counts": _ideation_bubble_state_counts(graph),
                    "graph_cycle": graph.get("update_cycle"),
                    "graph_bubbles": _bubble_debug_compact_bubbles(graph),
                },
            )
            return _response(
                graph,
                False,
                "로컬 추출기에서 표시할 명사구가 없었습니다.",
                signature,
                workspace,
                reason="no_keywords",
                used_local=True,
                extractor_route=extractor_route,
            )

        graph_metrics: dict[str, int] = {}
        initial_graph = _normalize_canvas_ideation_bubble_graph(graph)
        initial_ids = {
            _safe_text(bubble.get("id"))
            for bubble in (initial_graph.get("bubbles") or [])
            if isinstance(bubble, dict) and _safe_text(bubble.get("id"))
        }
        next_graph = _apply_ideation_bubble_graph_update(
            initial_graph,
            rows,
            normalized_keywords,
            [],
            [],
            [],
            allow_single_support=True,
            decay_profile="demo_balance",
            apply_decay=False,
            mark_processed=False,
            demo_local_cleanup=False,
            primary_keyword_texts=_demo_balance_primary_anchor_texts(demo_config),
            metrics=graph_metrics,
        )
        _final_by_id, final_by_text = _ideation_bubble_graph_text_maps(next_graph)
        ordered_new_ids: list[str] = []
        for keyword in normalized_keywords:
            bubble = final_by_text.get(_ideation_bubble_text_key(keyword.get("text")))
            bubble_id = _safe_text((bubble or {}).get("id"))
            if bubble_id and bubble_id not in initial_ids and bubble_id not in ordered_new_ids:
                ordered_new_ids.append(bubble_id)
        for bubble_id in _demo_balance_graph_bubbles_by_id(next_graph):
            if bubble_id not in initial_ids and bubble_id not in ordered_new_ids:
                ordered_new_ids.append(bubble_id)
        slot_assignment_metrics = _demo_balance_assign_nearest_open_rail_slots(
            initial_graph,
            next_graph,
            set(ordered_new_ids),
        )
        plan_id = _demo_balance_motion_plan_id(next_graph, signature)
        base_cycle = _safe_nonnegative_int(initial_graph.get("update_cycle"), 0)
        next_step_cycle = base_cycle
        previous_step_graph = copy.deepcopy(initial_graph)
        broadcast_steps: list[dict[str, Any]] = []
        motion_metrics: dict[str, int] = {
            "new_count": 0,
            "relayout_count": 0,
            "push_count": 0,
            "gap_count": 0,
            "content_count": 0,
            "transfer_count": 0,
            "overflow_count": 0,
            "exit_count": 0,
        }
        if ordered_new_ids:
            revealed_ids = set(initial_ids)
            step_specs = [(index, bubble_id) for index, bubble_id in enumerate(ordered_new_ids)]
        else:
            step_specs = [(0, "")]

        for keyword_index, bubble_id in step_specs:
            next_step_cycle += 1
            step_graph = copy.deepcopy(next_graph)
            if bubble_id:
                revealed_ids.add(bubble_id)
                step_graph["bubbles"] = [
                    bubble
                    for bubble in (step_graph.get("bubbles") or [])
                    if isinstance(bubble, dict)
                    and (
                        _safe_text(bubble.get("id")) in revealed_ids
                        or _is_demo_balance_anchor_bubble(bubble)
                        or _normalize_ideation_bubble_state(bubble.get("display_state")) == "exiting"
                    )
                ]
                step_by_id = _demo_balance_graph_bubbles_by_id(step_graph)
                current_new = step_by_id.get(bubble_id)
                if current_new:
                    _demo_balance_apply_gate_pose(current_new)
            step_graph["update_cycle"] = next_step_cycle
            step_delay_ms = DEMO_BALANCE_GATE_ENTER_DELAY_MS if keyword_index == 0 else DEMO_BALANCE_GATE_STEP_DELAY_MS
            step_motion_metrics = _annotate_demo_balance_motion_hints(
                previous_step_graph,
                step_graph,
                update_reason="insert" if bubble_id else "content",
                sequence=keyword_index,
                delay_ms=step_delay_ms,
                plan_id=plan_id,
            )
            for metric_key, metric_value in step_motion_metrics.items():
                motion_metrics[metric_key] = _safe_nonnegative_int(motion_metrics.get(metric_key), 0) + _safe_nonnegative_int(metric_value, 0)
            broadcast_steps.append(
                {
                    "delay_ms": step_delay_ms,
                    "reason": "gate_enter" if bubble_id else "content_update",
                    "keyword": _safe_text((_demo_balance_graph_bubbles_by_id(step_graph).get(bubble_id) or {}).get("label")) if bubble_id else "",
                    "motion": step_motion_metrics,
                    "motion_plan_id": plan_id,
                    "bubble_graph": copy.deepcopy(step_graph),
                    "layout_debug": _bubble_debug_compact_bubbles(step_graph, limit=24),
                }
            )
            previous_step_graph = copy.deepcopy(step_graph)
        next_graph["update_cycle"] = next_step_cycle
        cleanup_previous_graph = copy.deepcopy(next_graph)
        cleanup_metrics: dict[str, int] = {}
        cleanup_graph = _apply_ideation_bubble_graph_update(
            next_graph,
            rows,
            [],
            [],
            [],
            [],
            allow_single_support=True,
            decay_profile="demo_balance",
            apply_decay=False,
            mark_processed=False,
            demo_local_cleanup=True,
            primary_keyword_texts=_demo_balance_primary_anchor_texts(demo_config),
            metrics=cleanup_metrics,
        )
        cleanup_count = _safe_nonnegative_int(cleanup_metrics.get("local_cleanup_count"), 0)
        if cleanup_count > 0:
            next_graph = cleanup_graph
            next_step_cycle = max(next_step_cycle + 1, _safe_nonnegative_int(next_graph.get("update_cycle"), 0))
            next_graph["update_cycle"] = next_step_cycle
            for metric_key, metric_value in cleanup_metrics.items():
                graph_metrics[metric_key] = _safe_nonnegative_int(graph_metrics.get(metric_key), 0) + _safe_nonnegative_int(metric_value, 0)
            cleanup_motion_metrics = _annotate_demo_balance_motion_hints(
                cleanup_previous_graph,
                next_graph,
                update_reason="cleanup",
                plan_id=plan_id,
            )
            for metric_key, metric_value in cleanup_motion_metrics.items():
                motion_metrics[metric_key] = _safe_nonnegative_int(motion_metrics.get(metric_key), 0) + _safe_nonnegative_int(metric_value, 0)
            broadcast_steps.append(
                {
                    "delay_ms": DEMO_BALANCE_GATE_STEP_DELAY_MS,
                    "reason": "cleanup",
                    "keyword": "",
                    "motion": cleanup_motion_metrics,
                    "motion_plan_id": plan_id,
                    "bubble_graph": copy.deepcopy(next_graph),
                    "layout_debug": _bubble_debug_compact_bubbles(next_graph, limit=24),
                }
            )
        saved_at = _now_ts()
        next_workspace = _clone_runtime_workspace_state(normalized_meeting_id, workspace, saved_at)
        next_workspace["ideation_bubble_graph"] = next_graph
        next_workspace["demo_config"] = demo_config
        with RT.lock:
            RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(next_workspace)
            RT.last_llm_parsed_json = {
                "stage": "canvas_ideation_bubble_graph_local_fast",
                "update_mode": update_mode,
                "source_signature": signature,
                "keywords": copy.deepcopy(normalized_keywords),
                "extractor_route": copy.deepcopy(extractor_route),
                "bubble_graph": copy.deepcopy(next_graph),
            }
            RT.last_llm_parsed_at = _now_ts()
        _save_canvas_workspace_to_db(normalized_meeting_id, next_workspace)
        print(
            "[canvas ideation bubble graph local fast]",
            {
                "meeting_id": normalized_meeting_id,
                "rows": len(rows),
                "keywords": len(normalized_keywords),
                "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
                "cycle": next_graph.get("update_cycle"),
                "extractor_route": extractor_route,
                "state_counts": _ideation_bubble_state_counts(next_graph),
                "selected_keywords": extractor_route.get("selected_keywords"),
                "graph_bubbles": [
                    {
                        "label": item.get("label"),
                        "state": item.get("display_state"),
                        "choice": item.get("choice_affinity"),
                        "count": item.get("count"),
                        "motion": item.get("motion_reason"),
                        "direction": item.get("motion_direction"),
                        "slot": item.get("orbit_slot_index"),
                        "move_cost": item.get("move_cost"),
                        "angle_delta": item.get("move_angle_delta"),
                        "arc_cost": item.get("arc_cost"),
                        "radius_cost": item.get("radius_cost"),
                    }
                    for item in _bubble_debug_compact_bubbles(next_graph, limit=16)
                ],
                "local_cleanup": graph_metrics.get("local_cleanup_count", 0),
                "slot_assignment": slot_assignment_metrics,
                "motion_plan_id": plan_id,
                "broadcast_steps": len(broadcast_steps),
                "motion": motion_metrics,
            },
            flush=True,
        )
        _write_bubble_debug_event(
            normalized_meeting_id,
            "local_fast_updated",
            {
                "update_mode": update_mode,
                "reason": "updated",
                "rows": _bubble_debug_compact_rows(rows),
                "selected_keywords": extractor_route.get("selected_keywords"),
                "top_candidates": extractor_route.get("top_candidates"),
                "extractor_route": extractor_route,
                "state_counts": _ideation_bubble_state_counts(next_graph),
                "graph_cycle": next_graph.get("update_cycle"),
                "graph_bubbles": _bubble_debug_compact_bubbles(next_graph),
                "local_cleanup_count": _safe_nonnegative_int(graph_metrics.get("local_cleanup_count"), 0),
                "slot_assignment": slot_assignment_metrics,
                "motion_plan_id": plan_id,
                "broadcast_steps": [
                    {
                        "delay_ms": _safe_nonnegative_int(step.get("delay_ms"), 0),
                        "reason": _safe_text(step.get("reason")),
                        "keyword": _safe_text(step.get("keyword")),
                        "motion": step.get("motion") or {},
                        "motion_plan_id": _safe_text(step.get("motion_plan_id")),
                        "cycle": _safe_nonnegative_int((step.get("bubble_graph") or {}).get("update_cycle"), 0),
                    }
                    for step in broadcast_steps
                ],
                "motion": motion_metrics,
            },
        )
        return _response(
            next_graph,
            False,
            "",
            signature,
            next_workspace,
            reason="updated",
            keyword_count=len(normalized_keywords),
            processed_count=0,
            alias_merge_count=_safe_nonnegative_int(extractor_route.get("alias_merge_count"), 0),
            canonicalized_count=_safe_nonnegative_int(extractor_route.get("canonicalized_count"), 0),
            local_cleanup_count=_safe_nonnegative_int(graph_metrics.get("local_cleanup_count"), 0),
            used_local=True,
            extractor_route=extractor_route,
            broadcast_steps=broadcast_steps,
        )

    lock_wait_started = time.perf_counter()
    request_lock = _get_canvas_llm_request_lock(RT, normalized_meeting_id, "ideation_bubble_graph_update")
    with request_lock:
        lock_wait_ms = round((time.perf_counter() - lock_wait_started) * 1000)
        timing_ms: dict[str, Any] = {"lock_wait_ms": lock_wait_ms}
        if lock_wait_ms > 100:
            print(
                "[canvas ideation bubble graph lock acquired]",
                {
                    "meeting_id": normalized_meeting_id,
                    "lock_wait_ms": lock_wait_ms,
                },
                flush=True,
            )
        workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
        graph = _normalize_canvas_ideation_bubble_graph(workspace.get("ideation_bubble_graph"))
        demo_config = _normalize_canvas_demo_config(payload.demo_config or workspace.get("demo_config"))
        is_demo_balance = _is_demo_balance_config(demo_config)
        if is_demo_balance:
            _ensure_demo_balance_anchor_bubbles(graph, demo_config)
        requested_demo_update_mode = _safe_text(requested_update_mode).lower()
        processed_ids = {
            _safe_text(value)
            for value in (graph.get("processed_utterance_ids") or [])
            if _safe_text(value)
        }
        rows = [
            row
            for row in normalized_input_rows
            if _safe_text(row.get("id")) and _safe_text(row.get("id")) not in processed_ids
        ]
        include_exiting_existing = (
            is_demo_balance
            and requested_demo_update_mode
            not in {"local_fast_keywords", "fast_keywords", "realtime_text_batch"}
        )
        existing_inputs = _ideation_bubble_existing_keyword_inputs(
            graph,
            include_exiting=include_exiting_existing,
        )
        update_mode = (
            "local_fast_keywords"
            if is_demo_balance and requested_update_mode == "local_fast_keywords"
            else
            "realtime_text_batch"
            if is_demo_balance and requested_update_mode == "realtime_text_batch"
            else "fast_keywords"
            if is_demo_balance and requested_update_mode == "fast_keywords"
            else "consolidate"
            if is_demo_balance
            else "normal"
        )
        if is_demo_balance and update_mode in {"fast_keywords", "realtime_text_batch"}:
            max_keywords = min(8, max(1, int(payload.max_keywords or 8)))
        else:
            max_keywords = min(6 if is_demo_balance else 3, max(1, int(payload.max_keywords or 3)))
        extract_payload = IdeationKeywordExtractInput(
            meeting_id=normalized_meeting_id,
            meeting_topic=_safe_text(payload.meeting_topic),
            meeting_goal=_safe_text(payload.meeting_goal),
            meeting_goal_context=_safe_text(payload.meeting_goal_context),
            demo_config=demo_config,
            utterances=[ProblemTaxonomyUtteranceInput(**row) for row in rows],
            context_cache=_safe_text(payload.context_cache),
            existing_keywords=existing_inputs,
            max_keywords=max_keywords,
        )
        context_cache = "" if is_demo_balance and update_mode == "consolidate" else _ideation_context_cache_text(extract_payload)
        existing_keyword_rows = _ideation_existing_keyword_rows(extract_payload)
        demo_consolidate_llm_request_payload = (
            _demo_balance_consolidate_llm_input_payload(extract_payload, rows)
            if is_demo_balance and update_mode == "consolidate"
            else {}
        )
        demo_consolidate_llm_id_map = (
            _demo_balance_consolidate_llm_id_map(extract_payload, rows)
            if is_demo_balance and update_mode == "consolidate"
            else {}
        )
        refined_transcripts: list[dict[str, Any]] = []
        ignored_utterance_ids: list[str] = []
        ignored_refine_count = 0
        primary_keyword_texts: list[str] | None = None
        primary_keywords_present = False
        affinity_updates: list[dict[str, Any]] = []
        signature_payload = {
            "version": 2 if is_demo_balance and update_mode == "consolidate" else 1,
            "meeting_id": normalized_meeting_id,
            "demo_config": demo_config,
            "update_mode": update_mode,
            "graph_cycle": _safe_nonnegative_int(graph.get("update_cycle"), 0),
            "rows": rows[-5:] if is_demo_balance and update_mode == "consolidate" else rows,
            "existing_keywords": [
                {
                    "id": item.get("id"),
                    "text": item.get("text"),
                    "aliases": item.get("aliases") or [],
                    "choice_affinity": item.get("choice_affinity"),
                    "needs_affinity_review": bool(item.get("needs_affinity_review")),
                }
                for item in existing_keyword_rows
            ]
            if is_demo_balance and update_mode == "consolidate"
            else existing_keyword_rows,
        }
        if not (is_demo_balance and update_mode == "consolidate"):
            signature_payload.update(
                {
                    "meeting_topic": _safe_text(payload.meeting_topic),
                    "meeting_goal": _safe_text(payload.meeting_goal),
                    "meeting_goal_context": _safe_text(payload.meeting_goal_context),
                    "context_cache": context_cache,
                }
            )
        signature = _canvas_llm_signature(signature_payload)

        if not rows:
            return _response(
                graph,
                False,
                "새로 처리할 아이디어 단계 발화가 없습니다.",
                signature,
                workspace,
                reason="no_rows",
                timing_ms=timing_ms,
            )

        ready_started = time.perf_counter()
        client, llm_ready, llm_note = _ensure_llm_ready(RT)
        timing_ms["llm_ready_ms"] = round((time.perf_counter() - ready_started) * 1000)
        if not llm_ready or client is None:
            return _response(
                graph,
                False,
                llm_note or "LLM 미연결 상태라 서버 버블 그래프를 갱신하지 않았습니다.",
                signature,
                workspace,
                reason="llm_not_ready",
                llm_error=_llm_error_payload(
                    error_type="llm_not_ready",
                    error_preview=llm_note or "LLM 미연결 상태",
                    elapsed_ms=round((time.perf_counter() - request_started) * 1000),
                    client=client,
                ),
                llm_request_payload=demo_consolidate_llm_request_payload,
                llm_id_map=demo_consolidate_llm_id_map,
                timing_ms=timing_ms,
            )

        warning = ""
        parsed: Any = {}
        llm_trace: dict[str, Any] = {}

        def _write_demo_consolidate_llm_log(event: str, extra: dict[str, Any] | None = None) -> None:
            if not (is_demo_balance and update_mode == "consolidate"):
                return
            _write_demo_bubble_llm_event(
                normalized_meeting_id,
                event,
                {
                    "update_mode": update_mode,
                    "model": llm_route.get("model"),
                    "llm_route": llm_route,
                    "request": copy.deepcopy(demo_consolidate_llm_request_payload),
                    "response": copy.deepcopy(parsed) if isinstance(parsed, dict) else {},
                    "id_map": copy.deepcopy(demo_consolidate_llm_id_map),
                    "timing": copy.deepcopy(timing_ms),
                    "trace": copy.deepcopy(llm_trace),
                    "rows_count": len(rows),
                    "input_bubbles": len(existing_keyword_rows),
                    **(extra or {}),
                },
            )

        _write_demo_consolidate_llm_log(
            "request_started",
            {
                "reason": "before_llm_call",
                "prompt_phase": "pending",
            },
        )

        try:
            prompt_started = time.perf_counter()
            llm_prompt = _build_ideation_keyword_extract_prompt(extract_payload, rows, update_mode)
            timing_ms["prompt_build_ms"] = round((time.perf_counter() - prompt_started) * 1000)
            llm_started = time.perf_counter()
            parsed = _call_llm_json(
                RT,
                client,
                prompt=llm_prompt,
                stage=llm_stage,
                temperature=0.08,
                max_tokens=320 if is_demo_balance and update_mode == "fast_keywords" else 760 if is_demo_balance and update_mode == "realtime_text_batch" else 520 if is_demo_balance and update_mode == "consolidate" else 1400,
            )
            timing_ms["llm_ms"] = round((time.perf_counter() - llm_started) * 1000)
            llm_trace = _llm_trace_payload(client)
        except Exception as exc:
            llm_trace = _llm_trace_payload(client)
            elapsed_ms = round((time.perf_counter() - request_started) * 1000)
            llm_error = _llm_error_payload(
                error_type=type(exc).__name__,
                error_preview=repr(exc),
                elapsed_ms=elapsed_ms,
                client=client,
            )
            print(
                "[canvas ideation bubble graph llm exception]",
                {
                    "meeting_id": normalized_meeting_id,
                    "elapsed_ms": elapsed_ms,
                    "llm_route": llm_route,
                    "llm_error": llm_error,
                    "llm_trace": llm_trace,
                },
                flush=True,
            )
            _write_demo_consolidate_llm_log(
                "exception",
                {
                    "elapsed_ms": elapsed_ms,
                    "llm_error": llm_error,
                    "warning": f"아이디어 버블 그래프 LLM 갱신 실패: {exc}",
                },
            )
            _write_bubble_debug_event(
                normalized_meeting_id,
                "llm_update_exception",
                {
                    "update_mode": update_mode,
                    "rows": _bubble_debug_compact_rows(rows),
                    "llm_route": llm_route,
                    "llm_error": llm_error,
                    "llm_trace": llm_trace,
                    "graph_cycle": graph.get("update_cycle"),
                    "graph_bubbles": _bubble_debug_compact_bubbles(graph),
                },
            )
            return _response(
                graph,
                False,
                f"아이디어 버블 그래프 LLM 갱신 실패: {exc}",
                signature,
                workspace,
                reason="llm_exception",
                llm_error=llm_error,
                llm_request_payload=demo_consolidate_llm_request_payload,
                llm_id_map=demo_consolidate_llm_id_map,
                llm_trace=llm_trace,
                timing_ms=timing_ms,
            )

        directive_started = time.perf_counter()
        if is_demo_balance:
            if update_mode == "realtime_text_batch":
                refined_transcripts = _normalize_demo_balance_refined_transcripts(parsed, rows)
                ignored_utterance_ids = _normalize_demo_balance_ignored_utterance_ids(parsed, rows)
            if update_mode == "consolidate":
                raw_refine = []
                if isinstance(parsed, dict):
                    raw_refine = (
                        parsed.get("refine")
                        or parsed.get("refined_transcripts")
                        or parsed.get("refinedTranscripts")
                        or []
                    )
                ignored_refine_count = len(raw_refine) if isinstance(raw_refine, list) else 0
                primary_keywords_present = True
                primary_keyword_texts = _demo_balance_primary_anchor_texts(demo_config)
        compact_demo_directives = is_demo_balance and update_mode == "consolidate" and _demo_balance_has_compact_id_directives(parsed)
        compact_graph_directive_actions = (
            compact_demo_directives
            and any(
                isinstance(parsed.get(key), list) and len(parsed.get(key) or []) > 0
                for key in ("rename", "merge", "remove", "move")
            )
        )

        normalized_keywords = _normalize_ideation_keyword_items(
            parsed,
            [],
            max_keywords,
            existing_keyword_rows,
        )
        if is_demo_balance and update_mode == "consolidate":
            normalized_keywords = []
        if compact_demo_directives:
            merge_keywords, remove_keywords = [], []
        else:
            merge_keywords, remove_keywords = _normalize_ideation_keyword_operations(
                parsed,
                existing_keyword_rows,
                normalized_keywords,
            )
        rename_merge_keywords = _normalize_ideation_keyword_rename_merges(
            parsed,
            existing_keyword_rows,
            merge_keywords,
            remove_keywords,
        )
        if rename_merge_keywords:
            merge_keywords = [
                *merge_keywords,
                *[
                    item
                    for item in rename_merge_keywords
                    if not any(
                        _safe_text(item.get("source")) == _safe_text(existing.get("source"))
                        and _safe_text(item.get("target")) == _safe_text(existing.get("target"))
                        for existing in merge_keywords
                    )
                ],
            ][:8]
        rename_keywords = [] if compact_demo_directives else _normalize_ideation_keyword_renames(
            parsed,
            existing_keyword_rows,
            merge_keywords,
            remove_keywords,
        )
        if is_demo_balance and update_mode == "consolidate" and not compact_demo_directives:
            local_rename_keywords = _demo_balance_local_keyword_renames(existing_keyword_rows)
            if local_rename_keywords:
                existing_pairs = {
                    (_safe_text(item.get("source")), _safe_text(item.get("target")))
                    for item in rename_keywords
                    if _safe_text(item.get("source")) and _safe_text(item.get("target"))
                }
                for item in local_rename_keywords:
                    pair = (_safe_text(item.get("source")), _safe_text(item.get("target")))
                    if pair not in existing_pairs:
                        rename_keywords.append(item)
                        existing_pairs.add(pair)
        correction_protected_texts = {
            _safe_text(item.get("source"))
            for item in [*merge_keywords, *rename_keywords]
            if _safe_text(item.get("source"))
        } | {
            _safe_text(item.get("target"))
            for item in [*merge_keywords, *rename_keywords]
            if _safe_text(item.get("target"))
        }
        if correction_protected_texts:
            remove_keywords = [
                text
                for text in remove_keywords
                if _safe_text(text) not in correction_protected_texts
            ]
        if is_demo_balance and update_mode == "consolidate" and not compact_demo_directives:
            affinity_updates = _normalize_demo_balance_affinity_updates(parsed, existing_keyword_rows)
        is_demo_balance = _is_demo_balance_config(demo_config)
        if not is_demo_balance:
            existing_text_keys = {
                _ideation_bubble_text_key(item.get("text"))
                for item in existing_keyword_rows
                if _safe_text(item.get("text"))
            }
            supported_keywords: list[dict[str, Any]] = []
            skipped_single_support_count = 0
            for keyword in normalized_keywords:
                text_key = _ideation_bubble_text_key(keyword.get("text"))
                support_count = max(
                    _safe_nonnegative_int(keyword.get("support_count"), 0),
                    _safe_nonnegative_int(keyword.get("count"), 1),
                )
                if text_key in existing_text_keys or support_count >= 2:
                    supported_keywords.append(keyword)
                else:
                    skipped_single_support_count += 1
            if skipped_single_support_count:
                warning = f"1회성 언급 {skipped_single_support_count}개는 버블 생성 조건에 미달해 보류했습니다."
            normalized_keywords = supported_keywords
        timing_ms["directive_parse_ms"] = round((time.perf_counter() - directive_started) * 1000)
        has_primary_directive = is_demo_balance and update_mode == "consolidate" and primary_keywords_present
        if not normalized_keywords and not rename_keywords and not merge_keywords and not remove_keywords and not affinity_updates and not compact_graph_directive_actions and not has_primary_directive:
            warning = warning or "이번 발화에서는 추가하거나 정리할 핵심 명사 버블이 없었습니다."
            if is_demo_balance:
                if update_mode in {"fast_keywords", "realtime_text_batch"}:
                    return _response(
                        graph,
                        True,
                        warning,
                        signature,
                        workspace,
                        reason="no_keywords",
                        refined_transcripts=refined_transcripts,
                        ignored_utterance_ids=ignored_utterance_ids,
                    )
                latest_workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
                latest_graph = _normalize_canvas_ideation_bubble_graph(latest_workspace.get("ideation_bubble_graph"))
                _ensure_demo_balance_anchor_bubbles(latest_graph, demo_config)
                graph_apply_started = time.perf_counter()
                next_graph = _apply_ideation_bubble_graph_update(
                    latest_graph,
                    rows,
                    [],
                    [],
                    [],
                    [],
                    allow_single_support=True,
                    decay_profile="demo_balance",
                    apply_decay=True,
                    mark_processed=True,
                    primary_keyword_texts=_demo_balance_primary_anchor_texts(demo_config),
                )
                timing_ms["graph_apply_ms"] = round((time.perf_counter() - graph_apply_started) * 1000)
                motion_started = time.perf_counter()
                motion_metrics = _annotate_demo_balance_motion_hints(
                    latest_graph,
                    next_graph,
                    update_reason="cleanup",
                )
                timing_ms["motion_ms"] = round((time.perf_counter() - motion_started) * 1000)
                saved_at = _now_ts()
                next_workspace = _clone_runtime_workspace_state(normalized_meeting_id, latest_workspace, saved_at)
                next_workspace["ideation_bubble_graph"] = next_graph
                next_workspace["demo_config"] = demo_config
                save_started = time.perf_counter()
                with RT.lock:
                    RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(next_workspace)
                _save_canvas_workspace_to_db(normalized_meeting_id, next_workspace)
                timing_ms["save_ms"] = round((time.perf_counter() - save_started) * 1000)
                RT.last_llm_parsed_json = {
                    "stage": llm_stage,
                    "update_mode": update_mode,
                    "source_signature": signature,
                    "raw_directives": _bubble_debug_compact_directives(parsed),
                    "rename_keywords": [],
                    "merge_keywords": [],
                    "remove_keywords": [],
                    "keywords": [],
                    "ignored_refine_count": ignored_refine_count,
                    "ignored_utterance_ids": copy.deepcopy(ignored_utterance_ids),
                    "llm_id_map": copy.deepcopy(demo_consolidate_llm_id_map),
                    "bubble_graph": copy.deepcopy(next_graph),
                    "reason": "no_keywords",
                }
                RT.last_llm_parsed_at = _now_ts()
                print(
                    "[canvas ideation bubble graph no keywords processed]",
                    {
                        "meeting_id": normalized_meeting_id,
                        "rows": len(rows),
                        "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
                        "cycle": next_graph.get("update_cycle"),
                        "refined": len(refined_transcripts),
                        "ignored_refine": ignored_refine_count,
                        "ignored": len(ignored_utterance_ids),
                    },
                    flush=True,
                )
                _write_demo_consolidate_llm_log(
                    "response_no_keywords",
                    {
                        "reason": "no_keywords",
                        "warning": warning,
                        "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
                        "refined_count": len(refined_transcripts),
                        "ignored_refine_count": ignored_refine_count,
                        "ignored_count": len(ignored_utterance_ids),
                        "state_counts": _ideation_bubble_state_counts(next_graph),
                        "motion": motion_metrics,
                    },
                )
                _write_bubble_debug_event(
                    normalized_meeting_id,
                    "llm_update_no_keywords_processed",
                    {
                        "update_mode": update_mode,
                        "rows": _bubble_debug_compact_rows(rows),
                        "raw_directives": _bubble_debug_compact_directives(parsed),
                        "warning": warning,
                        "refined_count": len(refined_transcripts),
                        "ignored_refine_count": ignored_refine_count,
                        "ignored_count": len(ignored_utterance_ids),
                        "ignored_utterance_ids": ignored_utterance_ids,
                        "llm_id_map": demo_consolidate_llm_id_map,
                        "llm_trace": llm_trace,
                        "motion": motion_metrics,
                        "timing": timing_ms,
                        "state_counts": _ideation_bubble_state_counts(next_graph),
                        "graph_cycle": next_graph.get("update_cycle"),
                        "graph_bubbles": _bubble_debug_compact_bubbles(next_graph),
                    },
                )
                return _response(
                    next_graph,
                    True,
                    warning,
                    signature,
                    next_workspace,
                    reason="no_keywords",
                    refined_transcripts=refined_transcripts,
                    ignored_utterance_ids=ignored_utterance_ids,
                    raw_directives=_bubble_debug_compact_directives(parsed),
                    llm_request_payload=demo_consolidate_llm_request_payload,
                    llm_response_payload=copy.deepcopy(parsed) if isinstance(parsed, dict) else {},
                    llm_id_map=demo_consolidate_llm_id_map,
                    llm_trace=llm_trace,
                    ignored_refine_count=ignored_refine_count,
                    refine_count=0 if is_demo_balance and update_mode == "consolidate" else len(refined_transcripts),
                    input_bubble_count=len(existing_keyword_rows),
                    timing_ms=timing_ms,
                    processed_count=len(rows),
                )
            return _response(graph, True, warning, signature, workspace, reason="no_keywords")

        graph_metrics: dict[str, int] = {}
        latest_workspace = workspace
        latest_graph = graph
        if is_demo_balance and update_mode == "consolidate":
            workspace_reload_started = time.perf_counter()
            latest_workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
            latest_graph = _normalize_canvas_ideation_bubble_graph(latest_workspace.get("ideation_bubble_graph"))
            _ensure_demo_balance_anchor_bubbles(latest_graph, demo_config)
            timing_ms["workspace_reload_ms"] = round((time.perf_counter() - workspace_reload_started) * 1000)
        graph_apply_started = time.perf_counter()
        next_graph = _apply_ideation_bubble_graph_update(
            latest_graph,
            rows,
            normalized_keywords,
            rename_keywords,
            merge_keywords,
            remove_keywords,
            allow_single_support=is_demo_balance,
            decay_profile="demo_balance" if is_demo_balance else "normal",
            apply_decay=not (is_demo_balance and update_mode in {"fast_keywords", "realtime_text_batch"}),
            mark_processed=not (is_demo_balance and update_mode in {"fast_keywords", "realtime_text_batch"}),
            primary_keyword_texts=primary_keyword_texts if is_demo_balance and update_mode == "consolidate" else None,
            affinity_updates=affinity_updates if is_demo_balance and update_mode == "consolidate" else None,
            demo_id_directives=parsed if compact_demo_directives else None,
            demo_id_map=demo_consolidate_llm_id_map if compact_demo_directives else None,
            metrics=graph_metrics,
        )
        timing_ms["graph_apply_ms"] = round((time.perf_counter() - graph_apply_started) * 1000)
        motion_metrics: dict[str, int] = {}
        if is_demo_balance:
            motion_started = time.perf_counter()
            motion_metrics = _annotate_demo_balance_motion_hints(
                latest_graph,
                next_graph,
                update_reason="cleanup" if update_mode == "consolidate" else "insert",
            )
            timing_ms["motion_ms"] = round((time.perf_counter() - motion_started) * 1000)
        saved_at = _now_ts()
        next_workspace = _clone_runtime_workspace_state(normalized_meeting_id, latest_workspace, saved_at)
        next_workspace["ideation_bubble_graph"] = next_graph
        if is_demo_balance:
            next_workspace["demo_config"] = demo_config
        save_started = time.perf_counter()
        with RT.lock:
            RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(next_workspace)
        _save_canvas_workspace_to_db(normalized_meeting_id, next_workspace)
        timing_ms["save_ms"] = round((time.perf_counter() - save_started) * 1000)

        RT.last_llm_parsed_json = {
            "stage": llm_stage,
            "update_mode": update_mode,
            "source_signature": signature,
            "raw_directives": _bubble_debug_compact_directives(parsed),
            "rename_keywords": copy.deepcopy(rename_keywords),
            "merge_keywords": copy.deepcopy(merge_keywords),
            "remove_keywords": copy.deepcopy(remove_keywords),
            "primary_keywords": copy.deepcopy(primary_keyword_texts if primary_keyword_texts is not None else []),
            "affinity_updates": copy.deepcopy(affinity_updates),
            "keywords": copy.deepcopy(normalized_keywords),
            "ignored_refine_count": ignored_refine_count,
            "ignored_utterance_ids": copy.deepcopy(ignored_utterance_ids),
            "llm_id_map": copy.deepcopy(demo_consolidate_llm_id_map),
            "llm_trace": copy.deepcopy(llm_trace),
            "motion": copy.deepcopy(motion_metrics),
            "bubble_graph": copy.deepcopy(next_graph),
        }
        RT.last_llm_parsed_at = _now_ts()
        print(
            "[canvas ideation bubble graph]",
            {
                "meeting_id": normalized_meeting_id,
                "update_mode": update_mode,
                "rows": len(rows),
                "keywords": len(normalized_keywords),
                "renames": max(len(rename_keywords), _safe_nonnegative_int(graph_metrics.get("rename_count"), 0)),
                "merges": max(len(merge_keywords), _safe_nonnegative_int(graph_metrics.get("merge_count"), 0)),
                "removes": max(len(remove_keywords), _safe_nonnegative_int(graph_metrics.get("remove_count"), 0)),
                "moves": graph_metrics.get("move_count", 0),
                "primary": graph_metrics.get("primary_count", 0),
                "promotes": graph_metrics.get("promote_count", 0),
                "demotes": graph_metrics.get("demote_count", 0),
                "affinity_updates": graph_metrics.get("affinity_update_count", 0),
                "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
                "cycle": next_graph.get("update_cycle"),
                "overlap_resolved": next_graph.get("layout_overlap_resolved_count"),
                "refined": len(refined_transcripts),
                "ignored_refine": ignored_refine_count,
                "input_bubbles": len(existing_keyword_rows),
                "ignored": len(ignored_utterance_ids),
                "visible_bubbles": len(
                    [
                        item
                        for item in (next_graph.get("bubbles") or [])
                        if _is_ideation_bubble_visible_state(item.get("display_state"))
                    ]
                ),
                "state_counts": _ideation_bubble_state_counts(next_graph),
                "motion": motion_metrics,
                "timing": timing_ms,
            },
        )
        _write_demo_consolidate_llm_log(
            "response_applied",
            {
                "reason": "updated",
                "warning": warning,
                "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
                "keyword_count": len(normalized_keywords),
                "rename_count": max(len(rename_keywords), _safe_nonnegative_int(graph_metrics.get("rename_count"), 0)),
                "merge_count": max(len(merge_keywords), _safe_nonnegative_int(graph_metrics.get("merge_count"), 0)),
                "remove_count": max(len(remove_keywords), _safe_nonnegative_int(graph_metrics.get("remove_count"), 0)),
                "move_count": _safe_nonnegative_int(graph_metrics.get("move_count"), 0),
                "ignored_refine_count": ignored_refine_count,
                "ignored_count": len(ignored_utterance_ids),
                "metrics": graph_metrics,
                "motion": motion_metrics,
                "state_counts": _ideation_bubble_state_counts(next_graph),
            },
        )
        _write_bubble_debug_event(
            normalized_meeting_id,
            "llm_update_applied",
            {
                "update_mode": update_mode,
                "rows": _bubble_debug_compact_rows(rows),
                "raw_directives": _bubble_debug_compact_directives(parsed),
                "keywords": normalized_keywords,
                "rename_keywords": rename_keywords,
                "merge_keywords": merge_keywords,
                "remove_keywords": remove_keywords,
                "primary_keywords": primary_keyword_texts if primary_keyword_texts is not None else [],
                "affinity_updates": affinity_updates,
                "refined_count": len(refined_transcripts),
                "ignored_refine_count": ignored_refine_count,
                "move_count": graph_metrics.get("move_count", 0),
                "input_bubble_count": len(existing_keyword_rows),
                "ignored_count": len(ignored_utterance_ids),
                "llm_id_map": demo_consolidate_llm_id_map,
                "llm_trace": llm_trace,
                "metrics": graph_metrics,
                "motion": motion_metrics,
                "timing": timing_ms,
                "state_counts": _ideation_bubble_state_counts(next_graph),
                "graph_cycle": next_graph.get("update_cycle"),
                "graph_bubbles": _bubble_debug_compact_bubbles(next_graph),
            },
        )
        return _response(
            next_graph,
            True,
            warning,
            signature,
            next_workspace,
            reason="updated",
            refined_transcripts=refined_transcripts,
            ignored_utterance_ids=ignored_utterance_ids,
            rename_keywords=rename_keywords,
            keyword_count=len(normalized_keywords),
            rename_count=max(len(rename_keywords), _safe_nonnegative_int(graph_metrics.get("rename_count"), 0)),
            merge_count=max(len(merge_keywords), _safe_nonnegative_int(graph_metrics.get("merge_count"), 0)),
            remove_count=max(len(remove_keywords), _safe_nonnegative_int(graph_metrics.get("remove_count"), 0)),
            move_count=_safe_nonnegative_int(graph_metrics.get("move_count"), 0),
            refine_count=0 if is_demo_balance and update_mode == "consolidate" else len(refined_transcripts),
            input_bubble_count=len(existing_keyword_rows),
            primary_count=graph_metrics.get("primary_count", 0),
            promote_count=graph_metrics.get("promote_count", 0),
            demote_count=graph_metrics.get("demote_count", 0),
            affinity_update_count=graph_metrics.get("affinity_update_count", 0),
            raw_directives=_bubble_debug_compact_directives(parsed),
            llm_request_payload=demo_consolidate_llm_request_payload,
            llm_response_payload=copy.deepcopy(parsed) if isinstance(parsed, dict) else {},
            llm_id_map=demo_consolidate_llm_id_map,
            llm_trace=llm_trace,
            ignored_refine_count=ignored_refine_count,
            timing_ms=timing_ms,
            processed_count=0 if is_demo_balance and update_mode in {"fast_keywords", "realtime_text_batch"} else len(rows),
        )


@app.get("/api/canvas/personal-notes")
def get_canvas_personal_notes(meeting_id: str, user_id: str):
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_user_id = _safe_text(user_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")
    if not normalized_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    loaded_notes, loaded_local_state = _load_canvas_personal_notes_from_db(
        normalized_meeting_id,
        normalized_user_id,
    )
    with RT.lock:
        meeting_notes = RT.canvas_personal_notes_by_meeting_user.setdefault(normalized_meeting_id, {})
        meeting_local_state = RT.canvas_local_state_by_meeting_user.setdefault(normalized_meeting_id, {})
        if loaded_notes is not None:
            meeting_notes[normalized_user_id] = copy.deepcopy(loaded_notes)
        if loaded_local_state is not None:
            meeting_local_state[normalized_user_id] = copy.deepcopy(loaded_local_state)
        personal_notes = copy.deepcopy(meeting_notes.get(normalized_user_id) or [])
        local_canvas_state = copy.deepcopy(meeting_local_state.get(normalized_user_id) or {})
        return {
            "ok": True,
            "meeting_id": normalized_meeting_id,
            "user_id": normalized_user_id,
            "personal_notes": personal_notes,
            "local_canvas_state": local_canvas_state,
            "saved_at": _safe_text((RT.canvas_workspace_by_meeting.get(normalized_meeting_id) or {}).get("saved_at")),
        }


@app.post("/api/canvas/personal-notes")
def post_canvas_personal_notes(payload: CanvasPersonalNotesStateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    normalized_user_id = _safe_text(payload.user_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")
    if not normalized_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    saved_at = _now_ts()
    normalized_notes = [
        {
            "id": _safe_text(note.id),
            "project_id": _safe_text(note.project_id) or normalized_meeting_id,
            "agenda_id": _safe_text(note.agenda_id),
            "linked_canvas_item_id": _safe_text(note.linked_canvas_item_id),
            "linked_canvas_item_title": _safe_text(note.linked_canvas_item_title),
            "kind": _safe_text(note.kind, "note"),
            "title": _safe_text(note.title),
            "body": _safe_text(note.body),
        }
        for note in (payload.personal_notes or [])
        if _safe_text(note.id) or _safe_text(note.title) or _safe_text(note.body)
    ]
    normalized_local_canvas_state = _normalize_canvas_local_state(payload.local_canvas_state)

    with RT.lock:
        meeting_notes = RT.canvas_personal_notes_by_meeting_user.setdefault(normalized_meeting_id, {})
        meeting_local_state = RT.canvas_local_state_by_meeting_user.setdefault(normalized_meeting_id, {})
        meeting_notes[normalized_user_id] = copy.deepcopy(normalized_notes)
        meeting_local_state[normalized_user_id] = copy.deepcopy(normalized_local_canvas_state)

    _save_canvas_personal_notes_to_db(
        normalized_meeting_id,
        normalized_user_id,
        normalized_notes,
        normalized_local_canvas_state,
    )

    return {
        "ok": True,
        "meeting_id": normalized_meeting_id,
        "user_id": normalized_user_id,
        "personal_notes": copy.deepcopy(normalized_notes),
        "local_canvas_state": copy.deepcopy(normalized_local_canvas_state),
        "saved_at": saved_at,
    }


@app.get("/api/canvas/workspace-state")
def get_canvas_workspace_state(meeting_id: str):
    normalized_meeting_id = _safe_text(meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")

    saved = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    print(
        "[canvas workspace GET]",
        {
            "meeting_id": normalized_meeting_id,
            "stage": _safe_text(saved.get("stage")),
            "canvas_items": len(saved.get("canvas_items") or []),
            "node_positions": _summarize_canvas_node_positions_for_debug(saved.get("node_positions")),
        },
    )
    return _canvas_workspace_response(saved)


@app.post("/api/canvas/workspace-state")
def post_canvas_workspace_state(payload: CanvasWorkspaceStateInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")

    saved_at = _now_ts()
    previous_workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    workspace = _clone_runtime_workspace_state(normalized_meeting_id, previous_workspace, saved_at)
    workspace["meeting_goal"] = _safe_text(payload.meeting_goal)
    workspace["meeting_goal_context"] = _safe_text(payload.meeting_goal_context)
    workspace["demo_config"] = _normalize_canvas_demo_config(payload.demo_config)
    workspace["demo_balance_classification"] = _normalize_canvas_demo_balance_classification(
        payload.demo_balance_classification
    )
    workspace["stage"] = "ideation"
    workspace["agenda_overrides"] = _normalize_canvas_agenda_overrides(payload.agenda_overrides)
    workspace["canvas_items"] = _normalize_canvas_workspace_items(payload.canvas_items)
    workspace["custom_groups"] = _normalize_canvas_custom_groups(payload.custom_groups)
    workspace["problem_groups"] = _normalize_canvas_workspace_problem_groups(payload.problem_groups)
    workspace["problem_structure"] = _normalize_canvas_problem_structure_state(payload.problem_structure)
    workspace["solution_topics"] = _normalize_canvas_workspace_solution_topics(payload.solution_topics)
    workspace["final_solution_summary"] = _normalize_canvas_final_solution_summary(payload.final_solution_summary)
    workspace["node_positions"] = _normalize_canvas_node_positions(payload.node_positions)
    workspace["artifact_generation"] = _normalize_canvas_artifact_generation(payload.artifact_generation)
    workspace["ideation_bubble_graph"] = _normalize_canvas_ideation_bubble_graph(payload.ideation_bubble_graph)
    _ensure_demo_balance_workspace_graph(workspace, saved_at)
    workspace["imported_state"] = (
        copy.deepcopy(payload.imported_state) if isinstance(payload.imported_state, dict) else None
    )
    with RT.lock:
        RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(workspace)

    _save_canvas_workspace_to_db(normalized_meeting_id, workspace)
    print(
        "[canvas workspace PUT]",
        {
            "meeting_id": normalized_meeting_id,
            "meeting_goal": _safe_text(workspace.get("meeting_goal"))[:80],
            "meeting_goal_context": _safe_text(workspace.get("meeting_goal_context"))[:80],
            "stage": _safe_text(workspace.get("stage")),
            "canvas_items": len(workspace.get("canvas_items") or []),
            "custom_groups": len(workspace.get("custom_groups") or []),
            "problem_structure_phase": _safe_text((workspace.get("problem_structure") or {}).get("phase")),
            "final_solution_count": int((workspace.get("final_solution_summary") or {}).get("final_count") or 0),
            "node_positions": _summarize_canvas_node_positions_for_debug(workspace.get("node_positions")),
        },
    )

    return _canvas_workspace_response(workspace)


@app.post("/api/canvas/artifact-generation/start")
def post_canvas_artifact_generation_start(payload: CanvasArtifactGenerationStartInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    artifact_key = _safe_text(payload.artifact_key)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")
    if artifact_key not in _CANVAS_ARTIFACT_KEYS:
        raise HTTPException(status_code=400, detail="invalid artifact_key")

    saved_at = _now_ts()
    previous_workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    should_save_workspace = False
    with RT.lock:
        workspace_source = RT.canvas_workspace_by_meeting.get(normalized_meeting_id) or previous_workspace
        workspace = _clone_runtime_workspace_state(normalized_meeting_id, workspace_source, saved_at)
        generation_map = _normalize_canvas_artifact_generation(workspace.get("artifact_generation") or {})
        lock_map = RT.canvas_artifact_generation_locks_by_meeting.setdefault(normalized_meeting_id, {})
        locked_generation = copy.deepcopy(lock_map.get(artifact_key) or {})
        if locked_generation and _is_canvas_artifact_generation_stale(locked_generation, saved_at):
            lock_map.pop(artifact_key, None)
            locked_generation = {}

        current = locked_generation or generation_map.get(artifact_key) or {}
        current_status = _safe_text(current.get("status"))
        current_is_stale = _is_canvas_artifact_generation_stale(current, saved_at)

        if current_status == "generating" and not payload.force and not current_is_stale:
            generation = copy.deepcopy(current)
            generation_map[artifact_key] = generation
            workspace["artifact_generation"] = generation_map
            RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(workspace)
            acquired = False
            should_save_workspace = True
        else:
            input_transcript_revision = _safe_nonnegative_int(getattr(RT, "transcript_version", 0))
            generation = {
                "artifact_key": artifact_key,
                "status": "generating",
                "generation_id": f"{artifact_key}:{uuid4().hex}",
                "started_by": _safe_text(payload.user_id),
                "started_at": saved_at,
                "updated_at": saved_at,
                "finished_at": "",
                "error": "",
                "phase": _safe_text(payload.phase),
                "detail": _safe_text(payload.detail),
                "retryable": bool(payload.retryable),
                "version": int(current.get("version") or 0),
                "input_transcript_revision": input_transcript_revision,
            }
            generation_map[artifact_key] = generation
            lock_map[artifact_key] = copy.deepcopy(generation)
            workspace["artifact_generation"] = generation_map
            acquired = True
            should_save_workspace = True
            RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(workspace)

    if should_save_workspace:
        _save_canvas_workspace_to_db(normalized_meeting_id, workspace)

    return {
        "ok": True,
        "acquired": acquired,
        "generation": copy.deepcopy(generation),
        "workspace": _canvas_workspace_response(workspace),
    }


@app.post("/api/canvas/artifact-generation/finish")
def post_canvas_artifact_generation_finish(payload: CanvasArtifactGenerationFinishInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    artifact_key = _safe_text(payload.artifact_key)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")
    if artifact_key not in _CANVAS_ARTIFACT_KEYS:
        raise HTTPException(status_code=400, detail="invalid artifact_key")
    status = _safe_text(payload.status)
    if status not in {"ready", "failed"}:
        raise HTTPException(status_code=400, detail="invalid status")

    saved_at = _now_ts()
    previous_workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    workspace = _clone_runtime_workspace_state(normalized_meeting_id, previous_workspace, saved_at)
    generation_map = _normalize_canvas_artifact_generation(workspace.get("artifact_generation") or {})
    current = generation_map.get(artifact_key) or {}
    current_generation_id = _safe_text(current.get("generation_id"))
    requested_generation_id = _safe_text(payload.generation_id)

    if current_generation_id and requested_generation_id and current_generation_id != requested_generation_id:
        return {
            "ok": True,
            "applied": False,
            "generation": copy.deepcopy(current),
            "workspace": _canvas_workspace_response(workspace),
        }

    with RT.lock:
        lock_map = RT.canvas_artifact_generation_locks_by_meeting.setdefault(normalized_meeting_id, {})
        locked_generation = lock_map.get(artifact_key) or {}
        locked_generation_id = _safe_text(locked_generation.get("generation_id"))
        if not locked_generation_id or not requested_generation_id or locked_generation_id == requested_generation_id:
            lock_map.pop(artifact_key, None)

    generation_id = requested_generation_id or current_generation_id or f"{artifact_key}:{uuid4().hex}"
    generation = _finish_canvas_artifact_generation_entry(
        current,
        artifact_key,
        status,
        generation_id,
        _safe_text(payload.user_id),
        saved_at,
        _safe_text(payload.error),
        _safe_text(payload.phase),
        _safe_text(payload.detail),
        bool(payload.retryable),
    )
    generation_map[artifact_key] = generation
    workspace["artifact_generation"] = generation_map

    if status == "ready" and artifact_key == "problem-definition:structure":
        if payload.problem_structure is None:
            raise HTTPException(status_code=400, detail="problem_structure is required")
        next_structure = _normalize_canvas_problem_structure_state(payload.problem_structure)
        previous_structure = _normalize_canvas_problem_structure_state(workspace.get("problem_structure"))
        next_revision = max(
            _safe_nonnegative_int(previous_structure.get("revision")) + 1,
            _safe_nonnegative_int(generation.get("version")),
        )
        next_structure["phase"] = "structure"
        next_structure["revision"] = next_revision
        next_structure["source_generation_id"] = generation_id
        next_structure["based_on_transcript_revision"] = _safe_nonnegative_int(
            current.get("input_transcript_revision")
        )
        next_structure["updated_at"] = saved_at
        workspace["problem_structure"] = next_structure

    with RT.lock:
        RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(workspace)

    _save_canvas_workspace_to_db(normalized_meeting_id, workspace)
    print(
        "[canvas artifact finish]",
        {
            "meeting_id": normalized_meeting_id,
            "artifact_key": artifact_key,
            "status": status,
            "generation_id": generation_id,
            "version": _safe_nonnegative_int(generation.get("version")),
            "problem_structure_revision": _safe_nonnegative_int(
                (workspace.get("problem_structure") or {}).get("revision")
            ),
        },
    )
    return {
        "ok": True,
        "applied": True,
        "generation": copy.deepcopy(generation),
        "workspace": _canvas_workspace_response(workspace),
    }


@app.post("/api/canvas/workspace-patch")
def post_canvas_workspace_patch(payload: CanvasWorkspacePatchInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")

    saved_at = _now_ts()
    previous_workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    workspace = _clone_runtime_workspace_state(normalized_meeting_id, previous_workspace, saved_at)
    provided_fields = set(getattr(payload, "model_fields_set", set()))
    current_artifact_generation = _normalize_canvas_artifact_generation(workspace.get("artifact_generation") or {})
    incoming_artifact_generation = (
        _normalize_canvas_artifact_generation(payload.artifact_generation or {})
        if "artifact_generation" in provided_fields
        else {}
    )

    if "meeting_goal" in provided_fields:
        workspace["meeting_goal"] = _safe_text(payload.meeting_goal)
    if "meeting_goal_context" in provided_fields:
        workspace["meeting_goal_context"] = _safe_text(payload.meeting_goal_context)
    if "demo_config" in provided_fields:
        workspace["demo_config"] = _normalize_canvas_demo_config(payload.demo_config)
    if "demo_balance_classification" in provided_fields:
        workspace["demo_balance_classification"] = _normalize_canvas_demo_balance_classification(
            payload.demo_balance_classification
        )
    if "stage" in provided_fields:
        workspace["stage"] = "ideation"
    if "agenda_overrides" in provided_fields:
        workspace["agenda_overrides"] = _normalize_canvas_agenda_overrides(payload.agenda_overrides)
    if "canvas_items" in provided_fields:
        workspace["canvas_items"] = _normalize_canvas_workspace_items(payload.canvas_items)
    if "custom_groups" in provided_fields:
        workspace["custom_groups"] = _normalize_canvas_custom_groups(payload.custom_groups)
    if "problem_groups" in provided_fields:
        if _should_accept_artifact_scoped_workspace_patch(
            current_artifact_generation,
            incoming_artifact_generation,
            "problem-definition:explore",
        ):
            workspace["problem_groups"] = _normalize_canvas_workspace_problem_groups(payload.problem_groups)
        else:
            print(
                "[canvas workspace PATCH] ignored stale problem_groups",
                {
                    "meeting_id": normalized_meeting_id,
                    "current": current_artifact_generation.get("problem-definition:explore"),
                    "incoming": incoming_artifact_generation.get("problem-definition:explore"),
                },
            )
    if "problem_structure" in provided_fields:
        incoming_problem_structure = _normalize_canvas_problem_structure_state(payload.problem_structure)
        current_problem_structure = _normalize_canvas_problem_structure_state(workspace.get("problem_structure"))
        if (
            _should_accept_artifact_scoped_workspace_patch(
                current_artifact_generation,
                incoming_artifact_generation,
                "problem-definition:structure",
            )
            and _should_accept_problem_structure_patch(current_problem_structure, incoming_problem_structure)
        ):
            workspace["problem_structure"] = incoming_problem_structure
        else:
            print(
                "[canvas workspace PATCH] ignored stale problem_structure",
                {
                    "meeting_id": normalized_meeting_id,
                    "current_revision": _safe_nonnegative_int(current_problem_structure.get("revision")),
                    "incoming_revision": _safe_nonnegative_int(incoming_problem_structure.get("revision")),
                },
            )
    if "solution_topics" in provided_fields:
        workspace["solution_topics"] = _normalize_canvas_workspace_solution_topics(payload.solution_topics)
    if "final_solution_summary" in provided_fields:
        if _should_accept_artifact_scoped_workspace_patch(
            current_artifact_generation,
            incoming_artifact_generation,
            "solution:summary",
        ):
            current_final_summary = _normalize_canvas_final_solution_summary(workspace.get("final_solution_summary"))
            incoming_final_summary = _normalize_canvas_final_solution_summary(payload.final_solution_summary)
            incoming_revision = _safe_nonnegative_int(incoming_final_summary.get("revision"))
            current_revision = _safe_nonnegative_int(current_final_summary.get("revision"))
            summary_artifact = incoming_artifact_generation.get("solution:summary") or {}
            summary_artifact_version = _safe_nonnegative_int(summary_artifact.get("version"))
            incoming_final_summary["revision"] = max(
                incoming_revision,
                summary_artifact_version,
                current_revision + 1 if incoming_revision <= 0 else incoming_revision,
            )
            if summary_artifact.get("generation_id"):
                incoming_final_summary["source_generation_id"] = _safe_text(summary_artifact.get("generation_id"))
            if summary_artifact.get("input_transcript_revision") is not None:
                incoming_final_summary["based_on_transcript_revision"] = _safe_nonnegative_int(
                    summary_artifact.get("input_transcript_revision")
                )
            incoming_final_summary["updated_at"] = saved_at
            workspace["final_solution_summary"] = incoming_final_summary
        else:
            print(
                "[canvas workspace PATCH] ignored stale final_solution_summary",
                {
                    "meeting_id": normalized_meeting_id,
                    "current": current_artifact_generation.get("solution:summary"),
                    "incoming": incoming_artifact_generation.get("solution:summary"),
                },
            )
    if "node_positions" in provided_fields:
        workspace["node_positions"] = _normalize_canvas_node_positions(payload.node_positions or {})
    if "artifact_generation" in provided_fields:
        workspace["artifact_generation"] = _merge_canvas_artifact_generation_patch(
            current_artifact_generation,
            incoming_artifact_generation,
        )
        with RT.lock:
            lock_map = RT.canvas_artifact_generation_locks_by_meeting.setdefault(normalized_meeting_id, {})
            for artifact_key, generation in incoming_artifact_generation.items():
                if _safe_text(generation.get("status")) != "generating":
                    lock_map.pop(artifact_key, None)
    if "ideation_bubble_graph" in provided_fields:
        incoming_bubble_graph = _normalize_canvas_ideation_bubble_graph(payload.ideation_bubble_graph)
        current_bubble_graph = _normalize_canvas_ideation_bubble_graph(workspace.get("ideation_bubble_graph"))
        if _should_accept_ideation_bubble_graph_patch(current_bubble_graph, incoming_bubble_graph):
            workspace["ideation_bubble_graph"] = incoming_bubble_graph
        else:
            print(
                "[canvas workspace PATCH] ignored stale ideation_bubble_graph",
                {
                    "meeting_id": normalized_meeting_id,
                    "current_cycle": _safe_nonnegative_int(current_bubble_graph.get("update_cycle")),
                    "incoming_cycle": _safe_nonnegative_int(incoming_bubble_graph.get("update_cycle")),
                },
            )
    if "imported_state" in provided_fields:
        workspace["imported_state"] = (
            copy.deepcopy(payload.imported_state) if isinstance(payload.imported_state, dict) else None
        )
    if "llm_cache_reset_prefixes" in provided_fields:
        with RT.lock:
            reset_keys = _reset_canvas_llm_cache_entries(
                RT,
                normalized_meeting_id,
                workspace,
                payload.llm_cache_reset_prefixes or [],
            )
    else:
        reset_keys = []

    _ensure_demo_balance_workspace_graph(workspace, saved_at)

    with RT.lock:
        RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(workspace)

    _save_canvas_workspace_to_db(normalized_meeting_id, workspace)
    print(
        "[canvas workspace PATCH]",
        {
            "meeting_id": normalized_meeting_id,
            "fields": sorted(list(provided_fields)),
            "meeting_goal": _safe_text(workspace.get("meeting_goal"))[:80],
            "meeting_goal_context": _safe_text(workspace.get("meeting_goal_context"))[:80],
            "stage": _safe_text(workspace.get("stage")),
            "canvas_items": len(workspace.get("canvas_items") or []),
            "custom_groups": len(workspace.get("custom_groups") or []),
            "problem_structure_phase": _safe_text((workspace.get("problem_structure") or {}).get("phase")),
            "node_positions": _summarize_canvas_node_positions_for_debug(workspace.get("node_positions")),
            "llm_cache_reset_count": len(reset_keys),
        },
    )
    return _canvas_workspace_response(workspace)


@app.post("/api/canvas/meeting-room-reset")
def post_canvas_meeting_room_reset(payload: CanvasMeetingRoomResetInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")

    client = _get_supabase_service_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Supabase service role client is not configured")

    deleted_count = 0
    try:
        with _SUPABASE_REQUEST_LOCK:
            response = (
                client
                .table("transcripts")
                .delete()
                .eq("meeting_id", normalized_meeting_id)
                .execute()
            )
        deleted_rows = response.data if isinstance(getattr(response, "data", None), list) else []
        deleted_count = len(deleted_rows)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to delete transcripts: {exc}") from exc

    reset_at = _now_ts()
    print(
        "[canvas meeting room reset]",
        {
            "meeting_id": normalized_meeting_id,
            "user_id": _safe_text(payload.user_id),
            "deleted_transcript_count": deleted_count,
            "reset_at": reset_at,
        },
    )
    return {
        "ok": True,
        "meeting_id": normalized_meeting_id,
        "deleted_transcript_count": deleted_count,
        "reset_at": reset_at,
    }


@app.post("/api/canvas/bubble-debug-log")
def post_canvas_bubble_debug_log(payload: CanvasBubbleDebugLogInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")

    event = re.sub(r"[^A-Za-z0-9_.:-]+", "_", _safe_text(payload.event) or "frontend_event")[:80]
    data = payload.data if isinstance(payload.data, dict) else {}
    _write_bubble_debug_event(
        normalized_meeting_id,
        f"frontend_{event}",
        {
            "user_id": _safe_text(payload.user_id)[:120],
            "data": data,
        },
    )
    return {"ok": True, "meeting_id": normalized_meeting_id}


@app.post("/api/canvas/final-report-share")
def post_canvas_final_report_share(payload: CanvasFinalReportShareInput):
    normalized_meeting_id = _safe_text(payload.meeting_id)
    if not normalized_meeting_id:
        raise HTTPException(status_code=400, detail="meeting_id is required")

    saved_at = _now_ts()
    previous_workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    workspace = _clone_runtime_workspace_state(normalized_meeting_id, previous_workspace, saved_at)
    final_summary = _normalize_canvas_final_solution_summary(workspace.get("final_solution_summary"))
    if not _canvas_final_report_has_content(final_summary):
        raise HTTPException(status_code=400, detail="final report is empty")

    token = _safe_text(workspace.get("final_report_share_token"))
    created_at = _safe_text(workspace.get("final_report_share_created_at"))
    if payload.regenerate or not token:
        token = f"fr_{uuid4().hex}{uuid4().hex}"
        created_at = saved_at

    workspace["final_report_share_token"] = token
    workspace["final_report_share_created_at"] = created_at

    with RT.lock:
        RT.canvas_workspace_by_meeting[normalized_meeting_id] = copy.deepcopy(workspace)

    _save_canvas_workspace_to_db(normalized_meeting_id, workspace)
    return {
        "ok": True,
        "meeting_id": normalized_meeting_id,
        "token": token,
        "created_at": created_at,
        "saved_at": _safe_text(workspace.get("saved_at")),
    }


@app.get("/api/public/final-report/{meeting_id}/{token}")
def get_public_canvas_final_report(meeting_id: str, token: str):
    normalized_meeting_id = _safe_text(meeting_id)
    normalized_token = _safe_text(token)
    if not normalized_meeting_id or not normalized_token:
        raise HTTPException(status_code=404, detail="final report not found")

    workspace = _warm_canvas_workspace_cache(RT, normalized_meeting_id)
    expected_token = _safe_text(workspace.get("final_report_share_token"))
    if not expected_token or not hmac.compare_digest(expected_token, normalized_token):
        raise HTTPException(status_code=404, detail="final report not found")

    final_summary = _normalize_canvas_final_solution_summary(workspace.get("final_solution_summary"))
    if not _canvas_final_report_has_content(final_summary):
        raise HTTPException(status_code=404, detail="final report not found")

    return {
        "ok": True,
        "meeting_id": normalized_meeting_id,
        "markdown": _safe_text(final_summary.get("markdown")),
        "document_blocks": copy.deepcopy(final_summary.get("document_blocks") or []),
        "document_status": _safe_text(final_summary.get("document_status")),
        "generated_at": _safe_text(final_summary.get("generated_at")),
        "created_at": _safe_text(workspace.get("final_report_share_created_at")),
        "saved_at": _safe_text(workspace.get("saved_at")),
    }


@app.post("/api/stt/chunk")
async def post_stt_chunk(
    audio: UploadFile = File(...),
    speaker: str = Form(default="시스템오디오"),
    source: str = Form(default="system_audio"),
):
    t0 = time.perf_counter()
    with RT.lock:
        RT.stt_chunk_seq += 1
        chunk_id = RT.stt_chunk_seq

    try:
        blob = await audio.read()
    except Exception as exc:
        blob = b""
        read_err = str(exc)
    else:
        read_err = ""

    steps = [{"step": "read_chunk", "t_ms": int((time.perf_counter() - t0) * 1000)}]
    status = "ok"
    text = ""
    err_msg = ""

    if read_err:
        status = "error"
        err_msg = read_err
    elif not blob:
        status = "empty"
    else:
        suffix = Path(audio.filename or "chunk.webm").suffix or ".webm"
        try:
            text = _transcribe_with_whisper(blob, suffix=suffix)
        except Exception as exc:
            status = "error"
            err_msg = str(exc)
            text = ""
        if status == "ok" and not _safe_text(text):
            status = "empty"

    with RT.lock:
        if status == "ok" and _safe_text(text):
            _append_turn(RT, speaker, text, _now_ts())
            _enqueue_windowed_with_backpressure(RT, source="stt_chunk")
        state = _state_response(RT)

    steps.append({"step": "done", "t_ms": int((time.perf_counter() - t0) * 1000)})
    duration_ms = int((time.perf_counter() - t0) * 1000)

    return {
        "state": state,
        "stt_debug": {
            "chunk_id": chunk_id,
            "status": status,
            "source": source,
            "speaker": speaker,
            "filename": audio.filename or "chunk.webm",
            "bytes": len(blob),
            "steps": steps,
            "duration_ms": duration_ms,
            "transcript_chars": len(_safe_text(text)),
            "transcript_preview": _safe_text(text)[:240],
            "error": err_msg,
        },
    }


##추가 코드(웹소켓 에러 방지)
@app.post("/api/transcribe-chunk")
async def post_transcribe_chunk(
    audio_file: UploadFile = File(...),
    meeting_goal: str = Form(default=""),
    meeting_goal_context: str = Form(default=""),
    context_pack: str = Form(default=""),
    defer_refine: str = Form(default="false"),
):
    """
    Gateway에서 호출하는 전사 엔드포인트
    오디오 청크를 받아서 Whisper로 전사한 후 텍스트 반환
    """
    try:
        started_at = time.perf_counter()
        blob = await audio_file.read()
        if not blob:
            return {"text": "", "language": WHISPER_LANGUAGE, "error": "empty audio"}
        
        suffix = Path(audio_file.filename or "chunk.webm").suffix or ".webm"
        parsed_context_pack = _parse_stt_context_pack(context_pack)
        should_defer_refine = _boolify(defer_refine, False)
        print(
            f"[STT] transcribe chunk start model={WHISPER_MODEL_NAME} "
            f"bytes={len(blob)} suffix={suffix} "
            f"raw_first={should_defer_refine} refine_goal={bool(_safe_text(meeting_goal))} refine_context={bool(_safe_text(meeting_goal_context))}"
        )
        raw_text = _transcribe_with_whisper(blob, suffix=suffix)
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        context_pack_summary = _summarize_stt_context_pack(parsed_context_pack)

        if should_defer_refine:
            print(
                f"[STT] transcribed chunk model={WHISPER_MODEL_NAME} "
                f"bytes={len(blob)} suffix={suffix} elapsed_ms={elapsed_ms} "
                f"raw_chars={len(_safe_text(raw_text))} refine_deferred=true "
                f"context_pack={context_pack_summary}"
            )
            return {
                "text": _safe_text(raw_text),
                "raw_text": _safe_text(raw_text),
                "refined_text": "",
                "refine_used_llm": False,
                "refine_deferred": True,
                "refine_warning": "LLM 보정은 비동기 처리됩니다.",
                "confidence": None,
                "corrections": [],
                "uncertain_terms": [],
                "context_terms": [],
                "context_pack_summary": context_pack_summary,
                "language": WHISPER_LANGUAGE,
                "elapsed_ms": elapsed_ms,
                "model": WHISPER_MODEL_NAME,
            }

        refined_text, refine_used_llm, refine_warning, refine_meta = _refine_transcript_text_with_llm(
            raw_text,
            meeting_goal=meeting_goal,
            meeting_goal_context=meeting_goal_context,
            context_pack=parsed_context_pack,
        )
        total_elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        print(
            f"[STT] transcribed chunk model={WHISPER_MODEL_NAME} "
            f"bytes={len(blob)} suffix={suffix} elapsed_ms={total_elapsed_ms} "
            f"raw_chars={len(_safe_text(raw_text))} refined_chars={len(_safe_text(refined_text))} "
            f"refine_deferred=false refine_used_llm={refine_used_llm} context_pack={context_pack_summary}"
        )
        
        return {
            "text": _safe_text(refined_text) or _safe_text(raw_text),
            "raw_text": _safe_text(raw_text),
            "refined_text": _safe_text(refined_text),
            "refine_used_llm": refine_used_llm,
            "refine_deferred": False,
            "refine_warning": refine_warning,
            "confidence": refine_meta.get("confidence"),
            "corrections": refine_meta.get("corrections") or [],
            "uncertain_terms": refine_meta.get("uncertain_terms") or [],
            "context_terms": refine_meta.get("context_terms") or [],
            "context_pack_summary": refine_meta.get("context_pack_summary") or context_pack_summary,
            "language": WHISPER_LANGUAGE,
            "elapsed_ms": total_elapsed_ms,
            "model": WHISPER_MODEL_NAME,
        }
    except Exception as exc:
        print(f"[STT][backend] transcribe chunk error: {exc}", flush=True)
        return {
            "text": "",
            "language": WHISPER_LANGUAGE,
            "error": str(exc)
        }
