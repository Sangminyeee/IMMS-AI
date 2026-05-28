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
          version: Number.isFinite(Number(value.version)) ? Number(value.version) : 0,
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
  return normalizeArtifactGenerationStatus(generation[artifactKey]?.status) === "generating";
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
