#!/usr/bin/env node

import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const requireFromScript = createRequire(import.meta.url);

const DEFAULT_BASE_URL = "http://127.0.0.1:5173";
const DEFAULT_CLIENTS = 5;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_HOLD_MS = 15_000;
const DEFAULT_SETTLE_MS = 4_000;
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output", "playwright", "multiclient-canvas-smoke");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const raw = token.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex >= 0) {
      args[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[raw] = next;
      index += 1;
    } else {
      args[raw] = "true";
    }
  }
  return args;
}

function envOption(name) {
  const envName = `npm_config_${name.replaceAll("-", "_")}`;
  const value = process.env[envName];
  return value === undefined || value === "" ? undefined : value;
}

function optionValue(args, name, envName, fallback = "") {
  return args[name] ?? envOption(name) ?? process.env[envName] ?? fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function printHelp() {
  console.log(`
Usage:
  npm run smoke:multiclient-canvas -- --meeting-id=<meeting-id> [options]

Options:
  --base-url=<url>           Next.js URL. Default: ${DEFAULT_BASE_URL}
  --url=<url>                Full meeting URL. Overrides --base-url/--meeting-id.
  --meeting-id=<id>          Meeting id to open.
  --clients=<n>              Isolated browser clients. Default: ${DEFAULT_CLIENTS}
  --headed                   Show browser windows.
  --trigger=<mode>           none | problem1 | problem2 | both. Default: problem1
  --enter-watchers           After driver action, watcher clients enter problem definition.
  --auth=<mode>              guest | password | none. Default: guest
  --email=<email>            Password auth email. Or MOA_TEST_EMAIL.
  --password=<password>      Password auth password. Or MOA_TEST_PASSWORD.
  --timeout-ms=<ms>          Per-action timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --hold-ms=<ms>             Observation window after actions. Default: ${DEFAULT_HOLD_MS}
  --settle-ms=<ms>           Short wait between actions. Default: ${DEFAULT_SETTLE_MS}
  --output-dir=<path>        Report/screenshot dir. Default: ${DEFAULT_OUTPUT_DIR}

Examples:
  npm run smoke:multiclient-canvas -- --meeting-id=abc --headed --trigger=both --enter-watchers
  npm run smoke:multiclient-canvas -- --url=http://127.0.0.1:5173/?meeting_id=abc --auth=password
`);
}

function buildOptions() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || envOption("help") || envOption("h")) {
    printHelp();
    process.exit(0);
  }

  const baseUrl = String(optionValue(args, "base-url", "MOA_TEST_BASE_URL", DEFAULT_BASE_URL)).replace(/\/+$/, "");
  const meetingId = String(optionValue(args, "meeting-id", "MOA_TEST_MEETING_ID")).trim();
  const url = String(optionValue(args, "url", "MOA_TEST_MEETING_URL")).trim();
  if (!url && !meetingId) {
    console.error("[error] --meeting-id 또는 --url 이 필요합니다.");
    printHelp();
    process.exit(1);
  }

  const trigger = String(optionValue(args, "trigger", "MOA_TEST_TRIGGER", "problem1")).toLowerCase();
  if (!["none", "problem1", "problem2", "both"].includes(trigger)) {
    console.error("[error] --trigger 는 none, problem1, problem2, both 중 하나여야 합니다.");
    process.exit(1);
  }

  return {
    auth: String(optionValue(args, "auth", "MOA_TEST_AUTH", "guest")).toLowerCase(),
    baseUrl,
    clients: Math.max(1, toInt(optionValue(args, "clients", "MOA_TEST_CLIENTS"), DEFAULT_CLIENTS)),
    email: String(optionValue(args, "email", "MOA_TEST_EMAIL")),
    enterWatchers: toBool(optionValue(args, "enter-watchers", "MOA_TEST_ENTER_WATCHERS", undefined), false),
    headed: toBool(optionValue(args, "headed", "MOA_TEST_HEADED", undefined), false),
    holdMs: toInt(optionValue(args, "hold-ms", "MOA_TEST_HOLD_MS"), DEFAULT_HOLD_MS),
    meetingId,
    outputDir: path.resolve(String(optionValue(args, "output-dir", "MOA_TEST_OUTPUT_DIR", DEFAULT_OUTPUT_DIR))),
    password: String(optionValue(args, "password", "MOA_TEST_PASSWORD")),
    settleMs: toInt(optionValue(args, "settle-ms", "MOA_TEST_SETTLE_MS"), DEFAULT_SETTLE_MS),
    timeoutMs: toInt(optionValue(args, "timeout-ms", "MOA_TEST_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS),
    trigger,
    url: url || `${baseUrl}/?meeting_id=${encodeURIComponent(meetingId)}`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadChromium() {
  const importErrors = [];
  try {
    const playwright = await import("playwright");
    return playwright.chromium || playwright.default?.chromium;
  } catch (error) {
    importErrors.push(error);
  }

  const candidates = [];
  const addCandidate = (candidate) => {
    if (!candidate || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  addCandidate(path.join(frontendRoot, "node_modules", "playwright"));
  addCandidate(path.join(repoRoot, "node_modules", "playwright"));

  for (const entry of String(process.env.PATH || "").split(path.delimiter)) {
    const cleanEntry = entry.trim().replace(/^"|"$/g, "");
    if (!cleanEntry || path.basename(cleanEntry).toLowerCase() !== ".bin") continue;
    addCandidate(path.join(path.dirname(cleanEntry), "playwright"));
  }

  for (const packageRoot of candidates) {
    const entryFile = path.join(packageRoot, "index.js");
    try {
      await fs.access(entryFile);
    } catch {
      continue;
    }

    try {
      const playwright = requireFromScript(entryFile);
      const chromium = playwright?.chromium || playwright?.default?.chromium;
      if (chromium) return chromium;
    } catch (error) {
      importErrors.push(error);
    }

    try {
      const playwright = await import(pathToFileURL(entryFile).href);
      const chromium = playwright?.chromium || playwright?.default?.chromium;
      if (chromium) return chromium;
    } catch (error) {
      importErrors.push(error);
    }
  }

  throw new Error(
    "Playwright 패키지를 불러오지 못했습니다. `npm install -D playwright` 후 다시 실행하거나 `npx --yes --package playwright -- node scripts/multiclient-canvas-smoke.mjs --help` 형태로 실행해 주세요.",
    { cause: importErrors[0] },
  );
}

function endpointFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

function isInterestingEndpoint(url) {
  const endpoint = endpointFromUrl(url);
  return endpoint.startsWith("/api/canvas") || endpoint.startsWith("/api/meetings");
}

function compactText(value, maxLength = 1600) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function createClientRecord(index) {
  return {
    actions: [],
    api: [],
    console: [],
    finalText: "",
    finalUrl: "",
    index,
    label: `client-${index + 1}`,
    pageErrors: [],
    screenshot: "",
  };
}

function attachMonitoring(page, record) {
  page.on("console", (message) => {
    const type = message.type();
    if (!["error", "warning"].includes(type)) return;
    record.console.push({
      location: message.location(),
      text: message.text(),
      type,
    });
  });

  page.on("pageerror", (error) => {
    record.pageErrors.push({
      message: error.message,
      stack: error.stack || "",
    });
  });

  page.on("request", (request) => {
    if (!isInterestingEndpoint(request.url())) return;
    record.api.push({
      at: new Date().toISOString(),
      endpoint: endpointFromUrl(request.url()),
      method: request.method(),
      phase: "request",
    });
  });

  page.on("response", (response) => {
    if (!isInterestingEndpoint(response.url())) return;
    record.api.push({
      at: new Date().toISOString(),
      endpoint: endpointFromUrl(response.url()),
      method: response.request().method(),
      phase: "response",
      status: response.status(),
    });
  });
}

async function clickFirstVisible(locator, timeoutMs) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    const visible = await item.isVisible({ timeout: 500 }).catch(() => false);
    if (!visible) continue;
    const disabled = await item.isDisabled({ timeout: 500 }).catch(() => false);
    if (disabled) return { clicked: false, disabled: true };
    await item.click({ timeout: timeoutMs });
    return { clicked: true, disabled: false };
  }
  return { clicked: false, disabled: false };
}

async function detectAuthState(page, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 20_000);
  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const meetingVisible = await page.getByText("현재 단계").first().isVisible({ timeout: 300 }).catch(() => false);
    if (meetingVisible) return "meeting";

    const guestButtonVisible = await page
      .getByRole("button", { name: /게스트로 시작하기|게스트 로그인|게스트/ })
      .first()
      .isVisible({ timeout: 300 })
      .catch(() => false);
    if (currentUrl.includes("/login") || guestButtonVisible) return "login";

    await sleep(300);
  }
  return "unknown";
}

async function authenticateIfNeeded(page, options, record) {
  await page.waitForLoadState("domcontentloaded", { timeout: options.timeoutMs }).catch(() => {});

  const authState = await detectAuthState(page, options.timeoutMs);
  if (authState === "meeting") return;
  if (authState !== "login") return;

  if (options.auth === "none") {
    throw new Error(`${record.label}: login page reached, but --auth=none`);
  }

  if (options.auth === "password") {
    if (!options.email || !options.password) {
      throw new Error(`${record.label}: --auth=password requires --email/--password or MOA_TEST_EMAIL/MOA_TEST_PASSWORD`);
    }
    record.actions.push("password login");
    await page.locator("input[type='email']").first().fill(options.email, { timeout: options.timeoutMs });
    await page.locator("input[type='password']").first().fill(options.password, { timeout: options.timeoutMs });
    await page.getByRole("button", { name: /^로그인$/ }).first().click({ timeout: options.timeoutMs });
  } else {
    record.actions.push("guest login");
    const guestButton = page.getByRole("button", { name: /게스트로 시작하기|게스트 로그인|게스트/ });
    const result = await clickFirstVisible(guestButton, options.timeoutMs);
    if (!result.clicked) {
      throw new Error(`${record.label}: guest login button not found`);
    }
  }

  await page
    .waitForURL((nextUrl) => !nextUrl.pathname.includes("/login"), { timeout: options.timeoutMs })
    .catch(() => {});
  await detectAuthState(page, options.timeoutMs);
}

async function openMeeting(page, options, record) {
  record.actions.push(`open ${options.url}`);
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await authenticateIfNeeded(page, options, record);

  if (page.url() !== options.url) {
    record.actions.push("navigate back to meeting after auth");
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await authenticateIfNeeded(page, options, record);
  }

  await page.getByText("현재 단계").first().waitFor({ timeout: options.timeoutMs });
}

async function clickCanvasButton(page, record, namePattern, label, timeoutMs) {
  const button = page.getByRole("button", { name: namePattern });
  const result = await clickFirstVisible(button, timeoutMs);
  if (result.clicked) {
    record.actions.push(`clicked ${label}`);
    return true;
  }
  record.actions.push(result.disabled ? `skipped disabled ${label}` : `missing ${label}`);
  return false;
}

async function waitForClientSettled(page, timeoutMs) {
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const text = document.body?.innerText || "";
        if (!text.trim()) return false;
        return !/^로딩 중\.\.\.$/.test(text.trim());
      },
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => {});
}

