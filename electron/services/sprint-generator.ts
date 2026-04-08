/**
 * SprintGenerator — One-shot Sprint generation from a brief description.
 * Inspired by Taskade's AI project generation.
 *
 * Takes a brief description from the boss, then spawns a headless PM session
 * that generates the complete Sprint artifacts:
 * 1. Sprint proposal (sprint-proposal.md)
 * 2. Development plan (dev-plan.md)
 * 3. Task breakdown with assignments
 *
 * Uses the existing PM agent and Skill system to ensure consistency.
 */

import { sessionManager } from './session-manager';
import { logger } from '../utils/logger';

export interface SprintGenerationParams {
  projectId: string;
  brief: string;              // One-line description from the boss
  sprintName?: string;        // Optional sprint name
  priority?: 'normal' | 'urgent';
}

export interface SprintGenerationResult {
  sessionId: string;
  status: 'spawned';
}

class SprintGenerator {
  /**
   * Generate a complete Sprint from a brief description.
   * Spawns a headless PM session that runs the full Sprint planning workflow.
   */
  generate(params: SprintGenerationParams): SprintGenerationResult {
    const sprintName = params.sprintName || `Sprint-${new Date().toISOString().slice(0, 10)}`;

    const task = [
      `## 一鍵 Sprint 生成`,
      '',
      `老闆要求你為以下需求規劃一個完整的 Sprint：`,
      '',
      `**需求簡述**: ${params.brief}`,
      `**Sprint 名稱**: ${sprintName}`,
      `**優先級**: ${params.priority || 'normal'}`,
      '',
      `### 請依序完成以下工作：`,
      '',
      `1. 執行 \`/sprint-proposal\` 建立提案書`,
      `   - 將需求簡述展開為完整的目標、範圍、和成功指標`,
      `   - 列出預估的任務清單和預計工時`,
      '',
      `2. 執行 \`/dev-plan\` 建立開發計畫書`,
      `   - 拆解為具體的技術任務`,
      `   - 標註每個任務的負責 Agent（根據專業對應）`,
      `   - 設定任務依賴關係`,
      '',
      `3. 執行 \`/task-delegation\` 建立任務檔案`,
      `   - 為每個任務建立 .tasks/ 檔案`,
      `   - 分派給對應的 Agent`,
      '',
      `完成後用 \`/gate-record\` 記錄 G0 通過。`,
    ].join('\n');

    const result = sessionManager.spawnHeadless({
      agentId: 'product-manager',
      task,
      projectId: params.projectId,
      model: 'sonnet',
      maxTurns: 30,
      scheduledBy: 'sprint-generator',
    });

    logger.info(`SprintGenerator: spawned PM session ${result.sessionId} for "${params.brief}"`);

    return {
      sessionId: result.sessionId,
      status: 'spawned',
    };
  }
}

export const sprintGenerator = new SprintGenerator();
