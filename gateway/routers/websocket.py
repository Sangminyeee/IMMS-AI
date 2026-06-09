"""
WebSocket Router
실시간 회의 음성 스트리밍 및 전사
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Any, Dict, List
import asyncio
import httpx
import json
import base64
import copy
import time
from datetime import datetime, timezone
from ..config import get_supabase, settings
from security_utils import extract_client_ip, is_ip_allowed, parse_ip_whitelist

router = APIRouter()

# 회의방별 연결 관리
active_connections: Dict[str, List[Dict]] = {}
latest_canvas_workspace_by_meeting: Dict[str, Dict[str, Any]] = {}
CANVAS_WORKSPACE_SYNC_FIELDS = {
    "meeting_goal",
    "meeting_goal_context",
    "demo_config",
    "demo_balance_classification",
    "agenda_overrides",
    "canvas_items",
    "custom_groups",
    "problem_groups",
    "problem_structure",
    "solution_topics",
    "final_solution_summary",
    "node_positions",
    "artifact_generation",
    "ideation_bubble_graph",
    "imported_state",
}
CANVAS_SCOPED_SYNC_FIELDS = {
    "artifact_generation": {"artifact_generation"},
    "ideation_bubble_graph": {"ideation_bubble_graph"},
    "problem_groups": {"problem_groups", "node_positions", "artifact_generation"},
    "problem_structure": {"problem_groups", "problem_structure", "node_positions", "artifact_generation"},
    "summary_document": {"final_solution_summary", "artifact_generation", "imported_state"},
    "meeting_goal": {"meeting_goal", "meeting_goal_context"},
    "meeting_room_reset": set(CANVAS_WORKSPACE_SYNC_FIELDS),
}
latest_stt_summary_by_meeting: Dict[str, Dict[str, Any]] = {}

# AI 백엔드 URL
AI_BACKEND_URL = settings.ai_module_url.rstrip("/")
IP_WHITELIST = parse_ip_whitelist(settings.ip_whitelist)
FUSION_BUCKET_MS = 1200
FUSION_WAIT_MS = 250
FUSION_STICKY_BONUS = 0.35
FUSION_MIN_RMS = 0.004
FUSION_MIN_SPEECH_RATIO = 0.05
TRANSCRIPT_PERSIST_RETRY_DELAYS = (0.0, 2.0, 6.0, 15.0)
TRANSCRIPT_STATUS_FINAL = "final"
TRANSCRIPT_PERSISTENCE_SAVING = "saving"
TRANSCRIPT_PERSISTENCE_RETRYING = "retrying"
TRANSCRIPT_PERSISTENCE_PERSISTED = "persisted"
TRANSCRIPT_PERSISTENCE_FAILED = "persist_failed"
TRANSCRIPT_EVENT_CREATED = "transcript_created"
TRANSCRIPT_EVENT_REFINED = "transcript_refined"
TRANSCRIPT_EVENT_PERSISTENCE_UPDATED = "transcript_persistence_updated"
TRANSCRIPT_SELECT_FIELDS_WITH_STAGE = "id, meeting_id, user_id, speaker, text, timestamp, created_at, canvas_stage, canvas_target_id"
TRANSCRIPT_SELECT_FIELDS_BASE = "id, meeting_id, user_id, speaker, text, timestamp, created_at"
fusion_states: Dict[str, Dict[str, Any]] = {}
IDEATION_BUBBLE_COALESCE_MS = 4500
IDEATION_BUBBLE_MAX_KEYWORDS = 3
IDEATION_BUBBLE_FAILURE_BACKOFF_MS = 30000
DEMO_LOCAL_FAST_BUBBLE_COALESCE_MS = 250
DEMO_LOCAL_FAST_BUBBLE_MAX_ROWS = 6
DEMO_LOCAL_FAST_BUBBLE_RETAIN_ROWS = 18
DEMO_LOCAL_FAST_BUBBLE_MAX_KEYWORDS = 4
DEMO_TEXT_POSTPROCESS_INTERVAL_MS = 4000
DEMO_TEXT_POSTPROCESS_MAX_ROWS = 6
DEMO_TEXT_POSTPROCESS_RETAIN_ROWS = 18
DEMO_TEXT_POSTPROCESS_MAX_KEYWORDS = 8
DEMO_CONSOLIDATION_INTERVAL_MS = 20000
DEMO_CONSOLIDATION_MAX_KEYWORDS = 6


def _float_meta(meta: dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for key in keys:
        value = meta.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return default


def normalize_audio_meta(raw_meta: Any) -> dict[str, Any]:
    meta = raw_meta if isinstance(raw_meta, dict) else {}
    return {
        "started_at": meta.get("started_at") or meta.get("startedAt"),
        "ended_at": meta.get("ended_at") or meta.get("endedAt"),
        "duration_ms": _float_meta(meta, "duration_ms", "durationMs"),
        "rms": _float_meta(meta, "rms"),
        "peak": _float_meta(meta, "peak"),
        "speech_ratio": _float_meta(meta, "speech_ratio", "speechRatio"),
        "zero_crossing_rate": _float_meta(meta, "zero_crossing_rate", "zeroCrossingRate"),
        "noise_floor": _float_meta(meta, "noise_floor", "noiseFloor", default=0.0015),
        "source_sample_rate": _float_meta(meta, "source_sample_rate", "sourceSampleRate"),
        "sample_rate": _float_meta(meta, "sample_rate", "sampleRate"),
        "chunk_index": _float_meta(meta, "chunk_index", "chunkIndex", default=-1),
        "mime_type": meta.get("mime_type") or meta.get("mimeType"),
        "original_started_at": meta.get("original_started_at") or meta.get("originalStartedAt"),
        "original_ended_at": meta.get("original_ended_at") or meta.get("originalEndedAt"),
        "original_duration_ms": _float_meta(meta, "original_duration_ms", "originalDurationMs"),
        "removed_silence_ms": _float_meta(meta, "removed_silence_ms", "removedSilenceMs"),
        "combined_chunk_count": _float_meta(meta, "combined_chunk_count", "combinedChunkCount"),
        "trimmed_from_silence": bool(meta.get("trimmed_from_silence") or meta.get("trimmedFromSilence")),
    }


def normalize_demo_config(raw: Any) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    mode = str(source.get("mode") or "normal").strip().lower()
    option_a = str(source.get("option_a") or source.get("optionA") or "").strip()
    option_b = str(source.get("option_b") or source.get("optionB") or "").strip()
    option_a_keyword = str(source.get("option_a_keyword") or source.get("optionAKeyword") or option_a).strip()
    option_b_keyword = str(source.get("option_b_keyword") or source.get("optionBKeyword") or option_b).strip()
    enabled = bool(source.get("enabled") or mode == "demo_balance") and bool(option_a and option_b)
    if not enabled:
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
        "option_a_keyword": option_a_keyword,
        "option_b_keyword": option_b_keyword,
        "instruction": str(source.get("instruction") or "발화할 때 A 또는 B를 먼저 말하고 이유를 설명해 주세요.").strip(),
    }


def is_demo_balance_config(raw: Any) -> bool:
    config = normalize_demo_config(raw)
    return bool(config.get("enabled")) and config.get("mode") == "demo_balance"


def build_ideation_context_cache(state: Dict[str, Any], *, exclude_id: str = "", limit: int = 80) -> str:
    recent = [
        item
        for item in (state.get("recent_transcripts") or [])
        if str(item.get("canvas_stage") or item.get("stage") or "ideation") == "ideation"
        and str(item.get("id") or "") != exclude_id
        and str(item.get("text") or "").strip()
    ][-limit:]
    return "\n".join(
        f"{index + 1}. {str(item.get('speaker') or '참가자')}: {str(item.get('text') or '').strip()}"
        for index, item in enumerate(recent)
    )


def get_fusion_state(meeting_id: str) -> Dict[str, Any]:
    state = fusion_states.get(meeting_id)
    if state is None:
        state = {
            "lock": asyncio.Lock(),
            "buckets": {},
            "tasks": {},
            "transcription_lock": asyncio.Lock(),
            "flow_summary_lock": asyncio.Lock(),
            "flow_summary_buffer": [],
            "flow_summaries": [],
            "flow_summary_seq": 0,
            "recent_transcripts": [],
            "ideation_bubble_lock": asyncio.Lock(),
            "ideation_bubble_queue": [],
            "ideation_bubble_retry_rows": [],
            "ideation_bubble_task": None,
            "demo_local_fast_queue": [],
            "demo_local_fast_task": None,
            "demo_consolidation_queue": [],
            "demo_consolidation_task": None,
            "last_winner_user_id": None,
            "last_winner_bucket": None,
            "device_profiles": {},
            "last_transcript_text_by_user": {},
            "reset_seq": 0,
        }
        fusion_states[meeting_id] = state
    return state


async def reset_meeting_room_runtime_state(meeting_id: str) -> None:
    state = get_fusion_state(meeting_id)
    async with state["lock"]:
        state["reset_seq"] = int(state.get("reset_seq") or 0) + 1
        for task in list((state.get("tasks") or {}).values()):
            if task and not task.done():
                task.cancel()
        state["buckets"] = {}
        state["tasks"] = {}
        state["flow_summary_buffer"] = []
        state["flow_summary_buffer_by_stage"] = {}
        state["flow_summaries"] = []
        state["flow_summary_seq"] = 0
        state["recent_transcripts"] = []
        state["stt_key_terms"] = []
        state["stt_correction_hints"] = []
        state["last_winner_user_id"] = None
        state["last_winner_bucket"] = None
        state["last_transcript_text_by_user"] = {}

    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        for task_key in ("ideation_bubble_task", "demo_local_fast_task", "demo_consolidation_task"):
            task = state.get(task_key)
            if task and not task.done():
                task.cancel()
            state[task_key] = None
        state["ideation_bubble_queue"] = []
        state["ideation_bubble_retry_rows"] = []
        state["demo_local_fast_queue"] = []
        state["demo_consolidation_queue"] = []
        state["ideation_bubble_paused_until"] = 0.0
        state["ideation_bubble_pause_reason"] = ""
        state["demo_consolidation_paused_until"] = 0.0
        state["demo_consolidation_pause_reason"] = ""

    latest_stt_summary_by_meeting.pop(meeting_id, None)
    print(
        "[meeting room reset][gateway]",
        {
            "meeting_id": meeting_id,
            "reset_seq": state.get("reset_seq"),
        },
        flush=True,
    )


def build_recent_transcript_context(
    state: Dict[str, Any],
    *,
    canvas_stage: str,
    limit: int = 4,
) -> list[dict[str, str]]:
    rows = state.get("recent_transcripts")
    if not isinstance(rows, list):
        return []
    selected: list[dict[str, str]] = []
    for row in reversed(rows):
        if not isinstance(row, dict):
            continue
        row_stage = str(row.get("canvas_stage") or row.get("stage") or "ideation")
        if row_stage != canvas_stage:
            continue
        text = str(row.get("text") or "").strip()
        if not text:
            continue
        selected.append({
            "speaker": str(row.get("speaker") or "참가자"),
            "text": text,
            "timestamp": str(row.get("timestamp") or row.get("created_at") or ""),
        })
        if len(selected) >= limit:
            break
    selected.reverse()
    return selected


def build_current_focus_context(state: Dict[str, Any], *, canvas_stage: str) -> str:
    summaries = state.get("flow_summaries")
    if not isinstance(summaries, list):
        return ""
    for item in reversed(summaries):
        if not isinstance(item, dict):
            continue
        if str(item.get("stage") or "ideation") != canvas_stage:
            continue
        text = str(item.get("text") or "").strip()
        if text:
            return text[:160]
    return ""


def build_stt_context_pack(
    state: Dict[str, Any],
    *,
    canvas_stage: str,
    meeting_goal: str = "",
    meeting_goal_context: str = "",
) -> dict[str, Any]:
    pack: dict[str, Any] = {
        "stage": canvas_stage,
        "recent_utterances": build_recent_transcript_context(state, canvas_stage=canvas_stage, limit=4),
    }
    clean_goal = meeting_goal.strip()
    clean_context = meeting_goal_context.strip()
    if clean_goal:
        pack["meeting_goal"] = clean_goal
    if clean_context:
        pack["meeting_goal_context"] = clean_context
    current_focus = build_current_focus_context(state, canvas_stage=canvas_stage)
    if current_focus:
        pack["current_focus"] = current_focus

    key_terms = state.get("stt_key_terms")
    if isinstance(key_terms, list):
        pack["key_terms"] = [str(item).strip() for item in key_terms if str(item).strip()][:40]

    correction_hints = state.get("stt_correction_hints")
    if isinstance(correction_hints, list):
        pack["correction_hints"] = [
            {
                "raw": str(item.get("raw") or "").strip(),
                "corrected": str(item.get("corrected") or "").strip(),
            }
            for item in correction_hints
            if isinstance(item, dict) and str(item.get("raw") or "").strip() and str(item.get("corrected") or "").strip()
        ][-20:]

    return {key: value for key, value in pack.items() if value not in ("", [], {})}


def remember_recent_transcript(state: Dict[str, Any], transcript: dict[str, Any], limit: int = 60):
    rows = state.get("recent_transcripts")
    if not isinstance(rows, list):
        rows = []
    row = {
        "id": str(transcript.get("id") or ""),
        "speaker": str(transcript.get("speaker") or "참가자"),
        "text": str(transcript.get("text") or "").strip(),
        "timestamp": str(transcript.get("timestamp") or transcript.get("created_at") or ""),
        "canvas_stage": str(transcript.get("canvas_stage") or "ideation"),
    }
    rows = [item for item in rows if str(item.get("id") or "") != row["id"]]
    rows.append(row)
    state["recent_transcripts"] = rows[-limit:]


def remember_stt_refine_feedback(state: Dict[str, Any], transcription: dict[str, Any]):
    context_terms = transcription.get("context_terms")
    if isinstance(context_terms, list):
        terms = [str(item).strip() for item in context_terms if str(item).strip()]
        current_terms = state.get("stt_key_terms")
        if not isinstance(current_terms, list):
            current_terms = []
        deduped_terms: list[str] = []
        for item in [*current_terms, *terms]:
            if item and item not in deduped_terms:
                deduped_terms.append(item)
        state["stt_key_terms"] = deduped_terms[-60:]

    corrections = transcription.get("corrections")
    if isinstance(corrections, list):
        current_corrections = state.get("stt_correction_hints")
        if not isinstance(current_corrections, list):
            current_corrections = []
        merged = [
            item
            for item in current_corrections
            if isinstance(item, dict) and str(item.get("raw") or "").strip() and str(item.get("corrected") or "").strip()
        ]
        for item in corrections:
            if not isinstance(item, dict):
                continue
            raw = str(item.get("raw") or item.get("from") or "").strip()
            corrected = str(item.get("corrected") or item.get("to") or "").strip()
            if not raw or not corrected or raw == corrected:
                continue
            merged = [
                existing
                for existing in merged
                if not (
                    str(existing.get("raw") or "").strip() == raw
                    and str(existing.get("corrected") or "").strip() == corrected
                )
            ]
            merged.append({"raw": raw, "corrected": corrected})
        state["stt_correction_hints"] = merged[-40:]


def iso_to_epoch_ms(value: str | None) -> int:
    if not value:
        return int(datetime.now(timezone.utc).timestamp() * 1000)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp() * 1000)
    except ValueError:
        return int(datetime.now(timezone.utc).timestamp() * 1000)


def score_audio_candidate(candidate: dict[str, Any], sticky_user_id: str | None, sticky_bucket: int | None, bucket_id: int) -> float:
    meta = candidate.get("audio_meta") or {}
    profile = candidate.get("device_profile") or {}
    rms = float(meta.get("rms") or 0.0)
    peak = float(meta.get("peak") or 0.0)
    speech_ratio = float(meta.get("speech_ratio") or 0.0)
    noise_floor = max(float(meta.get("noise_floor") or 0.0015), 0.0002)
    profile_rms = max(float(profile.get("rms") or 0.0), FUSION_MIN_RMS)
    profile_peak = max(float(profile.get("peak") or 0.0), 0.01)
    profile_speech_ratio = max(float(profile.get("speech_ratio") or 0.0), FUSION_MIN_SPEECH_RATIO)
    snr = max((rms - noise_floor) / noise_floor, 0.0)
    duration_score = min(float(meta.get("duration_ms") or 0.0) / 1200.0, 1.0)
    normalized_rms = min(rms / profile_rms, 1.6)
    normalized_peak = min(peak / profile_peak, 1.4)
    normalized_speech = min(speech_ratio / profile_speech_ratio, 1.8)

    score = (
        (normalized_speech * 1.9)
        + (normalized_rms * 1.2)
        + (normalized_peak * 0.45)
        + (min(snr, 12.0) * 0.22)
        + (duration_score * 0.12)
    )
    if sticky_user_id and sticky_user_id == candidate.get("user_id") and sticky_bucket is not None and bucket_id - sticky_bucket <= 1:
        score += FUSION_STICKY_BONUS
    return score


def pick_dominant_candidate(candidates: list[dict[str, Any]], sticky_user_id: str | None, sticky_bucket: int | None, bucket_id: int) -> dict[str, Any] | None:
    ranked: list[tuple[float, dict[str, Any]]] = []
    for candidate in candidates:
        meta = candidate.get("audio_meta") or {}
        rms = float(meta.get("rms") or 0.0)
        speech_ratio = float(meta.get("speech_ratio") or 0.0)
        if rms < FUSION_MIN_RMS and speech_ratio < FUSION_MIN_SPEECH_RATIO:
          continue
        ranked.append((score_audio_candidate(candidate, sticky_user_id, sticky_bucket, bucket_id), candidate))

    if not ranked:
        return None

    ranked.sort(key=lambda item: item[0], reverse=True)
    best_score, best_candidate = ranked[0]

    if len(ranked) > 1:
        second_score, second_candidate = ranked[1]
        if (
            sticky_user_id
            and second_candidate.get("user_id") == sticky_user_id
            and sticky_bucket is not None
            and bucket_id - sticky_bucket <= 1
            and (best_score - second_score) < 0.18
        ):
            return second_candidate

    return best_candidate


def normalize_transcript_for_dedupe(text: str) -> str:
    return "".join(ch for ch in (text or "").lower().strip() if ch.isalnum())


def trim_text_prefix_by_chars(text: str, prefix_char_count: int) -> str:
    if prefix_char_count <= 0:
        return text.strip()
    consumed = 0
    cut_index = 0
    for index, char in enumerate(text):
        if char.isalnum():
            consumed += 1
        if consumed >= prefix_char_count:
            cut_index = index + 1
            break
    return text[cut_index:].strip(" \n\t,.，。")


def find_longest_normalized_overlap(previous_text: str, current_text: str) -> int:
    previous = normalize_transcript_for_dedupe(previous_text)
    current = normalize_transcript_for_dedupe(current_text)
    if not previous or not current:
        return 0
    max_len = min(len(previous), len(current))
    for size in range(max_len, 12, -1):
        if previous[-size:] == current[:size]:
            return size
    return 0


def extract_incremental_transcript(current_text: str, previous_cumulative_text: str) -> str:
    clean = (current_text or "").strip()
    previous = (previous_cumulative_text or "").strip()
    if not clean or not previous:
        return clean
    if clean == previous:
        return ""
    if clean.startswith(previous):
        return clean[len(previous):].strip(" \n\t,.，。")

    previous_norm = normalize_transcript_for_dedupe(previous)
    clean_norm = normalize_transcript_for_dedupe(clean)
    if clean_norm and previous_norm and clean_norm.startswith(previous_norm):
        return trim_text_prefix_by_chars(clean, len(previous_norm))

    overlap = find_longest_normalized_overlap(previous, clean)
    if overlap > 0:
        return trim_text_prefix_by_chars(clean, overlap)

    # If the new cumulative result is mostly old content with minor Whisper rewrites,
    # avoid saving another duplicate sentence.
    if previous_norm and clean_norm and (clean_norm in previous_norm or previous_norm in clean_norm):
        return "" if len(clean_norm) <= len(previous_norm) + 8 else trim_text_prefix_by_chars(clean, len(previous_norm))

    return clean


def build_transcript_summary(speaker: str, text: str) -> str:
    clean_text = " ".join((text or "").split()).strip()
    if len(clean_text) > 64:
        clean_text = clean_text[:63].strip() + "…"
    lowered = clean_text.lower()
    if any(token in lowered for token in ["?", "？", "궁금", "어떻게", "왜", "가능", "될까", "되나"]):
        intent = "질문 중"
    elif any(token in lowered for token in ["문제", "불편", "어렵", "리스크", "걱정", "한계", "부족"]):
        intent = "문제 제기 중"
    elif any(token in lowered for token in ["하자", "하면", "아이디어", "제안", "추가", "개선", "만들", "넣", "도입", "활용"]):
        intent = "아이디어 제시 중"
    else:
        intent = "의견 공유 중"
    return f"{speaker or '참가자'}: {clean_text} · {intent}" if clean_text else "현재 발언 흐름 대기 중"


def build_stt_progress_summary(stage: str, data: dict[str, Any]) -> str:
    if stage in {"audio_chunk_received", "audio_chunk_queued"}:
        wait_ms = int(data.get("fusion_wait_ms") or FUSION_WAIT_MS)
        return f"오디오 수신 중 · 후보 {wait_ms}ms 수집"
    if stage == "audio_candidate_selected":
        return "발화 구간 선택됨 · 전사 준비 중"
    if stage == "audio_candidate_dropped":
        return "입력이 작아 전사하지 않음"
    if stage == "transcription_audio_prepared":
        return "발화 청크 준비됨 · 전사 준비 중"
    if stage == "transcription_started":
        return "Whisper 전사 중 · 잠시만 기다려 주세요"
    if stage == "transcription_empty":
        return "전사 결과 없음 · 다음 발화 대기"
    if stage == "transcript_saved":
        return "전사 저장 완료 · 화면 반영 대기"
    if stage == "transcript_save_failed":
        return "전사 DB 저장 실패"
    if stage == "transcription_duplicate_skipped":
        return "중복 전사 감지 · 새 내용 대기"
    if stage == "mic_calibrated":
        return "마이크 캘리브레이션 완료"
    return ""


async def update_stt_summary(meeting_id: str, text: str, source: str, user_id: str | None = None, **extra):
    summary = {
        "text": text,
        "source": source,
        "user_id": user_id or "",
        "updated_at": datetime.utcnow().isoformat(),
        **extra,
    }
    latest_stt_summary_by_meeting[meeting_id] = copy.deepcopy(summary)
    await broadcast_to_meeting(meeting_id, {
        "type": "stt_summary_updated",
        "meeting_id": meeting_id,
        "summary": summary,
        "summary_text": text,
        "timestamp": summary["updated_at"],
    })


async def transcribe_selected_chunk(candidate: dict[str, Any]) -> dict[str, Any]:
    audio_bytes = candidate.get("audio_bytes") or b""
    audio_mime = str(candidate.get("audio_mime") or candidate.get("audio_meta", {}).get("mime_type") or "audio/wav")
    audio_filename = str(candidate.get("audio_filename") or ("chunk.wav" if audio_mime.lower().startswith("audio/wav") else "chunk.webm"))
    meeting_id = str(candidate.get("meeting_id") or "")
    workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
    if not isinstance(workspace, dict):
        loaded_workspace = await fetch_canvas_workspace(meeting_id) if meeting_id else None
        workspace = loaded_workspace if isinstance(loaded_workspace, dict) else {}
        if meeting_id and isinstance(workspace, dict):
            latest_canvas_workspace_by_meeting[meeting_id] = copy.deepcopy(workspace)
    meeting_goal = str(candidate.get("meeting_goal") or workspace.get("meeting_goal") or "").strip()
    meeting_goal_context = str(candidate.get("meeting_goal_context") or workspace.get("meeting_goal_context") or "").strip()
    defer_refine = is_demo_balance_config(workspace.get("demo_config") if isinstance(workspace, dict) else None)
    context_pack = candidate.get("context_pack") if isinstance(candidate.get("context_pack"), dict) else {}
    started_at = time.perf_counter()
    print(
        "[STT][gateway] backend transcription request start "
        f"url={AI_BACKEND_URL}/api/transcribe-chunk bytes={len(audio_bytes)} "
        f"mime={audio_mime} filename={audio_filename} "
        f"defer_refine={defer_refine} "
        f"meeting_goal={bool(meeting_goal)} meeting_goal_context={bool(meeting_goal_context)} "
        f"context_pack_keys={list(context_pack.keys())}",
        flush=True,
    )
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{AI_BACKEND_URL}/api/transcribe-chunk",
                files={'audio_file': (audio_filename, audio_bytes, audio_mime)},
                data={
                    'meeting_goal': meeting_goal,
                    'meeting_goal_context': meeting_goal_context,
                    'context_pack': json.dumps(context_pack, ensure_ascii=False),
                    'defer_refine': "true" if defer_refine else "false",
                },
            )
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        print(f"[STT][gateway] backend transcription request exception elapsed_ms={elapsed_ms} error={exc}", flush=True)
        raise

    elapsed_ms = round((time.perf_counter() - started_at) * 1000)
    print(
        "[STT][gateway] backend transcription response "
        f"status={response.status_code} elapsed_ms={elapsed_ms} body_preview={response.text[:160]!r}",
        flush=True,
    )
    if response.status_code != 200:
        print(f"❌ Transcription failed: {response.status_code}")
        return {
            "text": "",
            "status": "http_error",
            "status_code": response.status_code,
            "error": response.text[:300],
            "elapsed_ms": elapsed_ms,
        }
    result = response.json()
    if result.get("error"):
        print(f"❌ Transcription error: {result.get('error')}")
    if not (result.get('text') or '').strip():
        meta = candidate.get("audio_meta") or {}
        print(
            "ℹ️ Empty transcription "
            f"bytes={len(audio_bytes)} "
            f"mime={audio_mime} "
            f"rms={meta.get('rms')} speech_ratio={meta.get('speech_ratio')} "
            f"duration_ms={meta.get('duration_ms')}"
        )
    text = (result.get('text') or '').strip()
    return {
        "text": text,
        "raw_text": result.get("raw_text") or text,
        "refined_text": result.get("refined_text") or text,
        "refine_used_llm": bool(result.get("refine_used_llm")),
        "refine_deferred": bool(result.get("refine_deferred")),
        "refine_warning": result.get("refine_warning") or "",
        "refine_confidence": result.get("confidence"),
        "corrections": result.get("corrections") or [],
        "uncertain_terms": result.get("uncertain_terms") or [],
        "context_terms": result.get("context_terms") or [],
        "context_pack_summary": result.get("context_pack_summary") or {},
        "status": "ok" if text else "empty",
        "status_code": response.status_code,
        "error": result.get("error") or "",
        "elapsed_ms": elapsed_ms,
        "backend_elapsed_ms": result.get("elapsed_ms"),
    }


async def refine_transcript_text_async(
    *,
    meeting_id: str,
    user_id: str,
    transient_id: str,
    speaker: str,
    raw_text: str,
    audio_started_at: str,
    audio_ended_at: str,
    chunk_index: Any,
    canvas_stage: str,
    canvas_target_id: str,
    context_pack: dict[str, Any],
    meeting_goal: str,
    meeting_goal_context: str,
    enqueue_bubble: bool = True,
    reset_seq: int = 0,
):
    clean_raw = str(raw_text or "").strip()
    if not clean_raw:
        return
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{AI_BACKEND_URL}/api/stt/refine-transcript",
                json={
                    "raw_text": clean_raw,
                    "meeting_goal": meeting_goal,
                    "meeting_goal_context": meeting_goal_context,
                    "context_pack": context_pack,
                },
            )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        if response.status_code >= 400:
            print(
                f"[STT][gateway] refine failed status={response.status_code} elapsed_ms={elapsed_ms} "
                f"body={response.text[:200]!r}",
                flush=True,
            )
            return
        payload = response.json()
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        print(f"[STT][gateway] refine exception elapsed_ms={elapsed_ms} error={exc}", flush=True)
        return

    if int(get_fusion_state(meeting_id).get("reset_seq") or 0) != reset_seq:
        print(
            "[STT][gateway] dropped refined transcript after meeting reset",
            {
                "meeting_id": meeting_id,
                "transient_id": transient_id,
                "reset_seq": get_fusion_state(meeting_id).get("reset_seq"),
            },
            flush=True,
        )
        return

    refined_text = str(payload.get("text") or payload.get("refined_text") or "").strip()
    if not refined_text or refined_text == clean_raw:
        return

    transcript = build_transcript_record(
        {},
        fallback_id=transient_id,
        meeting_id=meeting_id,
        user_id=user_id,
        speaker=speaker,
        text=refined_text,
        timestamp=str(audio_started_at),
        audio_started_at=audio_started_at,
        audio_ended_at=audio_ended_at,
        chunk_index=chunk_index,
        canvas_stage=canvas_stage,
        canvas_target_id=canvas_target_id,
        persisted=False,
        persistence_status=TRANSCRIPT_PERSISTENCE_SAVING,
    )
    message = {
        "type": TRANSCRIPT_EVENT_REFINED,
        "meeting_id": meeting_id,
        "transient_id": transient_id,
        "transcript": transcript,
        "canvas_stage": canvas_stage,
        "canvas_target_id": canvas_target_id,
        "raw_text": clean_raw,
        "refined_text": refined_text,
        "refine_used_llm": bool(payload.get("refine_used_llm")),
        "refine_warning": payload.get("refine_warning") or "",
        "refine_confidence": payload.get("confidence"),
        "corrections": payload.get("corrections") or [],
        "uncertain_terms": payload.get("uncertain_terms") or [],
        "context_pack_summary": payload.get("context_pack_summary") or {},
        "refine_elapsed_ms": elapsed_ms,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await broadcast_to_meeting(meeting_id, message)
    remember_recent_transcript(get_fusion_state(meeting_id), transcript)
    if enqueue_bubble:
        await enqueue_ideation_bubble_update(meeting_id, {**transcript, "id": f"{transient_id}:refined"})
    else:
        print(
            "[Bubble][gateway] refined transcript bubble enqueue skipped",
            {
                "meeting_id": meeting_id,
                "reason": "demo_balance_raw_only",
                "transient_id": transient_id,
            },
            flush=True,
        )
    asyncio.create_task(update_refined_transcript_text_with_retry(
        meeting_id=meeting_id,
        user_id=user_id,
        speaker=speaker,
        timestamp=str(audio_started_at),
        refined_text=refined_text,
    ))


async def request_flow_summary(turns: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{AI_BACKEND_URL}/api/stt/flow-summary",
                json={
                    "meeting_id": str(turns[0].get("meeting_id") or "") if turns else "",
                    "turns": [
                        {
                            "speaker": str(turn.get("speaker") or "화자"),
                            "text": str(turn.get("text") or ""),
                            "timestamp": str(turn.get("timestamp") or ""),
                        }
                        for turn in turns
                    ],
                    "max_chars": 30,
                },
            )
            if response.status_code >= 400:
                return {
                    "ok": False,
                    "summary": "",
                    "warning": response.text[:240],
                }
            payload = response.json()
            return payload if isinstance(payload, dict) else {"ok": False, "summary": ""}
    except Exception as exc:
        return {
            "ok": False,
            "summary": "",
            "warning": str(exc),
        }


async def maybe_generate_flow_summary(meeting_id: str, transcript: dict[str, Any]):
    workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
    if isinstance(workspace, dict) and is_demo_balance_config(workspace.get("demo_config")):
        return
    state = get_fusion_state(meeting_id)
    canvas_stage = str(transcript.get("canvas_stage") or "ideation")
    row = {
        "id": transcript.get("id"),
        "meeting_id": meeting_id,
        "speaker": transcript.get("speaker") or "화자",
        "text": transcript.get("text") or "",
        "timestamp": transcript.get("timestamp") or transcript.get("created_at") or datetime.utcnow().isoformat(),
        "stage": canvas_stage,
    }
    if not str(row.get("text") or "").strip():
        return

    async with state.setdefault("flow_summary_lock", asyncio.Lock()):
        buffers = state.setdefault("flow_summary_buffer_by_stage", {})
        if not isinstance(buffers, dict):
            buffers = {}
            state["flow_summary_buffer_by_stage"] = buffers
        buffer = buffers.setdefault(canvas_stage, [])
        buffer.append(row)
        if len(buffer) < 3:
            return
        turns = [dict(item) for item in buffer[:3]]
        del buffer[:3]
        state["flow_summary_seq"] = int(state.get("flow_summary_seq") or 0) + 1
        seq = int(state["flow_summary_seq"])

    result = await request_flow_summary(turns)
    summary = str(result.get("summary") or "").strip()
    if not summary:
        summary = "현재 발언 정리 중"
    summary = summary[:30].strip(" .,!?:;/|\"'")
    item = {
        "id": f"{meeting_id}:flow-summary:{seq}",
        "text": summary or "현재 발언 정리 중",
        "timestamp": datetime.utcnow().isoformat(),
        "stage": canvas_stage,
        "source_turn_ids": [str(turn.get("id") or "") for turn in turns],
        "source_timestamps": [str(turn.get("timestamp") or "") for turn in turns],
        "used_llm": bool(result.get("used_llm")),
        "warning": str(result.get("warning") or ""),
    }

    async with state.setdefault("flow_summary_lock", asyncio.Lock()):
        summaries = state.setdefault("flow_summaries", [])
        summaries.append(item)
        state["flow_summaries"] = summaries[-9:]
        payload_summaries = copy.deepcopy(state["flow_summaries"])

    await broadcast_to_meeting(meeting_id, {
        "type": "stt_flow_summaries_updated",
        "meeting_id": meeting_id,
        "summaries": payload_summaries,
        "latest_summary": item,
        "timestamp": item["timestamp"],
    })


def build_transient_transcript_id(
    meeting_id: str,
    user_id: str,
    bucket_id: int,
    audio_started_at: Any,
    chunk_index: Any,
) -> str:
    started_key = "".join(ch for ch in str(audio_started_at or "") if ch.isalnum())[-18:]
    chunk_key = str(chunk_index if chunk_index is not None else "x").replace(".", "-")
    return f"local-transcript-{meeting_id}-{user_id}-{bucket_id}-{chunk_key}-{started_key or int(time.time() * 1000)}"


def build_transcript_record(
    source: dict[str, Any],
    *,
    fallback_id: str,
    meeting_id: str,
    user_id: str,
    speaker: str,
    text: str,
    timestamp: str,
    audio_started_at: str,
    audio_ended_at: str,
    chunk_index: Any,
    canvas_stage: str,
    canvas_target_id: str,
    persisted: bool,
    persistence_status: str,
) -> dict[str, Any]:
    return {
        "id": source.get("id") or fallback_id,
        "meeting_id": source.get("meeting_id", meeting_id),
        "user_id": source.get("user_id", user_id),
        "speaker": source.get("speaker", speaker),
        "text": source.get("text", text),
        "timestamp": source.get("timestamp") or timestamp,
        "created_at": source.get("created_at") or source.get("timestamp") or timestamp,
        "audio_started_at": audio_started_at,
        "audio_ended_at": audio_ended_at,
        "audio_chunk_index": chunk_index,
        "canvas_stage": source.get("canvas_stage") or canvas_stage,
        "canvas_target_id": source.get("canvas_target_id") or canvas_target_id,
        "transcript_status": TRANSCRIPT_STATUS_FINAL,
        "persisted": persisted,
        "persistence_status": persistence_status,
    }


def build_transcript_persistence_update_message(
    *,
    meeting_id: str,
    transient_id: str,
    transcript: dict[str, Any],
    persisted: bool,
    persistence_status: str,
    retry_attempt: int | None = None,
) -> dict[str, Any]:
    message = {
        "type": TRANSCRIPT_EVENT_PERSISTENCE_UPDATED,
        "meeting_id": meeting_id,
        "transient_id": transient_id,
        "persisted": persisted,
        "persistence_status": persistence_status,
        "transcript": transcript,
        "timestamp": datetime.utcnow().isoformat(),
    }
    if retry_attempt is not None:
        message["retry_attempt"] = retry_attempt
    return message


def build_transcript_persistence_record(
    saved: dict[str, Any] | None,
    *,
    transient_id: str,
    meeting_id: str,
    user_id: str,
    speaker: str,
    text: str,
    audio_started_at: str,
    audio_ended_at: str,
    chunk_index: Any,
    canvas_stage: str,
    canvas_target_id: str,
    persisted: bool,
    persistence_status: str,
) -> dict[str, Any]:
    return build_transcript_record(
        saved or {},
        fallback_id=transient_id,
        meeting_id=meeting_id,
        user_id=user_id,
        speaker=speaker,
        text=text,
        timestamp=str(audio_started_at),
        audio_started_at=audio_started_at,
        audio_ended_at=audio_ended_at,
        chunk_index=chunk_index,
        canvas_stage=canvas_stage,
        canvas_target_id=canvas_target_id,
        persisted=persisted,
        persistence_status=persistence_status,
    )


def query_existing_transcript(supabase: Any, insert_payload: dict[str, Any]):
    try:
        select_fields = TRANSCRIPT_SELECT_FIELDS_WITH_STAGE
        response = select_transcript_by_identity(supabase, insert_payload, select_fields)
    except Exception as exc:
        message = str(exc)
        if "canvas_stage" not in message and "canvas_target_id" not in message:
            raise
        response = select_transcript_by_identity(supabase, insert_payload, TRANSCRIPT_SELECT_FIELDS_BASE)
    return response


def select_transcript_by_identity(supabase: Any, insert_payload: dict[str, Any], select_fields: str):
    query = supabase.table('transcripts').select(select_fields)
    for key in ("meeting_id", "user_id", "speaker", "text", "timestamp"):
        query = query.eq(key, insert_payload[key])
    return query.limit(1).execute()


async def persist_transcript_with_retry(
    *,
    meeting_id: str,
    user_id: str,
    speaker: str,
    text: str,
    transient_id: str,
    bucket_id: int,
    audio_started_at: str,
    audio_ended_at: str,
    chunk_index: Any,
    canvas_stage: str,
    canvas_target_id: str,
    transcription: dict[str, Any],
    reset_seq: int = 0,
):
    last_saved: dict[str, Any] | None = None
    for attempt, delay in enumerate(TRANSCRIPT_PERSIST_RETRY_DELAYS, start=1):
        if delay > 0:
            await asyncio.sleep(delay)

        if int(get_fusion_state(meeting_id).get("reset_seq") or 0) != reset_seq:
            print(
                f"[STT][gateway] skipped transcript persistence after meeting reset bucket_id={bucket_id} "
                f"transient_id={transient_id} reset_seq={get_fusion_state(meeting_id).get('reset_seq')}",
                flush=True,
            )
            return

        saved = await save_transcript(
            meeting_id,
            user_id,
            speaker,
            text,
            transcript_timestamp=str(audio_started_at),
            canvas_stage=canvas_stage,
            canvas_target_id=canvas_target_id,
            fallback_id=transient_id,
        )
        last_saved = saved
        if saved and saved.get("persisted") is not False:
            persisted_transcript = build_transcript_persistence_record(
                saved,
                transient_id=transient_id,
                meeting_id=meeting_id,
                user_id=user_id,
                speaker=speaker,
                text=text,
                audio_started_at=audio_started_at,
                audio_ended_at=audio_ended_at,
                chunk_index=chunk_index,
                canvas_stage=canvas_stage,
                canvas_target_id=canvas_target_id,
                persisted=True,
                persistence_status=TRANSCRIPT_PERSISTENCE_PERSISTED,
            )
            print(
                f"[STT][gateway] transcript persisted bucket_id={bucket_id} "
                f"transient_id={transient_id} transcript_id={persisted_transcript.get('id')} attempt={attempt}",
                flush=True,
            )
            await send_stt_debug(
                meeting_id,
                user_id,
                "transcript_saved",
                bucket_id=bucket_id,
                text_preview=text[:120],
                text_length=len(text),
                transcript_id=persisted_transcript.get("id"),
                transient_id=transient_id,
                elapsed_ms=transcription.get("elapsed_ms"),
                backend_elapsed_ms=transcription.get("backend_elapsed_ms"),
            )
            await broadcast_to_meeting(
                meeting_id,
                build_transcript_persistence_update_message(
                    meeting_id=meeting_id,
                    transient_id=transient_id,
                    persisted=True,
                    persistence_status=TRANSCRIPT_PERSISTENCE_PERSISTED,
                    transcript=persisted_transcript,
                ),
            )
            return

        if attempt < len(TRANSCRIPT_PERSIST_RETRY_DELAYS):
            await broadcast_to_meeting(
                meeting_id,
                build_transcript_persistence_update_message(
                    meeting_id=meeting_id,
                    transient_id=transient_id,
                    persisted=False,
                    persistence_status=TRANSCRIPT_PERSISTENCE_RETRYING,
                    retry_attempt=attempt,
                    transcript=build_transcript_persistence_record(
                        last_saved,
                        transient_id=transient_id,
                        meeting_id=meeting_id,
                        user_id=user_id,
                        speaker=speaker,
                        text=text,
                        audio_started_at=audio_started_at,
                        audio_ended_at=audio_ended_at,
                        chunk_index=chunk_index,
                        canvas_stage=canvas_stage,
                        canvas_target_id=canvas_target_id,
                        persisted=False,
                        persistence_status=TRANSCRIPT_PERSISTENCE_RETRYING,
                    ),
                ),
            )

    print(
        f"[STT][gateway] transcript persist failed bucket_id={bucket_id} "
        f"transient_id={transient_id} attempts={len(TRANSCRIPT_PERSIST_RETRY_DELAYS)}",
        flush=True,
    )
    await send_stt_debug(
        meeting_id,
        user_id,
        "transcript_save_failed",
        bucket_id=bucket_id,
        text_preview=text[:120],
        text_length=len(text),
        transient_id=transient_id,
    )
    await broadcast_to_meeting(
        meeting_id,
        build_transcript_persistence_update_message(
            meeting_id=meeting_id,
            transient_id=transient_id,
            persisted=False,
            persistence_status=TRANSCRIPT_PERSISTENCE_FAILED,
            transcript=build_transcript_persistence_record(
                last_saved,
                transient_id=transient_id,
                meeting_id=meeting_id,
                user_id=user_id,
                speaker=speaker,
                text=text,
                audio_started_at=audio_started_at,
                audio_ended_at=audio_ended_at,
                chunk_index=chunk_index,
                canvas_stage=canvas_stage,
                canvas_target_id=canvas_target_id,
                persisted=False,
                persistence_status=TRANSCRIPT_PERSISTENCE_FAILED,
            ),
        ),
    )


async def transcribe_and_broadcast_winner(
    meeting_id: str,
    bucket_id: int,
    winner: dict[str, Any],
    state: Dict[str, Any],
):
    reset_seq = int(state.get("reset_seq") or 0)
    audio_meta = winner.get("audio_meta") or {}
    audio_started_at = audio_meta.get("started_at") or datetime.utcnow().isoformat()
    audio_ended_at = audio_meta.get("ended_at") or audio_started_at
    chunk_index = audio_meta.get("chunk_index")
    canvas_stage = str(winner.get("canvas_stage") or "ideation")
    canvas_target_id = str(winner.get("canvas_target_id") or "")
    workspace = latest_canvas_workspace_by_meeting.get(meeting_id) or {}
    meeting_goal = str(winner.get("meeting_goal") or workspace.get("meeting_goal") or "").strip()
    meeting_goal_context = str(winner.get("meeting_goal_context") or workspace.get("meeting_goal_context") or "").strip()
    context_pack = build_stt_context_pack(
        state,
        canvas_stage=canvas_stage,
        meeting_goal=meeting_goal,
        meeting_goal_context=meeting_goal_context,
    )
    winner["context_pack"] = context_pack

    print(
        f"[STT][gateway] transcribe winner start meeting_id={meeting_id} bucket_id={bucket_id} "
        f"user_id={winner.get('user_id')} stage={canvas_stage} target={canvas_target_id} "
        f"context_pack_keys={list(context_pack.keys())} audio_meta={audio_meta}",
        flush=True,
    )

    await send_stt_debug(
        meeting_id,
        winner["user_id"],
        "transcription_audio_prepared",
        bucket_id=bucket_id,
        bytes=len(winner.get("audio_bytes") or b""),
        audio_mime=winner.get("audio_mime") or winner.get("audio_meta", {}).get("mime_type") or "audio/wav",
        audio_meta=audio_meta,
        context_pack_summary={
            "recent_utterance_count": len(context_pack.get("recent_utterances") or []),
            "key_term_count": len(context_pack.get("key_terms") or []),
            "has_current_focus": bool(context_pack.get("current_focus")),
        },
        fusion_wait_ms=FUSION_WAIT_MS,
    )
    await send_stt_debug(
        meeting_id,
        winner["user_id"],
        "transcription_started",
        bucket_id=bucket_id,
        backend_url=AI_BACKEND_URL,
    )
    transcription = await transcribe_selected_chunk(winner)
    if int(state.get("reset_seq") or 0) != reset_seq:
        print(
            f"[STT][gateway] dropped transcript after meeting reset bucket_id={bucket_id} "
            f"meeting_id={meeting_id} reset_seq={state.get('reset_seq')}",
            flush=True,
        )
        return
    transcribed_text = transcription.get("text") or ""
    raw_transcribed_text = transcription.get("raw_text") or transcribed_text
    print(
        f"[STT][gateway] transcribe winner result bucket_id={bucket_id} "
        f"status={transcription.get('status')} raw_chars={len(raw_transcribed_text)} "
        f"refined_chars={len(transcribed_text)} refine_used_llm={bool(transcription.get('refine_used_llm'))} "
        f"confidence={transcription.get('refine_confidence')} "
        f"elapsed_ms={transcription.get('elapsed_ms')} backend_elapsed_ms={transcription.get('backend_elapsed_ms')}",
        flush=True,
    )
    if not transcribed_text:
        await send_stt_debug(
            meeting_id,
            winner["user_id"],
            "transcription_empty",
            bucket_id=bucket_id,
            status=transcription.get("status"),
            status_code=transcription.get("status_code"),
            error=transcription.get("error") or "",
            audio_meta=audio_meta,
            bytes=len(winner.get("audio_bytes") or b""),
            elapsed_ms=transcription.get("elapsed_ms"),
            backend_elapsed_ms=transcription.get("backend_elapsed_ms"),
        )
        return

    transient_id = build_transient_transcript_id(
        meeting_id,
        winner["user_id"],
        bucket_id,
        audio_started_at,
        chunk_index,
    )
    finalized_transcript = build_transcript_record(
        {},
        fallback_id=transient_id,
        meeting_id=meeting_id,
        user_id=winner["user_id"],
        speaker=winner["speaker"],
        text=transcribed_text,
        timestamp=str(audio_started_at),
        audio_started_at=audio_started_at,
        audio_ended_at=audio_ended_at,
        chunk_index=chunk_index,
        canvas_stage=canvas_stage,
        canvas_target_id=canvas_target_id,
        persisted=False,
        persistence_status=TRANSCRIPT_PERSISTENCE_SAVING,
    )
    print(
        f"[STT][gateway] transcript finalized bucket_id={bucket_id} transient_id={transient_id} "
        f"chars={len(transcribed_text)}",
        flush=True,
    )
    await send_stt_debug(
        meeting_id,
        winner["user_id"],
        "transcript_finalized",
        bucket_id=bucket_id,
        text_preview=transcribed_text[:120],
        text_length=len(transcribed_text),
        transcript_id=transient_id,
        persistence_status=TRANSCRIPT_PERSISTENCE_SAVING,
        elapsed_ms=transcription.get("elapsed_ms"),
        backend_elapsed_ms=transcription.get("backend_elapsed_ms"),
        raw_text_preview=raw_transcribed_text[:120],
        refine_used_llm=bool(transcription.get("refine_used_llm")),
        refine_warning=transcription.get("refine_warning") or "",
        refine_confidence=transcription.get("refine_confidence"),
        corrections=transcription.get("corrections") or [],
        uncertain_terms=transcription.get("uncertain_terms") or [],
        context_pack_summary=transcription.get("context_pack_summary") or {},
    )
    transcript_message = {
        'type': TRANSCRIPT_EVENT_CREATED,
        'meeting_id': meeting_id,
        'transcript': finalized_transcript,
        'canvas_stage': canvas_stage,
        'canvas_target_id': canvas_target_id,
        'transcript_status': TRANSCRIPT_STATUS_FINAL,
        'persisted': False,
        'persistence_status': TRANSCRIPT_PERSISTENCE_SAVING,
        'stt_elapsed_ms': transcription.get("elapsed_ms"),
        'backend_elapsed_ms': transcription.get("backend_elapsed_ms"),
        'raw_text': raw_transcribed_text,
        'refined_text': transcription.get("refined_text") or transcribed_text,
        'refine_used_llm': bool(transcription.get("refine_used_llm")),
        'refine_warning': transcription.get("refine_warning") or "",
        'refine_confidence': transcription.get("refine_confidence"),
        'corrections': transcription.get("corrections") or [],
        'uncertain_terms': transcription.get("uncertain_terms") or [],
        'context_pack_summary': transcription.get("context_pack_summary") or {},
        'audio_meta': audio_meta,
        'fusion': {
            'bucket_id': bucket_id,
            'selected_user_id': winner["user_id"],
            'audio_started_at': audio_started_at,
            'audio_ended_at': audio_ended_at,
            'chunk_index': chunk_index,
        },
        'timestamp': datetime.utcnow().isoformat(),
    }
    await broadcast_to_meeting(meeting_id, transcript_message)
    remember_recent_transcript(state, finalized_transcript)
    remember_stt_refine_feedback(state, transcription)
    await enqueue_ideation_bubble_update(meeting_id, finalized_transcript)
    latest_workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
    demo_balance_mode = is_demo_balance_config(
        latest_workspace.get("demo_config") if isinstance(latest_workspace, dict) else None
    )
    if not demo_balance_mode:
        asyncio.create_task(maybe_generate_flow_summary(meeting_id, finalized_transcript))
    asyncio.create_task(
        persist_transcript_with_retry(
            meeting_id=meeting_id,
            user_id=winner["user_id"],
            speaker=winner["speaker"],
            text=transcribed_text,
            transient_id=transient_id,
            bucket_id=bucket_id,
            audio_started_at=audio_started_at,
            audio_ended_at=audio_ended_at,
            chunk_index=chunk_index,
            canvas_stage=canvas_stage,
            canvas_target_id=canvas_target_id,
            transcription=transcription,
            reset_seq=reset_seq,
        )
    )
    if transcription.get("refine_deferred") and not demo_balance_mode:
        asyncio.create_task(
            refine_transcript_text_async(
                meeting_id=meeting_id,
                user_id=winner["user_id"],
                transient_id=transient_id,
                speaker=winner["speaker"],
                raw_text=raw_transcribed_text,
                audio_started_at=audio_started_at,
                audio_ended_at=audio_ended_at,
                chunk_index=chunk_index,
                canvas_stage=canvas_stage,
                canvas_target_id=canvas_target_id,
                context_pack=context_pack,
                meeting_goal=meeting_goal,
                meeting_goal_context=meeting_goal_context,
                enqueue_bubble=not demo_balance_mode,
                reset_seq=reset_seq,
            )
        )

    async with state["lock"]:
        state["last_winner_user_id"] = winner["user_id"]
        state["last_winner_bucket"] = bucket_id
        state.setdefault("last_transcript_text_by_user", {})[winner["user_id"]] = transcribed_text[-500:]


async def flush_audio_bucket(meeting_id: str, bucket_id: int):
    await asyncio.sleep(FUSION_WAIT_MS / 1000)
    state = get_fusion_state(meeting_id)

    async with state["lock"]:
        candidates = list(state["buckets"].pop(bucket_id, []))
        state["tasks"].pop(bucket_id, None)
        sticky_user_id = state.get("last_winner_user_id")
        sticky_bucket = state.get("last_winner_bucket")

    print(
        f"[STT][gateway] flush bucket meeting_id={meeting_id} bucket_id={bucket_id} "
        f"candidate_count={len(candidates)} sticky_user_id={sticky_user_id} sticky_bucket={sticky_bucket}",
        flush=True,
    )

    if not candidates:
        return

    winner = pick_dominant_candidate(candidates, sticky_user_id, sticky_bucket, bucket_id)
    if not winner:
        await send_stt_debug(
            meeting_id,
            None,
            "audio_candidate_dropped",
            bucket_id=bucket_id,
            candidate_count=len(candidates),
            reason="below_rms_and_speech_ratio_threshold",
            fusion_wait_ms=FUSION_WAIT_MS,
            thresholds={
                "min_rms": FUSION_MIN_RMS,
                "min_speech_ratio": FUSION_MIN_SPEECH_RATIO,
            },
            candidates=[
                {
                    "user_id": item.get("user_id"),
                    "speaker": item.get("speaker"),
                    "bytes": len(item.get("audio_bytes") or b""),
                    "audio_meta": item.get("audio_meta") or {},
                }
                for item in candidates[:6]
            ],
        )
        return

    print(
        f"[STT][gateway] bucket winner user_id={winner.get('user_id')} speaker={winner.get('speaker')} "
        f"bytes={len(winner.get('audio_bytes') or b'')} audio_meta={winner.get('audio_meta') or {}}",
        flush=True,
    )

    await send_stt_debug(
        meeting_id,
        winner["user_id"],
        "audio_candidate_selected",
        bucket_id=bucket_id,
        candidate_count=len(candidates),
        bytes=len(winner.get("audio_bytes") or b""),
        audio_meta=winner.get("audio_meta") or {},
        fusion_wait_ms=FUSION_WAIT_MS,
    )
    await broadcast_to_meeting(meeting_id, {
        'type': 'audio_selection',
        'meeting_id': meeting_id,
        'selected_user_id': winner["user_id"],
        'speaker': winner["speaker"],
        'bucket_id': bucket_id,
        'timestamp': datetime.utcnow().isoformat(),
    })

    transcription_lock = state.setdefault("transcription_lock", asyncio.Lock())
    async with transcription_lock:
        await transcribe_and_broadcast_winner(meeting_id, bucket_id, winner, state)


async def queue_audio_for_fusion(meeting_id: str, candidate: dict[str, Any]):
    state = get_fusion_state(meeting_id)
    bucket_id = int(candidate["started_at_ms"] // FUSION_BUCKET_MS)
    dropped_buckets: list[int] = []

    async with state["lock"]:
        candidate["device_profile"] = dict(state["device_profiles"].get(candidate["user_id"], {}))
        state["buckets"].setdefault(bucket_id, []).append(candidate)
        print(
            f"[STT][gateway] queue audio meeting_id={meeting_id} bucket_id={bucket_id} "
            f"user_id={candidate.get('user_id')} speaker={candidate.get('speaker')} "
            f"bytes={len(candidate.get('audio_bytes') or b'')} queued={len(state['buckets'].get(bucket_id, []))} "
            f"audio_meta={candidate.get('audio_meta') or {}}",
            flush=True,
        )
        if bucket_id not in state["tasks"]:
            state["tasks"][bucket_id] = asyncio.create_task(flush_audio_bucket(meeting_id, bucket_id))
        workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
        if is_demo_balance_config((workspace or {}).get("demo_config") if isinstance(workspace, dict) else None):
            active_bucket_ids = sorted(int(value) for value in state.get("tasks", {}).keys())
            buckets_to_keep = set(active_bucket_ids[-3:])
            for stale_bucket_id in active_bucket_ids:
                if stale_bucket_id in buckets_to_keep:
                    continue
                state["buckets"].pop(stale_bucket_id, None)
                task = state["tasks"].pop(stale_bucket_id, None)
                if task and not task.done():
                    task.cancel()
                dropped_buckets.append(stale_bucket_id)

    for stale_bucket_id in dropped_buckets:
        await send_stt_debug(
            meeting_id,
            None,
            "transcription_audio_buffered",
            bucket_id=stale_bucket_id,
            reason="demo_backlog_drop",
            retained_recent_buckets=3,
        )


async def persist_canvas_workspace(meeting_id: str, workspace: dict[str, Any]):
    normalized_workspace = dict(workspace or {})
    normalized_workspace["meeting_id"] = meeting_id
    normalized_workspace.pop("stage", None)
    normalized_workspace.pop("sync_id", None)
    normalized_workspace.pop("sync_scope", None)
    normalized_workspace.pop("updated_by", None)
    normalized_workspace.pop("updated_at", None)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{AI_BACKEND_URL}/api/canvas/workspace-patch",
                json=normalized_workspace,
            )
            if response.status_code >= 400:
                print(f"❌ Failed to persist canvas workspace: {response.status_code} {response.text[:200]}")
    except Exception as e:
        print(f"❌ Failed to persist canvas workspace: {e}")


def build_canvas_workspace_patch_for_scope(
    meeting_id: str,
    workspace: dict[str, Any],
    sync_scope: str,
) -> dict[str, Any]:
    fields = CANVAS_WORKSPACE_SYNC_FIELDS if sync_scope == "full" else CANVAS_SCOPED_SYNC_FIELDS.get(sync_scope, set())
    patch = {"meeting_id": meeting_id}
    for field in fields:
        if field in workspace:
            patch[field] = copy.deepcopy(workspace.get(field))
    return patch


def merge_canvas_workspace_patch(
    meeting_id: str,
    current_workspace: dict[str, Any] | None,
    patch: dict[str, Any],
) -> dict[str, Any]:
    merged = copy.deepcopy(current_workspace) if isinstance(current_workspace, dict) else {}
    merged["meeting_id"] = meeting_id
    merged["stage"] = "ideation"
    for field in CANVAS_WORKSPACE_SYNC_FIELDS:
        if field in patch:
            merged[field] = copy.deepcopy(patch.get(field))
    return merged


async def fetch_canvas_workspace(meeting_id: str) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{AI_BACKEND_URL}/api/canvas/workspace-state",
                params={"meeting_id": meeting_id},
            )
            if response.status_code >= 400:
                print(f"❌ Failed to fetch canvas workspace: {response.status_code} {response.text[:200]}")
                return None
            payload = response.json()
            return payload if isinstance(payload, dict) else None
    except Exception as e:
        print(f"❌ Failed to fetch canvas workspace: {e}")
        return None


async def broadcast_to_meeting(meeting_id: str, message: dict, exclude_user: str = None):
    """회의방의 모든 참가자에게 메시지 브로드캐스트"""
    if meeting_id not in active_connections:
        return
    
    disconnected = []
    for conn_info in active_connections[meeting_id]:
        if exclude_user and conn_info['user_id'] == exclude_user:
            continue
            
        try:
            await conn_info['ws'].send_json(message)
        except Exception as e:
            print(f"❌ Failed to send to {conn_info['user_id']}: {e}")
            disconnected.append(conn_info)
    
    # 연결 끊긴 사용자 제거
    for conn_info in disconnected:
        active_connections[meeting_id].remove(conn_info)


def _ideation_bubble_graph_cycle(raw: Any) -> int:
    if not isinstance(raw, dict):
        return 0
    try:
        return max(0, int(float(raw.get("update_cycle") or raw.get("updateCycle") or 0)))
    except (TypeError, ValueError):
        return 0


def _ideation_bubble_coalesce_ms(workspace: dict[str, Any] | None) -> int:
    demo_config = workspace.get("demo_config") if isinstance(workspace, dict) else None
    return DEMO_TEXT_POSTPROCESS_INTERVAL_MS if is_demo_balance_config(demo_config) else IDEATION_BUBBLE_COALESCE_MS


def _ideation_bubble_pause_key(demo_balance_mode: bool, update_mode: str) -> str:
    if not demo_balance_mode:
        return "ideation_bubble_paused_until"
    normalized_mode = str(update_mode or "consolidate").strip().lower()
    if normalized_mode == "local_fast_keywords":
        return "demo_local_fast_bubble_paused_until"
    if normalized_mode == "realtime_text_batch":
        return "demo_text_batch_bubble_paused_until"
    if normalized_mode == "consolidate":
        return "demo_consolidation_bubble_paused_until"
    return f"demo_{normalized_mode}_bubble_paused_until"


async def broadcast_ideation_bubble_graph(meeting_id: str, graph: dict[str, Any], workspace: dict[str, Any]):
    now = datetime.utcnow().isoformat()
    latest_canvas_workspace_by_meeting[meeting_id] = {
        **copy.deepcopy(workspace),
        "meeting_id": meeting_id,
        "stage": "ideation",
        "ideation_bubble_graph": copy.deepcopy(graph),
    }
    sync_payload = {
        "sync_id": f"ideation-bubble-graph-{int(datetime.utcnow().timestamp() * 1000)}",
        "meeting_id": meeting_id,
        "sync_scope": "ideation_bubble_graph",
        "updated_by": "__server__",
        "updated_at": now,
        "stage": "ideation",
        "ideation_bubble_graph": copy.deepcopy(graph),
    }
    await broadcast_to_meeting(meeting_id, {
        "type": "canvas_sync",
        "data": sync_payload,
        "meeting_id": meeting_id,
        "user_id": "__server__",
        "timestamp": now,
    })


async def send_bubble_graph_debug(meeting_id: str, stage: str, **data):
    await broadcast_to_meeting(meeting_id, {
        "type": "bubble_graph_debug",
        "meeting_id": meeting_id,
        "stage": stage,
        "timestamp": datetime.utcnow().isoformat(),
        **data,
    })


async def apply_demo_balance_refined_transcripts(
    meeting_id: str,
    rows: list[dict[str, Any]],
    refined_items: Any,
) -> int:
    if not isinstance(refined_items, list) or not refined_items:
        return 0
    rows_by_id = {
        str(row.get("id") or ""): row
        for row in rows
        if str(row.get("id") or "")
    }
    applied = 0
    state = get_fusion_state(meeting_id)
    for item in refined_items:
        if not isinstance(item, dict):
            continue
        transcript_id = str(item.get("id") or item.get("utterance_id") or item.get("utteranceId") or "")
        row = rows_by_id.get(transcript_id)
        refined_text = str(item.get("text") or item.get("refined_text") or item.get("refinedText") or "").strip()
        if not row or not refined_text:
            continue
        raw_text = str(row.get("text") or "").strip()
        user_id = str(row.get("user_id") or "")
        speaker = str(row.get("speaker") or "참가자")
        timestamp = str(row.get("timestamp") or datetime.utcnow().isoformat())
        transcript = build_transcript_record(
            {},
            fallback_id=transcript_id,
            meeting_id=meeting_id,
            user_id=user_id,
            speaker=speaker,
            text=refined_text,
            timestamp=timestamp,
            audio_started_at=str(row.get("audio_started_at") or timestamp),
            audio_ended_at=str(row.get("audio_ended_at") or timestamp),
            chunk_index=row.get("audio_chunk_index"),
            canvas_stage=str(row.get("canvas_stage") or "ideation"),
            canvas_target_id=str(row.get("canvas_target_id") or ""),
            persisted=False,
            persistence_status=TRANSCRIPT_PERSISTENCE_SAVING,
        )
        await broadcast_to_meeting(meeting_id, {
            "type": TRANSCRIPT_EVENT_REFINED,
            "meeting_id": meeting_id,
            "transient_id": transcript_id,
            "transcript": transcript,
            "canvas_stage": transcript.get("canvas_stage") or "ideation",
            "canvas_target_id": transcript.get("canvas_target_id") or "",
            "raw_text": raw_text,
            "refined_text": refined_text,
            "refine_used_llm": True,
            "refine_warning": "",
            "refine_confidence": item.get("confidence"),
            "corrections": [],
            "uncertain_terms": [],
            "context_pack_summary": {
                "mode": "demo_balance_combined_batch",
                "choice": item.get("choice") or "unclear",
                "valid": bool(item.get("valid", True)),
                "reason": str(item.get("reason") or ""),
            },
            "timestamp": datetime.utcnow().isoformat(),
        })
        remember_recent_transcript(state, transcript)
        if user_id and refined_text != raw_text:
            asyncio.create_task(update_refined_transcript_text_with_retry(
                meeting_id=meeting_id,
                user_id=user_id,
                speaker=speaker,
                timestamp=timestamp,
                refined_text=refined_text,
            ))
        applied += 1
    if applied:
        print(
            "[STT][gateway] demo combined refined transcripts applied",
            {"meeting_id": meeting_id, "count": applied},
            flush=True,
        )
    return applied


async def request_ideation_bubble_graph_update(
    meeting_id: str,
    rows: list[dict[str, str]],
    state: Dict[str, Any],
    update_mode: str = "",
) -> str:
    if not rows:
        return "no_change"
    workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
    if not isinstance(workspace, dict):
        workspace = await fetch_canvas_workspace(meeting_id)
        if isinstance(workspace, dict):
            latest_canvas_workspace_by_meeting[meeting_id] = copy.deepcopy(workspace)
    if not isinstance(workspace, dict):
        print(f"[Bubble][gateway] ideation graph skipped reason=no_workspace meeting_id={meeting_id}", flush=True)
        await send_bubble_graph_debug(meeting_id, "skipped", reason="no_workspace")
        return "failed"

    demo_config = normalize_demo_config(workspace.get("demo_config"))
    demo_balance_mode = is_demo_balance_config(demo_config)
    workspace_stage = str(workspace.get("stage") or workspace.get("canvas_stage") or "ideation")
    if demo_balance_mode and workspace_stage != "ideation":
        async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
            state["demo_local_fast_queue"] = []
            state["demo_consolidation_queue"] = []
            state["demo_local_fast_task"] = None
            state["demo_consolidation_task"] = None
        print(
            "[Bubble][gateway] demo ideation graph skipped reason=workspace_stage_not_ideation",
            {
                "meeting_id": meeting_id,
                "workspace_stage": workspace_stage,
                "update_mode": update_mode,
            },
            flush=True,
        )
        await send_bubble_graph_debug(
            meeting_id,
            "skipped",
            mode="demo_balance",
            update_mode=update_mode,
            reason="workspace_stage_not_ideation",
            workspace_stage=workspace_stage,
        )
        return "no_change"
    pause_key = _ideation_bubble_pause_key(demo_balance_mode, update_mode)
    paused_until = float(state.get(pause_key) or 0.0)
    if paused_until > time.monotonic():
        remaining_ms = round((paused_until - time.monotonic()) * 1000)
        await send_bubble_graph_debug(
            meeting_id,
            "paused",
            reason="failure_backoff",
            update_mode=update_mode if demo_balance_mode else "",
            remaining_ms=remaining_ms,
            slow_backoff_ms=remaining_ms if demo_balance_mode and update_mode == "consolidate" else 0,
        )
        return "paused"
    if demo_balance_mode and update_mode == "local_fast_keywords":
        request_rows = rows[-DEMO_LOCAL_FAST_BUBBLE_MAX_ROWS:]
    elif demo_balance_mode and update_mode == "realtime_text_batch":
        request_rows = rows[-DEMO_TEXT_POSTPROCESS_MAX_ROWS:]
    elif demo_balance_mode:
        request_rows = rows[-12:]
    else:
        request_rows = rows[-8:]
    current_cycle = _ideation_bubble_graph_cycle(workspace.get("ideation_bubble_graph"))

    context_cache = build_ideation_context_cache(state, exclude_id=str(request_rows[-1].get("id") or ""))
    payload = {
        "meeting_id": meeting_id,
        "meeting_topic": str(workspace.get("meeting_goal") or ("밸런스게임" if demo_balance_mode else "회의 주제")),
        "meeting_goal": str(workspace.get("meeting_goal") or ""),
        "meeting_goal_context": str(workspace.get("meeting_goal_context") or ""),
        "demo_config": demo_config,
        "utterances": request_rows,
        "context_cache": context_cache,
        "max_keywords": (
            DEMO_LOCAL_FAST_BUBBLE_MAX_KEYWORDS
            if demo_balance_mode and update_mode == "local_fast_keywords"
            else DEMO_TEXT_POSTPROCESS_MAX_KEYWORDS
            if demo_balance_mode and update_mode == "realtime_text_batch"
            else DEMO_CONSOLIDATION_MAX_KEYWORDS
            if demo_balance_mode
            else IDEATION_BUBBLE_MAX_KEYWORDS
        ),
        "update_mode": update_mode if demo_balance_mode else "",
    }

    started = time.perf_counter()
    try:
        print(
            "[Bubble][gateway] ideation graph request started",
            {
                "meeting_id": meeting_id,
                "mode": "demo_balance" if demo_balance_mode else "normal",
                "update_mode": update_mode if demo_balance_mode else "",
                "rows": len(request_rows),
                "current_cycle": current_cycle,
            },
            flush=True,
        )
        await send_bubble_graph_debug(
            meeting_id,
            "request_started",
            mode="demo_balance" if demo_balance_mode else "normal",
            update_mode=update_mode if demo_balance_mode else "",
            rows=len(request_rows),
            current_cycle=current_cycle,
        )
        timeout = httpx.Timeout(connect=5.0, read=8.0 if demo_balance_mode and update_mode == "local_fast_keywords" else 35.0 if demo_balance_mode and update_mode == "realtime_text_batch" else 90.0, write=10.0, pool=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{AI_BACKEND_URL}/api/canvas/ideation-bubble-graph/update",
                json=payload,
            )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        if response.status_code >= 400:
            error_payload: dict[str, Any] = {}
            try:
                parsed_error = response.json()
                if isinstance(parsed_error, dict):
                    error_payload = parsed_error
            except Exception:
                error_payload = {}
            print(
                f"[Bubble][gateway] ideation graph update failed status={response.status_code} "
                f"elapsed_ms={elapsed_ms} body={response.text[:240]!r}",
                flush=True,
            )
            await send_bubble_graph_debug(
                meeting_id,
                "request_failed",
                status_code=response.status_code,
                elapsed_ms=elapsed_ms,
                body=response.text[:240],
                update_mode=update_mode if demo_balance_mode else "",
                llm_route=error_payload.get("llm_route") if isinstance(error_payload, dict) else None,
                llm_error=error_payload.get("llm_error") if isinstance(error_payload, dict) else None,
            )
            if demo_balance_mode:
                state[pause_key] = time.monotonic() + (IDEATION_BUBBLE_FAILURE_BACKOFF_MS / 1000)
                await send_bubble_graph_debug(
                    meeting_id,
                    "paused",
                    reason="http_error",
                    status_code=response.status_code,
                    update_mode=update_mode if demo_balance_mode else "",
                    duration_ms=IDEATION_BUBBLE_FAILURE_BACKOFF_MS,
                    slow_backoff_ms=IDEATION_BUBBLE_FAILURE_BACKOFF_MS if update_mode == "consolidate" else 0,
                )
                return "paused"
            return "failed"
        result = response.json()
        graph = result.get("bubble_graph") if isinstance(result, dict) else None
        if not isinstance(graph, dict):
            print(
                f"[Bubble][gateway] ideation graph skipped reason=missing_graph "
                f"meeting_id={meeting_id} elapsed_ms={elapsed_ms}",
                flush=True,
            )
            await send_bubble_graph_debug(
                meeting_id,
                "request_failed",
                reason="missing_graph",
                elapsed_ms=elapsed_ms,
            )
            return "failed"
        next_cycle = _ideation_bubble_graph_cycle(graph)
        refined_items = result.get("refined_transcripts") if isinstance(result, dict) else []
        refined_applied_count = 0
        if demo_balance_mode and update_mode in {"realtime_text_batch", "consolidate"}:
            refined_applied_count = await apply_demo_balance_refined_transcripts(meeting_id, request_rows, refined_items)
        print(
            "[Bubble][gateway] ideation graph response",
            {
                "meeting_id": meeting_id,
                "mode": "demo_balance" if demo_balance_mode else "normal",
                "update_mode": update_mode if demo_balance_mode else "",
                "rows": len(request_rows),
                "used_llm": bool(result.get("used_llm")),
                "used_local": bool(result.get("used_local")),
                "reason": result.get("reason") or "",
                "warning": result.get("warning") or "",
                "elapsed_ms": elapsed_ms,
                "cycle": next_cycle,
                "current_cycle": current_cycle,
                "bubbles": len(graph.get("bubbles") or []),
                "llm_route": result.get("llm_route") or {},
                "llm_error": result.get("llm_error") or {},
                "raw_directives": result.get("raw_directives") or {},
                "extractor_route": result.get("extractor_route") or {},
                "layout_debug": (result.get("layout_debug") or [])[:12],
                "refined": refined_applied_count,
                "keywords": result.get("keyword_count"),
                "renames": result.get("rename_count"),
                "merges": result.get("merge_count"),
                "removes": result.get("remove_count"),
                "primary": result.get("primary_count"),
                "promotes": result.get("promote_count"),
                "demotes": result.get("demote_count"),
                "affinity_updates": result.get("affinity_update_count"),
                "alias_merges": result.get("alias_merge_count"),
                "canonicalized": result.get("canonicalized_count"),
                "local_cleanup": result.get("local_cleanup_count"),
                "slow_backoff_ms": result.get("slow_backoff_ms"),
                "overlap_resolved": result.get("overlap_resolved_count"),
                "processed": result.get("processed_count"),
                "active": result.get("active_count"),
                "dimmed": result.get("dimmed_count"),
                "exiting": result.get("exiting_count"),
                "archived": result.get("archived_count"),
                "provisional": result.get("provisional_count"),
            },
            flush=True,
        )
        await send_bubble_graph_debug(
            meeting_id,
            "response",
            mode="demo_balance" if demo_balance_mode else "normal",
            update_mode=update_mode if demo_balance_mode else "",
            rows=len(request_rows),
            used_llm=bool(result.get("used_llm")),
            used_local=bool(result.get("used_local")),
            result_reason=result.get("reason") or "",
            warning=result.get("warning") or "",
            elapsed_ms=elapsed_ms,
            cycle=next_cycle,
            current_cycle=current_cycle,
            bubbles=len(graph.get("bubbles") or []),
            llm_route=result.get("llm_route") or {},
            llm_error=result.get("llm_error") or {},
            raw_directives=result.get("raw_directives") or {},
            extractor_route=result.get("extractor_route") or {},
            layout_debug=(result.get("layout_debug") or [])[:24],
            refined_count=refined_applied_count,
            keyword_count=result.get("keyword_count"),
            rename_count=result.get("rename_count"),
            merge_count=result.get("merge_count"),
            remove_count=result.get("remove_count"),
            primary_count=result.get("primary_count"),
            promote_count=result.get("promote_count"),
            demote_count=result.get("demote_count"),
            affinity_update_count=result.get("affinity_update_count"),
            alias_merge_count=result.get("alias_merge_count"),
            canonicalized_count=result.get("canonicalized_count"),
            local_cleanup_count=result.get("local_cleanup_count"),
            slow_backoff_ms=result.get("slow_backoff_ms"),
            overlap_resolved_count=result.get("overlap_resolved_count"),
            processed_count=result.get("processed_count"),
            active_count=result.get("active_count"),
            dimmed_count=result.get("dimmed_count"),
            exiting_count=result.get("exiting_count"),
            archived_count=result.get("archived_count"),
            provisional_count=result.get("provisional_count"),
        )
        graph_updated = bool(result.get("used_llm") or result.get("used_local"))
        if graph_updated and next_cycle > current_cycle:
            broadcast_steps = result.get("broadcast_steps") if isinstance(result.get("broadcast_steps"), list) else []
            if demo_balance_mode and update_mode == "local_fast_keywords" and broadcast_steps:
                last_broadcast_cycle = current_cycle
                broadcast_count = 0
                for step_index, step in enumerate(broadcast_steps):
                    if not isinstance(step, dict):
                        continue
                    step_graph = step.get("bubble_graph")
                    if not isinstance(step_graph, dict):
                        continue
                    step_cycle = _ideation_bubble_graph_cycle(step_graph)
                    if step_cycle <= last_broadcast_cycle:
                        continue
                    delay_ms = max(0, int(step.get("delay_ms") or 0))
                    if delay_ms > 0:
                        await asyncio.sleep(delay_ms / 1000)
                    step_workspace = copy.deepcopy(workspace)
                    step_workspace["ideation_bubble_graph"] = step_graph
                    step_workspace["demo_config"] = demo_config
                    await broadcast_ideation_bubble_graph(meeting_id, step_graph, step_workspace)
                    last_broadcast_cycle = step_cycle
                    broadcast_count += 1
                    await send_bubble_graph_debug(
                        meeting_id,
                        "broadcast_step",
                        update_mode=update_mode,
                        step_index=step_index,
                        delay_ms=delay_ms,
                        reason=step.get("reason") or "",
                        keyword=step.get("keyword") or "",
                        motion=step.get("motion") or {},
                        cycle=step_cycle,
                        bubbles=len(step_graph.get("bubbles") or []),
                        layout_debug=(step.get("layout_debug") or [])[:16],
                    )
                if broadcast_count > 0:
                    print(
                        "[Bubble][gateway] ideation graph broadcast steps",
                        {
                            "meeting_id": meeting_id,
                            "mode": "demo_balance",
                            "update_mode": update_mode,
                            "steps": broadcast_count,
                            "cycle": last_broadcast_cycle,
                            "bubbles": len(graph.get("bubbles") or []),
                        },
                        flush=True,
                    )
                    return "updated"
            next_workspace = copy.deepcopy(workspace)
            next_workspace["ideation_bubble_graph"] = graph
            if demo_balance_mode:
                next_workspace["demo_config"] = demo_config
            await broadcast_ideation_bubble_graph(meeting_id, graph, next_workspace)
            print(
                "[Bubble][gateway] ideation graph broadcast",
                {
                    "meeting_id": meeting_id,
                    "mode": "demo_balance" if demo_balance_mode else "normal",
                    "update_mode": update_mode if demo_balance_mode else "",
                    "cycle": next_cycle,
                    "bubbles": len(graph.get("bubbles") or []),
                },
                flush=True,
            )
            await send_bubble_graph_debug(
                meeting_id,
                "broadcast",
                update_mode=update_mode if demo_balance_mode else "",
                cycle=next_cycle,
                bubbles=len(graph.get("bubbles") or []),
            )
            return "updated"
        elif graph_updated:
            print(
                f"[Bubble][gateway] ideation graph no broadcast reason=no_graph_change "
                f"meeting_id={meeting_id} mode={'demo_balance' if demo_balance_mode else 'normal'} "
                f"warning={str(result.get('warning') or '')[:120]!r}",
                flush=True,
            )
            await send_bubble_graph_debug(
                meeting_id,
                "no_broadcast",
                reason="no_graph_change",
                update_mode=update_mode if demo_balance_mode else "",
                warning=str(result.get("warning") or "")[:240],
                cycle=next_cycle,
                current_cycle=current_cycle,
            )
            return "no_change"
        else:
            result_reason = str(result.get("reason") or "llm_not_used")
            print(
                f"[Bubble][gateway] ideation graph no broadcast reason={result_reason} "
                f"meeting_id={meeting_id} warning={str(result.get('warning') or '')[:120]!r}",
                flush=True,
            )
            await send_bubble_graph_debug(
                meeting_id,
                "request_failed",
                reason=result_reason,
                update_mode=update_mode if demo_balance_mode else "",
                warning=str(result.get("warning") or "")[:240],
                elapsed_ms=elapsed_ms,
                llm_route=result.get("llm_route") or {},
                llm_error=result.get("llm_error") or {},
            )
            if result_reason in {"llm_not_ready", "llm_exception"}:
                state[pause_key] = time.monotonic() + (IDEATION_BUBBLE_FAILURE_BACKOFF_MS / 1000)
                await send_bubble_graph_debug(
                    meeting_id,
                    "paused",
                    reason=result_reason,
                    update_mode=update_mode if demo_balance_mode else "",
                    duration_ms=IDEATION_BUBBLE_FAILURE_BACKOFF_MS,
                    slow_backoff_ms=IDEATION_BUBBLE_FAILURE_BACKOFF_MS if demo_balance_mode and update_mode == "consolidate" else 0,
                )
                return "paused"
            return "no_change" if result_reason == "no_rows" else "failed"
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        error_type = type(exc).__name__
        error_repr = repr(exc)
        print(
            f"[Bubble][gateway] ideation graph update exception meeting_id={meeting_id} "
            f"elapsed_ms={elapsed_ms} error_type={error_type} error={error_repr}",
            flush=True,
        )
        await send_bubble_graph_debug(
            meeting_id,
            "request_exception",
            update_mode=update_mode,
            elapsed_ms=elapsed_ms,
            error_type=error_type,
            error=error_repr,
        )
        state[pause_key] = time.monotonic() + (IDEATION_BUBBLE_FAILURE_BACKOFF_MS / 1000)
        await send_bubble_graph_debug(
            meeting_id,
            "paused",
            reason="request_exception",
            update_mode=update_mode,
            duration_ms=IDEATION_BUBBLE_FAILURE_BACKOFF_MS,
            slow_backoff_ms=IDEATION_BUBBLE_FAILURE_BACKOFF_MS if demo_balance_mode and update_mode == "consolidate" else 0,
        )
        return "paused"


async def flush_ideation_bubble_queue(meeting_id: str, delay_ms: int, update_mode: str = ""):
    await asyncio.sleep(max(0, delay_ms) / 1000)
    state = get_fusion_state(meeting_id)
    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        retry_rows = list(state.get("ideation_bubble_retry_rows") or [])
        queued_rows = list(state.get("ideation_bubble_queue") or [])
        state["ideation_bubble_queue"] = []
        state["ideation_bubble_retry_rows"] = []
    rows_by_id: dict[str, dict[str, str]] = {}
    for row in [*retry_rows, *queued_rows]:
        row_id = str(row.get("id") or "")
        if row_id:
            rows_by_id[row_id] = row
    rows = list(rows_by_id.values())

    result = "no_change"
    next_retry_delay_ms: int | None = None
    if rows:
        result = await request_ideation_bubble_graph_update(meeting_id, rows, state, update_mode)
        if result == "failed":
            workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
            demo_balance_mode = is_demo_balance_config(workspace.get("demo_config") if isinstance(workspace, dict) else None)
            async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
                state["ideation_bubble_retry_rows"] = rows[-12:] if demo_balance_mode else rows[-24:]
            print(
                "[Bubble][gateway] ideation graph retained retry rows",
                {
                    "meeting_id": meeting_id,
                    "result": result,
                    "retry_count": len(rows[-12:] if demo_balance_mode else rows[-24:]),
                },
                flush=True,
            )
        elif result == "paused":
            workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
            demo_balance_mode = is_demo_balance_config(workspace.get("demo_config") if isinstance(workspace, dict) else None)
            if demo_balance_mode:
                async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
                    state["ideation_bubble_retry_rows"] = rows[-12:]
                    pause_retry_count = int(state.get("ideation_bubble_pause_retry_count") or 0)
                    if pause_retry_count < 1:
                        state["ideation_bubble_pause_retry_count"] = pause_retry_count + 1
                        next_retry_delay_ms = IDEATION_BUBBLE_FAILURE_BACKOFF_MS + 250
                    else:
                        state["ideation_bubble_pause_retry_count"] = 0
            print(
                "[Bubble][gateway] ideation graph retry paused",
                {
                    "meeting_id": meeting_id,
                    "rows": len(rows),
                    "backoff_ms": IDEATION_BUBBLE_FAILURE_BACKOFF_MS,
                    "scheduled_retry_ms": next_retry_delay_ms,
                },
                flush=True,
            )
        elif result == "no_change":
            print(
                "[Bubble][gateway] ideation graph retry skipped",
                {
                    "meeting_id": meeting_id,
                    "result": result,
                    "rows": len(rows),
                },
                flush=True,
            )

    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        state["ideation_bubble_task"] = None
        if result != "paused":
            state["ideation_bubble_pause_retry_count"] = 0
        if next_retry_delay_ms is not None:
            state["ideation_bubble_task"] = asyncio.create_task(flush_ideation_bubble_queue(meeting_id, next_retry_delay_ms, update_mode))
        elif state.get("ideation_bubble_queue") and state.get("ideation_bubble_task") is None:
            workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
            next_delay_ms = _ideation_bubble_coalesce_ms(workspace if isinstance(workspace, dict) else None)
            next_update_mode = "local_fast_keywords" if isinstance(workspace, dict) and is_demo_balance_config(workspace.get("demo_config")) else update_mode
            state["ideation_bubble_task"] = asyncio.create_task(flush_ideation_bubble_queue(meeting_id, next_delay_ms, next_update_mode))


async def flush_demo_local_fast_bubble_queue(meeting_id: str, delay_ms: int = DEMO_LOCAL_FAST_BUBBLE_COALESCE_MS):
    await asyncio.sleep(max(0, delay_ms) / 1000)
    state = get_fusion_state(meeting_id)
    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        queued_rows = list(state.get("demo_local_fast_queue") or [])
        state["demo_local_fast_queue"] = []
    rows_by_id: dict[str, dict[str, str]] = {}
    for row in queued_rows:
        row_id = str(row.get("id") or "")
        if row_id:
            rows_by_id[row_id] = row
    rows = list(rows_by_id.values())

    result = "no_change"
    next_delay_ms = DEMO_LOCAL_FAST_BUBBLE_COALESCE_MS
    if rows:
        result = await request_ideation_bubble_graph_update(
            meeting_id,
            rows[-DEMO_LOCAL_FAST_BUBBLE_MAX_ROWS:],
            state,
            "local_fast_keywords",
        )
        if result in {"failed", "paused"}:
            next_delay_ms = (
                IDEATION_BUBBLE_FAILURE_BACKOFF_MS + 250
                if result == "paused"
                else DEMO_LOCAL_FAST_BUBBLE_COALESCE_MS
            )
            async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
                retained_rows = list(state.get("demo_local_fast_queue") or [])
                retained_by_id: dict[str, dict[str, str]] = {}
                for row in [*rows, *retained_rows]:
                    row_id = str(row.get("id") or "")
                    if row_id:
                        retained_by_id[row_id] = row
                state["demo_local_fast_queue"] = list(retained_by_id.values())[-DEMO_LOCAL_FAST_BUBBLE_RETAIN_ROWS:]
            print(
                "[Bubble][gateway] demo local fast retained rows",
                {
                    "meeting_id": meeting_id,
                    "result": result,
                    "rows": len(rows),
                    "next_delay_ms": next_delay_ms,
                },
                flush=True,
            )
            await send_bubble_graph_debug(
                meeting_id,
                "queued",
                mode="demo_balance",
                update_mode="local_fast_keywords",
                reason=f"{result}_retained",
                queue_size=len(state.get("demo_local_fast_queue") or []),
                delay_ms=next_delay_ms,
            )

    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        state["demo_local_fast_task"] = None
        if state.get("demo_local_fast_queue") and state.get("demo_local_fast_task") is None:
            state["demo_local_fast_task"] = asyncio.create_task(
                flush_demo_local_fast_bubble_queue(meeting_id, next_delay_ms)
            )


async def flush_demo_balance_consolidation_queue(meeting_id: str, delay_ms: int = DEMO_CONSOLIDATION_INTERVAL_MS):
    await asyncio.sleep(max(0, delay_ms) / 1000)
    state = get_fusion_state(meeting_id)
    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        queued_rows = list(state.get("demo_consolidation_queue") or [])
        state["demo_consolidation_queue"] = []
    rows_by_id: dict[str, dict[str, str]] = {}
    for row in queued_rows:
        row_id = str(row.get("id") or "")
        if row_id:
            rows_by_id[row_id] = row
    rows = list(rows_by_id.values())

    result = "no_change"
    if rows:
        result = await request_ideation_bubble_graph_update(meeting_id, rows[-12:], state, "consolidate")
        if result in {"failed", "paused"}:
            async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
                retained_rows = list(state.get("demo_consolidation_queue") or [])
                retained_by_id: dict[str, dict[str, str]] = {}
                for row in [*rows[-12:], *retained_rows]:
                    row_id = str(row.get("id") or "")
                    if row_id:
                        retained_by_id[row_id] = row
                state["demo_consolidation_queue"] = list(retained_by_id.values())[-24:]
            print(
                "[Bubble][gateway] demo consolidation retained rows",
                {
                    "meeting_id": meeting_id,
                    "result": result,
                    "rows": len(rows),
                },
                flush=True,
            )

    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        state["demo_consolidation_task"] = None
        if state.get("demo_consolidation_queue") and state.get("demo_consolidation_task") is None:
            state["demo_consolidation_task"] = asyncio.create_task(
                flush_demo_balance_consolidation_queue(meeting_id, DEMO_CONSOLIDATION_INTERVAL_MS)
            )


async def enqueue_ideation_bubble_update(meeting_id: str, transcript: dict[str, Any]):
    if str(transcript.get("canvas_stage") or "ideation") != "ideation":
        print(
            f"[Bubble][gateway] ideation graph skipped reason=stage_not_ideation "
            f"meeting_id={meeting_id} stage={str(transcript.get('canvas_stage') or '')}",
            flush=True,
        )
        return
    workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
    if not isinstance(workspace, dict):
        workspace = await fetch_canvas_workspace(meeting_id)
        if isinstance(workspace, dict):
            latest_canvas_workspace_by_meeting[meeting_id] = copy.deepcopy(workspace)
    if not isinstance(workspace, dict):
        print(f"[Bubble][gateway] ideation graph skipped reason=no_workspace meeting_id={meeting_id}", flush=True)
        return
    demo_balance_mode = is_demo_balance_config(workspace.get("demo_config"))
    row = {
        "id": str(transcript.get("id") or ""),
        "meeting_id": meeting_id,
        "user_id": str(transcript.get("user_id") or ""),
        "speaker": str(transcript.get("speaker") or "참가자"),
        "text": str(transcript.get("text") or "").strip(),
        "timestamp": str(transcript.get("timestamp") or transcript.get("created_at") or datetime.utcnow().isoformat()),
        "audio_started_at": str(transcript.get("audio_started_at") or transcript.get("timestamp") or transcript.get("created_at") or ""),
        "audio_ended_at": str(transcript.get("audio_ended_at") or transcript.get("timestamp") or transcript.get("created_at") or ""),
        "audio_chunk_index": transcript.get("audio_chunk_index"),
        "canvas_stage": str(transcript.get("canvas_stage") or "ideation"),
        "canvas_target_id": str(transcript.get("canvas_target_id") or ""),
    }
    if not row["id"] or not row["text"]:
        print(
            f"[Bubble][gateway] ideation graph skipped reason=empty_transcript "
            f"meeting_id={meeting_id} id={row['id']!r}",
            flush=True,
        )
        return
    state = get_fusion_state(meeting_id)
    if demo_balance_mode:
        async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
            consolidation_rows = [
                item
                for item in (state.get("demo_consolidation_queue") or [])
                if item.get("id") != row["id"]
            ]
            consolidation_rows.append(row)
            state["demo_consolidation_queue"] = consolidation_rows[-24:]
            if state.get("demo_consolidation_task") is None:
                state["demo_consolidation_task"] = asyncio.create_task(
                    flush_demo_balance_consolidation_queue(meeting_id, DEMO_CONSOLIDATION_INTERVAL_MS)
                )
            consolidation_queue_size = len(state.get("demo_consolidation_queue") or [])
        await send_bubble_graph_debug(
            meeting_id,
            "queued",
            mode="demo_balance",
            update_mode="consolidate",
            queue_size=consolidation_queue_size,
            delay_ms=DEMO_CONSOLIDATION_INTERVAL_MS,
        )

        async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
            fast_rows = [
                item
                for item in (state.get("demo_local_fast_queue") or [])
                if item.get("id") != row["id"]
            ]
            fast_rows.append(row)
            state["demo_local_fast_queue"] = fast_rows[-DEMO_LOCAL_FAST_BUBBLE_RETAIN_ROWS:]
            if state.get("demo_local_fast_task") is None:
                state["demo_local_fast_task"] = asyncio.create_task(
                    flush_demo_local_fast_bubble_queue(meeting_id, DEMO_LOCAL_FAST_BUBBLE_COALESCE_MS)
                )
            fast_queue_size = len(state.get("demo_local_fast_queue") or [])
        print(
            "[Bubble][gateway] demo local fast queued",
            {
                "meeting_id": meeting_id,
                "queue_size": fast_queue_size,
                "delay_ms": DEMO_LOCAL_FAST_BUBBLE_COALESCE_MS,
            },
            flush=True,
        )
        await send_bubble_graph_debug(
            meeting_id,
            "queued",
            mode="demo_balance",
            update_mode="local_fast_keywords",
            queue_size=fast_queue_size,
            delay_ms=DEMO_LOCAL_FAST_BUBBLE_COALESCE_MS,
        )
        return

    paused_until = float(state.get("ideation_bubble_paused_until") or 0.0)
    if paused_until > time.monotonic():
        remaining_ms = round((paused_until - time.monotonic()) * 1000)
        print(
            "[Bubble][gateway] ideation graph skipped reason=failure_backoff",
            {
                "meeting_id": meeting_id,
                "remaining_ms": remaining_ms,
            },
            flush=True,
        )
        await send_bubble_graph_debug(
            meeting_id,
            "skipped",
            reason="failure_backoff",
            remaining_ms=remaining_ms,
        )
        return
    async with state.setdefault("ideation_bubble_lock", asyncio.Lock()):
        queue = [item for item in (state.get("ideation_bubble_queue") or []) if item.get("id") != row["id"]]
        queue.append(row)
        state["ideation_bubble_queue"] = queue[-24:]
        if state.get("ideation_bubble_task") is None:
            delay_ms = _ideation_bubble_coalesce_ms(workspace)
            state["ideation_bubble_task"] = asyncio.create_task(
                flush_ideation_bubble_queue(meeting_id, delay_ms, "")
            )
        print(
            "[Bubble][gateway] ideation graph queued",
            {
                "meeting_id": meeting_id,
                "mode": "normal",
                "update_mode": "",
                "queue_size": len(state.get("ideation_bubble_queue") or []),
                "delay_ms": _ideation_bubble_coalesce_ms(workspace),
            },
            flush=True,
        )
        queue_size = len(state.get("ideation_bubble_queue") or [])
        delay_ms = _ideation_bubble_coalesce_ms(workspace)
    await send_bubble_graph_debug(
        meeting_id,
        "queued",
        mode="normal",
        update_mode="",
        queue_size=queue_size,
        delay_ms=delay_ms,
    )


async def send_stt_debug(meeting_id: str, user_id: str | None, stage: str, **data):
    summary_text = build_stt_progress_summary(stage, data)
    if summary_text:
        await update_stt_summary(meeting_id, summary_text, stage, user_id)

    message = {
        "type": "stt_debug",
        "meeting_id": meeting_id,
        "user_id": user_id,
        "stage": stage,
        "timestamp": datetime.utcnow().isoformat(),
        **data,
    }
    if not user_id:
        await broadcast_to_meeting(meeting_id, message)
        return

    for conn_info in list(active_connections.get(meeting_id, [])):
        if conn_info.get("user_id") != user_id:
            continue
        try:
            await conn_info["ws"].send_json(message)
        except Exception as e:
            print(f"❌ Failed to send STT debug to {user_id}: {e}")


async def save_transcript(
    meeting_id: str,
    user_id: str,
    speaker: str,
    text: str,
    transcript_timestamp: str | None = None,
    canvas_stage: str = "ideation",
    canvas_target_id: str = "",
    fallback_id: str = "",
) -> dict[str, Any] | None:
    """전사 결과를 Supabase에 저장"""
    normalized_text = (text or "").strip()
    if not normalized_text:
        return None
    transcript_timestamp = transcript_timestamp or datetime.utcnow().isoformat()
    insert_payload = {
        'meeting_id': meeting_id,
        'user_id': user_id,
        'speaker': speaker,
        'text': normalized_text,
        'timestamp': transcript_timestamp,
        'canvas_stage': canvas_stage,
        'canvas_target_id': canvas_target_id,
    }

    try:
        supabase = get_supabase()
        existing_response = query_existing_transcript(supabase, insert_payload)
        existing_rows = existing_response.data or []
        if existing_rows and isinstance(existing_rows[0], dict):
            print(
                f"[STT][gateway] duplicate transcript skipped id={existing_rows[0].get('id')} "
                f"meeting_id={meeting_id} user_id={user_id}",
                flush=True,
            )
            return {
                **existing_rows[0],
                "canvas_stage": existing_rows[0].get("canvas_stage") or canvas_stage,
                "canvas_target_id": existing_rows[0].get("canvas_target_id") or canvas_target_id,
                "persisted": True,
            }

        try:
            response = supabase.table('transcripts').insert(insert_payload).execute()
        except Exception as exc:
            message = str(exc)
            if "canvas_stage" not in message and "canvas_target_id" not in message:
                raise
            fallback_payload = {
                key: value
                for key, value in insert_payload.items()
                if key not in {"canvas_stage", "canvas_target_id"}
            }
            response = supabase.table('transcripts').insert(fallback_payload).execute()
        print(f"💾 Saved transcript: {speaker}: {normalized_text[:50]}...")
        rows = response.data or []
        if rows and isinstance(rows[0], dict):
            return {
                **rows[0],
                "canvas_stage": canvas_stage,
                "canvas_target_id": canvas_target_id,
                "persisted": True,
            }
        return {
            **insert_payload,
            "id": fallback_id or f"transcript-{meeting_id}-{user_id}-{int(time.time() * 1000)}",
            "persisted": True,
        }
    except Exception as e:
        print(f"❌ Failed to save transcript: {e}")
    fallback_id = fallback_id or f"local-transcript-{meeting_id}-{user_id}-{int(time.time() * 1000)}"
    print(f"[STT][gateway] transcript persistence deferred id={fallback_id}", flush=True)
    return {
        **insert_payload,
        "id": fallback_id,
        "persisted": False,
    }


async def update_refined_transcript_text_with_retry(
    *,
    meeting_id: str,
    user_id: str,
    speaker: str,
    timestamp: str,
    refined_text: str,
):
    clean_text = str(refined_text or "").strip()
    if not clean_text:
        return
    for attempt, delay in enumerate((0.0, 2.0, 6.0), start=1):
        if delay > 0:
            await asyncio.sleep(delay)
        try:
            supabase = get_supabase()
            response = (
                supabase.table("transcripts")
                .update({"text": clean_text})
                .eq("meeting_id", meeting_id)
                .eq("user_id", user_id)
                .eq("speaker", speaker)
                .eq("timestamp", timestamp)
                .execute()
            )
            rows = response.data or []
            if rows:
                print(
                    f"[STT][gateway] refined transcript persisted meeting_id={meeting_id} "
                    f"user_id={user_id} attempt={attempt}",
                    flush=True,
                )
                return
        except Exception as exc:
            print(
                f"[STT][gateway] refined transcript update failed attempt={attempt} "
                f"meeting_id={meeting_id} error={exc}",
                flush=True,
            )


@router.websocket("/ws/{meeting_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    meeting_id: str,
    user_id: str = Query(...)
):
    client_ip = extract_client_ip(websocket.headers, websocket.client.host if websocket.client else None)
    if not is_ip_allowed(client_ip, IP_WHITELIST):
        await websocket.close(code=1008, reason="IP not allowed")
        return

    await websocket.accept()
    print(f"✅ User {user_id} connected to meeting {meeting_id}")
    
    # 회의방에 연결 추가
    if meeting_id not in active_connections:
        active_connections[meeting_id] = []
    
    conn_info = {
        'ws': websocket,
        'user_id': user_id
    }
    active_connections[meeting_id].append(conn_info)

    current_workspace = copy.deepcopy(latest_canvas_workspace_by_meeting.get(meeting_id))
    if not isinstance(current_workspace, dict):
        current_workspace = await fetch_canvas_workspace(meeting_id)
        if isinstance(current_workspace, dict):
            latest_canvas_workspace_by_meeting[meeting_id] = copy.deepcopy(current_workspace)
    if current_workspace:
        try:
            await websocket.send_json({
                'type': 'canvas_sync',
                'sync_id': f"initial-{meeting_id}-{int(datetime.utcnow().timestamp() * 1000)}",
                'meeting_id': meeting_id,
                'updated_by': '__server__',
                'updated_at': datetime.utcnow().isoformat(),
                'stage': 'ideation',
                'agenda_overrides': current_workspace.get('agenda_overrides') or {},
                'canvas_items': current_workspace.get('canvas_items') or [],
                'custom_groups': current_workspace.get('custom_groups') or [],
                'problem_groups': current_workspace.get('problem_groups') or [],
                'problem_structure': current_workspace.get('problem_structure') or {
                    'phase': 'explore',
                    'method': 'affinity',
                    'mode': '',
                    'nodes': [],
                    'groups': [],
                },
                'solution_topics': current_workspace.get('solution_topics') or [],
                'final_solution_summary': current_workspace.get('final_solution_summary') or {
                    'final_count': 0,
                    'topics': [],
                    'items': [],
                    'markdown': '',
                },
                'node_positions': current_workspace.get('node_positions') or {},
                'artifact_generation': current_workspace.get('artifact_generation') or {},
                'ideation_bubble_graph': current_workspace.get('ideation_bubble_graph') or {},
                'imported_state': current_workspace.get('imported_state'),
                'meeting_goal': current_workspace.get('meeting_goal') or '',
                'meeting_goal_context': current_workspace.get('meeting_goal_context') or '',
                'demo_config': current_workspace.get('demo_config') or {},
                'demo_balance_classification': current_workspace.get('demo_balance_classification') or {},
            })
        except Exception as e:
            print(f"❌ Failed to send initial canvas sync to {user_id}: {e}")

    current_stt_summary = copy.deepcopy(latest_stt_summary_by_meeting.get(meeting_id))
    if isinstance(current_stt_summary, dict) and current_stt_summary.get("text"):
        try:
            await websocket.send_json({
                'type': 'stt_summary_updated',
                'meeting_id': meeting_id,
                'summary': current_stt_summary,
                'summary_text': current_stt_summary.get("text"),
                'timestamp': current_stt_summary.get("updated_at") or datetime.utcnow().isoformat(),
            })
        except Exception as e:
            print(f"❌ Failed to send initial STT summary to {user_id}: {e}")

    current_flow_summaries = []
    current_fusion_state = fusion_states.get(meeting_id)
    if isinstance(current_fusion_state, dict):
        current_flow_summaries = copy.deepcopy(current_fusion_state.get("flow_summaries") or [])
    if current_flow_summaries:
        try:
            await websocket.send_json({
                'type': 'stt_flow_summaries_updated',
                'meeting_id': meeting_id,
                'summaries': current_flow_summaries,
                'latest_summary': current_flow_summaries[-1],
                'timestamp': datetime.utcnow().isoformat(),
            })
        except Exception as e:
            print(f"❌ Failed to send initial STT flow summaries to {user_id}: {e}")

    # 참가자 입장 알림
    await broadcast_to_meeting(meeting_id, {
        'type': 'user_joined',
        'user_id': user_id,
        'timestamp': datetime.utcnow().isoformat()
    })
    
    try:
        while True:
            # 클라이언트로부터 메시지 수신
            message = await websocket.receive_json()
            message_type = message.get('type')
            
            if message_type == 'audio_chunk':
                # 오디오 청크 처리
                audio_data = message.get('audio_data')  # base64 encoded
                speaker = message.get('speaker', f'User_{user_id[:8]}')
                audio_meta = normalize_audio_meta(message.get('audio_meta') or {})
                audio_mime = str(message.get('audio_mime') or audio_meta.get("mime_type") or "audio/wav")
                audio_filename = str(message.get('audio_filename') or ("chunk.wav" if audio_mime.lower().startswith("audio/wav") else "chunk.webm"))
                workspace = latest_canvas_workspace_by_meeting.get(meeting_id) or {}
                meeting_goal = str(message.get("meeting_goal") or workspace.get("meeting_goal") or "").strip()
                meeting_goal_context = str(message.get("meeting_goal_context") or workspace.get("meeting_goal_context") or "").strip()
                canvas_stage = str(message.get("canvas_stage") or workspace.get("stage") or "ideation").strip() or "ideation"
                if canvas_stage not in {"ideation", "problem-definition", "solution"}:
                    canvas_stage = "ideation"
                canvas_target_id = str(message.get("canvas_target_id") or "").strip()
                
                try:
                    audio_bytes = base64.b64decode(audio_data)
                    await send_stt_debug(
                        meeting_id,
                        user_id,
                        "audio_chunk_received",
                        bytes=len(audio_bytes),
                        speaker=speaker,
                        audio_meta=audio_meta,
                        fusion_wait_ms=FUSION_WAIT_MS,
                    )
                    candidate = {
                        "meeting_id": meeting_id,
                        "user_id": user_id,
                        "speaker": speaker,
                        "audio_bytes": audio_bytes,
                        "audio_mime": audio_mime,
                        "audio_filename": audio_filename,
                        "audio_meta": audio_meta,
                        "meeting_goal": meeting_goal,
                        "meeting_goal_context": meeting_goal_context,
                        "canvas_stage": canvas_stage,
                        "canvas_target_id": canvas_target_id,
                        "started_at_ms": iso_to_epoch_ms(audio_meta.get("started_at") or message.get("timestamp")),
                    }
                    await queue_audio_for_fusion(meeting_id, candidate)
                    await send_stt_debug(
                        meeting_id,
                        user_id,
                        "audio_chunk_queued",
                        bucket_id=int(candidate["started_at_ms"] // FUSION_BUCKET_MS),
                        bytes=len(audio_bytes),
                        audio_meta=audio_meta,
                        fusion_wait_ms=FUSION_WAIT_MS,
                    )
                except Exception as e:
                    import traceback
                    print(f"❌ Error processing audio chunk: {e}")
                    print(f"❌ Full traceback:")
                    traceback.print_exc()
                    await send_stt_debug(
                        meeting_id,
                        user_id,
                        "audio_chunk_error",
                        error=str(e),
                    )
            
            elif message_type == 'request_analysis':
                # 분석 요청 처리
                try:
                    supabase = get_supabase()
                    
                    # 최근 전사 데이터 가져오기
                    transcripts_response = supabase.table('transcripts') \
                        .select('*') \
                        .eq('meeting_id', meeting_id) \
                        .order('timestamp', desc=False) \
                        .execute()
                    
                    transcripts = transcripts_response.data
                    
                    if len(transcripts) >= 4:  # 최소 4개 발화 이상
                        # AI 백엔드로 분석 요청
                        async with httpx.AsyncClient(timeout=120.0) as client:
                            response = await client.post(
                                f"{AI_BACKEND_URL}/api/tick-analysis",
                                json={'transcripts': transcripts}
                            )
                            
                            if response.status_code == 200:
                                analysis = response.json()
                                
                                # 분석 결과 브로드캐스트
                                await broadcast_to_meeting(meeting_id, {
                                    'type': 'analysis_update',
                                    'data': analysis,
                                    'timestamp': datetime.utcnow().isoformat()
                                })
                except Exception as e:
                    print(f"❌ Error in analysis: {e}")

            elif message_type == 'canvas_sync':
                workspace = message.get('workspace') or {}
                if not isinstance(workspace, dict):
                    continue

                sync_scope = str(workspace.get('sync_scope') or 'full').strip()
                if sync_scope not in {
                    'full',
                    'node_positions',
                    'artifact_generation',
                    'ideation_bubble_graph',
                    'problem_groups',
                    'problem_structure',
                    'summary_document',
                    'meeting_goal',
                    'meeting_room_reset',
                }:
                    sync_scope = 'full'

                if sync_scope == 'node_positions':
                    node_positions = copy.deepcopy(workspace.get('node_positions') or {})
                    stage = str(workspace.get('stage') or 'ideation').strip()
                    if stage not in {'ideation', 'problem-definition', 'solution'}:
                        stage = 'ideation'

                    current_workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
                    if not isinstance(current_workspace, dict):
                        current_workspace = {'meeting_id': meeting_id}
                    current_workspace = copy.deepcopy(current_workspace)
                    current_workspace['meeting_id'] = meeting_id
                    current_workspace['node_positions'] = node_positions
                    latest_canvas_workspace_by_meeting[meeting_id] = copy.deepcopy(current_workspace)

                    sync_message = {
                        'type': 'canvas_sync',
                        'data': {
                            'sync_id': str(workspace.get('sync_id') or f"node-positions-{int(datetime.utcnow().timestamp() * 1000)}"),
                            'meeting_id': meeting_id,
                            'sync_scope': 'node_positions',
                            'updated_by': user_id,
                            'updated_at': datetime.utcnow().isoformat(),
                            'stage': stage,
                            'node_positions': node_positions,
                        },
                        'meeting_id': meeting_id,
                        'user_id': user_id,
                        'timestamp': datetime.utcnow().isoformat(),
                    }
                    await broadcast_to_meeting(meeting_id, sync_message, exclude_user=user_id)
                    continue

                workspace['meeting_id'] = meeting_id
                workspace['stage'] = 'ideation'
                if sync_scope == 'meeting_room_reset':
                    await reset_meeting_room_runtime_state(meeting_id)
                patch_workspace = build_canvas_workspace_patch_for_scope(meeting_id, workspace, sync_scope)
                if sync_scope != 'full' and len(patch_workspace) <= 1:
                    continue

                current_workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
                shared_workspace = merge_canvas_workspace_patch(meeting_id, current_workspace, patch_workspace)
                latest_canvas_workspace_by_meeting[meeting_id] = copy.deepcopy(shared_workspace)
                broadcast_payload = {
                    'sync_id': str(workspace.get('sync_id') or f"{sync_scope}-{int(datetime.utcnow().timestamp() * 1000)}"),
                    'meeting_id': meeting_id,
                    'sync_scope': sync_scope,
                    'updated_by': user_id,
                    'updated_at': datetime.utcnow().isoformat(),
                    'stage': 'ideation',
                }
                for field in CANVAS_WORKSPACE_SYNC_FIELDS:
                    if field in patch_workspace:
                        broadcast_payload[field] = copy.deepcopy(patch_workspace.get(field))
                sync_message = {
                    'type': 'canvas_sync',
                    'data': broadcast_payload,
                    'meeting_id': meeting_id,
                    'user_id': user_id,
                    'timestamp': datetime.utcnow().isoformat(),
                }

                await asyncio.gather(
                    persist_canvas_workspace(meeting_id, patch_workspace),
                    broadcast_to_meeting(meeting_id, sync_message, exclude_user=user_id),
                )

            elif message_type == 'canvas_node_preview':
                node_id = str(message.get('node_id') or '').strip()
                if not node_id:
                    continue

                stage = str(message.get('stage') or 'ideation').strip()
                if stage not in {'ideation', 'problem-definition', 'solution'}:
                    stage = 'ideation'

                try:
                    x = float(message.get('x') or 0)
                    y = float(message.get('y') or 0)
                except (TypeError, ValueError):
                    continue

                try:
                    client_seq = int(message.get('client_seq') or 0)
                except (TypeError, ValueError):
                    client_seq = 0

                await broadcast_to_meeting(meeting_id, {
                    'type': 'canvas_node_preview',
                    'meeting_id': meeting_id,
                    'stage': stage,
                    'node_id': node_id,
                    'x': x,
                    'y': y,
                    'updated_by': user_id,
                    'updated_at': datetime.utcnow().isoformat(),
                    'drag_id': str(message.get('drag_id') or ''),
                    'client_seq': client_seq,
                }, exclude_user=user_id)

            elif message_type == 'canvas_edit_presence':
                target_type = str(message.get('target_type') or '').strip()
                if target_type not in {
                    'agenda',
                    'canvas_item',
                    'problem_group',
                    'problem_structure_group',
                    'problem_structure_node',
                    'solution_topic',
                    'solution_note',
                }:
                    continue

                target_id = str(message.get('target_id') or '').strip()
                if not target_id:
                    continue

                status = str(message.get('status') or 'start').strip()
                if status not in {'start', 'stop'}:
                    status = 'start'

                await broadcast_to_meeting(meeting_id, {
                    'type': 'canvas_edit_presence',
                    'meeting_id': meeting_id,
                    'target_type': target_type,
                    'target_id': target_id,
                    'note_id': str(message.get('note_id') or '').strip(),
                    'status': status,
                    'updated_by': user_id,
                    'updated_at': datetime.utcnow().isoformat(),
                }, exclude_user=user_id)

            elif message_type == 'meeting_goal_sync':
                meeting_goal = str(message.get("meeting_goal") or "").strip()
                meeting_goal_context = str(message.get("meeting_goal_context") or "").strip()
                workspace = latest_canvas_workspace_by_meeting.get(meeting_id)
                if not isinstance(workspace, dict):
                    workspace = {"meeting_id": meeting_id}
                workspace["meeting_goal"] = meeting_goal
                workspace["meeting_goal_context"] = meeting_goal_context
                latest_canvas_workspace_by_meeting[meeting_id] = copy.deepcopy(workspace)
                await broadcast_to_meeting(meeting_id, {
                    'type': 'meeting_goal_updated',
                    'meeting_id': meeting_id,
                    'meeting_goal': meeting_goal,
                    'meeting_goal_context': meeting_goal_context,
                    'updated_by': user_id,
                    'timestamp': datetime.utcnow().isoformat(),
                }, exclude_user=user_id)

            elif message_type == 'meeting_timer_sync':
                status = str(message.get("status") or "").strip()
                if status not in {"scheduled", "active", "in_progress", "completed", "waiting"}:
                    status = ""
                await broadcast_to_meeting(meeting_id, {
                    'type': 'meeting_timer_updated',
                    'meeting_id': meeting_id,
                    'started_at': str(message.get("started_at") or "").strip(),
                    'ended_at': str(message.get("ended_at") or "").strip(),
                    'status': status,
                    'updated_by': user_id,
                    'timestamp': datetime.utcnow().isoformat(),
                }, exclude_user=user_id)

            elif message_type == 'mic_calibration':
                profile = message.get('profile') or {}
                state = get_fusion_state(meeting_id)
                async with state["lock"]:
                    state["device_profiles"][user_id] = {
                        "rms": float(profile.get("rms") or 0.0),
                        "peak": float(profile.get("peak") or 0.0),
                        "speech_ratio": float(profile.get("speech_ratio") or 0.0),
                        "noise_floor": float(profile.get("noise_floor") or 0.0),
                        "sample_count": int(profile.get("sample_count") or 0),
                    }
                await broadcast_to_meeting(meeting_id, {
                    'type': 'audio_calibrated',
                    'meeting_id': meeting_id,
                    'user_id': user_id,
                    'timestamp': datetime.utcnow().isoformat(),
                })
                await send_stt_debug(
                    meeting_id,
                    user_id,
                    "mic_calibrated",
                    profile=state["device_profiles"][user_id],
                )
                    
    except WebSocketDisconnect as exc:
        print(f"ℹ️ User {user_id} disconnected from meeting {meeting_id} (code={exc.code})")
        active_connections[meeting_id].remove(conn_info)
        
        if not active_connections[meeting_id]:
            del active_connections[meeting_id]
            fusion_states.pop(meeting_id, None)
            latest_canvas_workspace_by_meeting.pop(meeting_id, None)
            latest_stt_summary_by_meeting.pop(meeting_id, None)
        
        # 참가자 퇴장 알림
        await broadcast_to_meeting(meeting_id, {
            'type': 'user_left',
            'user_id': user_id,
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        print(f"❌ WebSocket error for meeting {meeting_id}, user {user_id}: {e}")
        if conn_info in active_connections.get(meeting_id, []):
            active_connections[meeting_id].remove(conn_info)
        if meeting_id in active_connections and not active_connections[meeting_id]:
            active_connections.pop(meeting_id, None)
            fusion_states.pop(meeting_id, None)
            latest_canvas_workspace_by_meeting.pop(meeting_id, None)
            latest_stt_summary_by_meeting.pop(meeting_id, None)