async function collectFinalSnapshot(client, outputDir) {
  const { page, record } = client;
  record.finalUrl = page.url();
  record.finalText = compactText(await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""));
  const screenshotPath = path.join(outputDir, `${record.label}.png`);
  await page.screenshot({ fullPage: true, path: screenshotPath }).catch(() => {});
  record.screenshot = screenshotPath;
}

function summarizeApi(records) {
  const summary = {};
  for (const record of records) {
    for (const event of record.api) {
      if (event.phase !== "request") continue;
      const key = `${event.method} ${event.endpoint}`;
      summary[key] = (summary[key] || 0) + 1;
    }
  }
  return summary;
}

function buildFindings(records, apiSummary) {
  const findings = [];
  const consoleErrorCount = records.reduce(
    (total, record) => total + record.console.filter((event) => event.type === "error").length + record.pageErrors.length,
    0,
  );
  if (consoleErrorCount > 0) {
    findings.push({
      level: "error",
      message: `console/page error ${consoleErrorCount}개가 기록되었습니다.`,
    });
  }

  const taxonomyCalls = apiSummary["POST /api/canvas/problem-taxonomy"] || 0;
  const structureCalls = apiSummary["POST /api/canvas/problem-structure"] || 0;
  if (taxonomyCalls > 1) {
    findings.push({
      level: "warning",
      message: `문제정의 1단계 생성 API가 ${taxonomyCalls}회 호출되었습니다. 중복 생성 가능성이 있습니다.`,
    });
  }
  if (structureCalls > 1) {
    findings.push({
      level: "warning",
      message: `문제정의 2단계 구조화 API가 ${structureCalls}회 호출되었습니다. 중복 생성 가능성이 있습니다.`,
    });
  }

  for (const record of records) {
    const text = record.finalText;
    if (/^로딩 중/.test(text) || text.includes("로딩 중... 로딩 중...")) {
      findings.push({
        level: "warning",
        message: `${record.label} final snapshot이 로딩 상태처럼 보입니다.`,
      });
    }
    if (
      text.includes("다른 참가자가 문제정의를 생성 중입니다") ||
      (text.includes("문제 정의 그룹이 아직 없습니다") && text.includes("초기화 이후 도착한 이전 문제정의"))
    ) {
      findings.push({
        level: "warning",
        message: `${record.label} 이 문제정의 생성 대기/무결과 상태에 머물러 있을 수 있습니다.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      level: "ok",
      message: "자동 검사에서 중복 생성 호출, 콘솔 에러, 최종 로딩 고착이 발견되지 않았습니다.",
    });
  }

  return findings;
}

async function run() {
  const options = buildOptions();
  await fs.mkdir(options.outputDir, { recursive: true });

  console.log(`[multi-client] opening ${options.clients} clients`);
  console.log(`[multi-client] url=${options.url}`);
  console.log(`[multi-client] auth=${options.auth}, trigger=${options.trigger}, headed=${options.headed}`);

  const chromium = await loadChromium();
  const browser = await chromium.launch({
    headless: !options.headed,
    slowMo: options.headed ? 80 : 0,
  });

  const clients = [];
  try {
    for (let index = 0; index < options.clients; index += 1) {
      const record = createClientRecord(index);
      const context = await browser.newContext({
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        viewport: { height: 1080, width: 1920 },
      });
      const page = await context.newPage();
      attachMonitoring(page, record);
      clients.push({ context, page, record });
    }

    await Promise.all(clients.map((client) => openMeeting(client.page, options, client.record)));
    console.log("[multi-client] all clients loaded");

    const driver = clients[0];
    if (options.trigger === "problem1" || options.trigger === "both") {
      await clickCanvasButton(driver.page, driver.record, /문제정의 시작하기/, "problem definition start", options.timeoutMs);
      await waitForClientSettled(driver.page, options.timeoutMs);
      await sleep(options.settleMs);
    }

    if (options.trigger === "problem2" || options.trigger === "both") {
      await clickCanvasButton(
        driver.page,
        driver.record,
        /2단계.*구조화 시작하기|구조화 시작하기/,
        "problem structure start",
        options.timeoutMs,
      );
      await waitForClientSettled(driver.page, options.timeoutMs);
      await sleep(options.settleMs);
    }

    if (options.enterWatchers && options.trigger !== "none") {
      console.log("[multi-client] watcher clients entering problem definition");
      for (const client of clients.slice(1)) {
        await clickCanvasButton(client.page, client.record, /문제정의 시작하기/, "watcher problem definition start", options.timeoutMs);
        await sleep(600);
      }
    }

    console.log(`[multi-client] observing for ${options.holdMs}ms`);
    await sleep(options.holdMs);

    await Promise.all(clients.map((client) => collectFinalSnapshot(client, options.outputDir)));

    const records = clients.map((client) => client.record);
    const apiSummary = summarizeApi(records);
    const findings = buildFindings(records, apiSummary);
    const report = {
      apiSummary,
      createdAt: new Date().toISOString(),
      findings,
      options: {
        auth: options.auth,
        baseUrl: options.baseUrl,
        clients: options.clients,
        enterWatchers: options.enterWatchers,
        headed: options.headed,
        holdMs: options.holdMs,
        meetingId: options.meetingId,
        trigger: options.trigger,
        url: options.url,
      },
      records,
    };
    const reportPath = path.join(options.outputDir, `report-${Date.now()}.json`);
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log("[multi-client] API summary");
    for (const [key, value] of Object.entries(apiSummary).sort()) {
      console.log(`  ${key}: ${value}`);
    }
    console.log("[multi-client] findings");
    for (const finding of findings) {
      console.log(`  [${finding.level}] ${finding.message}`);
    }
    console.log(`[multi-client] report=${reportPath}`);
    console.log(`[multi-client] screenshots=${options.outputDir}`);

    const hasError = findings.some((finding) => finding.level === "error");
    process.exitCode = hasError ? 1 : 0;
  } finally {
    for (const client of clients) {
      await client.context.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error("[multi-client] failed");
  console.error(error);
  process.exitCode = 1;
});
