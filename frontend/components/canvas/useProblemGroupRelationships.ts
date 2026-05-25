"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { saveCanvasWorkspacePatch } from "@/lib/api";
import type { CanvasWorkspacePatchRequest, CanvasWorkspaceProblemGroup, MeetingState } from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type PersonalNoteModel = {
  id: string;
  kind: string;
  title: string;
  body: string;
};

export type ProblemGroupRelationshipModel = {
  group_id: string;
  parent_group_id?: string;
  depth?: number;
  topic: string;
  insight_lens?: string;
  insight_user_edited?: boolean;
  keywords?: string[];
  agenda_ids?: string[];
  agenda_titles?: string[];
  ideas: Array<{
    id?: string;
    kind?: string;
    title?: string;
    body?: string;
  }>;
  discussion_items?: unknown[];
  linked_group_ids?: string[];
  evidence_utterance_ids?: string[];
  source_summary_items?: string[];
  conclusion?: string;
  conclusion_user_edited?: boolean;
  status?: "draft" | "review" | "final" | string;
  source_signature?: string;
  source_agenda_signatures?: Record<string, string>;
  source_idea_signatures?: Record<string, string>;
};

type SharedWorkspaceModel<TGroup extends ProblemGroupRelationshipModel> = {
  stage: CanvasStage;
  problemGroups: TGroup[];
  importedState: MeetingState | null;
};

