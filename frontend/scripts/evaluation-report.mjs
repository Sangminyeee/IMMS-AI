#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output", "evaluation");
const DEFAULT_STT_TIMEOUT_MS = 180_000;
const DEFAULT_SUMMARY_TIMEOUT_MS = 240_000;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const raw = token.slice(2);
    const equalsIndex = raw.indexOf("=");
    const name = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    const value =
      equalsIndex >= 0
        ? raw.slice(equalsIndex + 1)
        : argv[index + 1] && !argv[index + 1].startsWith("--")
          ? argv[++index]
          : "true";
    if (args[name] === undefined) {
      args[name] = value;
    } else if (Array.isArray(args[name])) {
      args[name].push(value);
    } else {
      args[name] = [args[name], value];
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run report:evaluation -- [options]

STT accuracy / latency:
  --audio=<path>              Audio file to send to /api/transcribe-chunk. Repeatable.
  --reference=<path>          Ground-truth transcript text for STT accuracy.
  --meeting-goal=<text>       Optional STT refinement meeting goal.
  --meeting-context=<text>    Optional STT refinement context terms.

Summary latency:
  --summary-payload=<path>    JSON payload for a summary API call.
  --summary-endpoint=<name>   summary-document | summary-conclusion. Default: summary-document.
  --transcript=<path>         Full transcript/source text for normalized speed metrics.

Multi-client smoke report:
  --multiclient-report=<path> Existing report-*.json from smoke:multiclient-canvas. Repeatable.

Common:
  --backend-url=<url>         Backend API URL. Default: ${DEFAULT_BACKEND_URL}
  --output-dir=<path>         Report directory. Default: ${DEFAULT_OUTPUT_DIR}
  --stt-timeout-ms=<ms>       Default: ${DEFAULT_STT_TIMEOUT_MS}
  --summary-timeout-ms=<ms>   Default: ${DEFAULT_SUMMARY_TIMEOUT_MS}

Examples:
  npm run report:evaluation -- --audio=../samples/demo.wav --reference=../samples/demo-script.txt
  npm run report:evaluation -- --summary-payload=../samples/summary-payload.json --transcript=../samples/transcript.txt
`);
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function optionValue(args, name, fallback = "") {
  return args[name] ?? process.env[`MOA_EVAL_${name.replaceAll("-", "_").toUpperCase()}`] ?? fallback;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildOptions() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    process.exit(0);
  }
  const backendUrl = String(optionValue(args, "backend-url", DEFAULT_BACKEND_URL)).replace(/\/+$/, "");
  const summaryEndpointName = String(optionValue(args, "summary-endpoint", "summary-document")).toLowerCase();
  if (!["summary-document", "summary-conclusion"].includes(summaryEndpointName)) {
    throw new Error("--summary-endpoint는 summary-document 또는 summary-conclusion 이어야 합니다.");
  }
  return {
    audioPaths: asArray(args.audio).map((entry) => path.resolve(String(entry))),
    backendUrl,
    meetingContext: String(optionValue(args, "meeting-context", "")),
    meetingGoal: String(optionValue(args, "meeting-goal", "")),
    multiclientReports: asArray(args["multiclient-report"]).map((entry) => path.resolve(String(entry))),
    outputDir: path.resolve(String(optionValue(args, "output-dir", DEFAULT_OUTPUT_DIR))),
    referencePath: args.reference ? path.resolve(String(args.reference)) : "",
    sttTimeoutMs: toInt(optionValue(args, "stt-timeout-ms"), DEFAULT_STT_TIMEOUT_MS),
    summaryEndpointName,
    summaryPayloadPath: args["summary-payload"] ? path.resolve(String(args["summary-payload"])) : "",
    summaryTimeoutMs: toInt(optionValue(args, "summary-timeout-ms"), DEFAULT_SUMMARY_TIMEOUT_MS),
    transcriptPath: args.transcript ? path.resolve(String(args.transcript)) : "",
  };
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForCer(value) {
  return compactWhitespace(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, "");
}

function normalizeForWer(value) {
  return compactWhitespace(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const left = Array.isArray(a) ? a : Array.from(String(a || ""));
  const right = Array.isArray(b) ? b : Array.from(String(b || ""));
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  let curr = new Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[right.length];
}

function ratio(distance, total) {
  if (!total) return distance === 0 ? 0 : 1;
  return distance / total;
}

function computeTextMetrics(reference, hypothesis) {
  const referenceCompact = compactWhitespace(reference);
  const hypothesisCompact = compactWhitespace(hypothesis);
  const referenceChars = Array.from(referenceCompact);
  const hypothesisChars = Array.from(hypothesisCompact);
  const cerDistance = levenshteinDistance(referenceChars, hypothesisChars);

  const referenceNormalized = normalizeForCer(reference);
  const hypothesisNormalized = normalizeForCer(hypothesis);
  const normalizedCerDistance = levenshteinDistance(referenceNormalized, hypothesisNormalized);

  const referenceWords = normalizeForWer(reference).split(" ").filter(Boolean);
  const hypothesisWords = normalizeForWer(hypothesis).split(" ").filter(Boolean);
  const werDistance = levenshteinDistance(referenceWords, hypothesisWords);

  return {
    cer: ratio(cerDistance, referenceChars.length),
    cer_distance: cerDistance,
    cer_reference_chars: referenceChars.length,
    normalized_cer: ratio(normalizedCerDistance, Array.from(referenceNormalized).length),
    normalized_cer_distance: normalizedCerDistance,
    normalized_cer_reference_chars: Array.from(referenceNormalized).length,
    wer: ratio(werDistance, referenceWords.length),
    wer_distance: werDistance,
    wer_reference_words: referenceWords.length,
    hypothesis_chars: hypothesisChars.length,
    reference_chars: referenceChars.length,
  };
}

async function readTextIfPresent(filePath) {
  if (!filePath) return "";
  return fs.readFile(filePath, "utf8");
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function extractSummaryText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value.markdown === "string") return value.markdown;
  if (typeof value.summary === "string") return value.summary;
  if (Array.isArray(value.document_blocks)) {
    return value.document_blocks
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        if (typeof block.text === "string") return block.text;
        if (Array.isArray(block.items)) return block.items.join("\n");
        if (Array.isArray(block.rows)) return JSON.stringify(block.rows, null, 2);
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return JSON.stringify(value, null, 2);
}

function wavDurationSeconds(buffer) {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt " && chunkStart + 12 <= buffer.length) {
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    }
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  if (!byteRate || !dataSize) return null;
  return dataSize / byteRate;
}

async function postMultipart(url, fields, fileField, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  const fileBuffer = await fs.readFile(fileField.path);
  const blob = new Blob([fileBuffer], { type: fileField.type || "application/octet-stream" });
  form.append(fileField.name, blob, path.basename(fileField.path));
  const started = performance.now();
  try {
    const response = await fetch(url, { method: "POST", body: form, signal: controller.signal });
    const text = await response.text();
    const elapsedMs = Math.round(performance.now() - started);
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { body, elapsedMs, ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    const elapsedMs = Math.round(performance.now() - started);
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { body, elapsedMs, ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSttEvaluations(options, referenceText) {
  const results = [];
  for (const audioPath of options.audioPaths) {
    const fileBuffer = await fs.readFile(audioPath);
    const durationSec = wavDurationSeconds(fileBuffer);
    const response = await postMultipart(
      `${options.backendUrl}/api/transcribe-chunk`,
      {
        meeting_goal: options.meetingGoal,
        meeting_goal_context: options.meetingContext,
      },
      { name: "audio_file", path: audioPath },
      options.sttTimeoutMs,
    );
    const rawText = String(response.body.raw_text || "");
    const refinedText = String(response.body.refined_text || response.body.text || "");
    const metrics = referenceText ? computeTextMetrics(referenceText, refinedText || rawText) : null;
    results.push({
      audio_path: audioPath,
      backend_elapsed_ms: Number(response.body.elapsed_ms || 0) || null,
      bytes: fileBuffer.length,
      duration_sec: durationSec,
      error: response.body.error || "",
      http_elapsed_ms: response.elapsedMs,
      http_ok: response.ok,
      http_status: response.status,
      metrics,
      model: response.body.model || "",
      raw_text: rawText,
      refined_text: refinedText,
      refine_used_llm: Boolean(response.body.refine_used_llm),
      rtf: durationSec ? response.elapsedMs / 1000 / durationSec : null,
    });
  }
  return results;
}

function sourceCharCountFromSummaryPayload(payload, transcriptText) {
  if (transcriptText) return compactWhitespace(transcriptText).length;
  const chunks = [];
  for (const key of ["meeting_topic", "meetingTopic"]) {
    if (payload?.[key]) chunks.push(String(payload[key]));
  }
  for (const node of payload?.nodes || []) {
    chunks.push(node.title || "", node.body || "");
  }
  for (const group of payload?.groups || []) {
    chunks.push(group.title || "", group.rationale || "");
  }
  return compactWhitespace(chunks.join(" ")).length;
}

async function runSummaryGeneration(options, transcriptText, preloadedPayload = null) {
  if (!options.summaryPayloadPath) return null;
  const payload = preloadedPayload || (await readJson(options.summaryPayloadPath));
  const endpoint = `${options.backendUrl}/api/canvas/${options.summaryEndpointName}`;
  const response = await postJson(endpoint, payload, options.summaryTimeoutMs);
  const summaryText = extractSummaryText(response.body);
  const sourceChars = sourceCharCountFromSummaryPayload(payload, transcriptText);
  return {
    endpoint,
    error: response.body.error || "",
    generated_summary_text: summaryText,
    http_elapsed_ms: response.elapsedMs,
    http_ok: response.ok,
    http_status: response.status,
    response: response.body,
    seconds_per_1000_source_chars: sourceChars ? response.elapsedMs / 1000 / (sourceChars / 1000) : null,
    source_chars: sourceChars,
    summary_chars: compactWhitespace(summaryText).length,
    used_llm: Boolean(response.body.used_llm),
    warning: response.body.warning || "",
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarizeSmokeReport(report) {
  const latenciesByEndpoint = {};
  const errors = [];
  const warnings = [];
  for (const record of report.records || []) {
    const queues = new Map();
    for (const event of record.api || []) {
      const key = `${event.method} ${event.endpoint}`;
      if (event.phase === "request") {
        if (!queues.has(key)) queues.set(key, []);
        queues.get(key).push(Date.parse(event.at));
      } else if (event.phase === "response") {
        const queue = queues.get(key) || [];
        const started = queue.shift();
        const ended = Date.parse(event.at);
        if (Number.isFinite(started) && Number.isFinite(ended)) {
          if (!latenciesByEndpoint[key]) latenciesByEndpoint[key] = [];
          latenciesByEndpoint[key].push(ended - started);
        }
      }
    }
    for (const entry of record.console || []) {
      if (entry.type === "error") errors.push(entry.text);
      if (entry.type === "warning") warnings.push(entry.text);
    }
    for (const entry of record.pageErrors || []) errors.push(entry.message);
  }

  const endpoint_latency = {};
  for (const [key, values] of Object.entries(latenciesByEndpoint)) {
    endpoint_latency[key] = {
      count: values.length,
      max_ms: Math.max(...values),
      p50_ms: percentile(values, 50),
      p95_ms: percentile(values, 95),
    };
  }
  return {
    api_summary: report.apiSummary || {},
    clients: report.options?.clients || (report.records || []).length,
    endpoint_latency,
    error_count: errors.length,
    errors: errors.slice(0, 10),
    finding_count: (report.findings || []).length,
    findings: report.findings || [],
    report_created_at: report.createdAt || "",
    warning_count: warnings.length,
  };
}

async function loadSmokeSummaries(options) {
  const summaries = [];
  for (const reportPath of options.multiclientReports) {
    const report = await readJson(reportPath);
    summaries.push({
      path: reportPath,
      summary: summarizeSmokeReport(report),
    });
  }
  return summaries;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value).toLocaleString()}ms`;
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(digits);
}

