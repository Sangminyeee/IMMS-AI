"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  confirmCanvasPlacement,
  exportAgendaMarkdown,
  exportAgendaSnapshot,
  generateCanvasProblemDefinition,
  generateCanvasSolutionStage,
  importAgendaSnapshot,
} from "@/lib/api";
import type {
  AgendaActionItemDetail,
  AgendaDecisionDetail,
  CanvasProblemDefinitionGroup,
  CanvasSolutionTopicResponse,
  MeetingState,
  TranscriptUtterance,
} from "@/lib/types";

export type MeetingTranscript = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
};

export type MeetingAgenda = {
  id: string;
  title: string;
  status: string;
};

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ComposerTool = "note" | "comment" | "topic";

type CanvasIdea = {
  id: string;
  agendaId: string;
  kind: ComposerTool;
  title: string;
  body: string;
  x: number;
  y: number;
};

type AgendaViewModel = {
  id: string;
  title: string;
  status: string;
  keywords: string[];
  summaryBullets: string[];
  utterances: Array<TranscriptUtterance & { turnId: number }>;
  decisions: AgendaDecisionDetail[];
  actionItems: AgendaActionItemDetail[];
};

type MeetingCanvasTabProps = {
  meetingId: string;
  meetingTitle: string;
  transcripts: MeetingTranscript[];
  agendas: MeetingAgenda[];
  analysisState: MeetingState | null;
  onSyncFromMeeting: (analyze?: boolean) => Promise<MeetingState | null>;
  syncStatusText: string;
  autoSyncing: boolean;
};

function stageLabel(stage: CanvasStage) {
  if (stage === "ideation") return "아이데이션";
  if (stage === "problem-definition") return "문제 정의";
  return "해결책";
}

function toolLabel(tool: ComposerTool) {
  if (tool === "note") return "메모";
  if (tool === "comment") return "코멘트";
  return "주제";
}

function safeDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeTranscriptRows(rows: MeetingTranscript[] | TranscriptUtterance[]) {
  return rows.map((row, index) => ({
    speaker: row.speaker,
    text: row.text,
    timestamp: row.timestamp,
    turnId: index + 1,
  }));
}

function buildAgendaModels(
  analysisState: MeetingState | null,
  agendas: MeetingAgenda[],
  transcripts: MeetingTranscript[],
): AgendaViewModel[] {
  const transcriptRows = normalizeTranscriptRows((analysisState?.transcript?.length ? analysisState.transcript : transcripts) || []);
  const outcomes = analysisState?.analysis?.agenda_outcomes || [];

  if (outcomes.length > 0) {
    return outcomes.map((outcome, index) => {
      const start = Math.max(1, Number(outcome.start_turn_id || 1));
      const end = Math.max(start, Number(outcome.end_turn_id || transcriptRows.length || start));
      return {
        id: outcome.agenda_id || `agenda-${index + 1}`,
        title: outcome.agenda_title || `안건 ${index + 1}`,
        status: outcome.agenda_state || "PROPOSED",
        keywords: outcome.agenda_keywords || [],
        summaryBullets:
          (outcome.agenda_summary_items || []).filter(Boolean).slice(0, 4).length > 0
            ? (outcome.agenda_summary_items || []).filter(Boolean).slice(0, 4)
            : [outcome.summary].filter(Boolean),
        utterances: transcriptRows.filter((row) => row.turnId >= start && row.turnId <= end),
        decisions: outcome.decision_results || [],
        actionItems: outcome.action_items || [],
      };
    });
  }

  if (agendas.length > 0) {
    return agendas.map((agenda, index) => ({
      id: agenda.id,
      title: agenda.title,
      status: agenda.status || "PROPOSED",
      keywords: [],
      summaryBullets: [],
      utterances: index === 0 ? transcriptRows : [],
      decisions: [],
      actionItems: [],
    }));
  }

  return [
    {
      id: "agenda-fallback",
      title: "현재 회의",
      status: "ACTIVE",
      keywords: [],
      summaryBullets: [],
      utterances: transcriptRows,
      decisions: [],
      actionItems: [],
    },
  ];
}

