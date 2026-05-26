"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { WebSocketClient } from "@/lib/websocket";
import { AudioRecorder, type RecordedAudioChunk } from "@/lib/audio-recorder";
import { supabase } from "@/lib/supabase";
import { getCanvasWorkspaceState } from "@/lib/api";
import type {
  CanvasEditPresencePayload,
  CanvasNodePreviewPayload,
  CanvasRealtimeSyncPayload,
  MeetingState,
} from "@/lib/types";
import MeetingCanvasTab, { type MeetingAgenda as CanvasAgenda, type MeetingTranscript as CanvasTranscript } from "@/components/MeetingCanvasTab";

interface Transcript {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  canvas_stage?: "ideation" | "problem-definition" | "solution" | string;
  canvas_target_id?: string;
  transcript_status?: "final" | "processing" | string;
  persisted?: boolean;
  persistence_status?: "saving" | "retrying" | "persisted" | "persist_failed" | string;
}

type LoadedTranscriptRow = {
  id: unknown;
  speaker?: string | null;
  text?: string | null;
  timestamp?: string | null;
  created_at?: string | null;
  canvas_stage?: string | null;
  canvas_target_id?: string | null;
};

interface Agenda {
  id: string;
  title: string;
  status: string;
}

type CalibrationState = "idle" | "running" | "done";

interface CalibrationAccumulator {
  chunks: number;
  sumRms: number;
  sumPeak: number;
  sumSpeechRatio: number;
  sumNoiseFloor: number;
}

interface SpeechDetectionProfile {
  rms: number;
  peak: number;
  speechRatio: number;
  noiseFloor: number;
  sampleCount: number;
}

interface SpeechDetectionDecision {
  likely: boolean;
  snr: number;
  thresholds: {
    rms: number;
    peak: number;
    speechRatio: number;
    noiseFloor: number;
  };
}

export interface LiveSpeechPreview {
  speaker: string;
  text: string;
  timestamp: string;
}

interface CanvasStageContext {
  stage: "ideation" | "problem-definition" | "solution";
  targetId?: string;
  selectedNodeId?: string;
}

function createCalibrationAccumulator(): CalibrationAccumulator {
  return {
    chunks: 0,
    sumRms: 0,
    sumPeak: 0,
    sumSpeechRatio: 0,
    sumNoiseFloor: 0,
  };
}

