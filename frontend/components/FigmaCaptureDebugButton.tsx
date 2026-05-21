"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CAPTURE_SCRIPT_ID = "figma-html-to-design-capture-script";
const CAPTURE_SCRIPT_SRC = "https://mcp.figma.com/mcp/html-to-design/capture.js";
const CAPTURE_ROOT_SELECTOR = "[data-imms-figma-capture-root]";
const HANDOFF_VIEWPORT_LABEL = "Desktop 1440";
const ENABLED_STORAGE_KEY = "imms:figma-capture-enabled";
const CONFIG_STORAGE_KEY = "imms:figma-capture-config";
const VISIBLE_STORAGE_KEY = "imms:figma-capture-visible";

interface FigmaCaptureConfig {
  captureId: string;
  endpoint: string;
  fileUrl?: string;
  updatedAt: number;
}

interface FigmaCaptureResult {
  success?: boolean;
  error?: string;
  cancelled?: boolean;
}

interface FigmaCaptureApi {
  captureForDesign?: (options: {
    captureId?: string;
    endpoint?: string;
    selector?: string;
    delayMs?: number;
    verbose?: boolean;
  }) => Promise<FigmaCaptureResult>;
}

declare global {
  interface Window {
    figma?: FigmaCaptureApi;
    immsFigmaCapture?: {
      show: () => void;
      hide: () => void;
      enable: () => void;
      disable: () => void;
      setConfig: (captureUrlOrHash: string) => boolean;
    };
  }
}

function readStoredEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ENABLED_STORAGE_KEY) !== "false";
}

function readStoredConfig(): FigmaCaptureConfig | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FigmaCaptureConfig>;
    if (typeof parsed.captureId !== "string" || typeof parsed.endpoint !== "string") return null;
    if (!parsed.captureId || !parsed.endpoint) return null;
    return {
      captureId: parsed.captureId,
      endpoint: parsed.endpoint,
      fileUrl: typeof parsed.fileUrl === "string" ? parsed.fileUrl : undefined,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function readStoredVisible() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(VISIBLE_STORAGE_KEY) === "true";
}

function shouldShowFromUrl() {
  if (typeof window === "undefined") return false;
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("figma_debug") === "1" || window.location.hash.startsWith("#figmacapture");
}

function parseFigmaCaptureInput(value: string): Pick<FigmaCaptureConfig, "captureId" | "endpoint"> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hash = (() => {
    if (trimmed.startsWith("#")) return trimmed;
    try {
      return new URL(trimmed, window.location.href).hash;
    } catch {
      return "";
    }
  })();

  if (!hash.startsWith("#figmacapture")) return null;

  const params = new URLSearchParams(hash.slice(1));
  const captureId = params.get("figmacapture") || "";
  const endpoint = params.get("figmaendpoint") || "";
  if (!captureId || !endpoint) return null;
  return { captureId, endpoint };
}

function getEndpointForCaptureId(endpoint: string, captureId: string) {
  return endpoint.replace(/\/capture\/[^/]+\/submit/, `/capture/${captureId}/submit`);
}

function getMeetingStageName(searchParams: URLSearchParams) {
  const stage = searchParams.get("capture_stage");
  if (stage === "problem-definition") return "Problem Definition";
  if (stage === "solution") return "Solution";
  return "Ideation";
}

