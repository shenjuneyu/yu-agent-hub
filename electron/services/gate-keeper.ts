import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { database } from './database';
import { eventBus } from './event-bus';
import { auditLogger } from './audit-logger';
import { logger } from '../utils/logger';
import type {
  GateCreateParams,
  SubmitGateParams,
  ReviewGateParams,
  GateFilters,
  GateChecklist,
  GateChecklistItem,
  GateWithDetails,
  GateType,
  SprintType,
} from '../types';

const GATE_CHECKLISTS: Record<GateType, GateChecklistItem[]> = {
  G0: [
    { label: '需求文件已建立', criteria: '包含功能範圍、用戶角色、核心 User Story，並已寫入 docs/' },
    { label: '用戶故事已定義', criteria: '每個故事有角色、目標、驗收條件（Given/When/Then）' },
    { label: '驗收標準已明確', criteria: '量化指標或可驗證的完成條件，非模糊描述' },
    { label: '技術可行性已確認', criteria: '關鍵技術選型已 PoC 驗證，風險項已列出' },
  ],
  G1: [
    { label: 'UI/UX 圖稿已完成', criteria: '所有頁面的 Wireframe/Mockup 已產出，互動流程已標註' },
    { label: '架構設計已審核', criteria: '系統架構圖已繪製，模組職責與依賴關係已明確' },
    { label: 'API 規格已定義', criteria: '所有端點的 Request/Response Schema 已文件化（OpenAPI 或等效）' },
    { label: '資料模型已確認', criteria: 'DB Schema 已定義，包含欄位型別、索引、關聯與 Migration 計畫' },
  ],
  G2: [
    { label: '[CRITICAL] SQL 注入防護', criteria: '所有 DB 查詢使用參數化，無字串拼接' },
    { label: '[CRITICAL] Race Condition', criteria: '共用資源存取有適當鎖定或序列化機制' },
    { label: '[CRITICAL] LLM 信任邊界', criteria: 'AI 輸出不直接用於 SQL/shell/eval，有 sanitize' },
    { label: '[CRITICAL] 認證授權', criteria: '所有端點有適當的認證和權限檢查' },
    { label: '[INFO] 功能實作已完成', criteria: '所有 Sprint 任務狀態為 done' },
    { label: '[INFO] Magic Number', criteria: '數值常數已提取為命名常數或設定' },
    { label: '[INFO] Dead Code', criteria: '無未使用的函數、變數、import' },
    { label: '[INFO] 文件已同步', criteria: 'README、API 文件、架構圖已同步更新' },
  ],
  G3: [
    { label: '[T1] TypeScript 編譯通過', criteria: 'tsc --noEmit 無錯誤' },
    { label: '[T1] Lint 通過', criteria: 'ESLint + Prettier 無錯誤或警告' },
    { label: '[T2] 單元測試通過', criteria: '所有單元測試 Pass，核心模組覆蓋率 ≥ 80%' },
    { label: '[T2] E2E 測試通過', criteria: 'Playwright E2E 測試全部 Pass' },
    { label: '[T3] 效能檢查', criteria: '關鍵操作回應時間 < 目標值，無明顯效能退化' },
    { label: '[T3] 跨瀏覽器/平台', criteria: '目標平台手動驗證無重大差異' },
    { label: '[T3] 無重大 Bug', criteria: '無 Critical/High 等級的未解決 Bug' },
  ],
  G4: [
    { label: '文件更新已完成', criteria: 'CLAUDE.md、README、API 文件、架構圖已同步更新至最新狀態' },
    { label: '開發紀錄已補齊', criteria: '開發紀錄包含變更背景、修改範圍、設計決策' },
    { label: '規格書已同步', criteria: 'IPC 介面規格書、產品規格書、資料庫設計已反映最新變更' },
    { label: '測試文件已更新', criteria: '功能測試清單、E2E 測試個案說明已涵蓋新功能' },
  ],
  G5: [
    { label: 'CI/CD 管線通過', criteria: 'Build → Test → Deploy 管線完整執行成功，無紅燈' },
    { label: '環境配置已就緒', criteria: '目標環境（Staging/Production）的環境變數、密鑰、DNS 已設定' },
    { label: '回滾計畫已準備', criteria: '回滾步驟已文件化，包含 DB Migration 回退方案' },
    { label: '監控已設定', criteria: '錯誤追蹤、效能監控、告警通知已配置並驗證' },
  ],
  G6: [
    { label: '安全審核通過', criteria: '無 OWASP Top 10 漏洞，依賴項無已知高風險 CVE' },
    { label: '上線前最終確認', criteria: '產品負責人在 Staging 環境完成 UAT 驗收' },
    { label: '用戶文件已完成', criteria: '使用說明、FAQ、Changelog 已撰寫並發布' },
    { label: '正式核准發佈', criteria: '所有利害關係人已簽核，發佈時間與通知計畫已確認' },
  ],
};