function dedupeTranscripts(rows: Transcript[]) {
  const seen = new Set<string>();
  const deduped = rows.filter((row) => {
    const key = `${row.speaker}|${row.text}|${row.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return sortTranscriptsByTime(deduped);
}

function buildSttContext(goal: string, context: string, fallbackTitle: string) {
  const cleanGoal = goal.trim() || fallbackTitle.trim();
  const cleanContext = context.trim();
  return [cleanGoal ? `회의 목표: ${cleanGoal}` : "", cleanContext ? `관련 맥락: ${cleanContext}` : ""]
    .filter(Boolean)
    .join("\n");
}

function getTranscriptTime(row: Transcript) {
  const parsed = Date.parse(row.timestamp || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortTranscriptsByTime(rows: Transcript[]) {
  return [...rows].sort((a, b) => {
    const timeDelta = getTranscriptTime(a) - getTranscriptTime(b);
    if (timeDelta !== 0) return timeDelta;
    return a.id.localeCompare(b.id);
  });
}

async function loadTranscriptRows(meetingId: string): Promise<{
  data: LoadedTranscriptRow[] | null;
  error: unknown;
}> {
  const withStage = await supabase
    .from("transcripts")
    .select("id, speaker, text, timestamp, created_at, canvas_stage, canvas_target_id")
    .eq("meeting_id", meetingId)
    .order("timestamp", { ascending: true });

  if (!withStage.error) {
    return withStage as unknown as { data: LoadedTranscriptRow[] | null; error: unknown };
  }

  const message = `${withStage.error.message || ""} ${withStage.error.details || ""}`;
  if (!message.includes("canvas_stage") && !message.includes("canvas_target_id")) {
    return withStage as unknown as { data: LoadedTranscriptRow[] | null; error: unknown };
  }

  console.warn("[STT] transcripts table has no canvas stage columns; falling back to base transcript load");
  const fallback = await supabase
    .from("transcripts")
    .select("id, speaker, text, timestamp, created_at")
    .eq("meeting_id", meetingId)
    .order("timestamp", { ascending: true });
  return fallback as unknown as { data: LoadedTranscriptRow[] | null; error: unknown };
}

function mapAnalysisToUi(state: MeetingState) {
  const outcomes = state.analysis?.agenda_outcomes || [];
  const agendas: Agenda[] = outcomes.map((outcome, index) => ({
    id: outcome.agenda_id || `agenda-${index + 1}`,
    title: outcome.agenda_title || `안건 ${index + 1}`,
    status: outcome.agenda_state || "PROPOSED",
  }));

  return { agendas };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getMessagePayload(message: unknown) {
  if (!isRecord(message)) return message;
  return message.data ?? message;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function getSpeechDetectionDecision(
  metrics: RecordedAudioChunk["metrics"],
  profile: SpeechDetectionProfile | null,
): SpeechDetectionDecision {
  const noiseFloor = Math.max(metrics.noiseFloor || 0, profile?.noiseFloor || 0, 0.0005);
  const baselineRms = Math.max(profile?.rms || noiseFloor, noiseFloor);
  const baselinePeak = Math.max(profile?.peak || noiseFloor * 6, noiseFloor * 6);
  const baselineSpeechRatio = Math.max(profile?.speechRatio || 0, 0);

  const rmsThreshold = Math.max(0.0018, Math.min(0.0045, Math.max(noiseFloor * 2.6, baselineRms * 1.8)));
  const peakThreshold = Math.max(0.012, Math.min(0.04, Math.max(noiseFloor * 8, baselinePeak * 1.6)));
  const speechRatioThreshold = Math.max(0.012, Math.min(0.045, baselineSpeechRatio * 1.8));
  const snr = metrics.rms / noiseFloor;

  return {
    likely:
      metrics.rms >= rmsThreshold ||
      metrics.peak >= peakThreshold ||
      metrics.speechRatio >= speechRatioThreshold ||
      (snr >= 2.4 && metrics.peak >= 0.01),
    snr,
    thresholds: {
      rms: rmsThreshold,
      peak: peakThreshold,
      speechRatio: speechRatioThreshold,
      noiseFloor,
    },
  };
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const meetingId = searchParams.get("meeting_id");

  const [meetingTitle, setMeetingTitle] = useState("회의 워크스페이스");
  const [meetingGoal, setMeetingGoal] = useState("");
  const [meetingGoalContext, setMeetingGoalContext] = useState("");
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [analysisState, setAnalysisState] = useState<MeetingState | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [loadingMeeting, setLoadingMeeting] = useState(true);
  const [incomingCanvasSync, setIncomingCanvasSync] = useState<CanvasRealtimeSyncPayload | null>(null);
  const [incomingCanvasNodePreview, setIncomingCanvasNodePreview] = useState<CanvasNodePreviewPayload | null>(null);
  const [incomingCanvasEditPresence, setIncomingCanvasEditPresence] = useState<CanvasEditPresencePayload | null>(null);
  const [incomingCanvasStateRequestId, setIncomingCanvasStateRequestId] = useState("");
  const [calibrationState, setCalibrationState] = useState<CalibrationState>("idle");
  const [calibrationSecondsLeft, setCalibrationSecondsLeft] = useState(0);
  const [fusionSelectedUserId, setFusionSelectedUserId] = useState<string | null>(null);
  const [fusionSelectedSpeaker, setFusionSelectedSpeaker] = useState<string>("");
  const [liveSpeechPreview, setLiveSpeechPreview] = useState<LiveSpeechPreview | null>(null);
  const [canvasStageContext, setCanvasStageContext] = useState<CanvasStageContext>({ stage: "ideation" });
  const [transcriptPersistenceStatusText, setTranscriptPersistenceStatusText] = useState("");

  const wsClientRef = useRef<WebSocketClient | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const isRecordingRef = useRef(isRecording);
  const meetingTitleRef = useRef(meetingTitle);
  const meetingGoalRef = useRef(meetingGoal);
  const meetingGoalContextRef = useRef(meetingGoalContext);
  const transcriptsRef = useRef(transcripts);
  const canvasStageContextRef = useRef<CanvasStageContext>(canvasStageContext);
  const calibrationFinishTimerRef = useRef<number | null>(null);
  const calibrationCountdownTimerRef = useRef<number | null>(null);
  const calibrationAccumulatorRef = useRef<CalibrationAccumulator>(createCalibrationAccumulator());
  const calibrationActiveRef = useRef(false);
  const deviceCalibratedRef = useRef(false);
  const speechDetectionProfileRef = useRef<SpeechDetectionProfile | null>(null);
  const liveSpeechClearTimerRef = useRef<number | null>(null);
  const transcriptPersistenceStatusTimerRef = useRef<number | null>(null);
  const lastSttStatusLogAtRef = useRef(0);
  const lastGatewayChunkLogAtRef = useRef(0);

  useEffect(() => {
    meetingTitleRef.current = meetingTitle;
  }, [meetingTitle]);

  useEffect(() => {
    meetingGoalRef.current = meetingGoal;
  }, [meetingGoal]);

  useEffect(() => {
    meetingGoalContextRef.current = meetingGoalContext;
  }, [meetingGoalContext]);

  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  useEffect(() => {
    canvasStageContextRef.current = canvasStageContext;
  }, [canvasStageContext]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const showLiveSpeechPreview = useCallback((speaker: string, text: string, timestamp: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    setLiveSpeechPreview({
      speaker: speaker || "알 수 없음",
      text: trimmedText,
      timestamp,
    });

    if (liveSpeechClearTimerRef.current !== null) {
      window.clearTimeout(liveSpeechClearTimerRef.current);
    }

    liveSpeechClearTimerRef.current = window.setTimeout(() => {
      setLiveSpeechPreview(null);
      liveSpeechClearTimerRef.current = null;
    }, 5200);
  }, []);

  const showTranscriptPersistenceStatus = useCallback((message: string, durationMs = 7000) => {
    setTranscriptPersistenceStatusText(message);
    if (transcriptPersistenceStatusTimerRef.current !== null) {
      window.clearTimeout(transcriptPersistenceStatusTimerRef.current);
    }
    transcriptPersistenceStatusTimerRef.current = window.setTimeout(() => {
      setTranscriptPersistenceStatusText("");
      transcriptPersistenceStatusTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (calibrationFinishTimerRef.current !== null) {
        window.clearTimeout(calibrationFinishTimerRef.current);
      }
      if (calibrationCountdownTimerRef.current !== null) {
        window.clearInterval(calibrationCountdownTimerRef.current);
      }
      if (liveSpeechClearTimerRef.current !== null) {
        window.clearTimeout(liveSpeechClearTimerRef.current);
      }
      if (transcriptPersistenceStatusTimerRef.current !== null) {
        window.clearTimeout(transcriptPersistenceStatusTimerRef.current);
      }
      audioRecorderRef.current?.cleanup();
    };
  }, []);

  const applyMeetingStateToUi = useCallback((state: MeetingState) => {
    const mapped = mapAnalysisToUi(state);
    setAnalysisState(state);
    setAgendas(mapped.agendas);
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (!meetingId) {
        router.push("/dashboard");
      }
    }
  }, [user, authLoading, meetingId, router]);

  useEffect(() => {
    if (!user || !meetingId) return;

    setIncomingCanvasSync(null);
    setMeetingGoal("");
    setMeetingGoalContext("");
    setIncomingCanvasStateRequestId("");

    const loadMeeting = async () => {
      setLoadingMeeting(true);
      try {
        const [
          { data: meetingData, error: meetingError },
          { data: transcriptData, error: transcriptError },
          workspaceState,
        ] = await Promise.all([
          supabase.from("meetings").select("title").eq("id", meetingId).single(),
          loadTranscriptRows(meetingId),
          getCanvasWorkspaceState(meetingId).catch(() => null),
        ]);

        if (meetingError) throw meetingError;
        if (transcriptError) throw transcriptError;

        const nextMeetingTitle = meetingData?.title || "회의 워크스페이스";
        const nextTranscripts = dedupeTranscripts(
          (transcriptData || []).map((row) => ({
            id: String(row.id),
            speaker: row.speaker || "알 수 없음",
            text: row.text || "",
            timestamp: row.timestamp || row.created_at || new Date().toISOString(),
            canvas_stage: row.canvas_stage || "ideation",
            canvas_target_id: row.canvas_target_id || "",
            transcript_status: "final",
            persisted: true,
            persistence_status: "persisted",
          })),
        );

        setMeetingTitle(nextMeetingTitle);
        setMeetingGoal(workspaceState?.meeting_goal || "");
        setMeetingGoalContext(workspaceState?.meeting_goal_context || "");
        setTranscripts(nextTranscripts);

        if (workspaceState?.imported_state) {
          applyMeetingStateToUi(workspaceState.imported_state);
        } else {
          setAnalysisState(null);
          setAgendas([]);
        }
      } catch (error) {
        console.error("Failed to load meeting context:", error);
      } finally {
        setLoadingMeeting(false);
      }
    };

    void loadMeeting();
  }, [applyMeetingStateToUi, user, meetingId]);

  useEffect(() => {
    if (!user || !meetingId) return;

    const wsClient = new WebSocketClient(meetingId, user.id);
    wsClientRef.current = wsClient;
    setWsConnected(false);

    wsClient.onConnectionStateChange((connected) => {
      setWsConnected(connected);
    });

    wsClient.on("transcript_created", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload)) return;
      if (readString(payload.meeting_id) && readString(payload.meeting_id) !== meetingId) return;
      const transcriptPayload = isRecord(payload.transcript) ? payload.transcript : payload;
      const speaker = readString(transcriptPayload.speaker, "알 수 없음");
      const text = readString(transcriptPayload.text);
      if (!text.trim()) return;
      const nextTimestamp = readString(
        transcriptPayload.timestamp || transcriptPayload.created_at,
        new Date().toISOString(),
      );
      const transcriptId = readString(transcriptPayload.id, `${nextTimestamp}-${speaker}-${text}`);
      const audioMetaPayload = isRecord(payload.audio_meta) ? payload.audio_meta : {};
      const audioStartedAt = readString(transcriptPayload.audio_started_at || audioMetaPayload.started_at);
      const audioEndedAt = readString(transcriptPayload.audio_ended_at || audioMetaPayload.ended_at);
      const chunkIndex = readNumber(transcriptPayload.audio_chunk_index || audioMetaPayload.chunk_index, -1);
      const canvasStage = readString(transcriptPayload.canvas_stage || payload.canvas_stage, "ideation");
      const canvasTargetId = readString(transcriptPayload.canvas_target_id || payload.canvas_target_id);
      const persisted = readBoolean(transcriptPayload.persisted ?? payload.persisted, true);
      const persistenceStatus = readString(
        transcriptPayload.persistence_status || payload.persistence_status,
        persisted ? "persisted" : "saving",
      );
      const transcriptStatus = readString(transcriptPayload.transcript_status || payload.transcript_status, "final");
      const recordingNow = isRecordingRef.current || Boolean(audioRecorderRef.current?.isRecording());
      console.info("[STT] 서버 전사 수신", {
        id: transcriptId,
        speaker,
        text,
        timestamp: nextTimestamp,
        audioStartedAt,
        audioEndedAt,
        chunkIndex,
        canvasStage,
        canvasTargetId,
        recording: recordingNow,
        elapsedMs: payload.stt_elapsed_ms,
        backendElapsedMs: payload.backend_elapsed_ms,
        originalDurationMs: audioMetaPayload.original_duration_ms,
        removedSilenceMs: audioMetaPayload.removed_silence_ms,
        combinedChunkCount: audioMetaPayload.combined_chunk_count,
        persisted,
        persistenceStatus,
      });
      setTranscripts((prev) =>
        dedupeTranscripts([
          ...prev,
          {
            id: transcriptId,
            speaker,
            text,
            timestamp: nextTimestamp,
            canvas_stage: canvasStage,
            canvas_target_id: canvasTargetId,
            transcript_status: transcriptStatus,
            persisted,
            persistence_status: persistenceStatus,
          },
        ]),
      );
      showLiveSpeechPreview(speaker, text, nextTimestamp);
    });

    wsClient.on("transcript_persistence_updated", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload)) return;
      if (readString(payload.meeting_id) && readString(payload.meeting_id) !== meetingId) return;
      const transcriptPayload = isRecord(payload.transcript) ? payload.transcript : {};
      const transientId = readString(payload.transient_id);
      const transcriptId = readString(transcriptPayload.id, transientId);
      const speaker = readString(transcriptPayload.speaker);
      const text = readString(transcriptPayload.text);
      const nextTimestamp = readString(
        transcriptPayload.timestamp || transcriptPayload.created_at,
        new Date().toISOString(),
      );
      const persisted = readBoolean(transcriptPayload.persisted ?? payload.persisted, false);
      const persistenceStatus = readString(
        transcriptPayload.persistence_status || payload.persistence_status,
        persisted ? "persisted" : "retrying",
      );
      const canvasStage = readString(transcriptPayload.canvas_stage || payload.canvas_stage, "ideation");
      const canvasTargetId = readString(transcriptPayload.canvas_target_id || payload.canvas_target_id);

      console.info("[STT] 전사 저장 상태 업데이트", {
        transientId,
        transcriptId,
        persisted,
        persistenceStatus,
      });

      setTranscripts((prev) => {
        let matched = false;
        const nextRows = prev.map((row) => {
          const sameId = Boolean(transcriptId && row.id === transcriptId);
          const sameTransient = Boolean(transientId && row.id === transientId);
          const sameContent = Boolean(speaker && text && row.speaker === speaker && row.text === text && row.timestamp === nextTimestamp);
          if (!sameId && !sameTransient && !sameContent) return row;
          matched = true;
          return {
            ...row,
            id: transcriptId || row.id,
            speaker: speaker || row.speaker,
            text: text || row.text,
            timestamp: nextTimestamp || row.timestamp,
            canvas_stage: canvasStage || row.canvas_stage,
            canvas_target_id: canvasTargetId || row.canvas_target_id,
            transcript_status: "final",
            persisted,
            persistence_status: persistenceStatus,
          };
        });

        if (!matched && text.trim()) {
          nextRows.push({
            id: transcriptId || transientId || `${nextTimestamp}-${speaker}-${text}`,
            speaker: speaker || "알 수 없음",
            text,
            timestamp: nextTimestamp,
            canvas_stage: canvasStage,
            canvas_target_id: canvasTargetId,
            transcript_status: "final",
            persisted,
            persistence_status: persistenceStatus,
          });
        }

        return dedupeTranscripts(nextRows);
      });

      if (persistenceStatus === "retrying") {
        showTranscriptPersistenceStatus("전사 저장 재시도 중");
      } else if (persistenceStatus === "persist_failed") {
        showTranscriptPersistenceStatus("전사 임시 표시 중 · 저장 실패", 10000);
      }
    });

    wsClient.on("meeting_goal_updated", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload)) return;
      if (readString(payload.meeting_id) && readString(payload.meeting_id) !== meetingId) return;
      setMeetingGoal(readString(payload.meeting_goal));
      setMeetingGoalContext(readString(payload.meeting_goal_context));
    });

    wsClient.on("stt_debug", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload)) return;
      const stage = readString(payload.stage);
      const now = Date.now();
      console.info("[STT] gateway debug event", {
        stage,
        bucketId: payload.bucket_id,
        userId: payload.user_id,
        bytes: payload.bytes,
        status: payload.status,
        statusCode: payload.status_code,
        error: payload.error,
        elapsedMs: payload.elapsed_ms,
        backendElapsedMs: payload.backend_elapsed_ms,
        audioMeta: payload.audio_meta,
      });

      if (stage === "audio_chunk_received" || stage === "audio_chunk_queued") {
        if (now - lastGatewayChunkLogAtRef.current < 5000) return;
        lastGatewayChunkLogAtRef.current = now;
        console.info("[STT] gateway가 오디오를 받는 중", {
          stage,
          bytes: readNumber(payload.bytes),
          fusionWaitMs: readNumber(payload.fusion_wait_ms),
          audioMeta: payload.audio_meta,
        });
        return;
      }

      if (stage === "audio_candidate_selected") {
        console.info("[STT] gateway 후보 선택 완료", {
          bucketId: payload.bucket_id,
          candidateCount: payload.candidate_count,
          bytes: payload.bytes,
          fusionWaitMs: readNumber(payload.fusion_wait_ms),
          audioMeta: payload.audio_meta,
        });
        return;
      }

      if (stage === "audio_candidate_dropped") {
        console.warn("[STT] gateway가 오디오를 음성 아님으로 버림", {
          reason: payload.reason,
          fusionWaitMs: readNumber(payload.fusion_wait_ms),
          thresholds: payload.thresholds,
          candidates: payload.candidates,
        });
        return;
      }

      if (stage === "transcription_audio_prepared") {
        const audioMeta = isRecord(payload.audio_meta) ? payload.audio_meta : {};
        console.info("[STT] STT WAV 청크 준비 완료", {
          bucketId: payload.bucket_id,
          bytes: payload.bytes,
          audioMime: payload.audio_mime,
          fusionWaitMs: readNumber(payload.fusion_wait_ms),
          originalDurationMs: audioMeta.original_duration_ms,
          removedSilenceMs: audioMeta.removed_silence_ms,
          combinedChunkCount: audioMeta.combined_chunk_count,
          audioMeta: payload.audio_meta,
        });
        return;
      }

      if (stage === "transcription_audio_buffered") {
        return;
      }

      if (stage === "transcription_started") {
        console.info("[STT] backend Whisper 전사 시작", {
          bucketId: payload.bucket_id,
          backendUrl: payload.backend_url,
        });
        return;
      }

      if (stage === "transcription_failed") {
        console.warn("[STT] backend 전사 요청 실패", {
          status: payload.status,
          statusCode: payload.status_code,
          error: payload.error,
          bytes: payload.bytes,
          elapsedMs: payload.elapsed_ms,
          backendElapsedMs: payload.backend_elapsed_ms,
          audioMeta: payload.audio_meta,
        });
        return;
      }

      if (stage === "transcription_empty") {
        console.warn("[STT] backend 전사 결과가 비어 있음", {
          status: payload.status,
          statusCode: payload.status_code,
          error: payload.error,
          bytes: payload.bytes,
          elapsedMs: payload.elapsed_ms,
          backendElapsedMs: payload.backend_elapsed_ms,
          audioMeta: payload.audio_meta,
        });
        return;
      }

      if (stage === "transcript_finalized") {
        console.info("[STT] 전사 확정 - 화면 반영 및 저장 대기", {
          preview: payload.text_preview,
          length: payload.text_length,
          transcriptId: payload.transcript_id,
          persistenceStatus: payload.persistence_status,
          elapsedMs: payload.elapsed_ms,
          backendElapsedMs: payload.backend_elapsed_ms,
        });
        return;
      }

      if (stage === "transcript_saved") {
        console.info("[STT] 전사 저장 완료", {
          preview: payload.text_preview,
          length: payload.text_length,
          elapsedMs: payload.elapsed_ms,
          backendElapsedMs: payload.backend_elapsed_ms,
        });
        return;
      }

      if (stage === "transcript_save_failed") {
        console.warn("[STT] 전사 DB 저장 실패", {
          preview: payload.text_preview,
          length: payload.text_length,
          bucketId: payload.bucket_id,
        });
      }
    });

    wsClient.on("analysis_update", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload)) return;
      if (payload.agenda_outcomes || payload.analysis) {
        const normalizedState = payload.analysis ? (payload as unknown as MeetingState) : ({ analysis: payload } as unknown as MeetingState);
        applyMeetingStateToUi(normalizedState);
      }
    });

    wsClient.on("canvas_sync", (message) => {
      const payload = (message.data ?? message.workspace ?? message) as CanvasRealtimeSyncPayload | null;
      if (!payload || payload.meeting_id !== meetingId) return;
      setIncomingCanvasSync(payload);
    });

    wsClient.on("canvas_node_preview", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload) || readString(payload.meeting_id) !== meetingId) return;
      const stage = readString(payload.stage, "ideation");
      if (stage !== "ideation" && stage !== "problem-definition" && stage !== "solution") return;
      const nodeId = readString(payload.node_id);
      const updatedBy = readString(payload.updated_by);
      const x = Number(payload.x);
      const y = Number(payload.y);
      if (!nodeId || !updatedBy || !Number.isFinite(x) || !Number.isFinite(y)) return;
      setIncomingCanvasNodePreview({
        meeting_id: meetingId,
        stage,
        node_id: nodeId,
        x,
        y,
        updated_by: updatedBy,
        updated_at: readString(payload.updated_at, new Date().toISOString()),
        drag_id: readString(payload.drag_id),
        client_seq: Number(payload.client_seq) || 0,
      });
    });

    wsClient.on("canvas_edit_presence", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload) || readString(payload.meeting_id) !== meetingId) return;
      const targetType = readString(payload.target_type);
      if (
        targetType !== "canvas_item" &&
        targetType !== "problem_group" &&
        targetType !== "solution_topic" &&
        targetType !== "solution_note"
      ) {
        return;
      }
      const targetId = readString(payload.target_id);
      const updatedBy = readString(payload.updated_by);
      if (!targetId || !updatedBy) return;
      setIncomingCanvasEditPresence({
        meeting_id: meetingId,
        target_type: targetType,
        target_id: targetId,
        note_id: readString(payload.note_id),
        status: readString(payload.status) === "stop" ? "stop" : "start",
        updated_by: updatedBy,
        updated_at: readString(payload.updated_at, new Date().toISOString()),
      });
    });

    wsClient.on("canvas_state_request", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload) || payload.meeting_id !== meetingId) return;
      if (payload.requested_by === user.id) return;
      setIncomingCanvasStateRequestId(String(payload.request_id || Date.now()));
    });

    wsClient.on("audio_selection", (message) => {
      const payload = getMessagePayload(message);
      if (!isRecord(payload) || payload.meeting_id !== meetingId) return;
      setFusionSelectedUserId(readString(payload.selected_user_id) || null);
      setFusionSelectedSpeaker(readString(payload.speaker));
    });

    wsClient.connect();

    return () => {
      wsClient.disconnect();
      setWsConnected(false);
    };
  }, [user, meetingId, showLiveSpeechPreview, showTranscriptPersistenceStatus, applyMeetingStateToUi]);

  const finishCalibration = useCallback(() => {
    if (!user) return;

    if (calibrationFinishTimerRef.current !== null) {
      window.clearTimeout(calibrationFinishTimerRef.current);
      calibrationFinishTimerRef.current = null;
    }
    if (calibrationCountdownTimerRef.current !== null) {
      window.clearInterval(calibrationCountdownTimerRef.current);
      calibrationCountdownTimerRef.current = null;
    }

    const stats = calibrationAccumulatorRef.current;
    calibrationActiveRef.current = false;
    const sampleCount = Math.max(stats.chunks, 1);
    const avgRms = stats.chunks > 0 ? stats.sumRms / sampleCount : 0.0045;
    const avgPeak = stats.chunks > 0 ? stats.sumPeak / sampleCount : 0.04;
    const avgSpeechRatio = stats.chunks > 0 ? stats.sumSpeechRatio / sampleCount : 0.045;
    const avgNoiseFloor = stats.chunks > 0 ? stats.sumNoiseFloor / sampleCount : 0.0015;
    const profile: SpeechDetectionProfile = {
      rms: avgRms,
      peak: avgPeak,
      speechRatio: avgSpeechRatio,
      noiseFloor: avgNoiseFloor,
      sampleCount: stats.chunks,
    };
    speechDetectionProfileRef.current = profile;

    if (stats.chunks === 0) {
      console.info("[STT] mic calibration finished before first audio chunk; using fallback profile");
    }

    if (wsClientRef.current?.isConnected()) {
      console.info("[STT] mic calibration finished", {
        rms: profile.rms,
        peak: profile.peak,
        speechRatio: profile.speechRatio,
        noiseFloor: profile.noiseFloor,
        sampleCount: profile.sampleCount,
      });
      wsClientRef.current.sendMessage("mic_calibration", {
        profile: {
          rms: profile.rms,
          peak: profile.peak,
          speech_ratio: profile.speechRatio,
          noise_floor: profile.noiseFloor,
          sample_count: profile.sampleCount,
        },
      });
    }
    deviceCalibratedRef.current = true;

    setCalibrationState("done");
    setCalibrationSecondsLeft(0);
  }, [user]);

  const beginCalibration = useCallback(() => {
    if (calibrationFinishTimerRef.current !== null) {
      window.clearTimeout(calibrationFinishTimerRef.current);
    }
    if (calibrationCountdownTimerRef.current !== null) {
      window.clearInterval(calibrationCountdownTimerRef.current);
    }

    calibrationAccumulatorRef.current = createCalibrationAccumulator();
    calibrationActiveRef.current = true;
    deviceCalibratedRef.current = false;
    setCalibrationState("running");
    setCalibrationSecondsLeft(4);

    calibrationCountdownTimerRef.current = window.setInterval(() => {
      setCalibrationSecondsLeft((prev) => {
        if (prev <= 1) {
          if (calibrationCountdownTimerRef.current !== null) {
            window.clearInterval(calibrationCountdownTimerRef.current);
            calibrationCountdownTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    calibrationFinishTimerRef.current = window.setTimeout(() => {
      finishCalibration();
    }, 4000);
  }, [finishCalibration]);

  const accumulateCalibrationMetrics = useCallback((metrics: RecordedAudioChunk["metrics"]) => {
    if (!calibrationActiveRef.current && deviceCalibratedRef.current) {
      return;
    }
    calibrationAccumulatorRef.current.chunks += 1;
    calibrationAccumulatorRef.current.sumRms += metrics.rms;
    calibrationAccumulatorRef.current.sumPeak += metrics.peak;
    calibrationAccumulatorRef.current.sumSpeechRatio += metrics.speechRatio;
    calibrationAccumulatorRef.current.sumNoiseFloor += metrics.noiseFloor;
  }, []);

  const toggleRecording = async () => {
    if (!user) return;

    if (isRecording) {
      const recorder = audioRecorderRef.current;
      audioRecorderRef.current = null;
      await recorder?.stopAndCleanup();
      finishCalibration();
      setIsRecording(false);
      return;
    }

    if (!audioRecorderRef.current) {
      const recorder = new AudioRecorder();
      const initialized = await recorder.initialize();
      if (!initialized) {
        alert("마이크 접근 권한이 필요합니다.");
        return;
      }
      recorder.setRecordingInterval(7000);
      recorder.setMeterCallback(accumulateCalibrationMetrics);
      audioRecorderRef.current = recorder;
    } else {
      audioRecorderRef.current.setRecordingInterval(7000);
      audioRecorderRef.current.setMeterCallback(accumulateCalibrationMetrics);
    }

    beginCalibration();
    console.info("[STT] 녹음 파이프라인 시작", {
      intervalMs: 7000,
      mode: "pcm-wav-chunk",
      wsConnected: wsClientRef.current?.isConnected() || false,
    });
    audioRecorderRef.current.start(({ blob, metrics }: RecordedAudioChunk) => {
      const calibrated = deviceCalibratedRef.current;
      console.info("[STT] STT WAV 청크 생성", {
        bytes: blob.size,
        chunkIndex: metrics.chunkIndex,
        durationMs: metrics.durationMs,
        originalDurationMs: metrics.originalDurationMs,
        removedSilenceMs: metrics.removedSilenceMs,
        combinedChunkCount: metrics.combinedChunkCount,
        trimmedFromSilence: metrics.trimmedFromSilence,
        rms: metrics.rms,
        peak: metrics.peak,
        speechRatio: metrics.speechRatio,
        calibrated,
        calibrationActive: calibrationActiveRef.current,
      });
      if (calibrationActiveRef.current || !calibrated) {
        return;
      }
      const speechDecision = getSpeechDetectionDecision(metrics, speechDetectionProfileRef.current);
      if (!speechDecision.likely) {
        const now = Date.now();
        if (now - lastSttStatusLogAtRef.current > 5000) {
          lastSttStatusLogAtRef.current = now;
          console.info("[STT] 듣는 중 - 무음으로 판단해서 전송하지 않음", {
            rms: metrics.rms,
            peak: metrics.peak,
            speechRatio: metrics.speechRatio,
            snr: speechDecision.snr,
            thresholds: speechDecision.thresholds,
            profile: speechDetectionProfileRef.current,
          });
        }
        return;
      }
      if (wsClientRef.current?.isConnected()) {
        const canvasContext = canvasStageContextRef.current;
        console.info("[STT] 음성 감지 - 전사 요청 전송", {
          rms: metrics.rms,
          peak: metrics.peak,
          speechRatio: metrics.speechRatio,
          snr: speechDecision.snr,
          thresholds: speechDecision.thresholds,
          chunkIndex: metrics.chunkIndex,
          durationMs: metrics.durationMs,
          originalDurationMs: metrics.originalDurationMs,
          removedSilenceMs: metrics.removedSilenceMs,
          combinedChunkCount: metrics.combinedChunkCount,
          bytes: blob.size,
          canvasStage: canvasContext.stage,
          canvasTargetId: canvasContext.targetId || "",
        });
        wsClientRef.current.sendAudioChunk(
          blob,
          user.email || "Unknown",
          metrics,
          buildSttContext(meetingGoalRef.current, meetingGoalContextRef.current, meetingTitleRef.current),
          {
            stage: canvasContext.stage,
            targetId: canvasContext.targetId,
            selectedNodeId: canvasContext.selectedNodeId,
          },
        );
      } else {
        console.warn("[STT] audio chunk not sent because WebSocket is disconnected", {
          bytes: blob.size,
          metrics,
        });
      }
    });
    setIsRecording(true);
  };

  const endMeeting = async () => {
    if (!meetingId) return;

    if (isRecording) {
      const recorder = audioRecorderRef.current;
      audioRecorderRef.current = null;
      await recorder?.stopAndCleanup();
      setIsRecording(false);
    }

    wsClientRef.current?.disconnect();

    try {
      const { error } = await supabase
        .from("meetings")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
        })
        .eq("id", meetingId);

      if (error) throw error;
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to end meeting:", error);
      alert("회의 종료에 실패했습니다.");
    }
  };

  const canvasTranscripts = useMemo<CanvasTranscript[]>(
    () => transcripts.map((item) => ({ ...item })),
    [transcripts],
  );
  const canvasAgendas = useMemo<CanvasAgenda[]>(
    () => agendas.map((item) => ({ ...item })),
    [agendas],
  );

  const broadcastCanvasSync = useCallback((payload: CanvasRealtimeSyncPayload) => {
    wsClientRef.current?.sendMessage("canvas_sync", {
      workspace: payload,
    });
  }, []);
  const broadcastCanvasNodePreview = useCallback((payload: CanvasNodePreviewPayload) => {
    wsClientRef.current?.sendMessage("canvas_node_preview", payload as unknown as Record<string, unknown>);
  }, []);
  const broadcastCanvasEditPresence = useCallback((payload: CanvasEditPresencePayload) => {
    wsClientRef.current?.sendMessage("canvas_edit_presence", payload as unknown as Record<string, unknown>);
  }, []);
  const broadcastMeetingGoalSync = useCallback((goal: string, context = meetingGoalContextRef.current) => {
    wsClientRef.current?.sendMessage("meeting_goal_sync", {
      meeting_goal: goal,
      meeting_goal_context: context,
    });
  }, []);

  if (authLoading || !user || !meetingId || loadingMeeting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eaf0f7]">
        <div className="rounded-[28px] border border-white/70 bg-white/85 px-8 py-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-cyan-100 border-t-[#10243f]" />
          <p className="mt-4 text-sm font-medium text-slate-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-white">
      <MeetingCanvasTab
        userId={user.id}
        meetingId={meetingId}
        meetingTitle={meetingTitle}
        meetingGoal={meetingGoal}
        meetingGoalContext={meetingGoalContext}
        onMeetingGoalChange={setMeetingGoal}
        onMeetingGoalContextChange={setMeetingGoalContext}
        onMeetingGoalSync={broadcastMeetingGoalSync}
        transcripts={canvasTranscripts}
        agendas={canvasAgendas}
        analysisState={analysisState}
        incomingSharedCanvasSync={incomingCanvasSync}
        onSharedCanvasSync={broadcastCanvasSync}
        incomingNodePreview={incomingCanvasNodePreview}
        onNodePreviewSync={broadcastCanvasNodePreview}
        incomingEditPresence={incomingCanvasEditPresence}
        onEditPresenceSync={broadcastCanvasEditPresence}
        incomingCanvasStateRequestId={incomingCanvasStateRequestId}
        liveSpeechPreview={liveSpeechPreview}
        isRecording={isRecording}
        onToggleRecording={toggleRecording}
        onStopRecording={toggleRecording}
        onEndMeeting={endMeeting}
        onCanvasStageContextChange={setCanvasStageContext}
        recordingStatusText={
          transcriptPersistenceStatusText ||
          (calibrationState === "running"
            ? `마이크 캘리브레이션 ${calibrationSecondsLeft}s`
            : fusionSelectedUserId === user.id
            ? "내 마이크가 현재 선택됨"
            : fusionSelectedUserId
            ? `${fusionSelectedSpeaker || "다른 화자"} 마이크 선택 중`
            : wsConnected
            ? "WebSocket 연결됨"
            : "WebSocket 연결 안 됨")
        }
      />
    </div>
  );
}

function HomeFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eaf0f7]">
      <div className="rounded-[28px] border border-white/70 bg-white/85 px-8 py-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-cyan-100 border-t-[#10243f]" />
        <p className="mt-4 text-sm font-medium text-slate-600">워크스페이스를 불러오는 중...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
