"use client";

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";

type CanvasStage = "ideation" | "problem-definition" | "solution";

export type CanvasRightDrawerPersonalNote = {
  id: string;
  projectId: string;
  agendaId: string;
  linkedCanvasItemId?: string;
  linkedCanvasItemTitle?: string;
  kind: "note" | "comment" | "topic";
  title: string;
  body: string;
};

function KeyboardDoubleArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M18.41 5.41 11.83 12l6.58 6.59L17 20l-8-8 8-8 1.41 1.41Zm-6 0L5.83 12l6.58 6.59L11 20l-8-8 8-8 1.41 1.41Z" />
    </svg>
  );
}

function RightDrawerPanel({
  className,
  bodyClassName,
  bodyStyle,
  children,
}: {
  className: string;
  bodyClassName: string;
  bodyStyle?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <aside className={className}>
      <div className={bodyClassName} style={bodyStyle}>
        {children}
      </div>
    </aside>
  );
}

function RightDrawerSectionHeader({
  eyebrow,
  title,
  titleClassName = "mt-1 text-lg font-semibold leading-tight text-black",
  action,
}: {
  eyebrow: string;
  title: string;
  titleClassName?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-black/50">{eyebrow}</p>
        <h3 className={titleClassName}>{title}</h3>
      </div>
      {action}
    </div>
  );
}

function RightDetailPanelContent({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`imms-left-panel-detail mt-[clamp(0.875rem,1.5vw,1rem)] ${collapsed ? "hidden" : ""}`}>
      {children}
    </div>
  );
}

function RightDetailPanelShell({
  collapsed,
  onToggleCollapsed,
  children,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="border-b border-black/10 pb-[clamp(0.875rem,1.4vw,1rem)]">
        <RightDrawerSectionHeader
          eyebrow="선택 정보"
          title="내용 상세보기"
          action={
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="shrink-0 rounded-full border border-black/10 bg-[#eff0f6] px-3 py-1 text-sm font-semibold text-[#4d4d4d] transition hover:bg-[#e3e5ee]"
            >
              {collapsed ? "열기" : "접기"}
            </button>
          }
        />
      </div>
      <RightDetailPanelContent collapsed={collapsed}>
        {children}
      </RightDetailPanelContent>
    </>
  );
}

function RightDetailEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-black/10 bg-[#fafafa] px-4 py-5">
      <p className="text-base font-semibold text-slate-900">선택된 내용이 없습니다</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        왼쪽 캔버스에서 그룹을 선택하거나 오른쪽 캔버스에서 아이디어/댓글을 선택하면 상세 정보가 표시됩니다.
      </p>
    </div>
  );
}

function RightDrawerNotesPanel({
  collapsed,
  noteCount,
  onToggleCollapsed,
  children,
}: {
  collapsed: boolean;
  noteCount: number;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-black/10 pb-[clamp(1rem,2vh,1.5rem)]">
      <RightDrawerSectionHeader
        eyebrow="Personal note"
        title="개인 노트"
        titleClassName="mt-1 text-xl font-semibold leading-tight text-black"
        action={
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="shrink-0 rounded-full border border-black/10 bg-[#eff0f6] px-3 py-1 text-sm font-semibold text-[#4d4d4d] transition hover:bg-[#e3e5ee]"
          >
            {collapsed ? "열기" : `${noteCount}개 · 접기`}
          </button>
        }
      />
      {collapsed ? null : children}
    </section>
  );
}