const GATE_LABELS: Record<GateType, string> = {
  G0: '需求確認',
  G1: '圖稿審核',
  G2: '程式碼審查',
  G3: '測試驗收',
  G4: '文件審查',
  G5: '部署就緒',
  G6: '正式發佈',
};

/** Sprint 類型對應的關卡清單（預設組合，SOP v4.0 下由 G0 動態決定） */
const SPRINT_TYPE_GATES: Record<SprintType, GateType[]> = {
  full: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'],
  feature: ['G0', 'G2', 'G3', 'G4'],
  bugfix: ['G0', 'G2', 'G3'],
  release: ['G0', 'G5', 'G6'],
};

function rowToGate(row: any): GateWithDetails {
  let decision: string | null = row.decision || null;
  let itemReasons: Record<string, string> | null = null;

  if (decision) {
    try {
      const parsed = JSON.parse(decision);
      if (parsed && typeof parsed === 'object' && 'result' in parsed) {
        decision = parsed.comment
          ? `${parsed.result}: ${parsed.comment}`
          : parsed.result;
        itemReasons = parsed.itemReasons || null;
      }
    } catch {
      // 舊格式純字串 fallback，不做處理
    }
  }

  return {
    id: row.id,
    projectId: row.project_id,
    sprintId: row.sprint_id || null,
    gateType: row.gate_type,
    status: row.status,
    submittedBy: row.submitted_by || null,
    reviewer: row.reviewer || null,
    checklist: row.checklist ? JSON.parse(row.checklist) : null,
    decision,
    itemReasons,
    createdAt: row.created_at,
    projectName: row.project_name || undefined,
    sprintName: row.sprint_name || undefined,
  };
}

interface AutoApproveRule {
  id: string;
  name: string;
  enabled: boolean;
  gateTypes: GateType[];
  agentIds?: string[];
  projectIds?: string[];
}