function markdownTable(headers, rows) {
  if (!rows.length) return "";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, "<br>")).join(" | ")} |`),
  ].join("\n");
}

function buildPostMeetingSummaryEvaluationTable() {
  return markdownTable(
    ["평가 항목", "판정(O/X)", "오류 유형", "메모"],
    [
      ["핵심 논점이 빠지지 않고 포함되었는가", "", "누락", ""],
      ["원문에 없는 사실, 담당자, 일정, 결정이 추가되지 않았는가", "", "환각/과장", ""],
      ["논의가 진행된 흐름이 자연스럽게 반영되었는가", "", "흐름 오류", ""],
      ["결론이 실제 회의에서 정리된 방향과 일치하는가", "", "결론 오류", ""],
      ["확정/미정/추가 확인 사항이 구분되어 있는가", "", "상태 구분 오류", ""],
      ["같은 내용이 불필요하게 반복되지 않았는가", "", "중복/장황함", ""],
      ["제목, 문단, 목록, 표 구성이 읽기 쉬운가", "", "가독성", ""],
    ],
  );
}

function buildMarkdownReport(report) {
  const sections = [];
  sections.push(`# IMMS-AI 성능 평가 리포트`);
  sections.push(`생성 시각: ${report.created_at}`);
  sections.push(``);
  sections.push(`## 요약`);
  sections.push(
    markdownTable(
      ["항목", "결과"],
      [
        ["STT 평가 케이스", report.stt.length],
        ["요약 API 측정", report.summary_generation ? "실행" : "미실행"],
        ["요약 품질 평가", "사후 사용자 평가표로 기록"],
        ["Multi-client smoke report", report.multiclient.length],
      ],
    ),
  );

  if (report.stt.length) {
    sections.push(``);
    sections.push(`## STT 정확도 / 지연 시간`);
    sections.push(
      markdownTable(
        ["Audio", "HTTP", "Backend", "RTF", "CER", "정규화 CER", "WER", "LLM 보정"],
        report.stt.map((item) => [
          path.basename(item.audio_path),
          formatMs(item.http_elapsed_ms),
          formatMs(item.backend_elapsed_ms),
          formatNumber(item.rtf, 2),
          item.metrics ? formatPercent(item.metrics.cer) : "-",
          item.metrics ? formatPercent(item.metrics.normalized_cer) : "-",
          item.metrics ? formatPercent(item.metrics.wer) : "-",
          item.refine_used_llm ? "사용" : "미사용",
        ]),
      ),
    );
    sections.push(``);
    sections.push(`> 한국어 STT 평가는 띄어쓰기 영향이 큰 WER보다 정규화 CER을 주요 지표로 보는 것이 더 안정적입니다.`);
  }

  if (report.summary_generation) {
    sections.push(``);
    sections.push(`## 요약 생성 성능`);
    sections.push(
      markdownTable(
        ["Endpoint", "HTTP", "Source chars", "Summary chars", "초/1천자", "LLM"],
        [
          [
            report.summary_generation.endpoint,
            formatMs(report.summary_generation.http_elapsed_ms),
            report.summary_generation.source_chars,
            report.summary_generation.summary_chars,
            formatNumber(report.summary_generation.seconds_per_1000_source_chars, 2),
            report.summary_generation.used_llm ? "사용" : "미사용",
          ],
        ],
      ),
    );
    if (report.summary_generation.warning) {
      sections.push(``);
      sections.push(`경고: ${report.summary_generation.warning}`);
    }
  }

  sections.push(``);
  sections.push(`## 사후 사용자 요약 품질 평가표`);
  sections.push(buildPostMeetingSummaryEvaluationTable());
  sections.push(``);
  sections.push(`Summary Error Rate = X 판정 항목 수 / 전체 평가 항목 수`);

  if (report.multiclient.length) {
    sections.push(``);
    sections.push(`## Multi-client Smoke 요약`);
    for (const item of report.multiclient) {
      sections.push(``);
      sections.push(`### ${path.basename(item.path)}`);
      sections.push(
        markdownTable(
          ["Clients", "Findings", "Errors", "Warnings"],
          [[item.summary.clients, item.summary.finding_count, item.summary.error_count, item.summary.warning_count]],
        ),
      );
      const latencyRows = Object.entries(item.summary.endpoint_latency).map(([endpoint, value]) => [
        endpoint,
        value.count,
        formatMs(value.p50_ms),
        formatMs(value.p95_ms),
        formatMs(value.max_ms),
      ]);
      if (latencyRows.length) {
        sections.push(``);
        sections.push(markdownTable(["Endpoint", "Count", "p50", "p95", "Max"], latencyRows));
      }
    }
  }

  sections.push(``);
  sections.push(`## 긴 회의에서 보여줄 지표`);
  sections.push(`- STT는 절대 시간보다 RTF를 함께 제시합니다. RTF가 1보다 작으면 실시간보다 빠른 처리입니다.`);
  sections.push(`- 요약은 총 생성 시간과 함께 초/1천자 지표를 제시합니다.`);
  sections.push(`- 동기화는 평균보다 p50/p95 지연 시간을 제시하면 다중 사용자 상황을 더 설득력 있게 설명할 수 있습니다.`);
  return sections.filter(Boolean).join("\n");
}

