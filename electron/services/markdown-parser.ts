/**
 * Markdown parser for two file types:
 *   1. .tasks/*.md — Metadata table (| 欄位 | 值 |) + body sections
 *   2. proposal/sprint*-dev-plan.md — Section 10 execution records (3 tables)
 *
 * Fault-tolerant: malformed content returns null / empty arrays instead of throwing.
 */

export interface ParsedTask {
  id: string;
  title: string;
  status: string;
  assignedTo: string | null;
  priority: string;
  sprintId: string | null;
  projectId: string | null;
  tags: string | null;
  estimatedHours: number | null;
  createdAt: string | null;
  description: string;
  dependsOn: string | null;
}

export interface ParsedDevPlanSection10 {
  taskRecords: Array<{
    taskId: string;
    title: string;
    status: string;
    completedAt: string | null;
    notes: string | null;
  }>;
  reviewRecords: Array<{
    step: string;
    reviewType: string;
    result: string;
    reviewer: string | null;
    date: string | null;
    notes: string | null;
  }>;
  gateRecords: Array<{
    gateType: string;
    decision: string;
    submittedBy: string | null;
    reviewer: string | null;
    date: string | null;
    comment: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a 2-column metadata table (| 欄位 | 值 |) from task file content.
 * Returns a key-value map. Keys are the Chinese field names (e.g. 'ID', '狀態').
 */
function parseMetadataTable(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  let inTable = false;
  let headerParsed = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line.startsWith('|')) {
      if (inTable) break; // table ended
      continue;
    }

    inTable = true;

    // Skip separator rows like |------|-----|
    if (/^\|[\s\-:|]+\|$/.test(line)) {
      headerParsed = true;
      continue;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());

    if (!headerParsed) {
      // This is the header row (| 欄位 | 值 |), skip
      continue;
    }

    // Data row: cells[0] = field name, cells[1] = value
    if (cells.length >= 2 && cells[0]) {
      result[cells[0]] = cells[1] ?? '';
    }
  }

  return result;
}

/**
 * Extract the body content after the metadata table and horizontal rule.
 * Looks for sections like ## 任務描述, ## 驗收標準, ## 事件紀錄.
 */
function extractTaskBody(content: string): string {
  // Find the first ## heading after the metadata table
  const firstH2 = content.search(/^##\s+/m);
  if (firstH2 === -1) return '';
  return content.slice(firstH2).trim();
}

/**
 * Parse a markdown table section into an array of row objects.
 * Returns empty array if no valid table is found.
 * Each row is a plain object keyed by column index (0-based).
 */
function parseMarkdownTable(section: string): string[][] {
  const rows: string[][] = [];
  const lines = section.split('\n');
  let inTable = false;
  let headerParsed = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Detect table row: starts and ends with |
    if (!line.startsWith('|')) {
      if (inTable) break; // table ended
      continue;
    }

    inTable = true;

    // Skip separator rows like |---|---|
    if (/^\|[\s\-:|]+\|$/.test(line)) {
      headerParsed = true;
      continue;
    }

    // Split on | and trim each cell
    const cells = line
      .split('|')
      .slice(1, -1) // remove leading/trailing empty splits
      .map((c) => c.trim());

    if (!headerParsed) {
      // This is the header row — skip it but mark header seen on next separator
      headerParsed = false; // wait for separator
      rows.push(cells); // push header so we can skip it later by index
    } else {
      rows.push(cells);
    }
  }

  // The first row is always the header; return data rows only
  return rows.slice(1);
}

/**
 * Extract a named subsection (### heading) from markdown content.
 */