class GateKeeper {
  /**
   * Try to auto-approve a gate based on user-defined rules.
   * G4/G5 are always excluded for safety.
   */
  tryAutoApprove(gateId: string): boolean {
    const rows = database.prepare('SELECT * FROM gates WHERE id = ?', [gateId]);
    if (rows.length === 0) return false;
    const gate = rows[0];

    // G5 (部署就緒) and G6 (正式發佈) always require manual review
    if (['G5', 'G6'].includes(gate.gate_type)) return false;

    try {
      const rulesJson = database.prepare(
        "SELECT value FROM user_preferences WHERE key = 'gate.auto-approve-rules'",
      );
      if (!rulesJson.length) return false;

      const rules: AutoApproveRule[] = JSON.parse(rulesJson[0].value);
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (!rule.gateTypes.includes(gate.gate_type)) continue;
        if (rule.projectIds?.length && !rule.projectIds.includes(gate.project_id)) continue;

        // Match found — auto approve
        this.review({
          gateId,
          decision: 'approved',
          reviewer: 'system',
          comment: `(Auto-approved: ${rule.name})`,
        });
        auditLogger.log(
          'gate.auto_approved',
          'system',
          gateId,
          { ruleName: rule.name, gateType: gate.gate_type, ruleId: rule.id },
          gate.project_id,
        );
        logger.info(`Gate auto-approved: ${gateId} by rule "${rule.name}"`);
        return true;
      }
    } catch (err) {
      logger.warn('Failed to check auto-approve rules', err);
    }
    return false;
  }

  create(params: GateCreateParams): GateWithDetails {
    const id = randomUUID();
    const now = new Date().toISOString();

    database.run(
      `INSERT INTO gates (id, project_id, sprint_id, gate_type, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, params.projectId, params.sprintId || null, params.gateType, now],
    );

    logger.info(`Gate created: ${params.gateType} for project ${params.projectId}`);

    return {
      id,
      projectId: params.projectId,
      sprintId: params.sprintId || null,
      gateType: params.gateType,
      status: 'pending',
      submittedBy: null,
      reviewer: null,
      checklist: null,
      decision: null,
      createdAt: now,
    };
  }

  initializePipeline(
    projectId: string,
    sprintId: string,
    sprintType: SprintType = 'full',
  ): GateWithDetails[] {
    const gateOrder = SPRINT_TYPE_GATES[sprintType] || SPRINT_TYPE_GATES.full;
    const existing = this.list({ projectId, sprintId });
    const existingTypes = new Set(existing.map((g) => g.gateType));
    const created: GateWithDetails[] = [];

    for (const gateType of gateOrder) {
      if (!existingTypes.has(gateType)) {
        created.push(this.create({ projectId, sprintId, gateType }));
      }
    }

    logger.info(
      `Gate pipeline initialized for project ${projectId}, sprint ${sprintId} (${sprintType}): ${created.length} gates [${gateOrder.join(',')}]`,
    );
    return created;
  }

  submit(params: SubmitGateParams): GateWithDetails {
    const rows = database.prepare('SELECT * FROM gates WHERE id = ?', [params.gateId]);
    if (rows.length === 0) throw new Error(`Gate not found: ${params.gateId}`);

    const gate = rows[0];
    if (gate.status !== 'pending' && gate.status !== 'rejected') {
      throw new Error(`Gate ${params.gateId} cannot be submitted from status: ${gate.status}`);
    }

    // 順序檢查：sprint_id 為 null 的舊 gate 不受限制
    if (gate.sprint_id) {
      // 查詢此 sprint 所有 gate 以判斷前一個「實際存在」的關卡
      const sprintGates = database.prepare(
        `SELECT gate_type, status FROM gates WHERE project_id = ? AND sprint_id = ? ORDER BY gate_type`,
        [gate.project_id, gate.sprint_id],
      );
      const existingTypes = sprintGates.map((r: any) => r.gate_type as GateType);
      const currentIdx = existingTypes.indexOf(gate.gate_type);
      if (currentIdx > 0) {
        const prevType = existingTypes[currentIdx - 1];
        const prevGate = sprintGates.find((r: any) => r.gate_type === prevType);
        if (!prevGate || prevGate.status !== 'approved') {
          throw new Error(
            `Cannot submit ${gate.gate_type}: previous gate ${prevType} has not been approved`,
          );
        }
      }
    }

    database.run(
      `UPDATE gates SET status = 'submitted', submitted_by = ?, checklist = ? WHERE id = ?`,
      [params.submittedBy, JSON.stringify(params.checklist), params.gateId],
    );

    logger.info(`Gate submitted: ${params.gateId} by ${params.submittedBy}`);
    const result = this.get(params.gateId)!;
    // Auto-approve check runs after get() to avoid interfering with return value
    try { this.tryAutoApprove(params.gateId); } catch { /* ignore */ }
    return result;
  }

  review(params: ReviewGateParams): GateWithDetails {
    const rows = database.prepare('SELECT * FROM gates WHERE id = ?', [params.gateId]);
    if (rows.length === 0) throw new Error(`Gate not found: ${params.gateId}`);

    const gate = rows[0];
    if (gate.status !== 'submitted') {
      throw new Error(`Gate ${params.gateId} cannot be reviewed from status: ${gate.status}`);
    }

    // 結構化 JSON decision（向下相容：rowToGate 可解析新舊格式）
    const decisionObj: { result: string; comment?: string; itemReasons?: Record<string, string> } = {
      result: params.decision,
    };
    if (params.comment) decisionObj.comment = params.comment;
    if (params.itemReasons && Object.keys(params.itemReasons).length > 0) {
      decisionObj.itemReasons = params.itemReasons;
    }
    const decision = JSON.stringify(decisionObj);

    const newStatus = params.decision === 'approved' ? 'approved' : 'rejected';

    const checklistJson = params.checklist ? JSON.stringify(params.checklist) : null;

    database.run(
      `UPDATE gates SET status = ?, reviewer = ?, decision = ?${checklistJson ? ', checklist = ?' : ''} WHERE id = ?`,
      checklistJson
        ? [newStatus, params.reviewer, decision, checklistJson, params.gateId]
        : [newStatus, params.reviewer, decision, params.gateId],
    );

    logger.info(`Gate reviewed: ${params.gateId} → ${newStatus} by ${params.reviewer}`);

    // Notify session-manager of gate review completion
    eventBus.emit('gate:reviewed', {
      gateId: params.gateId,
      decision: params.decision,
      sprintId: gate.sprint_id,
    });

    return this.get(params.gateId)!;
  }

  get(id: string): GateWithDetails | null {
    const rows = database.prepare(
      `SELECT g.*, p.name as project_name, s.name as sprint_name
       FROM gates g
       LEFT JOIN projects p ON g.project_id = p.id
       LEFT JOIN sprints s ON g.sprint_id = s.id
       WHERE g.id = ?`,
      [id],
    );
    return rows.length > 0 ? rowToGate(rows[0]) : null;
  }

  list(filters?: GateFilters): GateWithDetails[] {
    let sql = `SELECT g.*, p.name as project_name, s.name as sprint_name
               FROM gates g
               LEFT JOIN projects p ON g.project_id = p.id
               LEFT JOIN sprints s ON g.sprint_id = s.id
               WHERE 1=1`;
    const params: unknown[] = [];

    if (filters?.projectId) {
      sql += ' AND g.project_id = ?';
      params.push(filters.projectId);
    }
    if (filters?.sprintId !== undefined) {
      if (filters.sprintId === null) {
        sql += ' AND g.sprint_id IS NULL';
      } else {
        sql += ' AND g.sprint_id = ?';
        params.push(filters.sprintId);
      }
    }
    if (filters?.gateType) {
      sql += ' AND g.gate_type = ?';
      params.push(filters.gateType);
    }
    if (filters?.status) {
      sql += ' AND g.status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY g.created_at DESC';
    return database.prepare(sql, params).map(rowToGate);
  }

  getChecklists(): GateChecklist[] {
    const types: GateType[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
    return types.map((t) => ({
      gateType: t,
      label: GATE_LABELS[t],
      items: GATE_CHECKLISTS[t],
    }));
  }

  /** Get flat label list for a gate type (used in review records). */
  private getChecklistLabels(gateType: GateType): string[] {
    return GATE_CHECKLISTS[gateType].map((item) => item.label);
  }

  getPendingCount(projectId?: string): number {
    let sql = `SELECT COUNT(*) as cnt FROM gates WHERE status IN ('pending', 'submitted')`;
    const params: unknown[] = [];
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    const rows = database.prepare(sql, params);
    return rows[0]?.cnt || 0;
  }

  getProjectPipeline(projectId: string): Record<GateType, GateWithDetails | null> {
    const gates = this.list({ projectId });
    const pipeline: Record<GateType, GateWithDetails | null> = {
      G0: null, G1: null, G2: null, G3: null, G4: null, G5: null, G6: null,
    };
    // Take the latest gate for each type
    for (const gate of gates) {
      if (!pipeline[gate.gateType]) {
        pipeline[gate.gateType] = gate;
      }
    }
    return pipeline;
  }

  /**
   * 9C: Sprint 所有任務完成 → 自動送審下一個 pending gate。
   * Checklist 全部勾選，submittedBy 標記為系統自動。
   */
  autoSubmitNextGate(sprintId: string): GateWithDetails | null {
    const gates = this.list({ sprintId });
    const pending = gates
      .filter((g) => g.status === 'pending')
      .sort((a, b) => a.gateType.localeCompare(b.gateType));

    if (pending.length === 0) return null;
    const nextGate = pending[0];

    const checklist: Record<string, boolean> = {};
    const items = GATE_CHECKLISTS[nextGate.gateType];
    if (items) items.forEach((item) => { checklist[item.label] = true; });

    try {
      this.submit({
        gateId: nextGate.id,
        submittedBy: 'system(auto-submit: all tasks completed)',
        checklist,
      });
      // Re-fetch：submit() 內 tryAutoApprove() 可能已改變狀態
      const latest = this.get(nextGate.id);
      logger.info(
        `Auto-submitted ${nextGate.gateType} for sprint ${sprintId} → ${latest?.status}`,
      );
      return latest;
    } catch (err) {
      logger.warn(`Auto-submit ${nextGate.gateType} failed for sprint ${sprintId}`, err);
      return null;
    }
  }

  getGatesForSprintType(sprintType: SprintType): GateType[] {
    return SPRINT_TYPE_GATES[sprintType] || SPRINT_TYPE_GATES.full;
  }

  /**
   * 審核完成後，自動在專案工作目錄產生備查 Markdown 文件。
   * 每個 gate type 維護一份文件，每次審核 append 新的紀錄區塊。
   */
  generateReviewRecord(gate: GateWithDetails): void {
    try {
      // 查 project workDir
      const projRows = database.prepare(
        'SELECT work_dir FROM projects WHERE id = ?',
        [gate.projectId],
      );
      const workDir = projRows[0]?.work_dir as string | null;
      if (!workDir) {
        logger.warn(`Skip review record: project ${gate.projectId} has no workDir`);
        return;
      }

      // Sprint 名稱（無 sprint 用 'no-sprint'）
      const sprintName = gate.sprintName || 'no-sprint';
      const safeName = sprintName.replace(/[<>:"/\\|?*]/g, '_');

      // 建立目錄
      const reviewDir = join(workDir, '.reviews', safeName);
      if (!existsSync(reviewDir)) {
        mkdirSync(reviewDir, { recursive: true });
      }

      // 固定檔名（不含日期和 decision）
      const label = GATE_LABELS[gate.gateType] || gate.gateType;
      const fileName = `${gate.gateType}-${label}.md`;
      const filePath = join(reviewDir, fileName);

      // Checklist 定義（提前宣告，新檔案標題和每次審核區塊都用到）
      const checklistDefs = GATE_CHECKLISTS[gate.gateType] || [];
      const criteriaMap = new Map(checklistDefs.map((d) => [d.label, d.criteria]));

      // 讀取現有內容 / 建立新檔
      let existingContent = '';
      let reviewNumber = 1;
      if (existsSync(filePath)) {
        existingContent = readFileSync(filePath, 'utf-8');
        // 計算審核序號
        const matches = existingContent.match(/## 審核 #(\d+)/g);
        if (matches) {
          reviewNumber = matches.length + 1;
        }
      } else {
        // 新檔案：標題 + 達成標準一覽
        const criteriaLines = checklistDefs
          .map((d, i) => `${i + 1}. **${d.label}**\n   ${d.criteria}`)
          .join('\n');
        existingContent = [
          `# ${gate.gateType} ${label} — 審核紀錄`,
          '',
          '## 達成標準',
          '',
          criteriaLines,
          '',
        ].join('\n');
      }

      const decision = gate.decision?.split(':')[0] || gate.status;
      const now = new Date().toISOString();
      const dateStr = now.slice(0, 10);
      let checklistSection = '';
      if (gate.checklist && typeof gate.checklist === 'object') {
        const items = Object.entries(gate.checklist)
          .map(([item, passed]) => {
            const line = `- [${passed ? 'x' : ' '}] ${item}`;
            const criteria = criteriaMap.get(item);
            let result = criteria ? `${line}\n  > ${criteria}` : line;
            // 不合格項目附加退回原因
            if (!passed && gate.itemReasons?.[item]) {
              result += `\n  > ⚠️ 不合格原因：${gate.itemReasons[item]}`;
            }
            return result;
          })
          .join('\n');
        checklistSection = `\n### Checklist\n\n${items}\n`;
      }

      // 審核意見
      const comment = gate.decision?.includes(':')
        ? gate.decision.split(':').slice(1).join(':').trim()
        : '';
      const commentSection = comment
        ? `\n### ${decision === 'rejected' ? '退回備註' : '審核意見'}\n\n${comment}\n`
        : '';

      // 查該 sprint 相關 sessions 摘要
      let sessionsSection = '';
      if (gate.sprintId) {
        const sessions = database.prepare(
          `SELECT cs.agent_id, cs.result_summary, cs.id, cs.duration_ms
           FROM claude_sessions cs
           JOIN tasks t ON cs.task_id = t.id
           WHERE t.sprint_id = ? AND cs.result_summary IS NOT NULL
           ORDER BY cs.started_at DESC
           LIMIT 10`,
          [gate.sprintId],
        );
        if (sessions.length > 0) {
          const items = sessions.map((s: any) => {
            const summary = (s.result_summary || '').slice(0, 100).replace(/\n/g, ' ');
            const dur = s.duration_ms ? `${Math.round(s.duration_ms / 1000)}s` : '-';
            return `- **${s.agent_id}**: "${summary}" (${s.id.slice(0, 8)}, ${dur})`;
          });
          sessionsSection = `\n### 相關 Session 摘要\n\n${items.join('\n')}\n`;
        }
      }

      // 組合新的審核區塊
      const reviewBlock = [
        '',
        '---',
        `## 審核 #${reviewNumber} — ${dateStr} — ${decision}`,
        '',
        '| 欄位 | 值 |',
        '|------|-----|',
        `| Sprint | ${sprintName} |`,
        `| 專案 | ${gate.projectName || gate.projectId} |`,
        `| 提交者 | ${gate.submittedBy || '-'} |`,
        `| 審核者 | ${gate.reviewer || '-'} |`,
        `| 審核時間 | ${now} |`,
        `| 結果 | ${decision} |`,
        checklistSection,
        commentSection,
        sessionsSection,
      ].filter(Boolean).join('\n');

      // Append 到現有內容
      const finalContent = existingContent.trimEnd() + '\n' + reviewBlock + '\n';

      writeFileSync(filePath, finalContent, 'utf-8');
      logger.info(`Review record appended (#${reviewNumber}): ${filePath}`);
    } catch (err) {
      logger.warn('Failed to generate review record', err);
    }
  }
}

export const gateKeeper = new GateKeeper();
export { SPRINT_TYPE_GATES };