async function main() {
  const options = buildOptions();
  await fs.mkdir(options.outputDir, { recursive: true });

  const referenceText = await readTextIfPresent(options.referencePath);
  const transcriptText = await readTextIfPresent(options.transcriptPath);
  const stt = await runSttEvaluations(options, referenceText);
  const summaryPayload = options.summaryPayloadPath ? await readJson(options.summaryPayloadPath) : null;
  const summaryGeneration = await runSummaryGeneration(options, transcriptText, summaryPayload);

  const multiclient = await loadSmokeSummaries(options);
  const report = {
    created_at: new Date().toISOString(),
    options: {
      audio_paths: options.audioPaths,
      backend_url: options.backendUrl,
      meeting_context_present: Boolean(options.meetingContext),
      meeting_goal_present: Boolean(options.meetingGoal),
      multiclient_reports: options.multiclientReports,
      reference_path: options.referencePath,
      summary_endpoint: options.summaryEndpointName,
      summary_payload_path: options.summaryPayloadPath,
      transcript_path: options.transcriptPath,
    },
    stt,
    summary_generation: summaryGeneration,
    multiclient,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(options.outputDir, `evaluation-${stamp}.json`);
  const markdownPath = path.join(options.outputDir, `evaluation-${stamp}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, `${buildMarkdownReport(report)}\n`, "utf8");
  console.log(`[evaluation] json=${jsonPath}`);
  console.log(`[evaluation] markdown=${markdownPath}`);
}

main().catch((error) => {
  console.error("[evaluation] failed");
  console.error(error);
  process.exitCode = 1;
});
