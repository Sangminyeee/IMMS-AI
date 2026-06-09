import { getPublicCanvasFinalReport } from "@/lib/api";
import {
  buildPrintableSummaryDocumentHtml,
  summaryDocumentBlocksToMarkdown,
} from "@/components/canvas/summaryDocumentHelpers";

export const dynamic = "force-dynamic";

type FinalReportRouteContext = {
  params: Promise<{
    meetingId: string;
    token: string;
  }>;
};

function buildNotFoundHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>최종 정리 문서 없음</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f8f8f8;
      color: #181818;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    }
    main {
      width: min(480px, calc(100% - 32px));
      border: 1px solid #e1e7f2;
      border-radius: 24px;
      background: #fff;
      padding: 32px;
      box-shadow: 0 24px 70px rgba(15,23,42,0.08);
      text-align: center;
    }
    h1 { margin: 0; font-size: 22px; line-height: 1.4; letter-spacing: -0.55px; }
    p { margin: 12px 0 0; color: #667085; font-size: 14px; line-height: 1.7; letter-spacing: -0.35px; }
  </style>
</head>
<body>
  <main>
    <h1>최종 정리 문서를 볼 수 없습니다.</h1>
    <p>링크가 만료되었거나 문서가 아직 저장되지 않았습니다.</p>
  </main>
</body>
</html>`;
}

export async function GET(_request: Request, context: FinalReportRouteContext) {
  const { meetingId, token } = await context.params;

  try {
    const report = await getPublicCanvasFinalReport(meetingId, token);
    const markdown =
      report.markdown?.trim() ||
      summaryDocumentBlocksToMarkdown(report.document_blocks || []);
    if (!markdown.trim()) {
      return new Response(buildNotFoundHtml(), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response(buildPrintableSummaryDocumentHtml(markdown, { includeToolbar: true }), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response(buildNotFoundHtml(), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
