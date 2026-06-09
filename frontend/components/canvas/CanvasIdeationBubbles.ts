type MeetingTranscript = {
  id?: string;
  speaker?: string;
  text: string;
  timestamp?: string;
  canvas_stage?: string;
  canvas_target_id?: string;
};

type ProblemGroupViewModel = {
  group_id: string;
  parent_group_id?: string;
  topic: string;
  evidence_utterance_ids?: string[];
};

export type IdeationKeywordBubble = {
  id: string;
  text: string;
  canonicalLabel?: string;
  aliases?: string[];
  count: number;
  weight: number;
  related: string[];
  kind?: "entity" | "topic" | "relation" | "action" | "off_topic";
  importance?: number;
  relevance?: number;
  offTopic?: boolean;
  offTopicReason?: string;
  anchorText?: string;
  layoutX?: number;
  layoutY?: number;
  layoutSize?: number;
  clusterId?: string;
  role?: "center" | "satellite" | "dot" | string;
  orbitCenterId?: string;
  orbitRing?: number;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitOrderKey?: number;
  orbitSlotIndex?: number;
  activity?: number;
  opacity?: number;
  displayState?: "active" | "dimmed" | "exiting" | "archived" | string;
  lifecycleState?: "provisional" | "active" | string;
  layoutZone?: "core" | "default" | "peripheral" | "archived" | string;
  durable?: boolean;
  emphasis?: "primary" | "default";
};

export type IdeationKeywordBubbleVisual = IdeationKeywordBubble & {
  activity: number;
  opacity: number;
  size: number;
  targetX: number;
  targetY: number;
  settledTargetX?: number;
  settledTargetY?: number;
  visualScale?: number;
  arcOffsetX?: number;
  arcOffsetY?: number;
  arcMotion?: boolean;
  arcMotionPath?: {
    key: string;
    fromX: number;
    fromY: number;
    midX: number;
    midY: number;
    previousAngle: number;
    nextAngle: number;
    durationMs: number;
  };
  demoMotionType?: "enter" | "arc" | "radial" | "orbit-transfer" | "exit" | "static";
  demoPreviousAngle?: number;
  demoNextAngle?: number;
  entering?: boolean;
  firstSeenTick: number;
  lastSeenTick: number;
};

export type IdeationBubbleLayoutAnchor = {
  centerX: number;
  centerY: number;
  spawnX: number;
  spawnY: number;
};

type IdeationKeywordBubblePlacement = {
  bubble: IdeationKeywordBubble;
  x: number;
  y: number;
  size: number;
  opacity?: number;
};

type IdeationKeywordBubbleClusterBox = {
  width: number;
  height: number;
  placements: Array<{
    bubble: IdeationKeywordBubble;
    x: number;
    y: number;
    size: number;
  }>;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

function normalizeTranscriptRows(rows: MeetingTranscript[]) {
  return rows.map((row, index) => ({
    id: row.id || `${row.timestamp || "turn"}-${index}`,
    speaker: row.speaker || "",
    text: row.text || "",
    timestamp: row.timestamp || "",
    canvas_stage: row.canvas_stage || "ideation",
    canvas_target_id: row.canvas_target_id || "",
    turnId: index + 1,
  }));
}
const CANVAS_ITEM_KEYWORD_STOPWORDS = new Set([
  "note",
  "comment",
  "topic",
  "memo",
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "about",
  "there",
  "would",
  "should",
  "could",
  "메모",
  "코멘트",
  "주제",
  "내용",
  "회의",
  "아이디어",
  "의견",
  "발언",
  "논의",
  "얘기",
  "이야기",
  "입력",
  "입력해",
  "작성",
  "정리",
  "정리해",
  "해주세요",
  "주세요",
  "새",
  "신규",
  "공용",
  "canvas",
  "캔버스",
  "그리고",
  "그런데",
  "근데",
  "그래서",
  "그러면",
  "그러니까",
  "하지만",
  "일단",
  "우선",
  "약간",
  "진짜",
  "그냥",
  "너무",
  "조금",
  "좀",
  "저희",
  "우리",
  "제가",
  "저는",
  "나는",
  "이거",
  "그거",
  "저거",
  "여기",
  "거기",
  "저기",
  "이런",
  "그런",
  "저런",
  "대한",
  "관련",
  "부분",
  "경우",
  "정도",
  "사람",
  "사람들",
  "생각",
  "생각해",
  "같아요",
  "같은",
  "있어",
  "있고",
  "있습니다",
  "없어",
  "없고",
  "없습니다",
  "하는",
  "하고",
  "하면",
  "해서",
  "해야",
  "되는",
  "됩니다",
  "되면",
  "되어",
  "보면",
  "말씀",
]);

const CANVAS_ITEM_KEYWORD_SUFFIXES = [
  "으로부터",
  "에서부터",
  "이라고",
  "이라는",
  "라고",
  "라는",
  "적으로",
  "에게는",
  "에서는",
  "에도",
  "에서",
  "에게",
  "까지",
  "부터",
  "처럼",
  "보다",
  "으로",
  "이랑",
  "랑",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "와",
  "과",
  "로",
  "의",
  "만",
];

const CANVAS_IDEATION_BUBBLE_NON_NOUN_PATTERNS = [
  /(하다|했다|한다|했던|하고|하며|하면|해서|해야|하기|하자|하죠|하게|하려|하려고|하려면|하던|할까|할지|해도|해요)$/u,
  /(되다|된다|됐다|되고|되면|되어|되는|되죠|돼요|됩니다)$/u,
  /(입니다|있는|있다|있고|있어|없다|없고|없어|같다|같은|같아요|싶다|싶은)$/u,
  /(좋다|좋은|나쁘다|나쁜|어렵다|어려운|쉽다|쉬운|많다|많은|적다|적은|크다|큰|작다|작은)$/u,
  /(아요|어요|워요|네요|군요|죠|지요|고요|습니다|습니까|면서|지만|거나|니까|어서|아서|려고|다고)$/u,
  /(하기도|되기도|한다면|한다고|한다는|한다면|해가지고|해보자|해보면|해봤|해줘|해줄|하는)$/u,
];
const CANVAS_IDEATION_BUBBLE_KOREAN_NON_NOUN_ENDINGS = [
  "했다",
  "한다",
  "하면",
  "해서",
  "해야",
  "하기",
  "되고",
  "되면",
  "되는",
  "있는",
  "없는",
];

const CANVAS_IDEATION_BUBBLE_ENGLISH_STOPWORDS = new Set([
  "make",
  "made",
  "doing",
  "done",
  "think",
  "want",
  "need",
  "maybe",
  "really",
  "just",
  "very",
  "more",
  "less",
]);
const CANVAS_KEYWORD_TOKEN_PATTERN = /[A-Za-z0-9가-힣][A-Za-z0-9가-힣+#._-]{1,}/g;
const CANVAS_IDEATION_BUBBLE_MIN_PHRASE_CHARS = 5;
const CANVAS_IDEATION_BUBBLE_MAX_PHRASE_CHARS = 18;
const CANVAS_IDEATION_BUBBLE_PHRASE_GAP_PATTERN = /^[ \t·ㆍ-]+$/u;
export const CANVAS_IDEATION_BUBBLE_PLANE_WIDTH = 1580;
export const CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT = 940;
const CANVAS_IDEATION_BUBBLE_ORGANIC_GAP = 12;
const CANVAS_IDEATION_BUBBLE_CLUSTER_GAP = 145;
const CANVAS_IDEATION_BUBBLE_CLUSTER_MAX_ITEMS = 6;
export const CANVAS_IDEATION_BUBBLE_DEBUG_GROWTH_STEP = 0.06;
export const CANVAS_IDEATION_BUBBLE_DEBUG_INTERVAL_MS = 600;
export const CANVAS_IDEATION_BUBBLE_DEBUG_MAX_GROWTH = 1.42;
const CANVAS_IDEATION_BUBBLE_DECAY_RATE = 0.72;
const CANVAS_IDEATION_BUBBLE_RELATION_TARGET_DISTANCE = 260;
const CANVAS_IDEATION_BUBBLE_MAX_RETARGET_DISTANCE = 180;
const CANVAS_IDEATION_BUBBLE_ZONE_RETARGET_DISTANCE = 118;
const CANVAS_IDEATION_BUBBLE_CORE_ZONE_RADIUS = 190;
const CANVAS_IDEATION_BUBBLE_PERIPHERAL_ZONE_RADIUS = 460;
const CANVAS_IDEATION_BUBBLE_COLLISION_GAP = 0;
const CANVAS_IDEATION_BUBBLE_COLLISION_ITERATIONS = 32;
const CANVAS_IDEATION_BUBBLE_RELAXATION_ITERATIONS = 8;
const CANVAS_IDEATION_BUBBLE_RELAXATION_GAP = 10;
const CANVAS_IDEATION_BUBBLE_RELAXATION_STEP = 0.42;
const CANVAS_IDEATION_BUBBLE_MAX_PRIMARY_COUNT = 2;
const CANVAS_IDEATION_BUBBLE_ENTER_SCALE = 0.65;
const CANVAS_IDEATION_BUBBLE_ENTER_SETTLE_DELAY_MS = 120;
const CANVAS_IDEATION_BUBBLE_ARC_MOTION_DURATION_MS = 2800;
const CANVAS_IDEATION_BUBBLE_SPAWN_GAP = 8;
export const CANVAS_IDEATION_BUBBLE_TRANSITION =
  "transform 2800ms cubic-bezier(0.22, 1, 0.36, 1), opacity 720ms ease";
export const CANVAS_IDEATION_BUBBLE_LABEL_TRANSITION =
  "transform 3100ms cubic-bezier(0.22, 1, 0.36, 1), opacity 720ms ease";

function resolveIdeationBubbleLayoutAnchor(anchor?: IdeationBubbleLayoutAnchor | null): IdeationBubbleLayoutAnchor {
  const defaultCenterX = CANVAS_IDEATION_BUBBLE_PLANE_WIDTH / 2;
  const defaultCenterY = CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT / 2;
  const centerX = clampNumber(Number(anchor?.centerX ?? defaultCenterX), 140, CANVAS_IDEATION_BUBBLE_PLANE_WIDTH - 140);
  const centerY = clampNumber(Number(anchor?.centerY ?? defaultCenterY), 140, CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT - 140);
  return {
    centerX,
    centerY,
    spawnX: clampNumber(Number(anchor?.spawnX ?? centerX), 140, CANVAS_IDEATION_BUBBLE_PLANE_WIDTH - 140),
    spawnY: clampNumber(Number(anchor?.spawnY ?? centerY + 220), 160, CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT - 120),
  };
}

function stripKoreanKeywordSuffixes(token: string) {
  let normalized = token;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of CANVAS_ITEM_KEYWORD_SUFFIXES) {
      if (normalized.length <= suffix.length + 1 || !normalized.endsWith(suffix)) continue;
      normalized = normalized.slice(0, -suffix.length);
      changed = true;
      break;
    }
  }
  return normalized;
}

