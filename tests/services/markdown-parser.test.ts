import { parseTaskFile, parseDevPlanSection10, parseConfirmedFlow } from '../../electron/services/markdown-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTaskFile = (overrides: Partial<{
  id: string; status: string; title: string; assignedTo: string;
  priority: string; sprint: string; project: string; tags: string;
  estimated: string; createdAt: string; dependsOn: string; body: string;
}> = {}): string => {
  const {
    id = 'T1',
    status = 'created',
    title = 'Test Task',
    assignedTo = 'frontend-engineer',
    priority = 'P1',
    sprint = 'sprint-1',
    project = 'AgentHub',
    tags = '',
    estimated = '4',
    createdAt = '2026-03-01T00:00:00Z',
    dependsOn = '',
    body = '## 任務描述\nSome description',
  } = overrides;

  return `# ${title}

| 欄位 | 值 |
|------|-----|
| ID | ${id} |
| 狀態 | ${status} |
| 指派給 | ${assignedTo} |
| 優先級 | ${priority} |
| Sprint | ${sprint} |
| 專案 | ${project} |
| 標籤 | ${tags} |
| 預估工時 | ${estimated} |
| 建立時間 | ${createdAt} |
| 依賴 | ${dependsOn} |

---

${body}`;
};

// ---------------------------------------------------------------------------
// parseTaskFile
// ---------------------------------------------------------------------------

describe('parseTaskFile', () => {
  describe('happy path', () => {
    it('parses a complete valid task file and returns all fields', () => {
      const content = makeTaskFile();
      const result = parseTaskFile(content);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('T1');
      expect(result!.status).toBe('created');
      expect(result!.title).toBe('Test Task');
      expect(result!.assignedTo).toBe('frontend-engineer');
      expect(result!.priority).toBe('P1');
      expect(result!.sprintId).toBe('sprint-1');
      expect(result!.projectId).toBe('AgentHub');
      expect(result!.estimatedHours).toBe(4);
      expect(result!.createdAt).toBe('2026-03-01T00:00:00Z');
    });

    it('extracts the title from the first # heading', () => {
      const content = makeTaskFile({ title: 'My Custom Task' });
      const result = parseTaskFile(content);

      expect(result!.title).toBe('My Custom Task');
    });

    it('extracts the description body after the metadata table', () => {
      const content = makeTaskFile({ body: '## 任務描述\nHello world' });
      const result = parseTaskFile(content);

      expect(result!.description).toContain('Hello world');
    });

    it('parses estimated hours using 預估工時 field', () => {
      const content = makeTaskFile({ estimated: '8.5' });
      const result = parseTaskFile(content);

      expect(result!.estimatedHours).toBe(8.5);
    });

    it('parses dependsOn field when present', () => {
      const content = makeTaskFile({ dependsOn: 'T2,T3' });
      const result = parseTaskFile(content);

      expect(result!.dependsOn).toBe('T2,T3');
    });
  });

  describe('status normalization', () => {
    it('maps ✅ 完成 to done', () => {
      const content = makeTaskFile({ status: '✅ 完成' });
      expect(parseTaskFile(content)!.status).toBe('done');
    });

    it('maps 審查中 to in_review', () => {
      const content = makeTaskFile({ status: '審查中' });
      expect(parseTaskFile(content)!.status).toBe('in_review');
    });

    it('maps 進行中 to in_progress', () => {
      const content = makeTaskFile({ status: '進行中' });
      expect(parseTaskFile(content)!.status).toBe('in_progress');
    });

    it('passes through DB status strings unchanged', () => {
      for (const s of ['done', 'in_progress', 'assigned', 'blocked', 'rejected']) {
        const content = makeTaskFile({ status: s });
        expect(parseTaskFile(content)!.status).toBe(s);
      }
    });
  });

  describe('null handling', () => {
    it('returns null when ID field is missing', () => {
      const content = `# Task\n| 欄位 | 值 |\n|------|-----|\n| 狀態 | created |\n`;
      expect(parseTaskFile(content)).toBeNull();
    });

    it('returns null when 狀態 field is missing', () => {
      const content = `# Task\n| 欄位 | 值 |\n|------|-----|\n| ID | T1 |\n`;
      expect(parseTaskFile(content)).toBeNull();
    });

    it('returns null for completely empty content', () => {
      expect(parseTaskFile('')).toBeNull();
    });

    it('converts empty tag cell to null', () => {
      const content = makeTaskFile({ tags: '' });
      expect(parseTaskFile(content)!.tags).toBeNull();
    });

    it('converts dash placeholder to null', () => {
      const content = makeTaskFile({ dependsOn: '-' });
      expect(parseTaskFile(content)!.dependsOn).toBeNull();
    });

    it('converts em-dash placeholder to null', () => {
      const content = makeTaskFile({ assignedTo: '—' });
      expect(parseTaskFile(content)!.assignedTo).toBeNull();
    });

    it('returns null on malformed content that throws', () => {
      expect(parseTaskFile(null as unknown as string)).toBeNull();
    });
  });

  describe('alternative field names', () => {
    it('accepts 預估 as alternative to 預估工時', () => {
      const content = `# T1\n\n| 欄位 | 值 |\n|------|-----|\n| ID | T1 |\n| 狀態 | created |\n| 預估 | 3 |\n\n---\n## desc`;
      const result = parseTaskFile(content);
      expect(result!.estimatedHours).toBe(3);
    });

    it('sets estimatedHours to null when estimated field is non-numeric', () => {
      const content = makeTaskFile({ estimated: 'TBD' });
      expect(parseTaskFile(content)!.estimatedHours).toBeNull();
    });

    it('falls back to using ID as title when no # heading is found', () => {
      const content = `| 欄位 | 值 |\n|------|-----|\n| ID | T99 |\n| 狀態 | created |\n`;
      const result = parseTaskFile(content);
      expect(result!.title).toBe('T99');
    });
  });

  describe('default values', () => {
    it('uses medium as default priority when not specified', () => {
      const content = `# Task\n\n| 欄位 | 值 |\n|------|-----|\n| ID | T1 |\n| 狀態 | created |\n\n---\n## desc`;
      const result = parseTaskFile(content);
      expect(result!.priority).toBe('medium');
    });
  });
});

