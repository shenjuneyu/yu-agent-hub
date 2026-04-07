export type TaskStatus =
  | 'created'
  | 'assigned'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'rejected'
  | 'done';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskRecord {
  id: string;
  projectId: string;
  sprintId: string | null;
  sprintName: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  assignedTo: string | null;
  createdBy: string | null;
  priority: TaskPriority;
  tags: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  startedAt: string | null;
  completedAt: string | null;
  dependsOn: string[];
  outputSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCreateParams {
  projectId: string;
  sprintId?: string | null;
  parentTaskId?: string | null;
  title: string;
  description?: string;
  assignedTo?: string | null;
  createdBy?: string | null;
  priority?: TaskPriority;
  tags?: string | null;
  estimatedHours?: number | null;
}

export interface TaskUpdateParams {
  title?: string;
  description?: string;
  assignedTo?: string | null;
  priority?: TaskPriority;
  sprintId?: string | null;
  tags?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
}

export interface TaskTransitionParams {
  projectId?: string;  // Optional for backward compat (UUID tasks don't need it)
  taskId: string;
  toStatus: TaskStatus;
}

export interface TaskFilters {
  projectId?: string;
  sprintId?: string;
  status?: TaskStatus;
  assignedTo?: string;
  priority?: TaskPriority;
  search?: string;
  parentTaskId?: string;
}

/** @deprecated Use skill-based task creation instead */
export interface DelegationCommand {
  targetAgent: string;
  task: string;
  context?: string;
  priority?: TaskPriority | string;
}

export type SprintStatus = 'planning' | 'active' | 'review' | 'completed';
export type SprintType = 'full' | 'feature' | 'bugfix' | 'release';

export interface SprintRecord {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  sprintType: SprintType;
  status: SprintStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SprintCreateParams {
  projectId: string;
  name: string;
  goal?: string;
  sprintType?: SprintType;
}

export interface SprintStatusInfo {
  sprint: SprintRecord;
  taskCounts: Record<TaskStatus, number>;
  totalTasks: number;
  completedTasks: number;
  progressPct: number;
}

export interface GateRecord {
  id: string;
  projectId: string;
  sprintId: string | null;
  gateType: 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  submittedBy: string | null;
  reviewer: string | null;
  checklist: string | null;
  decision: string | null;
  createdAt: string;
}