function isLikelyIdeationBubbleNoun(keyword: string) {
  if (!keyword || CANVAS_ITEM_KEYWORD_STOPWORDS.has(keyword)) return false;
  if (/^[a-z][a-z0-9+#._-]+$/i.test(keyword)) {
    return !CANVAS_IDEATION_BUBBLE_ENGLISH_STOPWORDS.has(keyword.toLowerCase());
  }
  if (!/[가-힣]/.test(keyword)) return false;
  if (/[가-힣][a-z0-9+#._-]+/i.test(keyword)) return false;
  if (CANVAS_IDEATION_BUBBLE_NON_NOUN_PATTERNS.some((pattern) => pattern.test(keyword))) return false;
  if (CANVAS_IDEATION_BUBBLE_KOREAN_NON_NOUN_ENDINGS.some((ending) => keyword.endsWith(ending))) return false;
  if (/(게|고|서|죠|요)$/u.test(keyword) && keyword.length <= 4) return false;
  if (/(적|화|성)$/u.test(keyword) && keyword.length < 3) return false;
  return true;
}

function shouldJoinIdeationNounPhrase(left: string, right: string) {
  const joinedLength = `${left}${right}`.length;
  if (
    joinedLength < CANVAS_IDEATION_BUBBLE_MIN_PHRASE_CHARS ||
    joinedLength > CANVAS_IDEATION_BUBBLE_MAX_PHRASE_CHARS
  ) {
    return false;
  }
  if (left.length <= 2 && right.length <= 2) return false;
  return true;
}

function extractIdeationBubbleTerms(text: string) {
  const cleanText = stripLeadingTimestamp(text);
  const matches = [...cleanText.matchAll(CANVAS_KEYWORD_TOKEN_PATTERN)];
  const nounTokens = matches
    .map((match) => {
      const keyword = normalizeCanvasItemKeyword(match[0]);
      if (!keyword || !isLikelyIdeationBubbleNoun(keyword)) return null;
      const start = match.index || 0;
      return {
        keyword,
        start,
        end: start + match[0].length,
      };
    })
    .filter((item): item is { keyword: string; start: number; end: number } => Boolean(item));
  const phraseTerms = new Set<string>();
  const tokenTerms = new Set<string>();

  nounTokens.forEach((token) => tokenTerms.add(token.keyword));
  for (let index = 0; index < nounTokens.length - 1; index += 1) {
    const left = nounTokens[index];
    const right = nounTokens[index + 1];
    const gap = cleanText.slice(left.end, right.start);
    if (!CANVAS_IDEATION_BUBBLE_PHRASE_GAP_PATTERN.test(gap)) continue;
    if (!shouldJoinIdeationNounPhrase(left.keyword, right.keyword)) continue;
    phraseTerms.add(`${left.keyword} ${right.keyword}`);
  }

  return [...phraseTerms, ...tokenTerms];
}

function normalizeCanvasItemKeyword(raw: string) {
  const token = raw
    .trim()
    .replace(/^#+/, "")
    .replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, "");
  if (!token || token.length < 2 || /^\d+$/.test(token)) return "";

  const normalized = /[A-Za-z]/.test(token)
    ? token.toLowerCase()
    : stripKoreanKeywordSuffixes(token);
  if (!normalized || normalized.length < 2) return "";
  if (CANVAS_ITEM_KEYWORD_STOPWORDS.has(normalized)) return "";

  return normalized;
}

export function extractCanvasItemKeywords(title: string, body: string, limit = 5) {
  const scores = new Map<string, { value: string; score: number; firstSeen: number }>();
  let cursor = 0;

  const addSource = (source: string, weight: number) => {
    const matches = source.match(CANVAS_KEYWORD_TOKEN_PATTERN) || [];
    matches.forEach((match) => {
      const keyword = normalizeCanvasItemKeyword(match);
      if (!keyword) return;

      const existing = scores.get(keyword);
      if (existing) {
        existing.score += weight;
        return;
      }

      scores.set(keyword, {
        value: keyword,
        score: weight,
        firstSeen: cursor,
      });
      cursor += 1;
    });
  };

  addSource(title, 2);
  addSource(body, 1);

  return [...scores.values()]
    .sort((left, right) => right.score - left.score || left.firstSeen - right.firstSeen)
    .slice(0, limit)
    .map((entry) => entry.value);
}

function normalizeProblemTaxonomyTopicKey(value: string) {
  return stripLeadingTimestamp(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function problemTaxonomyTopicTokens(value: string) {
  const matches = stripLeadingTimestamp(value).match(CANVAS_KEYWORD_TOKEN_PATTERN) || [];
  return new Set(
    matches
      .map((match) => normalizeCanvasItemKeyword(match))
      .filter((keyword) => keyword && !CANVAS_ITEM_KEYWORD_STOPWORDS.has(keyword)),
  );
}

function problemTaxonomyTopicOverlap(left: string, right: string) {
  const leftTokens = problemTaxonomyTopicTokens(left);
  const rightTokens = problemTaxonomyTopicTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

function areProblemTaxonomyTopicsSimilar(left: string, right: string) {
  const leftKey = normalizeProblemTaxonomyTopicKey(left);
  const rightKey = normalizeProblemTaxonomyTopicKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;

  const leftTokens = problemTaxonomyTopicTokens(left);
  const rightTokens = problemTaxonomyTopicTokens(right);
  if (Math.min(leftTokens.size, rightTokens.size) < 2) return false;

  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });
  return overlap >= 2 && overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size)) >= 0.8;
}

function problemTaxonomyEvidenceOverlap(leftIds: string[] | undefined, rightIds: string[] | undefined) {
  const left = new Set((leftIds || []).map((value) => value.trim()).filter(Boolean));
  const right = new Set((rightIds || []).map((value) => value.trim()).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  left.forEach((id) => {
    if (right.has(id)) overlap += 1;
  });
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

export function isDuplicateProblemTaxonomyGroup(
  candidate: ProblemGroupViewModel,
  existingGroups: ProblemGroupViewModel[],
  parentGroupId: string,
  parentTopic: string,
) {
  if (parentTopic && areProblemTaxonomyTopicsSimilar(candidate.topic, parentTopic)) {
    return true;
  }

  return existingGroups.some((existing) => {
    if (existing.group_id === candidate.group_id) return true;
    if (existing.group_id === parentGroupId) {
      return areProblemTaxonomyTopicsSimilar(candidate.topic, existing.topic);
    }
    if ((existing.parent_group_id || "") !== parentGroupId) return false;
    if (areProblemTaxonomyTopicsSimilar(candidate.topic, existing.topic)) return true;
    return (
      problemTaxonomyEvidenceOverlap(candidate.evidence_utterance_ids, existing.evidence_utterance_ids) >= 0.75 &&
      problemTaxonomyTopicOverlap(candidate.topic, existing.topic) >= 0.5
    );
  });
}

export function buildIdeationKeywordBubbles(transcripts: MeetingTranscript[], limit = 18): IdeationKeywordBubble[] {
  const rows = normalizeTranscriptRows(transcripts)
    .filter((row) => (!row.canvas_stage || row.canvas_stage === "ideation") && row.text.trim().length > 0)
    .slice(-180);
  const counts = new Map<string, { text: string; count: number; firstSeen: number }>();
  const cooccurrence = new Map<string, Map<string, number>>();
  let cursor = 0;

  rows.forEach((row) => {
    const rowKeywords = new Set<string>();
    extractIdeationBubbleTerms(row.text).forEach((keyword) => {
      rowKeywords.add(keyword);
      const current = counts.get(keyword);
      if (current) {
        current.count += 1;
      } else {
        counts.set(keyword, { text: keyword, count: 1, firstSeen: cursor });
        cursor += 1;
      }
    });

    const rowKeywordList = [...rowKeywords].slice(0, 12);
    rowKeywordList.forEach((left) => {
      const related = cooccurrence.get(left) || new Map<string, number>();
      rowKeywordList.forEach((right) => {
        if (left === right) return;
        related.set(right, (related.get(right) || 0) + 1);
      });
      cooccurrence.set(left, related);
    });
  });

  const minimumCount = rows.length >= 8 ? 2 : 1;
  let sorted = [...counts.values()]
    .filter((entry) => entry.count >= minimumCount)
    .sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen)
    .slice(0, limit);
  if (sorted.length === 0 && counts.size > 0) {
    sorted = [...counts.values()]
      .sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen)
      .slice(0, Math.min(limit, 8));
  }
  const maxCount = Math.max(1, ...sorted.map((entry) => entry.count));

  return sorted.map((entry) => {
    const related = [...(cooccurrence.get(entry.text) || new Map()).entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 4)
      .map(([keyword]) => keyword);
    return {
      id: `ideation-keyword-${encodeURIComponent(entry.text)}`,
      text: entry.text,
      count: entry.count,
      weight: entry.count / maxCount,
      related,
    };
  });
}

function getIdeationKeywordBubbleSize(bubble: IdeationKeywordBubble, maxCount: number, growth = 1) {
  const countRatio = maxCount <= 1 ? 1 : bubble.count / maxCount;
  const emphasizedRatio = Math.pow(countRatio, 0.72);
  return Math.round((72 + emphasizedRatio * 142) * growth);
}

function hashIdeationBubbleSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function ideationBubbleSeedRatio(value: string, salt: number) {
  const hash = hashIdeationBubbleSeed(`${value}:${salt}`);
  return (hash % 10000) / 10000;
}

function ideationBubbleCirclesOverlap(
  left: { x: number; y: number; size: number },
  right: { x: number; y: number; size: number },
  gap: number,
) {
  const leftRadius = left.size / 2;
  const rightRadius = right.size / 2;
  const dx = left.x + leftRadius - (right.x + rightRadius);
  const dy = left.y + leftRadius - (right.y + rightRadius);
  const minDistance = leftRadius + rightRadius + gap;
  return dx * dx + dy * dy < minDistance * minDistance;
}

function makeIdeationBubbleFallbackPlacement(
  bubble: IdeationKeywordBubble,
  size: number,
  placements: IdeationKeywordBubbleClusterBox["placements"],
) {
  const maxRight = Math.max(0, ...placements.map((placement) => placement.x + placement.size));
  return {
    bubble,
    x: maxRight + CANVAS_IDEATION_BUBBLE_ORGANIC_GAP,
    y: 0,
    size,
  };
}

function buildIdeationKeywordBubbleClusters(bubbles: IdeationKeywordBubble[]) {
  const remaining = new Set(bubbles.map((bubble) => bubble.text));
  const clusters: IdeationKeywordBubble[][] = [];

  bubbles.forEach((seed) => {
    if (!remaining.has(seed.text)) return;

    const cluster = [seed];
    remaining.delete(seed.text);
    while (cluster.length < CANVAS_IDEATION_BUBBLE_CLUSTER_MAX_ITEMS) {
      const next = bubbles.find((candidate) => {
        if (!remaining.has(candidate.text)) return false;
        return cluster.some(
          (item) =>
            item.related.includes(candidate.text) ||
            candidate.related.includes(item.text),
        );
      });
      if (!next) break;
      cluster.push(next);
      remaining.delete(next.text);
    }
    clusters.push(cluster);
  });

  return clusters;
}

function buildIdeationKeywordBubbleClusterBox(
  cluster: IdeationKeywordBubble[],
  maxCount: number,
  layoutSeed: number,
): IdeationKeywordBubbleClusterBox {
  const sizedItems = cluster
    .map((bubble) => ({
      bubble,
      size: getIdeationKeywordBubbleSize(bubble, maxCount),
    }))
    .sort((left, right) => right.size - left.size || right.bubble.count - left.bubble.count);
  const placements: IdeationKeywordBubbleClusterBox["placements"] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  sizedItems.forEach((item, index) => {
    if (index === 0) {
      placements.push({ bubble: item.bubble, x: 0, y: 0, size: item.size });
      return;
    }

    const relatedAnchor =
      placements.find(
        (placement) =>
          item.bubble.related.includes(placement.bubble.text) ||
          placement.bubble.related.includes(item.bubble.text),
      ) || placements[0];
    const seedOffset = ideationBubbleSeedRatio(`${item.bubble.text}:${layoutSeed}`, 7) * Math.PI * 2;
    let chosen: IdeationKeywordBubbleClusterBox["placements"][number] | null = null;
    for (let attempt = 0; attempt < 84; attempt += 1) {
      const ring = Math.floor(attempt / 18);
      const angle = seedOffset + (attempt + index * 2) * goldenAngle;
      const radius = relatedAnchor.size / 2 + item.size / 2 + CANVAS_IDEATION_BUBBLE_ORGANIC_GAP + ring * 12;
      const candidate = {
        bubble: item.bubble,
        x: relatedAnchor.x + relatedAnchor.size / 2 + Math.cos(angle) * radius - item.size / 2,
        y: relatedAnchor.y + relatedAnchor.size / 2 + Math.sin(angle) * radius - item.size / 2,
        size: item.size,
      };
      if (!placements.some((placement) => ideationBubbleCirclesOverlap(candidate, placement, CANVAS_IDEATION_BUBBLE_ORGANIC_GAP))) {
        chosen = candidate;
        break;
      }
    }
    placements.push(chosen || makeIdeationBubbleFallbackPlacement(item.bubble, item.size, placements));
  });

  const minX = Math.min(...placements.map((placement) => placement.x));
  const minY = Math.min(...placements.map((placement) => placement.y));
  const maxX = Math.max(...placements.map((placement) => placement.x + placement.size));
  const maxY = Math.max(...placements.map((placement) => placement.y + placement.size));
  return {
    width: maxX - minX,
    height: maxY - minY,
    placements: placements.map((placement) => ({
      ...placement,
      x: placement.x - minX,
      y: placement.y - minY,
    })),
  };
}

function applyIdeationBubbleGrowthDisplacement(
  placements: IdeationKeywordBubblePlacement[],
  growthById: Record<string, number>,
) {
  if (!Object.values(growthById).some((growth) => growth > 1)) return placements;

  const relaxed = placements.map((placement) => {
    const growth = growthById[placement.bubble.id] || 1;
    const nextSize = Math.round(placement.size * growth);
    const centerX = placement.x + placement.size / 2;
    const centerY = placement.y + placement.size / 2;
    return {
      ...placement,
      x: centerX - nextSize / 2,
      y: centerY - nextSize / 2,
      size: nextSize,
      grown: growth > 1,
    };
  });

  for (let iteration = 0; iteration < 18; iteration += 1) {
    let moved = false;
    for (let leftIndex = 0; leftIndex < relaxed.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < relaxed.length; rightIndex += 1) {
        const left = relaxed[leftIndex];
        const right = relaxed[rightIndex];
        const leftRadius = left.size / 2;
        const rightRadius = right.size / 2;
        const leftCenterX = left.x + leftRadius;
        const leftCenterY = left.y + leftRadius;
        const rightCenterX = right.x + rightRadius;
        const rightCenterY = right.y + rightRadius;
        let dx = rightCenterX - leftCenterX;
        let dy = rightCenterY - leftCenterY;
        let distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = leftRadius + rightRadius + CANVAS_IDEATION_BUBBLE_ORGANIC_GAP;

        if (distance >= minDistance) continue;
        if (distance < 0.001) {
          const angle = ideationBubbleSeedRatio(`${left.bubble.id}:${right.bubble.id}`, iteration) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const overlap = minDistance - distance;
        const pushX = (dx / distance) * overlap;
        const pushY = (dy / distance) * overlap;
        const leftShare = left.grown && !right.grown ? 0 : right.grown && !left.grown ? 1 : 0.5;
        const rightShare = 1 - leftShare;

        left.x -= pushX * leftShare;
        left.y -= pushY * leftShare;
        right.x += pushX * rightShare;
        right.y += pushY * rightShare;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return relaxed.map((placement) => ({
    bubble: placement.bubble,
    x: placement.x,
    y: placement.y,
    size: placement.size,
  }));
}

function buildIdeationKeywordBubblePlacements(
  bubbles: IdeationKeywordBubble[],
  growthById: Record<string, number> = {},
  layoutSeed = 0,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
): IdeationKeywordBubblePlacement[] {
  const maxCount = Math.max(1, ...bubbles.map((bubble) => bubble.count));
  const clusterBoxes = buildIdeationKeywordBubbleClusters(bubbles)
    .map((cluster) => buildIdeationKeywordBubbleClusterBox(cluster, maxCount, layoutSeed))
    .sort((left, right) => right.width * right.height - left.width * left.height);
  const placedBubbles: IdeationKeywordBubblePlacement[] = [];
  const placedBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  const { centerX, centerY } = resolveIdeationBubbleLayoutAnchor(layoutAnchor);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  clusterBoxes.forEach((box, index) => {
    let chosen: { x: number; y: number } | null =
      index === 0
        ? {
            x: centerX - box.width / 2,
            y: centerY - box.height / 2,
          }
        : null;

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const radius = index === 0 ? 0 : 130 + Math.sqrt(attempt + index * 8) * 82;
      const angle = attempt * goldenAngle + index * 1.15 + layoutSeed * 0.73;
      const rawCandidate = {
        x: centerX + Math.cos(angle) * radius - box.width / 2,
        y: centerY + Math.sin(angle) * radius * 0.72 - box.height / 2,
      };
      const candidate = {
        x: clampNumber(rawCandidate.x, 70, CANVAS_IDEATION_BUBBLE_PLANE_WIDTH - box.width - 70),
        y: clampNumber(rawCandidate.y, 80, CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT - box.height - 70),
      };
      const separated = placedBoxes.every((placed) => (
        candidate.x + box.width + CANVAS_IDEATION_BUBBLE_CLUSTER_GAP < placed.x ||
        placed.x + placed.width + CANVAS_IDEATION_BUBBLE_CLUSTER_GAP < candidate.x ||
        candidate.y + box.height + CANVAS_IDEATION_BUBBLE_CLUSTER_GAP < placed.y ||
        placed.y + placed.height + CANVAS_IDEATION_BUBBLE_CLUSTER_GAP < candidate.y
      ));
      if (separated) {
        chosen = candidate;
        break;
      }
    }

    if (!chosen) {
      const maxRight = Math.max(
        70,
        ...placedBoxes.map((placed) => placed.x + placed.width + CANVAS_IDEATION_BUBBLE_CLUSTER_GAP),
      );
      chosen = {
        x: maxRight,
        y: clampNumber(centerY - box.height / 2, 80, CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT - box.height - 70),
      };
    }

    const clampedBox = {
      x: chosen.x,
      y: chosen.y,
      width: box.width,
      height: box.height,
    };
    placedBoxes.push(clampedBox);
    box.placements.forEach((placement) => {
      placedBubbles.push({
        bubble: placement.bubble,
        x: clampedBox.x + placement.x,
        y: clampedBox.y + placement.y,
        size: placement.size,
      });
    });
  });

  return applyIdeationBubbleGrowthDisplacement(placedBubbles, growthById);
}

function getIdeationBubbleVisualSize(
  bubble: IdeationKeywordBubble,
  maxCount: number,
  activity: number,
  growth = 1,
) {
  const baseSize = getIdeationKeywordBubbleSize(
    bubble,
    maxCount,
    clampNumber(growth, 1, CANVAS_IDEATION_BUBBLE_DEBUG_MAX_GROWTH),
  );
  return Math.round(baseSize * (0.82 + clampNumber(activity, 0, 1) * 0.18));
}

function getIdeationBubbleVisualOpacity(bubble: IdeationKeywordBubble, _activity: number) {
  if (bubble.displayState === "exiting") {
    return 0;
  }

  return 1;
}

function getIdeationBubbleIncomingActivity(bubble: IdeationKeywordBubble) {
  const weight = clampNumber(Number(bubble.weight || 0.5), 0, 1);
  const importance = clampNumber(Number(bubble.importance ?? weight), 0, 1);
  const relevance = clampNumber(Number(bubble.relevance ?? 1), 0, 1);
  const serverActivity = bubble.activity == null ? null : clampNumber(Number(bubble.activity), 0, 1);
  const computedActivity = clampNumber(0.26 + Math.max(weight, importance) * 0.52 + relevance * 0.22, 0.2, 1);
  if (serverActivity == null) return computedActivity;
  return clampNumber(serverActivity * 0.64 + computedActivity * 0.36, 0.08, 1);
}

function getIdeationBubbleImportanceScore(bubble: IdeationKeywordBubble, maxCount: number) {
  const countRatio = maxCount <= 1 ? 1 : clampNumber(bubble.count / maxCount, 0, 1);
  const weight = clampNumber(Number(bubble.weight || countRatio), 0, 1);
  const importance = clampNumber(Number(bubble.importance ?? weight), 0, 1);
  const relevance = clampNumber(Number(bubble.relevance ?? 1), 0, 1);
  const activity = clampNumber(Number(bubble.activity ?? 0.5), 0, 1);
  return countRatio * 0.42 + weight * 0.28 + importance * 0.2 + relevance * 0.06 + activity * 0.04;
}

function resolveIdeationBubblePrimaryIds(visuals: IdeationKeywordBubbleVisual[]) {
  const serverPrimaryIds = visuals
    .filter((visual) => visual.emphasis === "primary")
    .map((visual) => visual.id);
  if (serverPrimaryIds.length > 0) {
    return new Set(serverPrimaryIds);
  }

  const maxCount = Math.max(1, ...visuals.map((bubble) => bubble.count));
  const rankBubbles = (left: IdeationKeywordBubble, right: IdeationKeywordBubble) =>
    getIdeationBubbleImportanceScore(right, maxCount) - getIdeationBubbleImportanceScore(left, maxCount) ||
    right.count - left.count ||
    left.text.localeCompare(right.text);
  const rankedVisuals = [...visuals].sort(rankBubbles);
  const primaryCandidates = new Map<string, IdeationKeywordBubbleVisual>();

  buildIdeationKeywordBubbleClusters(rankedVisuals).forEach((cluster) => {
    if (cluster.length < 2) return;
    const [clusterPrimary] = [...cluster].sort(rankBubbles);
    const visual = visuals.find((item) => item.id === clusterPrimary.id);
    if (visual) primaryCandidates.set(visual.id, visual);
  });

  const selected = [...primaryCandidates.values()]
    .sort(rankBubbles)
    .slice(0, CANVAS_IDEATION_BUBBLE_MAX_PRIMARY_COUNT);

  if (selected.length === 0 && rankedVisuals.length > 0) {
    selected.push(rankedVisuals[0]);
  }

  return new Set(selected.map((bubble) => bubble.id));
}

function applyIdeationBubblePrimaryEmphasis(visuals: IdeationKeywordBubbleVisual[]) {
  if (visuals.some((visual) => visual.emphasis === "primary" || visual.emphasis === "default")) {
    return visuals.map((visual) => ({
      ...visual,
      opacity: getIdeationBubbleVisualOpacity(visual, visual.activity),
    }));
  }

  const primaryIds = resolveIdeationBubblePrimaryIds(visuals);
  return visuals.map((visual) => {
    const nextVisual = {
      ...visual,
      emphasis: primaryIds.has(visual.id) ? "primary" as const : "default" as const,
    };
    return {
      ...nextVisual,
      opacity: getIdeationBubbleVisualOpacity(nextVisual, nextVisual.activity),
    };
  });
}

function clampIdeationBubblePosition(x: number, y: number, size: number) {
  return {
    x: clampNumber(x, 70, CANVAS_IDEATION_BUBBLE_PLANE_WIDTH - size - 70),
    y: clampNumber(y, 80, CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT - size - 70),
  };
}

function hasServerIdeationBubbleTarget(bubble: IdeationKeywordBubble) {
  return Number.isFinite(Number(bubble.layoutX)) && Number.isFinite(Number(bubble.layoutY));
}

function getServerIdeationBubblePosition(bubble: IdeationKeywordBubble, size: number) {
  const serverSize = Number.isFinite(Number(bubble.layoutSize)) && Number(bubble.layoutSize) > 0
    ? Number(bubble.layoutSize)
    : size;
  const centerX = Number(bubble.layoutX) + serverSize / 2;
  const centerY = Number(bubble.layoutY) + serverSize / 2;
  return clampIdeationBubblePosition(centerX - size / 2, centerY - size / 2, size);
}

function findIdeationBubbleVisualByText(
  visuals: IdeationKeywordBubbleVisual[],
  text?: string,
) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return null;
  return visuals.find((visual) => visual.text.trim().toLowerCase() === normalized) || null;
}

function findIdeationBubbleAnchorVisual(
  bubble: IdeationKeywordBubble,
  visuals: IdeationKeywordBubbleVisual[],
) {
  const directAnchor = findIdeationBubbleVisualByText(visuals, bubble.anchorText);
  if (directAnchor) return directAnchor;
  for (const relatedText of bubble.related || []) {
    const related = findIdeationBubbleVisualByText(visuals, relatedText);
    if (related) return related;
  }
  return null;
}

function isIdeationBubblePositionOpen(
  candidate: { id: string; x: number; y: number; size: number },
  occupied: Array<{ id: string; x: number; y: number; size: number }>,
) {
  return occupied.every((placement) => (
    placement.id === candidate.id ||
    !ideationBubbleCirclesOverlap(candidate, placement, CANVAS_IDEATION_BUBBLE_ORGANIC_GAP + 4)
  ));
}

function getIdeationBubbleScaledCircle(placement: {
  id: string;
  x: number;
  y: number;
  size: number;
  visualScale?: number;
}) {
  const visualSize = Math.max(1, placement.size * clampNumber(placement.visualScale ?? 1, 0.15, 1));
  const centerX = placement.x + placement.size / 2;
  const centerY = placement.y + placement.size / 2;
  return {
    id: placement.id,
    x: centerX - visualSize / 2,
    y: centerY - visualSize / 2,
    size: visualSize,
  };
}

function findIdeationBubbleSpawnTarget(
  bubble: Pick<IdeationKeywordBubble, "id">,
  size: number,
  occupied: Array<{ id: string; x: number; y: number; size: number; visualScale?: number }>,
  tick: number,
  order: number,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  const visualSize = size * CANVAS_IDEATION_BUBBLE_ENTER_SCALE;
  const { spawnX, spawnY } = resolveIdeationBubbleLayoutAnchor(layoutAnchor);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const seedAngle = ideationBubbleSeedRatio(`${bubble.id}:spawn:${tick}`, 61) * Math.PI * 2;
  const occupiedVisuals = occupied.map(getIdeationBubbleScaledCircle);

  for (let attempt = 0; attempt < 140; attempt += 1) {
    const radius = attempt === 0 ? 0 : 16 + Math.sqrt(attempt + order * 4) * 24;
    const angle = seedAngle + attempt * goldenAngle + order * 0.38;
    const visualCenterX = spawnX + Math.cos(angle) * radius;
    const visualCenterY = spawnY + Math.sin(angle) * radius * 0.72;
    const visualCandidate = {
      id: bubble.id,
      x: visualCenterX - visualSize / 2,
      y: visualCenterY - visualSize / 2,
      size: visualSize,
    };

    const spawnPositionOpen = occupiedVisuals.every((placement) => (
      placement.id === visualCandidate.id ||
      !ideationBubbleCirclesOverlap(visualCandidate, placement, CANVAS_IDEATION_BUBBLE_SPAWN_GAP)
    ));

    if (spawnPositionOpen) {
      return clampIdeationBubblePosition(
        visualCenterX - size / 2,
        visualCenterY - size / 2,
        size,
      );
    }
  }

  const fallbackCenterX = spawnX + ideationBubbleSeedRatio(`${bubble.id}:spawn-fallback`, 67) * 180 - 90;
  const fallbackCenterY = spawnY + ideationBubbleSeedRatio(`${bubble.id}:spawn-fallback`, 71) * 120 - 60;
  return clampIdeationBubblePosition(fallbackCenterX - size / 2, fallbackCenterY - size / 2, size);
}

function hasIdeationBubbleOrbitSpawnTarget(bubble: IdeationKeywordBubbleVisual) {
  return (
    hasServerIdeationBubbleTarget(bubble) &&
    Number.isFinite(Number(bubble.orbitAngle)) &&
    Number.isFinite(Number(bubble.orbitRadius))
  );
}

function findIdeationBubbleOrbitSpawnTarget(bubble: IdeationKeywordBubbleVisual) {
  const finalPosition = clampIdeationBubblePosition(bubble.targetX, bubble.targetY, bubble.size);
  return finalPosition;
}

function applyIdeationBubbleEnterState(
  visuals: IdeationKeywordBubbleVisual[],
  enteringIds: Set<string>,
  tick: number,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  if (enteringIds.size === 0) {
    return visuals.map((visual) => ({
      ...visual,
      entering: false,
      visualScale: visual.visualScale ?? 1,
    }));
  }

  const spawnOccupied: Array<{ id: string; x: number; y: number; size: number; visualScale?: number }> = visuals
    .filter((visual) => !enteringIds.has(visual.id))
    .map((visual) => ({
      id: visual.id,
      x: visual.targetX,
      y: visual.targetY,
      size: visual.size,
      visualScale: visual.visualScale ?? 1,
    }));
  let enteringOrder = 0;

  return visuals.map((visual) => {
    if (!enteringIds.has(visual.id)) {
      return {
        ...visual,
        entering: false,
        visualScale: visual.visualScale ?? 1,
      };
    }

    const spawn = hasIdeationBubbleOrbitSpawnTarget(visual)
      ? findIdeationBubbleOrbitSpawnTarget(visual)
      : findIdeationBubbleSpawnTarget(visual, visual.size, spawnOccupied, tick, enteringOrder, layoutAnchor);
    enteringOrder += 1;
    spawnOccupied.push({
      id: visual.id,
      x: spawn.x,
      y: spawn.y,
      size: visual.size,
      visualScale: CANVAS_IDEATION_BUBBLE_ENTER_SCALE,
    });

    return {
      ...visual,
      targetX: spawn.x,
      targetY: spawn.y,
      settledTargetX: visual.targetX,
      settledTargetY: visual.targetY,
      visualScale: CANVAS_IDEATION_BUBBLE_ENTER_SCALE,
      arcOffsetX: 0,
      arcOffsetY: 0,
      arcMotion: false,
      arcMotionPath: undefined,
      entering: true,
      opacity: getIdeationBubbleVisualOpacity(visual, visual.activity),
    };
  });
}

function findStableIdeationBubbleTarget(
  bubble: IdeationKeywordBubble,
  size: number,
  visuals: IdeationKeywordBubbleVisual[],
  occupied: Array<{ id: string; x: number; y: number; size: number }>,
  tick: number,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  const anchor = findIdeationBubbleAnchorVisual(bubble, visuals);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  if (anchor) {
    const anchorCenterX = anchor.targetX + anchor.size / 2;
    const anchorCenterY = anchor.targetY + anchor.size / 2;
    const seedAngle = ideationBubbleSeedRatio(`${bubble.id}:${anchor.id}`, 17) * Math.PI * 2;
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const ring = Math.floor(attempt / 20);
      const angle = seedAngle + attempt * goldenAngle;
      const radius = anchor.size / 2 + size / 2 + 22 + ring * 24;
      const raw = {
        x: anchorCenterX + Math.cos(angle) * radius - size / 2,
        y: anchorCenterY + Math.sin(angle) * radius - size / 2,
      };
      const candidate = { id: bubble.id, size, ...clampIdeationBubblePosition(raw.x, raw.y, size) };
      if (isIdeationBubblePositionOpen(candidate, occupied)) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  }

  const { centerX, centerY } = resolveIdeationBubbleLayoutAnchor(layoutAnchor);
  const seedAngle = ideationBubbleSeedRatio(`${bubble.id}:${tick}`, 29) * Math.PI * 2;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const radius = Math.sqrt(attempt + 1) * 78;
    const angle = seedAngle + attempt * goldenAngle;
    const raw = {
      x: centerX + Math.cos(angle) * radius - size / 2,
      y: centerY + Math.sin(angle) * radius * 0.72 - size / 2,
    };
    const candidate = { id: bubble.id, size, ...clampIdeationBubblePosition(raw.x, raw.y, size) };
    if (isIdeationBubblePositionOpen(candidate, occupied)) {
      return { x: candidate.x, y: candidate.y };
    }
  }

  return clampIdeationBubblePosition(
    centerX + ideationBubbleSeedRatio(bubble.id, 31) * 240 - 120,
    centerY + ideationBubbleSeedRatio(bubble.id, 37) * 180 - 90,
    size,
  );
}

function getIdeationBubbleCenter(bubble: Pick<IdeationKeywordBubbleVisual, "targetX" | "targetY" | "size">) {
  return {
    x: bubble.targetX + bubble.size / 2,
    y: bubble.targetY + bubble.size / 2,
  };
}

function prefersReducedIdeationBubbleMotion() {
  return (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function shortestIdeationBubbleAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function getIdeationBubbleArcMotionPath(
  previous: IdeationKeywordBubbleVisual | undefined,
  next: Pick<
    IdeationKeywordBubbleVisual,
    "id" | "size" | "targetX" | "targetY" | "orbitCenterId" | "orbitRing" | "orbitAngle" | "orbitRadius"
  >,
) {
  if (!previous || prefersReducedIdeationBubbleMotion()) return null;
  if (!next.orbitCenterId || previous.orbitCenterId !== next.orbitCenterId) return null;
  if (Number(previous.orbitRing ?? -1) !== Number(next.orbitRing ?? -2)) return null;
  if (Number(next.orbitRing ?? 0) <= 0) return null;

  const previousAngle = Number(previous.orbitAngle);
  const nextAngle = Number(next.orbitAngle);
  const previousRadius = Number(previous.orbitRadius);
  const nextRadius = Number(next.orbitRadius);
  if (
    !Number.isFinite(previousAngle)
    || !Number.isFinite(nextAngle)
    || !Number.isFinite(previousRadius)
    || !Number.isFinite(nextRadius)
    || previousRadius <= 0
    || nextRadius <= 0
  ) {
    return null;
  }

  const previousCenter = getIdeationBubbleCenter(previous);
  const nextCenter = getIdeationBubbleCenter(next);
  const moveDistance = Math.hypot(nextCenter.x - previousCenter.x, nextCenter.y - previousCenter.y);
  if (moveDistance < 8) return null;

  const delta = shortestIdeationBubbleAngleDelta(previousAngle, nextAngle);
  if (Math.abs(delta) < 0.02) return null;

  const radius = (previousRadius + nextRadius) / 2;
  const orbitCenter = {
    x: nextCenter.x - Math.cos(nextAngle) * nextRadius,
    y: nextCenter.y - Math.sin(nextAngle) * nextRadius,
  };
  const midAngle = previousAngle + delta / 2;
  const arcMid = {
    x: orbitCenter.x + Math.cos(midAngle) * radius,
    y: orbitCenter.y + Math.sin(midAngle) * radius,
  };
  const straightMid = {
    x: (previousCenter.x + nextCenter.x) / 2,
    y: (previousCenter.y + nextCenter.y) / 2,
  };
  const offsetX = clampNumber(arcMid.x - straightMid.x, -72, 72);
  const offsetY = clampNumber(arcMid.y - straightMid.y, -72, 72);
  const fromX = previousCenter.x - nextCenter.x;
  const fromY = previousCenter.y - nextCenter.y;
  const midX = (previousCenter.x - nextCenter.x) / 2 + offsetX;
  const midY = (previousCenter.y - nextCenter.y) / 2 + offsetY;
  if (Math.hypot(fromX, fromY) < 8 && Math.hypot(midX, midY) < 8) return null;
  return {
    key: [
      next.id,
      previous.orbitCenterId,
      previous.orbitRing,
      previous.orbitSlotIndex,
      nextAngle.toFixed(4),
      nextRadius.toFixed(1),
      Math.round(next.targetX),
      Math.round(next.targetY),
    ].join(":"),
    fromX: Math.round(fromX * 100) / 100,
    fromY: Math.round(fromY * 100) / 100,
    midX: Math.round(midX * 100) / 100,
    midY: Math.round(midY * 100) / 100,
    previousAngle: Math.round(previousAngle * 10000) / 10000,
    nextAngle: Math.round(nextAngle * 10000) / 10000,
    durationMs: CANVAS_IDEATION_BUBBLE_ARC_MOTION_DURATION_MS,
  };
}

function getDemoIdeationBubbleMotionType(
  previous: IdeationKeywordBubbleVisual | undefined,
  next: IdeationKeywordBubbleVisual,
): IdeationKeywordBubbleVisual["demoMotionType"] {
  if (!previous) return "enter";
  if (next.displayState === "exiting") return "exit";
  const sameOrbit = previous.orbitCenterId && previous.orbitCenterId === next.orbitCenterId;
  if (sameOrbit && Number(previous.orbitRing ?? -1) === Number(next.orbitRing ?? -2)) return "arc";
  if (sameOrbit) return "radial";
  return "orbit-transfer";
}

function limitIdeationBubbleTargetShift(
  current: { x: number; y: number },
  target: { x: number; y: number },
  maxDistance = CANVAS_IDEATION_BUBBLE_MAX_RETARGET_DISTANCE,
) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= maxDistance || distance < 0.001) {
    return target;
  }

  const ratio = maxDistance / distance;
  return {
    x: current.x + dx * ratio,
    y: current.y + dy * ratio,
  };
}

function normalizeIdeationBubbleLayoutZone(bubble: Pick<IdeationKeywordBubble, "layoutZone">) {
  const zone = String(bubble.layoutZone || "default").trim().toLowerCase();
  return zone === "core" || zone === "peripheral" || zone === "archived" ? zone : "default";
}

function getIdeationBubbleZoneTarget(
  bubble: Pick<IdeationKeywordBubbleVisual, "id" | "size" | "targetX" | "targetY" | "layoutZone" | "activity">,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  const zone = normalizeIdeationBubbleLayoutZone(bubble);
  if (zone !== "core" && zone !== "peripheral") {
    return null;
  }

  const { centerX: planeCenterX, centerY: planeCenterY } = resolveIdeationBubbleLayoutAnchor(layoutAnchor);
  const center = getIdeationBubbleCenter(bubble);
  const dx = center.x - planeCenterX;
  const dy = center.y - planeCenterY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const seedAngle = ideationBubbleSeedRatio(`${bubble.id}:layout-zone`, 43) * Math.PI * 2;
  const angle = zone === "core" ? seedAngle : distance > 12 ? Math.atan2(dy, dx) : seedAngle;
  const activity = clampNumber(Number(bubble.activity ?? 0.5), 0, 1);
  const radiusBase = zone === "peripheral"
    ? CANVAS_IDEATION_BUBBLE_PERIPHERAL_ZONE_RADIUS
    : 52 + (1 - activity) * CANVAS_IDEATION_BUBBLE_CORE_ZONE_RADIUS;
  const radiusJitter = zone === "peripheral"
    ? ideationBubbleSeedRatio(`${bubble.id}:peripheral`, 47) * 110
    : ideationBubbleSeedRatio(`${bubble.id}:core`, 53) * (22 + (1 - activity) * 58);
  const radius = radiusBase + radiusJitter;
  return clampIdeationBubblePosition(
    planeCenterX + Math.cos(angle) * radius - bubble.size / 2,
    planeCenterY + Math.sin(angle) * radius * 0.76 - bubble.size / 2,
    bubble.size,
  );
}

function applyIdeationBubbleLayoutZoneRetarget(
  visuals: IdeationKeywordBubbleVisual[],
  tick: number,
  immediate = false,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  return visuals.map((visual) => {
    const target = getIdeationBubbleZoneTarget(visual, layoutAnchor);
    if (!target) return visual;
    const limitedTarget = immediate
      ? target
      : limitIdeationBubbleTargetShift(
          { x: visual.targetX, y: visual.targetY },
          target,
          CANVAS_IDEATION_BUBBLE_ZONE_RETARGET_DISTANCE,
        );
    const clampedTarget = clampIdeationBubblePosition(limitedTarget.x, limitedTarget.y, visual.size);
    return {
      ...visual,
      targetX: clampedTarget.x,
      targetY: clampedTarget.y,
    };
  });
}

function applyIdeationBubbleProximityRetarget(
  visuals: IdeationKeywordBubbleVisual[],
  incomingIds: Set<string>,
  tick: number,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  const nextVisuals = visuals.map((visual) => ({ ...visual }));
  const occupied = nextVisuals.map((visual) => ({
    id: visual.id,
    x: visual.targetX,
    y: visual.targetY,
    size: visual.size,
  }));

  nextVisuals.forEach((visual, index) => {
    if (!incomingIds.has(visual.id)) return;
    const anchor = findIdeationBubbleAnchorVisual(visual, nextVisuals);
    if (!anchor || anchor.id === visual.id) return;

    const visualCenter = getIdeationBubbleCenter(visual);
    const anchorCenter = getIdeationBubbleCenter(anchor);
    const dx = visualCenter.x - anchorCenter.x;
    const dy = visualCenter.y - anchorCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= CANVAS_IDEATION_BUBBLE_RELATION_TARGET_DISTANCE) return;

    const target = findStableIdeationBubbleTarget(visual, visual.size, nextVisuals, occupied, tick, layoutAnchor);
    const limitedTarget = limitIdeationBubbleTargetShift(
      { x: visual.targetX, y: visual.targetY },
      target,
    );
    const clampedTarget = clampIdeationBubblePosition(limitedTarget.x, limitedTarget.y, visual.size);
    visual.targetX = clampedTarget.x;
    visual.targetY = clampedTarget.y;
    occupied[index] = { id: visual.id, x: visual.targetX, y: visual.targetY, size: visual.size };
  });

  return nextVisuals;
}

function applyIdeationBubbleIncrementalLayoutRelaxation(
  visuals: IdeationKeywordBubbleVisual[],
  tick: number,
) {
  if (visuals.length < 2) return visuals;

  const nextVisuals = visuals.map((visual) => ({ ...visual }));
  for (let iteration = 0; iteration < CANVAS_IDEATION_BUBBLE_RELAXATION_ITERATIONS; iteration += 1) {
    let moved = false;

    for (let leftIndex = 0; leftIndex < nextVisuals.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nextVisuals.length; rightIndex += 1) {
        const left = nextVisuals[leftIndex];
        const right = nextVisuals[rightIndex];
        const leftRadius = left.size / 2;
        const rightRadius = right.size / 2;
        const leftCenterX = left.targetX + leftRadius;
        const leftCenterY = left.targetY + leftRadius;
        const rightCenterX = right.targetX + rightRadius;
        const rightCenterY = right.targetY + rightRadius;
        let dx = rightCenterX - leftCenterX;
        let dy = rightCenterY - leftCenterY;
        let distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = leftRadius + rightRadius + CANVAS_IDEATION_BUBBLE_RELAXATION_GAP;

        if (distance >= minDistance) continue;
        if (distance < 0.001) {
          const angle = ideationBubbleSeedRatio(`${left.id}:${right.id}:relax`, tick + iteration) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const overlap = minDistance - distance;
        const pushX = (dx / distance) * overlap * CANVAS_IDEATION_BUBBLE_RELAXATION_STEP;
        const pushY = (dy / distance) * overlap * CANVAS_IDEATION_BUBBLE_RELAXATION_STEP;
        const leftMoveShare = right.size / Math.max(1, left.size + right.size);
        const rightMoveShare = 1 - leftMoveShare;
        const leftTarget = clampIdeationBubblePosition(
          left.targetX - pushX * leftMoveShare,
          left.targetY - pushY * leftMoveShare,
          left.size,
        );
        const rightTarget = clampIdeationBubblePosition(
          right.targetX + pushX * rightMoveShare,
          right.targetY + pushY * rightMoveShare,
          right.size,
        );

        left.targetX = leftTarget.x;
        left.targetY = leftTarget.y;
        right.targetX = rightTarget.x;
        right.targetY = rightTarget.y;
        moved = true;
      }
    }

    if (!moved) break;
  }

  return nextVisuals;
}

function resolveIdeationBubbleVisualCollisions(
  visuals: IdeationKeywordBubbleVisual[],
  tick: number,
) {
  if (visuals.length < 2) return visuals;

  const nextVisuals = visuals.map((visual) => ({ ...visual }));
  for (let iteration = 0; iteration < CANVAS_IDEATION_BUBBLE_COLLISION_ITERATIONS; iteration += 1) {
    let moved = false;

    for (let leftIndex = 0; leftIndex < nextVisuals.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nextVisuals.length; rightIndex += 1) {
        const left = nextVisuals[leftIndex];
        const right = nextVisuals[rightIndex];
        const leftRadius = left.size / 2;
        const rightRadius = right.size / 2;
        const leftCenterX = left.targetX + leftRadius;
        const leftCenterY = left.targetY + leftRadius;
        const rightCenterX = right.targetX + rightRadius;
        const rightCenterY = right.targetY + rightRadius;
        let dx = rightCenterX - leftCenterX;
        let dy = rightCenterY - leftCenterY;
        let distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = leftRadius + rightRadius + CANVAS_IDEATION_BUBBLE_COLLISION_GAP;

        if (distance >= minDistance) continue;
        if (distance < 0.001) {
          const angle = ideationBubbleSeedRatio(`${left.id}:${right.id}:${tick}`, iteration) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const overlap = minDistance - distance;
        const pushX = (dx / distance) * overlap;
        const pushY = (dy / distance) * overlap;
        const leftMoveShare = right.size / Math.max(1, left.size + right.size);
        const rightMoveShare = 1 - leftMoveShare;
        const leftTarget = clampIdeationBubblePosition(
          left.targetX - pushX * leftMoveShare,
          left.targetY - pushY * leftMoveShare,
          left.size,
        );
        const rightTarget = clampIdeationBubblePosition(
          right.targetX + pushX * rightMoveShare,
          right.targetY + pushY * rightMoveShare,
          right.size,
        );

        left.targetX = leftTarget.x;
        left.targetY = leftTarget.y;
        right.targetX = rightTarget.x;
        right.targetY = rightTarget.y;
        moved = true;
      }
    }

    if (!moved) break;
  }

  return nextVisuals;
}

function buildServerManagedIdeationBubbleVisuals(
  previousVisuals: IdeationKeywordBubbleVisual[],
  incomingBubbles: IdeationKeywordBubble[],
  growthById: Record<string, number>,
  tick: number,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  const previousById = new Map(previousVisuals.map((visual) => [visual.id, visual]));
  const maxCount = Math.max(1, ...incomingBubbles.map((bubble) => bubble.count));
  const newBubbleIds = new Set<string>();

  const visuals = incomingBubbles.map((bubble) => {
    const previous = previousById.get(bubble.id);
    const incomingActivity = getIdeationBubbleIncomingActivity(bubble);
    const activity = previous
      ? clampNumber(Math.max(previous.activity, 0.5) * 0.35 + incomingActivity * 0.65, 0.18, 1)
      : incomingActivity;
    const serverSize = Number(bubble.layoutSize);
    const size = Number.isFinite(serverSize) && serverSize > 0
      ? Math.round(serverSize)
      : getIdeationBubbleVisualSize(bubble, maxCount, activity, growthById[bubble.id] || 1);
    const position = getServerIdeationBubblePosition(bubble, size);
    if (!previous) {
      newBubbleIds.add(bubble.id);
    }

    const merged = previous ? { ...previous, ...bubble } : bubble;
    const nextVisual = {
      ...merged,
      activity,
      opacity: getIdeationBubbleVisualOpacity(merged, activity),
      size,
      targetX: position.x,
      targetY: position.y,
      settledTargetX: undefined,
      settledTargetY: undefined,
      visualScale: 1,
      entering: false,
      firstSeenTick: previous?.firstSeenTick ?? tick,
      lastSeenTick: tick,
    };
    const arcMotionPath = previous && !newBubbleIds.has(bubble.id)
      ? getIdeationBubbleArcMotionPath(previous, nextVisual)
      : null;
    const demoMotionType = getDemoIdeationBubbleMotionType(previous, nextVisual);
    return {
      ...nextVisual,
      arcOffsetX: 0,
      arcOffsetY: 0,
      arcMotion: Boolean(arcMotionPath),
      arcMotionPath: arcMotionPath ?? undefined,
      demoMotionType,
      demoPreviousAngle: previous?.orbitAngle,
      demoNextAngle: nextVisual.orbitAngle,
    };
  });

  const emphasized = applyIdeationBubblePrimaryEmphasis(visuals);
  return applyIdeationBubbleEnterState(emphasized, newBubbleIds, tick, layoutAnchor);
}

export function buildStableIdeationBubbleVisuals(
  previousVisuals: IdeationKeywordBubbleVisual[],
  incomingBubbles: IdeationKeywordBubble[],
  growthById: Record<string, number>,
  tick: number,
  layoutAnchor?: IdeationBubbleLayoutAnchor | null,
) {
  if (incomingBubbles.length > 0 && incomingBubbles.every(hasServerIdeationBubbleTarget)) {
    return buildServerManagedIdeationBubbleVisuals(
      previousVisuals,
      incomingBubbles,
      growthById,
      tick,
      layoutAnchor,
    );
  }

  const incomingById = new Map(incomingBubbles.map((bubble) => [bubble.id, bubble]));
  const incomingIds = new Set(incomingById.keys());
  const visiblePreviousVisuals = previousVisuals.filter((visual) => incomingIds.has(visual.id));

  if (visiblePreviousVisuals.length === 0 && incomingBubbles.length > 0) {
    const maxInitialCount = Math.max(
      1,
      ...incomingBubbles.map((bubble) => bubble.count),
    );
    const initialVisuals = buildIdeationKeywordBubblePlacements(incomingBubbles, growthById, tick, layoutAnchor).map(({ bubble, x, y, size }) => {
      const activity = getIdeationBubbleIncomingActivity(bubble);
      const visualSize = getIdeationBubbleVisualSize(bubble, maxInitialCount, activity, growthById[bubble.id] || 1);
      const centerX = x + size / 2;
      const centerY = y + size / 2;
      const position = clampIdeationBubblePosition(centerX - visualSize / 2, centerY - visualSize / 2, visualSize);
      return {
        ...bubble,
        activity,
        opacity: getIdeationBubbleVisualOpacity(bubble, activity),
        size: visualSize,
        targetX: position.x,
        targetY: position.y,
        visualScale: 1,
        entering: false,
        firstSeenTick: tick,
        lastSeenTick: tick,
      };
    });
    const settledVisuals = applyIdeationBubblePrimaryEmphasis(resolveIdeationBubbleVisualCollisions(
      applyIdeationBubbleIncrementalLayoutRelaxation(
        applyIdeationBubbleLayoutZoneRetarget(initialVisuals, tick, true, layoutAnchor),
        tick,
      ),
      tick,
    ));
    return applyIdeationBubbleEnterState(
      settledVisuals,
      tick > 1 ? new Set(incomingBubbles.map((bubble) => bubble.id)) : new Set<string>(),
      tick,
      layoutAnchor,
    );
  }

  const maxCount = Math.max(
    1,
    ...visiblePreviousVisuals.map((bubble) => bubble.count),
    ...incomingBubbles.map((bubble) => bubble.count),
  );

  const nextVisuals: IdeationKeywordBubbleVisual[] = visiblePreviousVisuals.map((visual) => {
    const incoming = incomingById.get(visual.id);
    const isActive = Boolean(incoming);
    const merged = incoming ? { ...visual, ...incoming } : visual;
    const nextActivity = isActive
      ? clampNumber(Math.max(visual.activity, 0.5) * 0.35 + getIdeationBubbleIncomingActivity(incoming || visual) * 0.65, 0.18, 1)
      : clampNumber(visual.activity * CANVAS_IDEATION_BUBBLE_DECAY_RATE, 0.08, 1);
    const size = getIdeationBubbleVisualSize(merged, maxCount, nextActivity, growthById[visual.id] || 1);
    const baseTargetX = visual.entering && visual.settledTargetX != null ? visual.settledTargetX : visual.targetX;
    const baseTargetY = visual.entering && visual.settledTargetY != null ? visual.settledTargetY : visual.targetY;
    const centerX = baseTargetX + visual.size / 2;
    const centerY = baseTargetY + visual.size / 2;
    const position = clampIdeationBubblePosition(centerX - size / 2, centerY - size / 2, size);
    return {
      ...merged,
      activity: nextActivity,
      opacity: getIdeationBubbleVisualOpacity(merged, nextActivity),
      size,
      targetX: position.x,
      targetY: position.y,
      settledTargetX: undefined,
      settledTargetY: undefined,
      visualScale: 1,
      entering: false,
      firstSeenTick: visual.firstSeenTick,
      lastSeenTick: isActive ? tick : visual.lastSeenTick,
    };
  });

  const occupied = nextVisuals.map((visual) => ({
    id: visual.id,
    x: visual.targetX,
    y: visual.targetY,
    size: visual.size,
  }));

  const newBubbleIds = new Set<string>();
  incomingBubbles.forEach((bubble) => {
    if (visiblePreviousVisuals.some((visual) => visual.id === bubble.id)) return;
    const activity = getIdeationBubbleIncomingActivity(bubble);
    const size = getIdeationBubbleVisualSize(bubble, maxCount, activity, growthById[bubble.id] || 1);
    const target = findStableIdeationBubbleTarget(bubble, size, nextVisuals, occupied, tick, layoutAnchor);
    const visual: IdeationKeywordBubbleVisual = {
      ...bubble,
      activity,
      opacity: getIdeationBubbleVisualOpacity(bubble, activity),
      size,
      targetX: target.x,
      targetY: target.y,
      visualScale: 1,
      entering: false,
      firstSeenTick: tick,
      lastSeenTick: tick,
    };
    nextVisuals.push(visual);
    newBubbleIds.add(visual.id);
    occupied.push({ id: visual.id, x: visual.targetX, y: visual.targetY, size: visual.size });
  });

  const retargetedVisuals = applyIdeationBubbleLayoutZoneRetarget(
    applyIdeationBubbleProximityRetarget(nextVisuals, incomingIds, tick, layoutAnchor),
    tick,
    false,
    layoutAnchor,
  );

  const settledVisuals = applyIdeationBubblePrimaryEmphasis(resolveIdeationBubbleVisualCollisions(
    applyIdeationBubbleIncrementalLayoutRelaxation(retargetedVisuals, tick),
    tick,
  )).sort((left, right) => {
    const leftActive = incomingIds.has(left.id) ? 1 : 0;
    const rightActive = incomingIds.has(right.id) ? 1 : 0;
    return rightActive - leftActive || left.firstSeenTick - right.firstSeenTick;
  });

  return applyIdeationBubbleEnterState(settledVisuals, newBubbleIds, tick, layoutAnchor);
}

export function getIdeationBubbleEnterSettleDelayMs() {
  return CANVAS_IDEATION_BUBBLE_ENTER_SETTLE_DELAY_MS;
}

export function getIdeationBubbleArcMotionSettleDelayMs() {
  return CANVAS_IDEATION_BUBBLE_ARC_MOTION_DURATION_MS + 120;
}

export function settleEnteringIdeationBubbleVisuals(
  visuals: IdeationKeywordBubbleVisual[],
  targetIds?: ReadonlySet<string>,
) {
  let changed = false;
  const nextVisuals = visuals.map((visual) => {
    const shouldSettle = visual.entering || visual.arcMotion;
    if (!shouldSettle || (targetIds && !targetIds.has(visual.id))) {
      return visual;
    }

    changed = true;
    return {
      ...visual,
      targetX: visual.settledTargetX ?? visual.targetX,
      targetY: visual.settledTargetY ?? visual.targetY,
      settledTargetX: undefined,
      settledTargetY: undefined,
      visualScale: 1,
      arcOffsetX: 0,
      arcOffsetY: 0,
      arcMotion: false,
      arcMotionPath: undefined,
      entering: false,
      opacity: getIdeationBubbleVisualOpacity(visual, visual.activity),
    };
  });

  return changed ? nextVisuals : visuals;
}