function extractSubsection(content: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(content);
  if (!match) return '';

  const start = match.index + match[0].length;
  // Find next ### heading or end of string
  const nextHeading = content.slice(start).search(/^###\s/m);
  if (nextHeading === -1) {
    return content.slice(start).trim();
  }
  return content.slice(start, start + nextHeading).trim();
}

/**
 * Normalize task status from emoji/Chinese text to DB status string.
 * Template uses: ✅ 完成 / 🔧 需修正
 */
function normalizeStatus(raw: string): string {
  const s = raw.trim();
  if (s.includes('完成') || s.includes('✅')) return 'done';
  if (s.includes('審查') || s.includes('修正') || s.includes('🔍') || s.includes('🔧')) return 'in_review';
  if (s.includes('進行') || s.includes('🔄')) return 'in_progress';
  // If it already looks like a DB status, return as-is
  if (['done', 'in_progress', 'in_review', 'created', 'assigned', 'blocked', 'rejected'].includes(s)) return s;
  return s || 'created';
}

/**
 * Normalize a cell value: empty string / '-' / '—' → null.
 */
function cellOrNull(value: string | undefined): string | null {
  if (value === undefined || value === '' || value === '-' || value === '—') return null;
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the "確認的流程" (confirmed flow) from a dev-plan to extract gate types.
 * The flow is typically in Section 1 inside a code block:
 * ```
 * 需求 → 設計 → UI 圖稿 → G1（圖稿審核）→ 實作 → G2（程式碼審查）→ 測試 → G3（測試驗收）
 * ```
 * Always includes G0 (implicit — dev-plan approval).
 * Returns sorted unique gate types, e.g. ['G0', 'G1', 'G2', 'G3'].
 */
export function parseConfirmedFlow(content: string): string[] {
  const gates: Set<string> = new Set(['G0']); // G0 is always present

  // Strategy 1: Look for "### 確認的流程" subsection with code block
  const flowSectionMatch = /###\s*確認的流程[\s\S]*?```\s*\n([\s\S]*?)```/m.exec(content);
  if (flowSectionMatch) {
    const flowText = flowSectionMatch[1];
    const gateMatches = flowText.matchAll(/G(\d+)/g);
    for (const m of gateMatches) {
      gates.add(`G${m[1]}`);
    }
  }

  // Strategy 2: Look for "確認的流程" inline (without code block)
  if (gates.size <= 1) {
    const inlineMatch = /確認的流程[：:]\s*(.+)/m.exec(content);
    if (inlineMatch) {
      const gateMatches = inlineMatch[1].matchAll(/G(\d+)/g);
      for (const m of gateMatches) {
        gates.add(`G${m[1]}`);
      }
    }
  }

  // Strategy 3: Fallback — scan proposal section 3 for checked gates
  if (gates.size <= 1) {
    const proposalGates = content.matchAll(/\[x\]\s*.*?\|\s*(G\d+)/gi);
    for (const m of proposalGates) {
      gates.add(m[1].toUpperCase());
    }
  }

  // Sort by gate number
  return Array.from(gates).sort((a, b) => {
    const numA = parseInt(a.slice(1), 10);
    const numB = parseInt(b.slice(1), 10);
    return numA - numB;
  });
}

/**
 * Parse a .tasks/*.md file.
 *
 * Task file format (created by task-delegation skill):
 * ```
 * # 任務標題
 *
 * | 欄位 | 值 |
 * |------|-----|
 * | ID | T1 |
 * | 專案 | AgentHub |
 * | Sprint | sprint1 |
 * | 指派給 | backend-architect |
 * | 優先級 | P0 |
 * | 狀態 | created |
 * | 建立時間 | 2026-03-24T20:00:00.000Z |
 *
 * ---
 *
 * ## 任務描述
 * ...
 * ```
 *
 * Returns null if content is missing required fields (ID, 狀態).
 */
export function parseTaskFile(content: string): ParsedTask | null {
  try {
    const meta = parseMetadataTable(content);

    const id = meta['ID'];
    const status = meta['狀態'];

    if (!id || !status) return null;

    // Extract title from first # heading
    const titleMatch = /^#\s+(.+)$/m.exec(content);
    const title = titleMatch ? titleMatch[1].trim() : id;

    // Extract estimated hours if present — support both 「預估工時」 and 「預估」
    const estimatedRaw = meta['預估工時'] || meta['預估'];
    const estimatedHours = estimatedRaw ? parseFloat(estimatedRaw) : null;

    // Priority normalization: P0/P1/P2 → keep as-is, default to 'medium'
    const rawPriority = meta['優先級'] || '';
    const priority = rawPriority || 'medium';

    return {
      id,
      title,
      status: normalizeStatus(status),
      assignedTo: cellOrNull(meta['指派給']),
      priority,
      sprintId: cellOrNull(meta['Sprint']),
      projectId: cellOrNull(meta['專案']),
      tags: cellOrNull(meta['標籤']),
      estimatedHours: estimatedHours !== null && !isNaN(estimatedHours) ? estimatedHours : null,
      createdAt: cellOrNull(meta['建立時間']),
      description: extractTaskBody(content),
      dependsOn: cellOrNull(meta['依賴']),
    };
  } catch {
    return null;
  }
}

/**
 * Parse Section 10 of a sprint*-dev-plan.md file.
 * Returns empty arrays on any parsing failure (never throws).
 */
export function parseDevPlanSection10(content: string): ParsedDevPlanSection10 {
  const empty: ParsedDevPlanSection10 = {
    taskRecords: [],
    reviewRecords: [],
    gateRecords: [],
  };

  try {
    // Locate Section 10 — try both Chinese and numeric headings
    const section10Match = /^##\s+10[.\s].*$/m.exec(content);
    if (!section10Match) return empty;

    const section10Start = section10Match.index + section10Match[0].length;
    // Find next ## heading (not ###) or end of file
    const nextSection = content.slice(section10Start).search(/^##\s+(?!#)/m);
    const section10Content =
      nextSection === -1
        ? content.slice(section10Start)
        : content.slice(section10Start, section10Start + nextSection);

    // --- Task completion records ---
    // Template: ### 任務完成紀錄  |  Also accept: ### 10.1
    const taskSection = extractSubsection(
      section10Content,
      /^###\s+(?:10\.1\s|任務完成)/m,
    );
    const taskRows = parseMarkdownTable(taskSection);
    // Template columns: 任務 | 完成日期 | 結果 | 備註
    const taskRecords = taskRows
      .filter((row) => row.length >= 3 && row[0])
      .map((row) => ({
        taskId: row[0] ?? '',
        title: '',
        status: normalizeStatus(row[2] ?? ''),
        completedAt: cellOrNull(row[1]),
        notes: cellOrNull(row[3]),
      }));

    // --- Review records ---
    // Template: ### Review 紀錄  |  Also accept: ### 10.2
    const reviewSection = extractSubsection(
      section10Content,
      /^###\s+(?:10\.2\s|Review\s*紀錄)/m,
    );
    const reviewRows = parseMarkdownTable(reviewSection);
    // Template columns: Review 步驟 | 日期 | 結果 | Review 文件連結
    const reviewRecords = reviewRows
      .filter((row) => row.length >= 3 && row[0])
      .map((row) => ({
        step: row[0] ?? '',
        reviewType: '',
        result: row[2] ?? '',
        reviewer: null,
        date: cellOrNull(row[1]),
        notes: cellOrNull(row[3]),
      }));

    // --- Gate records ---
    // Template: ### Gate 紀錄  |  Also accept: ### 10.3
    const gateSection = extractSubsection(
      section10Content,
      /^###\s+(?:10\.3\s|Gate\s*紀錄)/m,
    );
    const gateRows = parseMarkdownTable(gateSection);
    // Template columns: Gate | 日期 | 決策 | 審核意見
    const gateRecords = gateRows
      .filter((row) => row.length >= 2 && row[0])
      .map((row) => ({
        gateType: row[0] ?? '',
        decision: row[2] ?? row[1] ?? '',
        submittedBy: null,
        reviewer: null,
        date: cellOrNull(row[1]),
        comment: cellOrNull(row[3]),
      }));

    return { taskRecords, reviewRecords, gateRecords };
  } catch {
    return empty;
  }
}