function normalizeNoteText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clipNoteSummary(value: string, limit: number) {
  const clean = normalizeNoteText(value);
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function makePersonalNoteChildTopic(title: string, body: string) {
  const cleanTitle = normalizeNoteText(title);
  if (cleanTitle && !/^개인 메모\s*\d*$/i.test(cleanTitle)) {
    return clipNoteSummary(cleanTitle, 42);
  }

  return clipNoteSummary(body || cleanTitle || "개인 메모", 42);
}

function makePersonalNoteChildSummary(title: string, body: string) {
  const cleanTitle = normalizeNoteText(title);
  const cleanBody = normalizeNoteText(body);
  const firstSentence = cleanBody.match(/[^.!?。！？]+[.!?。！？]?/)?.[0]?.trim() || cleanBody;
  const summaryBase = firstSentence || cleanTitle || "개인 메모에서 추가한 세부 논점입니다.";
  return clipNoteSummary(summaryBase, 120);
}

function makePersonalNoteChildConclusion(title: string, body: string) {
  const summary = makePersonalNoteChildSummary(title, body);
  return clipNoteSummary(summary, 90);
}

type UseProblemGroupRelationshipsOptions<
  TGroup extends ProblemGroupRelationshipModel,
  TWorkspace extends SharedWorkspaceModel<TGroup>,
  TPatch extends CanvasWorkspacePatchRequest,
> = {
  buildCurrentWorkspacePatchPayload: (overrides?: { problemGroups?: TGroup[] }) => TPatch;
  forceBroadcastSharedCanvas: (payload: { problemGroups: TGroup[] }) => void;
  latestSharedWorkspaceRef: MutableRefObject<TWorkspace>;
  meetingId: string;
  persistedSharedImportedState: TWorkspace["importedState"];
  personalNotes: PersonalNoteModel[];
  problemGroupById: Map<string, TGroup>;
  problemGroups: TGroup[];
  serializeSharedProblemGroups: (groups: TGroup[]) => CanvasWorkspaceProblemGroup[];
  sharedSyncEnabled: boolean;
  stage: TWorkspace["stage"];
  writeSharedWorkspaceSessionCache: (meetingId: string, payload: TPatch) => void;
  setActivityMessage: (message: string) => void;
  setCollapsedProblemGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setDraggingPersonalNoteId: Dispatch<SetStateAction<string>>;
  setDropProblemGroupId: Dispatch<SetStateAction<string>>;
  setLeftPanelTab: Dispatch<SetStateAction<"detail">>;
  setPendingProblemGroupLinkId: Dispatch<SetStateAction<string>>;
  setProblemGroups: Dispatch<SetStateAction<TGroup[]>>;
  setSelectedCanvasItemId: Dispatch<SetStateAction<string>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
  setSelectedProblemSourceNodeId: Dispatch<SetStateAction<string>>;
};

export function useProblemGroupRelationships<
  TGroup extends ProblemGroupRelationshipModel,
  TWorkspace extends SharedWorkspaceModel<TGroup>,
  TPatch extends CanvasWorkspacePatchRequest,
>({
  buildCurrentWorkspacePatchPayload,
  forceBroadcastSharedCanvas,
  latestSharedWorkspaceRef,
  meetingId,
  persistedSharedImportedState,
  personalNotes,
  problemGroupById,
  problemGroups,
  serializeSharedProblemGroups,
  sharedSyncEnabled,
  stage,
  writeSharedWorkspaceSessionCache,
  setActivityMessage,
  setCollapsedProblemGroupIds,
  setDraggingPersonalNoteId,
  setDropProblemGroupId,
  setLeftPanelTab,
  setPendingProblemGroupLinkId,
  setProblemGroups,
  setSelectedCanvasItemId,
  setSelectedNodeId,
  setSelectedProblemGroupId,
  setSelectedProblemSourceNodeId,
}: UseProblemGroupRelationshipsOptions<TGroup, TWorkspace, TPatch>) {
  const handleAttachPersonalNoteToProblemGroup = useCallback(
    (groupId: string, noteId: string) => {
      const note = personalNotes.find((entry) => entry.id === noteId);
      const group = problemGroupById.get(groupId);
      if (!note || !group) return;

      const alreadyAddedAsChild = problemGroups.some(
        (item) =>
          item.parent_group_id === groupId &&
          (item.ideas || []).some((idea) => idea.id === noteId),
      );
      if (alreadyAddedAsChild) {
        setDropProblemGroupId("");
        setDraggingPersonalNoteId("");
        setActivityMessage("이미 세부 노드로 추가된 메모입니다.");
        return;
      }

      const createdAt = Date.now();
      const childGroupId = `note-problem-${groupId}-${note.id}-${createdAt}`;
      const noteTitle = normalizeNoteText(note.title);
      const noteBody = normalizeNoteText(note.body);
      const childTopic = makePersonalNoteChildTopic(noteTitle, noteBody);
      const childSummary = makePersonalNoteChildSummary(noteTitle, noteBody);
      const childConclusion = makePersonalNoteChildConclusion(noteTitle, noteBody);
      const nextChildGroup = {
        group_id: childGroupId,
        parent_group_id: group.group_id,
        depth: Math.max(0, (group.depth || 0) + 1),
        topic: childTopic,
        insight_lens: childSummary,
        insight_user_edited: true,
        keywords: [],
        agenda_ids: [],
        agenda_titles: [],
        ideas: [
          {
            id: note.id,
            kind: note.kind,
            title: note.title,
            body: note.body,
          },
        ],
        discussion_items: [],
        linked_group_ids: [],
        evidence_utterance_ids: [],
        source_summary_items: [childSummary],
        conclusion: childConclusion,
        conclusion_user_edited: true,
        status: "draft",
        source_signature: `personal-note:${note.id}:${createdAt}`,
        source_agenda_signatures: {},
        source_idea_signatures: {
          [note.id]: `${note.title}\n${note.body}`,
        },
      } as unknown as TGroup;
      const nextProblemGroups = [...problemGroups, nextChildGroup];

      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage,
        problemGroups: nextProblemGroups,
        importedState: persistedSharedImportedState,
      } as TWorkspace;
      setProblemGroups(nextProblemGroups);
      setSelectedProblemGroupId(childGroupId);
      setSelectedNodeId(`problem-${childGroupId}`);
      setLeftPanelTab("detail");
      setCollapsedProblemGroupIds((prev) => {
        if (!prev.has(groupId)) return prev;
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      setDropProblemGroupId("");
      setDraggingPersonalNoteId("");
      setActivityMessage(`"${group.topic}" 아래에 개인 메모 세부 노드를 추가했습니다.`);

      if (sharedSyncEnabled) {
        if (meetingId) {
          writeSharedWorkspaceSessionCache(
            meetingId,
            buildCurrentWorkspacePatchPayload({
              problemGroups: nextProblemGroups,
            }),
          );
        }
        forceBroadcastSharedCanvas({
          problemGroups: nextProblemGroups,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            problem_groups: serializeSharedProblemGroups(nextProblemGroups),
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save personal note problem child:", error);
          });
        }
      }
    },
    [
      buildCurrentWorkspacePatchPayload,
      forceBroadcastSharedCanvas,
      latestSharedWorkspaceRef,
      meetingId,
      persistedSharedImportedState,
      personalNotes,
      problemGroupById,
      problemGroups,
      serializeSharedProblemGroups,
      sharedSyncEnabled,
      stage,
      writeSharedWorkspaceSessionCache,
      setActivityMessage,
      setCollapsedProblemGroupIds,
      setDraggingPersonalNoteId,
      setDropProblemGroupId,
      setLeftPanelTab,
      setProblemGroups,
      setSelectedNodeId,
      setSelectedProblemGroupId,
    ],
  );

  const handleCreateProblemGroupLink = useCallback(
    (sourceGroupId: string, targetGroupId: string) => {
      if (!sourceGroupId || !targetGroupId) return false;
      if (sourceGroupId === targetGroupId) {
        setPendingProblemGroupLinkId("");
        setActivityMessage("같은 문제정의 그룹에는 연결할 수 없습니다.");
        return true;
      }

      const sourceGroup = problemGroupById.get(sourceGroupId);
      const targetGroup = problemGroupById.get(targetGroupId);
      if (!sourceGroup || !targetGroup) {
        setPendingProblemGroupLinkId("");
        setActivityMessage("연결할 문제정의 그룹을 찾지 못했습니다.");
        return true;
      }

      if ((sourceGroup.linked_group_ids || []).includes(targetGroupId)) {
        setSelectedProblemGroupId(targetGroupId);
        setPendingProblemGroupLinkId("");
        setActivityMessage("이미 연결된 문제정의 그룹입니다.");
        return true;
      }

      const nextProblemGroups = problemGroups.map((group) =>
        group.group_id === sourceGroupId
          ? ({
              ...group,
              linked_group_ids: [...new Set([...(group.linked_group_ids || []), targetGroupId])],
            } as TGroup)
          : group,
      );

      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage,
        problemGroups: nextProblemGroups,
        importedState: persistedSharedImportedState,
      } as TWorkspace;
      setProblemGroups(nextProblemGroups);
      setSelectedProblemGroupId(targetGroupId);
      setSelectedProblemSourceNodeId("");
      setSelectedCanvasItemId("");
      setPendingProblemGroupLinkId("");
      setActivityMessage(`"${sourceGroup.topic}"와 "${targetGroup.topic}" 문제정의 그룹을 연결했습니다.`);

      if (sharedSyncEnabled) {
        if (meetingId) {
          writeSharedWorkspaceSessionCache(
            meetingId,
            buildCurrentWorkspacePatchPayload({
              problemGroups: nextProblemGroups,
            }),
          );
        }
        forceBroadcastSharedCanvas({
          problemGroups: nextProblemGroups,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            problem_groups: serializeSharedProblemGroups(nextProblemGroups),
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save problem group link:", error);
          });
        }
      }

      return true;
    },
    [
      buildCurrentWorkspacePatchPayload,
      forceBroadcastSharedCanvas,
      latestSharedWorkspaceRef,
      meetingId,
      persistedSharedImportedState,
      problemGroupById,
      problemGroups,
      serializeSharedProblemGroups,
      sharedSyncEnabled,
      stage,
      writeSharedWorkspaceSessionCache,
      setActivityMessage,
      setPendingProblemGroupLinkId,
      setProblemGroups,
      setSelectedCanvasItemId,
      setSelectedProblemGroupId,
      setSelectedProblemSourceNodeId,
    ],
  );

  return {
    handleAttachPersonalNoteToProblemGroup,
    handleCreateProblemGroupLink,
  };
}
