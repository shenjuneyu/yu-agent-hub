import { ipcMain } from 'electron';
import { taskManager } from '../services/task-manager';
import { IpcChannels } from '../types';
import type {
  TaskCreateParams,
  TaskUpdateParams,
  TaskTransitionParams,
  TaskFilters,
} from '../types';

export function registerTaskHandlers(): void {
  ipcMain.handle(IpcChannels.TASK_CREATE, (_e, params: TaskCreateParams) => {
    return taskManager.create(params);
  });

  ipcMain.handle(IpcChannels.TASK_LIST, (_e, filters?: TaskFilters) => {
    return taskManager.list(filters);
  });

  // Composite key: (projectId, id)
  ipcMain.handle(IpcChannels.TASK_GET, (_e, projectId: string, id: string) => {
    return taskManager.getById(projectId, id);
  });

  // Composite key: (projectId, id, params)
  ipcMain.handle(IpcChannels.TASK_UPDATE, (_e, projectId: string, id: string, params: TaskUpdateParams) => {
    return taskManager.update(projectId, id, params);
  });

  // Composite key: (projectId, id)
  ipcMain.handle(IpcChannels.TASK_DELETE, (_e, projectId: string, id: string) => {
    taskManager.delete(projectId, id);
    return { success: true };
  });

  ipcMain.handle(IpcChannels.TASK_TRANSITION, (_e, params: TaskTransitionParams) => {
    return taskManager.transition(params);
  });

  // Composite key: (projectId, taskId, dependsOnId)
  ipcMain.handle(
    IpcChannels.TASK_ADD_DEPENDENCY,
    (_e, projectId: string, taskId: string, dependsOnId: string) => {
      taskManager.addDependency(projectId, taskId, dependsOnId);
      return { success: true };
    },
  );

  // Composite key: (projectId, taskId, dependsOnId)
  ipcMain.handle(
    IpcChannels.TASK_REMOVE_DEPENDENCY,
    (_e, projectId: string, taskId: string, dependsOnId: string) => {
      taskManager.removeDependency(projectId, taskId, dependsOnId);
      return { success: true };
    },
  );

  ipcMain.handle(IpcChannels.TASK_GET_READY, (_e, projectId: string) => {
    return taskManager.getReadyTasks(projectId);
  });

  ipcMain.handle(IpcChannels.TASK_GET_SESSION_COUNTS, (_e, taskIds: string[]) => {
    return taskManager.getSessionCountsByTask(taskIds);
  });
}