function makeNodeLabel(badge: string, title: string, body: string, meta: string[], accent: string) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${accent}`}>{badge}</span>
        {meta[0] ? <span className="text-[11px] text-slate-400">{meta[0]}</span> : null}
      </div>
      <strong className="mt-3 block text-sm text-slate-900">{title}</strong>
      {body ? <p className="mt-2 text-xs leading-5 text-slate-600">{body}</p> : null}
      {meta.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meta.slice(1, 4).map((item) => (
            <span key={`${title}-${item}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function MeetingCanvasTab({
  meetingId,
  meetingTitle,
  transcripts,
  agendas,
  analysisState,
  onSyncFromMeeting,
  syncStatusText,
  autoSyncing,
}: MeetingCanvasTabProps) {
  const [stage, setStage] = useState<CanvasStage>("ideation");
  const [composerTool, setComposerTool] = useState<ComposerTool>("note");
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [selectedAgendaId, setSelectedAgendaId] = useState("");
  const [activityMessage, setActivityMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<CanvasIdea[]>([]);
  const [problemGroups, setProblemGroups] = useState<CanvasProblemDefinitionGroup[]>([]);
  const [solutionTopics, setSolutionTopics] = useState<CanvasSolutionTopicResponse[]>([]);
  const [importedState, setImportedState] = useState<MeetingState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const flowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  const effectiveState = importedState ?? analysisState;
  const agendaModels = useMemo(() => buildAgendaModels(effectiveState, agendas, transcripts), [effectiveState, agendas, transcripts]);

  useEffect(() => {
    if (!selectedAgendaId && agendaModels[0]) {
      setSelectedAgendaId(agendaModels[0].id);
    }
  }, [agendaModels, selectedAgendaId]);

  const graph = useMemo(() => {
    if (stage === "problem-definition") {
      return {
        nodes: problemGroups.map((group, index) => ({
          id: `problem-${group.group_id}`,
          position: { x: 80 + index * 340, y: 120 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "rounded-3xl border border-violet-200 bg-violet-50 shadow-sm",
          style: { width: 300, borderRadius: 20, padding: 0 },
          data: {
            label: makeNodeLabel(
              `TOPIC ${index + 1}`,
              group.topic,
              group.conclusion,
              [`${group.agenda_titles.length}개 안건`, `${group.ideas.length}개 메모`, ...(group.keywords || []).slice(0, 2).map((item) => `#${item}`)],
              "bg-violet-100 text-violet-700",
            ),
          },
        })),
        edges: [] as Edge[],
      };
    }

    if (stage === "solution") {
      return {
        nodes: solutionTopics.map((topic, index) => ({
          id: `solution-${topic.group_id}`,
          position: { x: 80 + index * 340, y: 120 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "rounded-3xl border border-emerald-200 bg-emerald-50 shadow-sm",
          style: { width: 320, borderRadius: 20, padding: 0 },
          data: {
            label: makeNodeLabel(
              `SOLUTION ${topic.topic_no || index + 1}`,
              topic.topic,
              topic.ideas.join(" / "),
              [`아이디어 ${topic.ideas.length}개`, topic.conclusion || "결론 없음"],
              "bg-emerald-100 text-emerald-700",
            ),
          },
        })),
        edges: [] as Edge[],
      };
    }

    const nextNodes: Node[] = [];
    const nextEdges: Edge[] = [];
    const laneWidth = 320;

    agendaModels.forEach((agenda, agendaIndex) => {
      const laneX = 60 + agendaIndex * laneWidth;
      nextNodes.push({
        id: `agenda-${agenda.id}`,
        position: { x: laneX, y: 56 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        className: "rounded-3xl border border-blue-200 bg-blue-50 shadow-sm",
        style: { width: 260, borderRadius: 20, padding: 0 },
        data: {
          label: makeNodeLabel(
            "AGENDA",
            agenda.title,
            agenda.summaryBullets[0] || "요약이 아직 없습니다.",
            [agenda.status, ...(agenda.keywords || []).slice(0, 3).map((item) => `#${item}`)],
            "bg-blue-100 text-blue-700",
          ),
        },
      });

      agenda.summaryBullets.slice(0, 3).forEach((summary, summaryIndex) => {
        const summaryId = `summary-${agenda.id}-${summaryIndex}`;
        nextNodes.push({
          id: summaryId,
          position: { x: laneX, y: 240 + summaryIndex * 132 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "rounded-3xl border border-slate-200 bg-white shadow-sm",
          style: { width: 260, borderRadius: 20, padding: 0 },
          data: {
            label: makeNodeLabel(
              `POINT ${summaryIndex + 1}`,
              `핵심 포인트 ${summaryIndex + 1}`,
              summary,
              [`${agenda.utterances.length}개 발화`, ...(agenda.keywords || []).slice(0, 2).map((item) => `#${item}`)],
              "bg-slate-100 text-slate-700",
            ),
          },
        });
        nextEdges.push({
          id: `edge-agenda-${agenda.id}-${summaryIndex}`,
          source: `agenda-${agenda.id}`,
          target: summaryId,
          type: "smoothstep",
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        });
      });
    });

    ideas.forEach((idea, index) => {
      nextNodes.push({
        id: idea.id,
        position: { x: idea.x, y: idea.y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        className: "rounded-3xl border border-amber-200 bg-amber-50 shadow-sm",
        style: { width: 240, borderRadius: 20, padding: 0 },
        data: {
          label: makeNodeLabel(
            toolLabel(idea.kind).toUpperCase(),
            idea.title,
            idea.body,
            [agendaModels.find((agenda) => agenda.id === idea.agendaId)?.title || "미지정 안건", `#${index + 1}`],
            "bg-amber-100 text-amber-700",
          ),
        },
      });
      nextEdges.push({
        id: `edge-idea-${idea.id}`,
        source: `agenda-${idea.agendaId}`,
        target: idea.id,
        type: "smoothstep",
        style: { stroke: "#cbd5e1", strokeWidth: 1.25, strokeDasharray: "6 4" },
      });
    });

    return { nodes: nextNodes, edges: nextEdges };
  }, [stage, agendaModels, ideas, problemGroups, solutionTopics]);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

  useEffect(() => {
    if (!flowRef.current || nodes.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.2, duration: 250 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [nodes, edges, stage]);

  const selectedNode = useMemo(() => nodes.find((item) => item.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  const handleGenerateProblemDefinition = async () => {
    setBusy(true);
    try {
      const result = await generateCanvasProblemDefinition({
        topic: meetingTitle || effectiveState?.meeting_goal || "회의 주제",
        agendas: agendaModels.map((agenda) => ({
          agenda_id: agenda.id,
          title: agenda.title,
          keywords: agenda.keywords,
          summary_bullets: agenda.summaryBullets,
        })),
        ideas: ideas.map((idea) => ({
          id: idea.id,
          agenda_id: idea.agendaId,
          kind: idea.kind,
          title: idea.title,
          body: idea.body,
        })),
      });
      setProblemGroups(result.groups);
      setStage("problem-definition");
      setActivityMessage(result.warning || `문제 정의 주제 ${result.groups.length}개를 생성했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActivityMessage(`문제 정의 생성 실패: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSolutionStage = async () => {
    setBusy(true);
    try {
      const result = await generateCanvasSolutionStage({
        meeting_topic: meetingTitle || effectiveState?.meeting_goal || "회의 주제",
        topics: problemGroups.map((group, index) => ({
          group_id: group.group_id,
          topic_no: index + 1,
          topic: group.topic,
          conclusion: group.conclusion,
        })),
      });
      setSolutionTopics(result.topics);
      setStage("solution");
      setActivityMessage(result.warning || `해결책 묶음 ${result.topics.length}개를 생성했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActivityMessage(`해결책 생성 실패: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (stage !== "ideation" || !flowRef.current) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".react-flow__node, .react-flow__controls, .react-flow__minimap, button, input, textarea, label")) {
      return;
    }
    const agendaId = selectedAgendaId || agendaModels[0]?.id;
    if (!agendaId) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const position = flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const nextIdea: CanvasIdea = {
      id: `idea-${Date.now()}`,
      agendaId,
      kind: composerTool,
      title: composerTitle.trim() || `${toolLabel(composerTool)} ${ideas.length + 1}`,
      body: composerBody.trim() || "이 메모는 문제 정의/해결책 단계 생성에 반영됩니다.",
      x: position.x,
      y: position.y,
    };
    setIdeas((prev) => [...prev, nextIdea]);
    setSelectedNodeId(nextIdea.id);
    setComposerTitle("");
    setComposerBody("");
    void confirmCanvasPlacement({
      tool: composerTool,
      ui_x: event.clientX - bounds.left,
      ui_y: event.clientY - bounds.top,
      flow_x: position.x,
      flow_y: position.y,
      agenda_id: agendaId,
      title: nextIdea.title,
      body: nextIdea.body,
    }).catch(() => undefined);
  };

  const onNodesChange = (changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  };

  const onConnect = (connection: Connection) => {
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: `user-edge-${Date.now()}`,
          type: "smoothstep",
          style: { stroke: "#94a3b8", strokeWidth: 1.25 },
        },
        current,
      ),
    );
  };

  const handleNodeDragStop = (_event: React.MouseEvent, node: Node) => {
    if (!node.id.startsWith("idea-")) return;
    setIdeas((prev) => prev.map((item) => (item.id === node.id ? { ...item, x: node.position.x, y: node.position.y } : item)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 xl:gap-0">
      <section className="relative h-full min-h-[820px] overflow-hidden border border-slate-200 bg-slate-100 shadow-sm xl:min-h-0 xl:border-x-0 xl:border-b-0 xl:shadow-none">
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-3 md:inset-x-4 md:top-4 md:flex-row md:items-start md:justify-between">
          <div className="pointer-events-auto max-w-md rounded-[24px] border border-slate-200/80 bg-white/92 px-5 py-4 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Canvas Workspace</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{meetingTitle || "회의 캔버스"}</h2>
            <p className="mt-2 text-sm text-slate-500">{syncStatusText}</p>
            {activityMessage ? <p className="mt-1 text-xs text-slate-400">{activityMessage}</p> : null}
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 md:justify-end">
            <span className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold ${autoSyncing ? "bg-blue-50 text-blue-700" : "bg-white text-slate-600"}`}>
              {autoSyncing ? "자동 동기화 중" : "실시간 자동 동기화"}
            </span>
            <button type="button" onClick={() => void onSyncFromMeeting(false).then(() => exportAgendaMarkdown()).then((res) => safeDownload(res.filename, res.markdown, "text/markdown;charset=utf-8"))} className="rounded-xl border border-slate-200 bg-white/92 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md hover:bg-white">
              Markdown 내보내기
            </button>
            <button type="button" onClick={() => void onSyncFromMeeting(false).then(() => exportAgendaSnapshot()).then((res) => safeDownload(res.filename, JSON.stringify(res.snapshot, null, 2), "application/json;charset=utf-8"))} className="rounded-xl border border-slate-200 bg-white/92 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md hover:bg-white">
              Snapshot 저장
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-slate-200 bg-white/92 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md hover:bg-white">
              Snapshot 불러오기
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void importAgendaSnapshot({ file, reset_state: true }).then((result) => {
                    setImportedState(result.state);
                    setProblemGroups([]);
                    setSolutionTopics([]);
                    setStage("ideation");
                    setActivityMessage(`스냅샷을 불러왔습니다: ${result.import_debug.filename}`);
                  });
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        <div className="h-[820px] w-full xl:h-full" onClick={handleCanvasClick}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={(instance) => {
              flowRef.current = instance;
            }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={handleNodeDragStop}
            fitView
            fitViewOptions={{ padding: 0.16, duration: 300 }}
            minZoom={0.45}
            maxZoom={1.6}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#dbe3f0" />
            <MiniMap zoomable pannable />
            <Controls />
          </ReactFlow>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4 top-[136px] hidden w-[320px] xl:flex xl:flex-col xl:gap-4">
          <section className="pointer-events-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-900">캔버스 단계</h3>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
              {(["ideation", "problem-definition", "solution"] as CanvasStage[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStage(item)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${stage === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {stageLabel(item)}
                </button>
              ))}
            </div>
          </section>

          <section className="pointer-events-auto max-h-[260px] overflow-y-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">소스 안건</h3>
              <span className="text-xs text-slate-500">{agendaModels.length}개</span>
            </div>
            <div className="mt-4 space-y-3">
              {agendaModels.map((agenda) => (
                <button key={agenda.id} type="button" onClick={() => setSelectedAgendaId(agenda.id)} className={`w-full rounded-2xl border px-4 py-3 text-left ${selectedAgendaId === agenda.id ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <strong className="text-sm text-slate-900">{agenda.title}</strong>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{agenda.summaryBullets[0] || "요약이 아직 없습니다."}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="pointer-events-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-900">캔버스 작성</h3>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["note", "comment", "topic"] as ComposerTool[]).map((item) => (
                <button key={item} type="button" onClick={() => setComposerTool(item)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${composerTool === item ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {toolLabel(item)}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <select value={selectedAgendaId} onChange={(event) => setSelectedAgendaId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                {agendaModels.map((agenda) => (
                  <option key={agenda.id} value={agenda.id}>
                    {agenda.title}
                  </option>
                ))}
              </select>
              <input value={composerTitle} onChange={(event) => setComposerTitle(event.target.value)} placeholder="카드 제목" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
              <textarea value={composerBody} onChange={(event) => setComposerBody(event.target.value)} placeholder="보드를 클릭하면 이 메모가 그 위치에 배치됩니다." className="min-h-[96px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
            </div>
          </section>

          <section className="pointer-events-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-900">AI 단계 전환</h3>
            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => void handleGenerateProblemDefinition()} disabled={busy || agendaModels.length === 0} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                문제 정의 생성
              </button>
              <button type="button" onClick={() => void handleGenerateSolutionStage()} disabled={busy || problemGroups.length === 0} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                해결책 생성
              </button>
            </div>
          </section>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 top-[136px] hidden w-[360px] xl:flex xl:flex-col xl:gap-4">
          <section className="pointer-events-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-900">선택 상세</h3>
            {!selectedNode ? (
              <p className="mt-3 text-sm leading-6 text-slate-500">캔버스 카드를 선택하면 상세 정보가 여기에 표시됩니다.</p>
            ) : (
              <div className="mt-4 text-sm text-slate-600">{selectedNode.data.label as React.ReactNode}</div>
            )}
          </section>

          <section className="pointer-events-auto max-h-[280px] overflow-y-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-900">문제 정의 결과</h3>
            <div className="mt-4 space-y-3">
              {problemGroups.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">문제 정의를 생성하면 주제 결론이 이 영역에 표시됩니다.</p>
              ) : (
                problemGroups.map((group) => (
                  <article key={group.group_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">{group.topic}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{group.conclusion}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="pointer-events-auto max-h-[280px] overflow-y-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-900">해결책 아이디어</h3>
            <div className="mt-4 space-y-3">
              {solutionTopics.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">해결책을 생성하면 주제별 아이디어가 이 영역에 정리됩니다.</p>
              ) : (
                solutionTopics.map((topic) => (
                  <article key={topic.group_id} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">{topic.topic}</h4>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      {topic.ideas.map((idea) => (
                        <li key={`${topic.group_id}-${idea}`}>• {idea}</li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>

      <div className="grid gap-4 px-4 pb-4 xl:hidden">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">캔버스 단계</h3>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
            {(["ideation", "problem-definition", "solution"] as CanvasStage[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStage(item)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${stage === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {stageLabel(item)}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">소스 안건</h3>
            <span className="text-xs text-slate-500">{agendaModels.length}개</span>
          </div>
          <div className="mt-4 space-y-3">
            {agendaModels.map((agenda) => (
              <button key={agenda.id} type="button" onClick={() => setSelectedAgendaId(agenda.id)} className={`w-full rounded-2xl border px-4 py-3 text-left ${selectedAgendaId === agenda.id ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <strong className="text-sm text-slate-900">{agenda.title}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-500">{agenda.summaryBullets[0] || "요약이 아직 없습니다."}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">캔버스 작성</h3>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["note", "comment", "topic"] as ComposerTool[]).map((item) => (
              <button key={item} type="button" onClick={() => setComposerTool(item)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${composerTool === item ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {toolLabel(item)}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <select value={selectedAgendaId} onChange={(event) => setSelectedAgendaId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              {agendaModels.map((agenda) => (
                <option key={agenda.id} value={agenda.id}>
                  {agenda.title}
                </option>
              ))}
            </select>
            <input value={composerTitle} onChange={(event) => setComposerTitle(event.target.value)} placeholder="카드 제목" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
            <textarea value={composerBody} onChange={(event) => setComposerBody(event.target.value)} placeholder="보드를 클릭하면 이 메모가 그 위치에 배치됩니다." className="min-h-[96px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">AI 단계 전환</h3>
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={() => void handleGenerateProblemDefinition()} disabled={busy || agendaModels.length === 0} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              문제 정의 생성
            </button>
            <button type="button" onClick={() => void handleGenerateSolutionStage()} disabled={busy || problemGroups.length === 0} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              해결책 생성
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">선택 상세</h3>
          {!selectedNode ? (
            <p className="mt-3 text-sm leading-6 text-slate-500">캔버스 카드를 선택하면 상세 정보가 여기에 표시됩니다.</p>
          ) : (
            <div className="mt-4 text-sm text-slate-600">{selectedNode.data.label as React.ReactNode}</div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">문제 정의 결과</h3>
          <div className="mt-4 space-y-3">
            {problemGroups.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">문제 정의를 생성하면 주제 결론이 이 영역에 표시됩니다.</p>
            ) : (
              problemGroups.map((group) => (
                <article key={group.group_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">{group.topic}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{group.conclusion}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">해결책 아이디어</h3>
          <div className="mt-4 space-y-3">
            {solutionTopics.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">해결책을 생성하면 주제별 아이디어가 이 영역에 정리됩니다.</p>
            ) : (
              solutionTopics.map((topic) => (
                <article key={topic.group_id} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">{topic.topic}</h4>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    {topic.ideas.map((idea) => (
                      <li key={`${topic.group_id}-${idea}`}>• {idea}</li>
                    ))}
                  </ul>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