function getHandoffFrameName() {
  const searchParams = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname;

  if (pathname === "/login") return `01 /login - Default - ${HANDOFF_VIEWPORT_LABEL}`;
  if (pathname === "/register") return `02 /register - Default - ${HANDOFF_VIEWPORT_LABEL}`;
  if (pathname === "/dashboard") return `03 /dashboard - Loaded - ${HANDOFF_VIEWPORT_LABEL}`;

  if (pathname === "/" && searchParams.get("meeting_id")) {
    const stageName = getMeetingStageName(searchParams);
    if (stageName === "Problem Definition") return `05 /meeting - ${stageName} - ${HANDOFF_VIEWPORT_LABEL}`;
    if (stageName === "Solution") return `06 /meeting - ${stageName} - ${HANDOFF_VIEWPORT_LABEL}`;
    return `04 /meeting - ${stageName} - ${HANDOFF_VIEWPORT_LABEL}`;
  }

  return `00 ${pathname || "/"} - Default - ${HANDOFF_VIEWPORT_LABEL}`;
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function waitForTimeout(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForCaptureReady() {
  await waitForNextPaint();

  if (document.fonts?.ready) {
    await Promise.race([document.fonts.ready.then(() => undefined), waitForTimeout(1200)]);
  }

  const pendingImages = Array.from(document.images).filter((image) => !image.complete);
  if (pendingImages.length > 0) {
    await Promise.race([
      Promise.all(
        pendingImages.map(
          (image) =>
            new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
      ).then(() => undefined),
      waitForTimeout(1200),
    ]);
  }

  await waitForNextPaint();
}

function loadCaptureScript() {
  if (window.figma?.captureForDesign) return Promise.resolve();

  const existing = document.getElementById(CAPTURE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Figma capture script load failed")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = CAPTURE_SCRIPT_ID;
    script.src = CAPTURE_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Figma capture script load failed")), { once: true });
    document.head.appendChild(script);
  });
}

export function FigmaCaptureDebugButton() {
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState<FigmaCaptureConfig | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [captureUrlInput, setCaptureUrlInput] = useState("");
  const [status, setStatus] = useState<"idle" | "ready" | "capturing" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [hiddenForCapture, setHiddenForCapture] = useState(false);
  const [visible, setVisible] = useState(false);
  const fetchRestoreRef = useRef<(() => void) | null>(null);

  const persistVisible = useCallback((nextVisible: boolean) => {
    setVisible(nextVisible);
    window.localStorage.setItem(VISIBLE_STORAGE_KEY, String(nextVisible));
  }, []);

  const persistEnabled = useCallback((nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    window.localStorage.setItem(ENABLED_STORAGE_KEY, String(nextEnabled));
  }, []);

  const persistConfig = useCallback((nextConfig: FigmaCaptureConfig | null) => {
    setConfig(nextConfig);
    if (nextConfig) {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
      setStatus("ready");
      setMessage("Figma ready");
      return;
    }

    window.localStorage.removeItem(CONFIG_STORAGE_KEY);
    setStatus("idle");
    setMessage("");
  }, []);

  const saveCaptureInput = useCallback((value: string) => {
    const parsed = parseFigmaCaptureInput(value);
    if (!parsed) {
      setStatus("error");
      setMessage("capture link needed");
      return false;
    }

    persistConfig({ ...parsed, updatedAt: Date.now() });
    return true;
  }, [persistConfig]);

  const patchFetchForNextCaptureId = useCallback(() => {
    if (fetchRestoreRef.current) return fetchRestoreRef.current;

    const originalFetch = window.fetch.bind(window);
    const patchedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const requestUrl = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (requestUrl.includes("/capture/") && requestUrl.endsWith("/submit")) {
        void response.clone().json().then((payload: unknown) => {
          if (!payload || typeof payload !== "object") return;
          const nextCaptureId = (payload as { nextCaptureId?: unknown }).nextCaptureId;
          const fileUrl =
            (payload as { fileUrl?: unknown }).fileUrl ||
            (payload as { claimUrl?: unknown }).claimUrl;
          if (typeof nextCaptureId !== "string" || !nextCaptureId) return;

          setConfig((current) => {
            if (!current) return current;
            const nextConfig = {
              ...current,
              captureId: nextCaptureId,
              endpoint: getEndpointForCaptureId(current.endpoint, nextCaptureId),
              fileUrl: typeof fileUrl === "string" ? fileUrl : current.fileUrl,
              updatedAt: Date.now(),
            };
            window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
            return nextConfig;
          });
        }).catch(() => undefined);
      }

      return response;
    };

    window.fetch = patchedFetch;
    const restore = () => {
      if (window.fetch === patchedFetch) {
        window.fetch = originalFetch;
      }
      fetchRestoreRef.current = null;
    };
    fetchRestoreRef.current = restore;
    return restore;
  }, []);

  const runCapture = useCallback(async () => {
    if (!enabled || !config) return;

    setHiddenForCapture(true);
    setStatus("capturing");
    setMessage("sending...");

    const restoreFetch = patchFetchForNextCaptureId();
    const previousTitle = document.title;
    try {
      await waitForCaptureReady();
      await loadCaptureScript();
      document.title = getHandoffFrameName();
      const result = await window.figma?.captureForDesign?.({
        captureId: config.captureId,
        endpoint: config.endpoint,
        selector: CAPTURE_ROOT_SELECTOR,
        delayMs: 1200,
        verbose: true,
      });

      if (result?.success === false) {
        setStatus("error");
        setMessage(result.error || "capture failed");
        return;
      }

      setStatus("sent");
      setMessage("sent");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "capture failed");
    } finally {
      document.title = previousTitle;
      restoreFetch();
      setHiddenForCapture(false);
    }
  }, [config, enabled, patchFetchForNextCaptureId]);

  const statusText = useMemo(() => {
    if (!enabled) return "off";
    if (!config) return "needs link";
    return message || status;
  }, [config, enabled, message, status]);

  useEffect(() => {
    const ingestCaptureHash = () => {
      const parsedFromHash = parseFigmaCaptureInput(window.location.hash);
      if (!parsedFromHash) return false;

      persistVisible(true);
      persistConfig({ ...parsedFromHash, updatedAt: Date.now() });
      persistEnabled(true);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      return true;
    };

    setEnabled(readStoredEnabled());
    setVisible(shouldShowFromUrl() || readStoredVisible());
    if (!ingestCaptureHash()) {
      const storedConfig = readStoredConfig();
      if (storedConfig) {
        setConfig(storedConfig);
        setStatus("ready");
        setMessage("Figma ready");
      }
    }

    window.addEventListener("hashchange", ingestCaptureHash);

    return () => {
      window.removeEventListener("hashchange", ingestCaptureHash);
    };
  }, [persistConfig, persistEnabled, persistVisible]);

  useEffect(() => {
    window.immsFigmaCapture = {
      show: () => persistVisible(true),
      hide: () => persistVisible(false),
      enable: () => persistEnabled(true),
      disable: () => persistEnabled(false),
      setConfig: saveCaptureInput,
    };

    return () => {
      fetchRestoreRef.current?.();
      delete window.immsFigmaCapture;
    };
  }, [persistEnabled, persistVisible, saveCaptureInput]);

  if (!visible || hiddenForCapture) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[2147483000] w-[min(360px,calc(100vw-32px))] rounded-[18px] border border-black/10 bg-white/95 p-2 text-xs text-[#111827] shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur"
      data-figma-capture-debug
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => persistEnabled(!enabled)}
          className={[
            "h-9 shrink-0 rounded-[12px] px-3 font-semibold transition",
            enabled ? "bg-[#111827] text-white" : "bg-[#f1f3f5] text-[#4b5563]",
          ].join(" ")}
          aria-pressed={enabled}
        >
          {enabled ? "Figma on" : "Figma off"}
        </button>
        <button
          type="button"
          onClick={() => void runCapture()}
          disabled={!enabled || !config || status === "capturing"}
          className="h-9 min-w-0 flex-1 rounded-[12px] bg-[#a13ab8] px-3 font-semibold text-white transition hover:bg-[#8e2da4] disabled:cursor-not-allowed disabled:bg-[#d8dce2] disabled:text-[#6b7280]"
        >
          Send screen
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="h-9 shrink-0 rounded-[12px] border border-black/10 bg-white px-3 font-semibold text-[#374151] transition hover:bg-[#f7f8fa]"
          aria-expanded={expanded}
        >
          Set
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] font-medium text-[#6b7280]">
        <span className="truncate">{statusText}</span>
        {config?.fileUrl ? (
          <a className="shrink-0 text-[#a13ab8] underline-offset-2 hover:underline" href={config.fileUrl} target="_blank" rel="noreferrer">
            Open
          </a>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-black/10 pt-2">
          <textarea
            value={captureUrlInput}
            onChange={(event) => setCaptureUrlInput(event.target.value)}
            className="min-h-16 w-full resize-none rounded-[12px] border border-black/10 bg-[#f8fafc] px-3 py-2 text-[11px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#a13ab8] focus:bg-white"
            placeholder="figmacapture URL or hash"
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (saveCaptureInput(captureUrlInput)) setCaptureUrlInput("");
              }}
              className="h-8 flex-1 rounded-[10px] bg-[#111827] px-3 font-semibold text-white transition hover:bg-black"
            >
              Save link
            </button>
            <button
              type="button"
              onClick={() => persistConfig(null)}
              className="h-8 rounded-[10px] border border-black/10 bg-white px-3 font-semibold text-[#4b5563] transition hover:bg-[#f7f8fa]"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
