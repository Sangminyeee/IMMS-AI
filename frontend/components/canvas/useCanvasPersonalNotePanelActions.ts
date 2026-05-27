"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

type PersonalNotePanelModel = {
  id: string;
  projectId: string;
  agendaId: string;
  linkedCanvasItemId?: string;
  linkedCanvasItemTitle?: string;
  kind: "note" | "comment" | "topic";
  title: string;
  body: string;
};

type UseCanvasPersonalNotePanelActionsOptions<TNote extends PersonalNotePanelModel> = {
  meetingId: string;
  composerTitle: string;
  composerBody: string;
  projectPersonalNoteCount: number;
  composerPersonalNoteLinkId: string;
  pendingPersonalNoteLinkId: string;
  editingPersonalNoteId: string;
  personalNoteDraftTitle: string;
  personalNoteDraftBody: string;
  setActivityMessage: (message: string) => void;
  setComposerTitle: Dispatch<SetStateAction<string>>;
  setComposerBody: Dispatch<SetStateAction<string>>;
  setComposerLinkedCanvasItemId: Dispatch<SetStateAction<string>>;
  setComposerLinkedCanvasItemTitle: Dispatch<SetStateAction<string>>;
  setPendingPersonalNoteLinkId: Dispatch<SetStateAction<string>>;
  setPersonalNotes: Dispatch<SetStateAction<TNote[]>>;
  setEditingPersonalNoteId: Dispatch<SetStateAction<string>>;
  setPersonalNoteDraftAgendaId: Dispatch<SetStateAction<string>>;
  setPersonalNoteDraftTitle: Dispatch<SetStateAction<string>>;
  setPersonalNoteDraftBody: Dispatch<SetStateAction<string>>;
  setDraggingPersonalNoteId: Dispatch<SetStateAction<string>>;
  setDropProblemGroupId: Dispatch<SetStateAction<string>>;
};

export function useCanvasPersonalNotePanelActions<TNote extends PersonalNotePanelModel>({
  meetingId,
  composerTitle,
  composerBody,
  projectPersonalNoteCount,
  composerPersonalNoteLinkId,
  pendingPersonalNoteLinkId,
  editingPersonalNoteId,
  personalNoteDraftTitle,
  personalNoteDraftBody,
  setActivityMessage,
  setComposerTitle,
  setComposerBody,
  setComposerLinkedCanvasItemId,
  setComposerLinkedCanvasItemTitle,
  setPendingPersonalNoteLinkId,
  setPersonalNotes,
  setEditingPersonalNoteId,
  setPersonalNoteDraftAgendaId,
  setPersonalNoteDraftTitle,
  setPersonalNoteDraftBody,
  setDraggingPersonalNoteId,
  setDropProblemGroupId,
}: UseCanvasPersonalNotePanelActionsOptions<TNote>) {
  const clearPersonalNoteEditDraft = useCallback(() => {
    setEditingPersonalNoteId("");
    setPersonalNoteDraftAgendaId("");
    setPersonalNoteDraftTitle("");
    setPersonalNoteDraftBody("");
  }, [
    setEditingPersonalNoteId,
    setPersonalNoteDraftAgendaId,
    setPersonalNoteDraftBody,
    setPersonalNoteDraftTitle,
  ]);

  const handleAddPersonalNote = useCallback(() => {
    const nextNote = {
      id: `note-${Date.now()}`,
      projectId: meetingId,
      agendaId: "",
      linkedCanvasItemId: "",
      linkedCanvasItemTitle: "",
      kind: "note",
      title: composerTitle.trim() || `개인 메모 ${projectPersonalNoteCount + 1}`,
      body: composerBody.trim() || "개인 메모를 입력해 두면 나중에 그룹 보드로 이동시킬 수 있습니다.",
    } satisfies PersonalNotePanelModel;

    setPersonalNotes((prev) => [nextNote as TNote, ...prev]);
    setComposerTitle("");
    setComposerBody("");
    setComposerLinkedCanvasItemId("");
    setComposerLinkedCanvasItemTitle("");
    if (pendingPersonalNoteLinkId === composerPersonalNoteLinkId) {
      setPendingPersonalNoteLinkId("");
    }
    setActivityMessage("개인 메모에 저장했습니다.");
  }, [
    composerBody,
    composerPersonalNoteLinkId,
    composerTitle,
    meetingId,
    pendingPersonalNoteLinkId,
    projectPersonalNoteCount,
    setActivityMessage,
    setComposerBody,
    setComposerLinkedCanvasItemId,
    setComposerLinkedCanvasItemTitle,
    setComposerTitle,
    setPendingPersonalNoteLinkId,
    setPersonalNotes,
  ]);

  const handleDeletePersonalNote = useCallback((noteId: string) => {
    setPersonalNotes((prev) => prev.filter((item) => item.id !== noteId));
    if (pendingPersonalNoteLinkId === noteId) {
      setPendingPersonalNoteLinkId("");
    }
    if (editingPersonalNoteId === noteId) {
      clearPersonalNoteEditDraft();
    }
  }, [
    clearPersonalNoteEditDraft,
    editingPersonalNoteId,
    pendingPersonalNoteLinkId,
    setPendingPersonalNoteLinkId,
    setPersonalNotes,
  ]);

  const handleStartPersonalNoteEdit = useCallback((note: TNote) => {
    setEditingPersonalNoteId(note.id);
    setPersonalNoteDraftAgendaId(note.agendaId);
    setPersonalNoteDraftTitle(note.title);
    setPersonalNoteDraftBody(note.body);
  }, [
    setEditingPersonalNoteId,
    setPersonalNoteDraftAgendaId,
    setPersonalNoteDraftBody,
    setPersonalNoteDraftTitle,
  ]);

  const handleSavePersonalNoteEdit = useCallback((noteId: string) => {
    setPersonalNotes((prev) =>
      prev.map((note) =>
        note.id === noteId
          ? {
              ...note,
              title: personalNoteDraftTitle.trim() || note.title,
              body: personalNoteDraftBody.trim(),
            }
          : note,
      ),
    );
    clearPersonalNoteEditDraft();
    setActivityMessage("개인 메모를 수정했습니다.");
  }, [
    clearPersonalNoteEditDraft,
    personalNoteDraftBody,
    personalNoteDraftTitle,
    setActivityMessage,
    setPersonalNotes,
  ]);

  const handlePersonalNoteDragEnd = useCallback(() => {
    setDraggingPersonalNoteId("");
    setDropProblemGroupId("");
  }, [setDraggingPersonalNoteId, setDropProblemGroupId]);

  return {
    handleAddPersonalNote,
    handleDeletePersonalNote,
    handleStartPersonalNoteEdit,
    handleCancelPersonalNoteEdit: clearPersonalNoteEditDraft,
    handleSavePersonalNoteEdit,
    handlePersonalNoteDragEnd,
  };
}
