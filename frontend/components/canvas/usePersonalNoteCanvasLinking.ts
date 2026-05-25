"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

type CanvasItemLinkTargetModel = {
  id: string;
  agenda_id?: string;
  kind?: string;
  title?: string;
};

type PersonalNoteLinkModel = {
  id: string;
  agendaId: string;
  linkedCanvasItemId?: string;
  linkedCanvasItemTitle?: string;
};

type UsePersonalNoteCanvasLinkingOptions<TNote extends PersonalNoteLinkModel> = {
  composerAgendaId: string;
  composerPersonalNoteLinkId: string;
  pendingPersonalNoteLinkId: string;
  setActivityMessage: (message: string) => void;
  setComposerAgendaId: Dispatch<SetStateAction<string>>;
  setComposerLinkedCanvasItemId: Dispatch<SetStateAction<string>>;
  setComposerLinkedCanvasItemTitle: Dispatch<SetStateAction<string>>;
  setFocusedCanvasItemId: Dispatch<SetStateAction<string>>;
  setPendingPersonalNoteLinkId: Dispatch<SetStateAction<string>>;
  setPersonalNotes: Dispatch<SetStateAction<TNote[]>>;
  setSelectedCanvasItemId: Dispatch<SetStateAction<string>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
};

export function usePersonalNoteCanvasLinking<TNote extends PersonalNoteLinkModel>({
  composerAgendaId,
  composerPersonalNoteLinkId,
  pendingPersonalNoteLinkId,
  setActivityMessage,
  setComposerAgendaId,
  setComposerLinkedCanvasItemId,
  setComposerLinkedCanvasItemTitle,
  setFocusedCanvasItemId,
  setPendingPersonalNoteLinkId,
  setPersonalNotes,
  setSelectedCanvasItemId,
  setSelectedNodeId,
}: UsePersonalNoteCanvasLinkingOptions<TNote>) {
  const linkPendingPersonalNoteToCanvasItem = useCallback(
    (item: CanvasItemLinkTargetModel) => {
      if (!pendingPersonalNoteLinkId) return false;

      if (item.kind === "topic") {
        setActivityMessage("토픽 내용은 열어두고, 연결할 아이디어 노드를 선택해 주세요.");
        return false;
      }

      if (pendingPersonalNoteLinkId === composerPersonalNoteLinkId) {
        setComposerAgendaId(item.agenda_id || composerAgendaId);
        setComposerLinkedCanvasItemId(item.id);
        setComposerLinkedCanvasItemTitle(item.title || "연결 아이디어");
        setPendingPersonalNoteLinkId("");
        setFocusedCanvasItemId(item.id);
        setSelectedCanvasItemId(item.id);
        setSelectedNodeId(`canvas-item-${item.id}`);
        setActivityMessage("작성 중인 개인 메모에 연결할 아이디어를 선택했습니다.");
        return true;
      }

      setPersonalNotes((prev) =>
        prev.map((note) =>
          note.id === pendingPersonalNoteLinkId
            ? ({
                ...note,
                agendaId: item.agenda_id || note.agendaId,
                linkedCanvasItemId: item.id,
                linkedCanvasItemTitle: item.title || "연결 아이디어",
              } as TNote)
            : note,
        ),
      );
      setPendingPersonalNoteLinkId("");
      setFocusedCanvasItemId(item.id);
      setSelectedCanvasItemId(item.id);
      setSelectedNodeId(`canvas-item-${item.id}`);
      setActivityMessage("개인 메모를 선택한 아이디어 노드에 연결했습니다.");
      return true;
    },
    [
      composerAgendaId,
      composerPersonalNoteLinkId,
      pendingPersonalNoteLinkId,
      setActivityMessage,
      setComposerAgendaId,
      setComposerLinkedCanvasItemId,
      setComposerLinkedCanvasItemTitle,
      setFocusedCanvasItemId,
      setPendingPersonalNoteLinkId,
      setPersonalNotes,
      setSelectedCanvasItemId,
      setSelectedNodeId,
    ],
  );

  return {
    linkPendingPersonalNoteToCanvasItem,
  };
}