// ---------------------------------------------------------------------------
// parseConfirmedFlow
// ---------------------------------------------------------------------------

describe('parseConfirmedFlow', () => {
  it('always includes G0 by default', () => {
    const result = parseConfirmedFlow('some content without gate markers');
    expect(result).toContain('G0');
  });

  it('extracts gates from a code block in 確認的流程 section', () => {
    const content = `## 1. Sprint 概覽

### 確認的流程

\`\`\`
需求 → 設計 → G1（圖稿審核）→ 實作 → G2（程式碼審查）→ G3（測試驗收）
\`\`\`
`;
    const result = parseConfirmedFlow(content);
    expect(result).toEqual(['G0', 'G1', 'G2', 'G3']);
  });

  it('extracts gates from inline 確認的流程 format', () => {
    const content = `確認的流程：需求 → G1 → 實作 → G2`;
    const result = parseConfirmedFlow(content);
    expect(result).toContain('G1');
    expect(result).toContain('G2');
  });

  it('returns gates sorted by number', () => {
    const content = `確認的流程：G3 → G1 → G2`;
    const result = parseConfirmedFlow(content);
    expect(result).toEqual(['G0', 'G1', 'G2', 'G3']);
  });

  it('deduplicates repeated gate references', () => {
    const content = `確認的流程：G1 → G1 → G2`;
    const result = parseConfirmedFlow(content);
    expect(result.filter((g) => g === 'G1').length).toBe(1);
  });

  it('returns only G0 when no other gates found', () => {
    const result = parseConfirmedFlow('no gates here');
    expect(result).toEqual(['G0']);
  });

  it('extracts gates from checkbox format using strategy 3', () => {
    const content = `[x] 已完成 | G1\n[x] 已完成 | G2`;
    const result = parseConfirmedFlow(content);
    expect(result).toContain('G1');
    expect(result).toContain('G2');
  });
});

// ---------------------------------------------------------------------------
// parseDevPlanSection10
// ---------------------------------------------------------------------------