function PersonalNoteComposer({
  composerTitle,
  composerBody,
  composerBodyRef,
  onTitleChange,
  onBodyChange,
  onSave,
}: {
  composerTitle: string;
  composerBody: string;
  composerBodyRef: RefObject<HTMLTextAreaElement | null>;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <input value={composerTitle} onChange={(event) => onTitleChange(event.target.value)} placeholder="메모 제목" className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-base text-[#4d4d4d] focus:border-black/30 focus:outline-none" />
      <textarea ref={composerBodyRef} value={composerBody} onChange={(event) => onBodyChange(event.target.value)} placeholder="메모 내용" className="min-h-[118px] w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-base leading-7 text-[#4d4d4d] focus:border-black/30 focus:outline-none" />
      <button type="button" onClick={onSave} className="ml-auto block rounded-full bg-[#eff0f6] px-5 py-2 text-sm font-medium text-[#4d4d4d] hover:bg-[#e3e5ee]">
        개인 메모 저장
      </button>
    </div>
  );
}

function PersonalNoteList({
  notes,
  stage,
  editingPersonalNoteId,
  draggingPersonalNoteId,
  personalNoteDraftTitle,
  personalNoteDraftBody,
  onDragStartNote,
  onDragEndNote,
  onDraftTitleChange,
  onDraftBodyChange,
  onCancelEdit,
  onSaveEdit,
  onStartEdit,
  onDelete,
}: {
  notes: CanvasRightDrawerPersonalNote[];
  stage: CanvasStage;
  editingPersonalNoteId: string;
  draggingPersonalNoteId: string;
  personalNoteDraftTitle: string;
  personalNoteDraftBody: string;
  onDragStartNote: (noteId: string) => void;
  onDragEndNote: () => void;
  onDraftTitleChange: (value: string) => void;
  onDraftBodyChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (noteId: string) => void;
  onStartEdit: (note: CanvasRightDrawerPersonalNote) => void;
  onDelete: (noteId: string) => void;
}) {
  return (
    <section className="pt-[clamp(1rem,2vh,1.5rem)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-black">내 메모 목록</h3>
        <span className="rounded-full border border-black/10 bg-[#eff0f6] px-3 py-1 text-sm font-medium text-[#4d4d4d]">
          {notes.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {notes.length === 0 ? (
          <p className="text-base leading-7 text-slate-500">이 프로젝트에 저장한 개인 메모가 없습니다.</p>
        ) : (
          notes.map((note) => {
            const isEditing = editingPersonalNoteId === note.id;

            return (
              <article
                key={note.id}
                draggable={stage === "problem-definition" && !isEditing}
                onDragStart={(event) => {
                  if (stage !== "problem-definition" || isEditing) return;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-imms-note-id", note.id);
                  event.dataTransfer.setData("text/plain", note.id);
                  onDragStartNote(note.id);
                }}
                onDragEnd={onDragEndNote}
                className={`rounded-xl border border-black/10 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] ${stage === "problem-definition" && !isEditing ? "cursor-grab active:cursor-grabbing" : ""} ${draggingPersonalNoteId === note.id ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        value={personalNoteDraftTitle}
                        onChange={(event) => onDraftTitleChange(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-900"
                      />
                    ) : (
                      <h4 className="text-base font-semibold text-slate-900">{note.title}</h4>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={onCancelEdit} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                          취소
                        </button>
                        <button type="button" onClick={() => onSaveEdit(note.id)} className="text-sm font-medium text-slate-700 hover:text-slate-900">
                          저장
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onStartEdit(note)} className="text-sm font-medium text-slate-400 hover:text-slate-600">
                          수정
                        </button>
                        <button type="button" onClick={() => onDelete(note.id)} className="text-sm font-medium text-slate-400 hover:text-slate-600">
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <textarea
                    value={personalNoteDraftBody}
                    onChange={(event) => onDraftBodyChange(event.target.value)}
                    className="mt-3 min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
                  />
                ) : (
                  <p className="mt-2 text-base leading-7 text-slate-600">{note.body}</p>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

type CanvasRightDrawerProps = {
  collapsed: boolean;
  contentVisible: boolean;
  detailCollapsed: boolean;
  notesCollapsed: boolean;
  showDetailPanel: boolean;
  expandedWidth: string;
  isDesktopLayout: boolean;
  detailContent: ReactNode;
  composerTitle: string;
  composerBody: string;
  composerBodyRef: RefObject<HTMLTextAreaElement | null>;
  notes: CanvasRightDrawerPersonalNote[];
  stage: CanvasStage;
  editingPersonalNoteId: string;
  draggingPersonalNoteId: string;
  personalNoteDraftTitle: string;
  personalNoteDraftBody: string;
  quickAskSlot: ReactNode;
  onToggleDrawer: () => void;
  onStartResize: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onToggleDetailCollapsed: () => void;
  onToggleNotesCollapsed: () => void;
  onComposerTitleChange: (value: string) => void;
  onComposerBodyChange: (value: string) => void;
  onSavePersonalNote: () => void;
  onDragStartNote: (noteId: string) => void;
  onDragEndNote: () => void;
  onPersonalNoteDraftTitleChange: (value: string) => void;
  onPersonalNoteDraftBodyChange: (value: string) => void;
  onCancelPersonalNoteEdit: () => void;
  onSavePersonalNoteEdit: (noteId: string) => void;
  onStartPersonalNoteEdit: (note: CanvasRightDrawerPersonalNote) => void;
  onDeletePersonalNote: (noteId: string) => void;
};

export function CanvasRightDrawer({
  collapsed,
  contentVisible,
  detailCollapsed,
  notesCollapsed,
  showDetailPanel,
  expandedWidth,
  isDesktopLayout,
  detailContent,
  composerTitle,
  composerBody,
  composerBodyRef,
  notes,
  stage,
  editingPersonalNoteId,
  draggingPersonalNoteId,
  personalNoteDraftTitle,
  personalNoteDraftBody,
  quickAskSlot,
  onToggleDrawer,
  onStartResize,
  onToggleDetailCollapsed,
  onToggleNotesCollapsed,
  onComposerTitleChange,
  onComposerBodyChange,
  onSavePersonalNote,
  onDragStartNote,
  onDragEndNote,
  onPersonalNoteDraftTitleChange,
  onPersonalNoteDraftBodyChange,
  onCancelPersonalNoteEdit,
  onSavePersonalNoteEdit,
  onStartPersonalNoteEdit,
  onDeletePersonalNote,
}: CanvasRightDrawerProps) {
  const bodyClassName = contentVisible
    ? `imms-drawer-body imms-overlay-scroll box-border h-full translate-x-0 overflow-y-auto px-[clamp(1rem,1.6vw,1.35rem)] py-[clamp(1rem,2vh,1.5rem)] opacity-100 xl:overflow-y-auto ${
        showDetailPanel ? "max-h-[min(48vh,500px)] xl:max-h-none" : "max-h-none"
      }`
    : `imms-drawer-body ${collapsed ? "hidden " : ""}pointer-events-none translate-x-8 opacity-0`;
  const bodyStyle = isDesktopLayout && !collapsed ? { width: expandedWidth } : undefined;
  const wrapperClassName = `imms-drawer-pane imms-side-panel relative order-2 flex min-h-[min(34vh,420px)] flex-col overflow-visible border-b border-black/10 shadow-[inset_1px_0_0_rgba(0,0,0,0.04)] xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:min-h-0 xl:border-b-0 ${collapsed ? "border border-black/10 bg-[#f7f8fb]" : "bg-white"}`;
  const topPanelClassName = "imms-drawer-pane imms-side-panel imms-left-panel relative min-h-[min(34vh,420px)] flex-1 overflow-hidden bg-transparent";
  const toggleClassName = `pointer-events-auto absolute top-1/2 z-50 flex h-[clamp(2.25rem,3vw,2.75rem)] w-[clamp(2.25rem,3vw,2.75rem)] items-center justify-center rounded-full border border-black/10 bg-white text-[#4d4d4d] shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-300 hover:bg-[#f5f6f8] ${
    collapsed ? "left-1/2 -translate-x-1/2 -translate-y-1/2" : "left-0 -translate-x-1/2 -translate-y-1/2"
  }`;
  const toggleIconClassName = `h-5 w-5 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`;
  const resizeHandleClassName = "absolute left-[-7px] top-0 hidden h-full w-4 cursor-ew-resize xl:block";
  const bottomPanelClassName = `imms-drawer-pane imms-side-panel imms-right-panel relative flex-1 overflow-hidden bg-transparent ${
    showDetailPanel ? "min-h-[min(34vh,420px)] max-h-[min(48vh,500px)] xl:min-h-0 xl:max-h-none" : "min-h-0 max-h-none"
  } ${
    collapsed && !contentVisible
      ? "hidden pointer-events-none -translate-x-8 px-0 py-0 opacity-0"
      : `${showDetailPanel ? "border-t-4 border-[#d5d5d5]" : ""} translate-x-0 opacity-100`
  }`;

  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        aria-label={collapsed ? "오른쪽 패널 열기" : "오른쪽 패널 접기"}
        onClick={onToggleDrawer}
        className={toggleClassName}
      >
        <KeyboardDoubleArrowLeftIcon className={toggleIconClassName} />
      </button>
      <button
        type="button"
        aria-label="오른쪽 패널 너비 조절"
        onMouseDown={onStartResize}
        className={resizeHandleClassName}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/10" />
      </button>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showDetailPanel ? (
          <RightDrawerPanel
            className={topPanelClassName}
            bodyClassName={bodyClassName}
            bodyStyle={bodyStyle}
          >
            <RightDetailPanelShell
              collapsed={detailCollapsed}
              onToggleCollapsed={onToggleDetailCollapsed}
            >
              {detailContent || <RightDetailEmptyState />}
            </RightDetailPanelShell>
          </RightDrawerPanel>
        ) : null}

        <RightDrawerPanel
          className={bottomPanelClassName}
          bodyClassName={bodyClassName}
          bodyStyle={bodyStyle}
        >
          <RightDrawerNotesPanel
            collapsed={notesCollapsed}
            noteCount={notes.length}
            onToggleCollapsed={onToggleNotesCollapsed}
          >
            <PersonalNoteComposer
              composerTitle={composerTitle}
              composerBody={composerBody}
              composerBodyRef={composerBodyRef}
              onTitleChange={onComposerTitleChange}
              onBodyChange={onComposerBodyChange}
              onSave={onSavePersonalNote}
            />
          </RightDrawerNotesPanel>

          {notesCollapsed ? null : (
            <PersonalNoteList
              notes={notes}
              stage={stage}
              editingPersonalNoteId={editingPersonalNoteId}
              draggingPersonalNoteId={draggingPersonalNoteId}
              personalNoteDraftTitle={personalNoteDraftTitle}
              personalNoteDraftBody={personalNoteDraftBody}
              onDragStartNote={onDragStartNote}
              onDragEndNote={onDragEndNote}
              onDraftTitleChange={onPersonalNoteDraftTitleChange}
              onDraftBodyChange={onPersonalNoteDraftBodyChange}
              onCancelEdit={onCancelPersonalNoteEdit}
              onSaveEdit={onSavePersonalNoteEdit}
              onStartEdit={onStartPersonalNoteEdit}
              onDelete={onDeletePersonalNote}
            />
          )}
        </RightDrawerPanel>
      </div>
      {quickAskSlot}
    </div>
  );
}
