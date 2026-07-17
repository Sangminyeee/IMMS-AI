import type {
  CanvasArtifactGenerationKey,
  CanvasArtifactGenerationMap,
  CanvasArtifactGenerationState,
  CanvasArtifactGenerationStatus,
} from "@/lib/types";

export const PROBLEM_DEFINITION_STEP1_ARTIFACT: CanvasArtifactGenerationKey = "problem-definition:explore";
export const PROBLEM_DEFINITION_STEP2_ARTIFACT: CanvasArtifactGenerationKey = "problem-definition:structure";
export const SUMMARY_DOCUMENT_ARTIFACT: CanvasArtifactGenerationKey = "solution:summary";

export const CANVAS_ARTIFACT_KEYS: CanvasArtifactGenerationKey[] = [
  PROBLEM_DEFINITION_STEP1_ARTIFACT,
  PROBLEM_DEFINITION_STEP2_ARTIFACT,
  SUMMARY_DOCUMENT_ARTIFACT,
];
const ARTIFACT_GENERATION_STALE_MS = 5 * 60 * 1000;

export function normalizeCanvasArtifactGeneration(
  raw?: CanvasArtifactGenerationMap | null,
): CanvasArtifactGenerationMap {
  if (!raw || typeof raw !== "object") return {};

  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      if (!value || typeof value !== "object") return [];
      const artifactKey = (value.artifact_key || key).trim();
      if (!artifactKey) return [];
      const status = normalizeArtifactGenerationStatus(value.status);
      return [[
        artifactKey,
        {
          artifact_key: artifactKey,
          status,
          generation_id: (value.generation_id || "").trim(),
          started_by: (value.started_by || "").trim(),
          started_at: (value.started_at || "").trim(),
          updated_at: (value.updated_at || "").trim(),
          finished_at: (value.finished_at || "").trim(),
          error: (value.error || "").trim(),
          phase: (value.phase || "").trim(),
          detail: (value.detail || "").trim(),
          retryable: Boolean(value.retryable),
          version: Number.isFinite(Number(value.version)) ? Number(value.version) : 0,
          input_transcript_revision: Number.isFinite(Number(value.input_transcript_revision))
            ? Number(value.input_transcript_revision)
            : 0,
        } satisfies CanvasArtifactGenerationState,
      ]];
    }),
  );
}

export function normalizeArtifactGenerationStatus(raw?: string): CanvasArtifactGenerationStatus {
  if (raw === "generating" || raw === "ready" || raw === "failed") return raw;
  return "idle";
}

export function isCanvasArtifactGenerating(
  generation: CanvasArtifactGenerationMap,
  artifactKey: CanvasArtifactGenerationKey,
) {
  const entry = generation[artifactKey];
  return normalizeArtifactGenerationStatus(entry?.status) === "generating" && !isCanvasArtifactGenerationStale(entry);
}

function parseArtifactGenerationTime(value?: string): number | null {
  const text = (value || "").trim();
  if (!text) return null;

  if (text.includes("T")) {
    const time = Date.parse(text);
    return Number.isFinite(time) ? time : null;
  }

  const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [, rawHours, rawMinutes, rawSeconds] = match;
  const now = new Date();
  const parsed = new Date(now);
  parsed.setHours(Number(rawHours), Number(rawMinutes), Number(rawSeconds), 0);
  if (parsed.getTime() - now.getTime() > 60 * 1000) {
    parsed.setDate(parsed.getDate() - 1);
  }
  return parsed.getTime();
}

export function isCanvasArtifactGenerationStale(entry?: CanvasArtifactGenerationState | null) {
  if (!entry || normalizeArtifactGenerationStatus(entry.status) !== "generating") return false;
  const startedOrUpdatedAt = parseArtifactGenerationTime(entry.updated_at || entry.started_at);
  if (startedOrUpdatedAt === null) return true;
  return Date.now() - startedOrUpdatedAt >= ARTIFACT_GENERATION_STALE_MS;
}

export function setCanvasArtifactGenerationState(
  current: CanvasArtifactGenerationMap,
  nextState: CanvasArtifactGenerationState,
): CanvasArtifactGenerationMap {
  const artifactKey = nextState.artifact_key.trim();
  if (!artifactKey) return normalizeCanvasArtifactGeneration(current);
  return normalizeCanvasArtifactGeneration({
    ...current,
    [artifactKey]: nextState,
  });
}