describe('parseDevPlanSection10', () => {
  const makeDevPlan = (section10: string): string => `# 開發計畫書: 測試 — Sprint 1

## 1. 需求摘要

Some content.

## 10. 執行紀錄

${section10}

## 11. 附錄
`;

  it('returns empty arrays when section 10 is absent', () => {
    const result = parseDevPlanSection10('# 開發計畫書\n## 1. 概覽\nContent');
    expect(result.taskRecords).toEqual([]);
    expect(result.reviewRecords).toEqual([]);
    expect(result.gateRecords).toEqual([]);
  });

  it('returns empty arrays for completely empty input', () => {
    const result = parseDevPlanSection10('');
    expect(result.taskRecords).toEqual([]);
    expect(result.reviewRecords).toEqual([]);
    expect(result.gateRecords).toEqual([]);
  });

  it('never throws on malformed content', () => {
    expect(() => parseDevPlanSection10(null as unknown as string)).not.toThrow();
    expect(() => parseDevPlanSection10('garbage [[[[ content')).not.toThrow();
  });

  describe('task records (10.1)', () => {
    it('parses task completion table with numeric heading 10.1', () => {
      const section10 = `### 10.1 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|----------|------|------|
| T1 | 2026-03-01 | ✅ 完成 | - |
`;
      const result = parseDevPlanSection10(makeDevPlan(section10));
      expect(result.taskRecords).toHaveLength(1);
      expect(result.taskRecords[0].taskId).toBe('T1');
      expect(result.taskRecords[0].status).toBe('done');
      expect(result.taskRecords[0].completedAt).toBe('2026-03-01');
      expect(result.taskRecords[0].notes).toBeNull();
    });

    it('parses multiple task rows', () => {
      const section10 = `### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|----------|------|------|
| T1 | 2026-03-01 | ✅ 完成 | good |
| T2 | 2026-03-02 | 🔧 需修正 | needs work |
`;
      const result = parseDevPlanSection10(makeDevPlan(section10));
      expect(result.taskRecords).toHaveLength(2);
      expect(result.taskRecords[1].taskId).toBe('T2');
      expect(result.taskRecords[1].status).toBe('in_review');
    });
  });

  describe('review records (10.2)', () => {
    it('parses review records table with numeric heading 10.2', () => {
      const section10 = `### 10.2 Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|-------------|------|------|-----------------|
| Code Review | 2026-03-05 | Passed | - |
`;
      const result = parseDevPlanSection10(makeDevPlan(section10));
      expect(result.reviewRecords).toHaveLength(1);
      expect(result.reviewRecords[0].step).toBe('Code Review');
      expect(result.reviewRecords[0].result).toBe('Passed');
      expect(result.reviewRecords[0].date).toBe('2026-03-05');
    });
  });

  describe('gate records (10.3)', () => {
    it('parses gate records table with numeric heading 10.3', () => {
      const section10 = `### 10.3 Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G1 | 2026-03-10 | 通過 | LGTM |
`;
      const result = parseDevPlanSection10(makeDevPlan(section10));
      expect(result.gateRecords).toHaveLength(1);
      expect(result.gateRecords[0].gateType).toBe('G1');
      expect(result.gateRecords[0].decision).toBe('通過');
      expect(result.gateRecords[0].date).toBe('2026-03-10');
      expect(result.gateRecords[0].comment).toBe('LGTM');
    });

    it('extracts gate type using Gn pattern from gate cell', () => {
      const section10 = `### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G2（程式碼審查） | 2026-03-12 | approved | ok |
`;
      const result = parseDevPlanSection10(makeDevPlan(section10));
      expect(result.gateRecords[0].gateType).toBe('G2');
    });

    it('parses multiple gates', () => {
      const section10 = `### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | 2026-03-01 | 通過 | - |
| G1 | 2026-03-05 | 拒絕 | needs redo |
`;
      const result = parseDevPlanSection10(makeDevPlan(section10));
      expect(result.gateRecords).toHaveLength(2);
      expect(result.gateRecords[1].gateType).toBe('G1');
    });
  });
});
