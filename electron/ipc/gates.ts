import { ipcMain } from 'electron';
import { IpcChannels } from '../types';
import { gateKeeper } from '../services/gate-keeper';
import { sprintManager } from '../services/sprint-manager';
import { auditLogger } from '../services/audit-logger';
import { eventBus } from '../services/event-bus';
import { logger } from '../utils/logger';

export function registerGateHandlers(): void {
  ipcMain.handle(IpcChannels.GATE_CREATE, (_e, params) => {
    const gate = gateKeeper.create(params);
    auditLogger.log('gate.create', 'user', gate.id, { gateType: params.gateType }, params.projectId);
    return gate;
  });

  ipcMain.handle(IpcChannels.GATE_LIST, (_e, filters) => {
    return gateKeeper.list(filters);
  });

  ipcMain.handle(IpcChannels.GATE_GET, (_e, id) => {
    return gateKeeper.get(id);
  });

  ipcMain.handle(IpcChannels.GATE_SUBMIT, (_e, params) => {
    const gate = gateKeeper.submit(params);
    auditLogger.log('gate.submit', params.submittedBy, gate.id, { gateType: gate.gateType }, gate.projectId);
    return gate;
  });

  ipcMain.handle(IpcChannels.GATE_REVIEW, (_e, params) => {
    const gate = gateKeeper.review(params);
    auditLogger.log('gate.review', params.reviewer, gate.id, {
      gateType: gate.gateType,
      decision: params.decision,
    }, gate.projectId);

    // Gate approved → auto-advance sprint status
    if (params.decision === 'approved' && gate.sprintId) {
      sprintManager.syncStatusFromGate(gate.sprintId, gate.gateType);
    }

    // 產生審核備查文件
    gateKeeper.generateReviewRecord(gate);

    return gate;
  });

  ipcMain.handle(IpcChannels.GATE_GET_CHECKLISTS, () => {
    return gateKeeper.getChecklists();
  });

  // NOTE: initializePipeline is a legacy endpoint — gates are now dynamically
  // created by project-sync from the dev-plan's "確認的流程".
  // This endpoint remains for manual fallback / backward compatibility.
  ipcMain.handle(
    IpcChannels.GATE_INIT_PIPELINE,
    (_e, params: { projectId: string; sprintId: string }) => {
      const sprint = sprintManager.getById(params.sprintId);
      const sprintType = sprint?.sprintType || 'full';
      const gates = gateKeeper.initializePipeline(params.projectId, params.sprintId, sprintType);
      auditLogger.log('gate.init-pipeline', 'user', params.sprintId, {
        projectId: params.projectId,
        sprintType,
        gatesCreated: gates.length,
      }, params.projectId);
      return gates;
    },
  );

  // 9C: Sprint 所有任務完成 → 自動送審下一關
  eventBus.on('sprint:all-tasks-done', ({ sprintId }: { sprintId: string }) => {
    const gate = gateKeeper.autoSubmitNextGate(sprintId);
    if (!gate) return;

    logger.info(`Auto-submitted gate ${gate.gateType} for sprint ${sprintId} → ${gate.status}`);

    // 若 auto-approve 已通過，觸發 Sprint 狀態同步 + 審核備查
    if (gate.status === 'approved' && gate.sprintId) {
      sprintManager.syncStatusFromGate(gate.sprintId, gate.gateType);
      gateKeeper.generateReviewRecord(gate);
    }
  });
}
