<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { ActiveSession, SessionRecord } from '../../stores/sessions';
import { useGitStore } from '../../stores/git';
import { useIpc } from '../../composables/useIpc';
import { formatTokens } from '../../utils/format-tokens';
import BaseButton from '../common/BaseButton.vue';

type PanelSession = ActiveSession | SessionRecord;

const props = defineProps<{
  session: PanelSession;
}>();

const emit = defineEmits<{
  close: [];
}>();

const ipc = useIpc();
const gitStore = useGitStore();
const activeTab = ref<'diff' | 'output' | 'cost' | 'summary' | 'git'>('diff');
const inlineMode = ref(false);
const logContent = ref('');
const logLoading = ref(false);

// Git tab state
const commitMessage = ref('');
const selectedFiles = ref<Set<string>>(new Set());
const newBranchName = ref('');
const gitOperating = ref(false);
const gitResult = ref<string | null>(null);

const tabs = [
  { key: 'diff', label: 'Diff' },
  { key: 'output', label: '輸出' },
  { key: 'cost', label: '用量' },
  { key: 'summary', label: '摘要' },
  { key: 'git', label: 'Git' },
] as const;

/** Helper to detect if session is an ActiveSession (has sessionId) or SessionRecord (has id) */
function isActiveSession(s: PanelSession): s is ActiveSession {
  return 'sessionId' in s;
}

const sessionId = computed(() =>
  isActiveSession(props.session) ? props.session.sessionId : props.session.id,
);

const agentName = computed(() =>
  isActiveSession(props.session) ? props.session.agentName : props.session.agent_id,
);

const taskText = computed(() => props.session.task);

const costUsd = computed(() =>
  isActiveSession(props.session) ? props.session.costUsd : (props.session.cost_usd || 0),
);

const inputTokens = computed(() =>
  isActiveSession(props.session) ? props.session.inputTokens : (props.session.input_tokens || 0),
);

const outputTokens = computed(() =>
  isActiveSession(props.session) ? props.session.outputTokens : (props.session.output_tokens || 0),
);

const turnsCount = computed(() =>
  isActiveSession(props.session) ? props.session.turnsCount : (props.session.turns_count || 0),
);

const toolCallsCount = computed(() =>
  isActiveSession(props.session) ? props.session.toolCallsCount : 0,
);

const resultSummary = computed(() =>
  isActiveSession(props.session) ? undefined : props.session.result_summary,
);

const sessionCwd = computed(() => {
  if (isActiveSession(props.session) && props.session.workDir) return props.session.workDir;
  return process.cwd?.() || 'C:\\';
});

onMounted(async () => {
  await gitStore.fetchDiff(sessionCwd.value);
});

watch(
  () => gitStore.diffEntries,
  (entries) => {
    if (entries.length > 0 && !gitStore.selectedFile) {
      selectFile(entries[0].file);
    }
  },
);

// Load log content when output tab is selected, refresh git data for git tab
watch(activeTab, async (tab) => {
  if (tab === 'output' && !logContent.value) {
    await loadLog();
  }
  if (tab === 'git') {
    await refreshGitData();
  }
});

async function refreshGitData() {
  const cwd = sessionCwd.value;
  await Promise.all([
    gitStore.fetchStatus(cwd),
    gitStore.fetchDiff(cwd),
    gitStore.fetchBranches(cwd),
    gitStore.fetchLog(cwd, 10),
  ]);
  // Auto-select all changed files
  const allFiles = [
    ...(gitStore.status?.staged || []),
    ...(gitStore.status?.modified || []),
    ...(gitStore.status?.untracked || []),
  ];
  selectedFiles.value = new Set(allFiles);
}

function toggleFile(file: string) {
  const s = new Set(selectedFiles.value);
  if (s.has(file)) s.delete(file);
  else s.add(file);
  selectedFiles.value = s;
}

function selectAllFiles() {
  const allFiles = [
    ...(gitStore.status?.staged || []),
    ...(gitStore.status?.modified || []),
    ...(gitStore.status?.untracked || []),
  ];
  selectedFiles.value = new Set(allFiles);
}

function deselectAllFiles() {
  selectedFiles.value = new Set();
}

async function handleCommit() {
  if (!commitMessage.value.trim()) return;
  gitOperating.value = true;
  gitResult.value = null;
  try {
    const files = [...selectedFiles.value];
    const result = await gitStore.commit(sessionCwd.value, commitMessage.value, files);
    gitResult.value = `Committed ${result.hash.slice(0, 7)}: ${result.filesChanged} files`;
    commitMessage.value = '';
  } catch (err: any) {
    gitResult.value = `Commit failed: ${err.message}`;
  } finally {
    gitOperating.value = false;
  }
}

async function handlePush() {
  gitOperating.value = true;
  gitResult.value = null;
  try {
    const result = await gitStore.push(sessionCwd.value, 'origin', undefined, true);
    gitResult.value = `Pushed to ${result.remote}/${result.branch}`;
  } catch (err: any) {
    gitResult.value = `Push failed: ${err.message}`;
  } finally {
    gitOperating.value = false;
  }
}

async function handlePull() {
  gitOperating.value = true;
  gitResult.value = null;
  try {
    const result = await gitStore.pull(sessionCwd.value);
    gitResult.value = result.summary;
  } catch (err: any) {
    gitResult.value = `Pull failed: ${err.message}`;
  } finally {
    gitOperating.value = false;
  }
}

async function handleCreateBranch() {
  if (!newBranchName.value.trim()) return;
  gitOperating.value = true;
  try {
    await gitStore.createBranch(sessionCwd.value, newBranchName.value.trim());
    newBranchName.value = '';
    gitResult.value = null;
  } catch (err: any) {
    gitResult.value = `Branch failed: ${err.message}`;
  } finally {
    gitOperating.value = false;
  }
}

async function handleCheckout(branchName: string) {
  gitOperating.value = true;
  try {
    await gitStore.checkoutBranch(sessionCwd.value, branchName);
    gitResult.value = null;
  } catch (err: any) {
    gitResult.value = `Checkout failed: ${err.message}`;
  } finally {
    gitOperating.value = false;
  }
}

async function handleDeleteBranch(branchName: string) {
  gitOperating.value = true;
  try {
    await gitStore.deleteBranch(sessionCwd.value, branchName);
    gitResult.value = null;
  } catch (err: any) {
    gitResult.value = `Delete failed: ${err.message}`;
  } finally {
    gitOperating.value = false;
  }
}

async function loadLog() {
  logLoading.value = true;
  try {
    logContent.value = await ipc.getSessionLog(sessionId.value);
  } catch (err) {
    logContent.value = '無法載入工作階段紀錄';
  } finally {
    logLoading.value = false;
  }
}

async function selectFile(file: string) {
  const cwd = gitStore.currentCwd || process.cwd?.() || 'C:\\';
  await gitStore.fetchFileDiff(cwd, file);
}
</script>

<template>
  <div class="side-panel" style="animation: slideInRight 200ms ease-out">
    <!-- Header -->
    <div class="side-panel__header">
      <div class="side-panel__header-info">
        <span class="side-panel__agent-name">{{ agentName }}</span>
        <span class="side-panel__task-preview">{{ taskText.slice(0, 40) }}...</span>
      </div>
      <button class="side-panel__close-btn" @click="emit('close')">
        ✕
      </button>
    </div>

    <!-- Tabs -->
    <div class="side-panel__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="side-panel__tab"
        :class="activeTab === tab.key ? 'side-panel__tab--active' : 'side-panel__tab--inactive'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="side-panel__body">
      <!-- Diff tab -->
      <div v-if="activeTab === 'diff'" class="side-panel__diff">
        <!-- File list -->
        <div class="side-panel__diff-file-list">
          <div class="side-panel__diff-file-header">
            <span class="side-panel__diff-file-count">
              {{ gitStore.diffEntries.length }} 個變更檔案
            </span>
            <button
              class="side-panel__inline-toggle"
              @click="inlineMode = !inlineMode"
            >
              {{ inlineMode ? 'Split' : 'Inline' }}
            </button>
          </div>
          <div class="side-panel__diff-file-scroll">
            <button
              v-for="entry in gitStore.diffEntries"
              :key="entry.file"
              class="side-panel__diff-file-btn"
              :class="
                gitStore.selectedFile === entry.file
                  ? 'side-panel__diff-file-btn--active'
                  : 'side-panel__diff-file-btn--inactive'
              "
              @click="selectFile(entry.file)"
            >
              <span
                class="side-panel__diff-file-dot"
                :class="{
                  'side-panel__diff-file-dot--added': entry.status === 'added',
                  'side-panel__diff-file-dot--modified': entry.status === 'modified',
                  'side-panel__diff-file-dot--deleted': entry.status === 'deleted',
                  'side-panel__diff-file-dot--renamed': entry.status === 'renamed',
                }"
              />
              <span class="side-panel__diff-file-name">{{ entry.file }}</span>
              <span class="side-panel__diff-insertions">+{{ entry.insertions }}</span>
              <span class="side-panel__diff-deletions">-{{ entry.deletions }}</span>
            </button>
          </div>
        </div>

        <!-- Diff content -->
        <div class="side-panel__diff-content">
          <div v-if="gitStore.fileDiff" class="side-panel__diff-pre-wrap">
            <pre class="side-panel__diff-pre">{{ gitStore.fileDiff.modified }}</pre>
          </div>
          <div v-else class="side-panel__diff-empty">
            選擇檔案查看差異
          </div>
        </div>
      </div>

      <!-- Output tab -->
      <div v-else-if="activeTab === 'output'" class="side-panel__output">
        <div v-if="logLoading" class="side-panel__center-msg">
          載入中...
        </div>
        <pre v-else-if="logContent" class="side-panel__output-pre">{{ logContent }}</pre>
        <div v-else class="side-panel__center-msg">
          尚無輸出紀錄
        </div>
      </div>

      <!-- Cost tab -->
      <div v-else-if="activeTab === 'cost'" class="side-panel__cost">
        <div class="side-panel__cost-list">
          <div class="side-panel__cost-row">
            <span class="side-panel__cost-label">總 Token 用量</span>
            <span class="side-panel__cost-value">{{ formatTokens(inputTokens + outputTokens) }}</span>
          </div>
          <div class="side-panel__cost-row">
            <span class="side-panel__cost-label">輸入 Tokens</span>
            <span class="side-panel__cost-value">{{ formatTokens(inputTokens) }}</span>
          </div>
          <div class="side-panel__cost-row">
            <span class="side-panel__cost-label">輸出 Tokens</span>
            <span class="side-panel__cost-value">{{ formatTokens(outputTokens) }}</span>
          </div>
          <div class="side-panel__cost-row">
            <span class="side-panel__cost-label">工具呼叫</span>
            <span class="side-panel__cost-value">{{ toolCallsCount }}</span>
          </div>
          <div class="side-panel__cost-row">
            <span class="side-panel__cost-label">回合數</span>
            <span class="side-panel__cost-value">{{ turnsCount }}</span>
          </div>
          <div class="side-panel__cost-divider">
            <div class="side-panel__cost-row side-panel__cost-row--muted">
              <span>參考成本 (USD)</span>
              <span>${{ costUsd.toFixed(4) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary tab -->
      <div v-else-if="activeTab === 'summary'" class="side-panel__summary">
        <pre v-if="resultSummary" class="side-panel__summary-pre">{{ resultSummary }}</pre>
        <p v-else class="side-panel__summary-empty">
          尚無工作摘要
        </p>
      </div>

      <!-- Git tab -->
      <div v-else-if="activeTab === 'git'" class="side-panel__git">
        <div class="side-panel__git-sections">
          <!-- Branch info -->
          <div v-if="gitStore.status" class="side-panel__branch-info">
            <div class="side-panel__branch-row">
              <span class="side-panel__branch-icon">&#9741;</span>
              <div class="side-panel__branch-text">
                <div class="side-panel__branch-name">{{ gitStore.status.branch }}</div>
                <div class="side-panel__branch-remote">&#8594; origin</div>
              </div>
              <div class="side-panel__branch-badges">
                <span v-if="gitStore.status.ahead > 0" class="side-panel__branch-badge side-panel__branch-badge--ahead">
                  &#8593; {{ gitStore.status.ahead }}
                </span>
                <span v-if="gitStore.status.behind > 0" class="side-panel__branch-badge side-panel__branch-badge--behind">
                  &#8595; {{ gitStore.status.behind }}
                </span>
              </div>
            </div>
          </div>

          <!-- Changed files -->
          <div class="side-panel__git-section">
            <div class="side-panel__git-section-header">
              <span>變更檔案</span>
              <span class="side-panel__git-file-count">
                {{ (gitStore.status?.modified.length || 0) + (gitStore.status?.untracked.length || 0) + (gitStore.status?.staged.length || 0) }}
              </span>
            </div>
            <div class="side-panel__file-list">
              <div
                v-for="file in [...(gitStore.status?.staged || []), ...(gitStore.status?.modified || []), ...(gitStore.status?.untracked || [])]"
                :key="file"
                class="side-panel__file-row"
                @click="toggleFile(file)"
              >
                <span
                  class="side-panel__file-checkbox"
                  :class="selectedFiles.has(file) ? 'side-panel__file-checkbox--checked' : 'side-panel__file-checkbox--unchecked'"
                >
                  <span v-if="selectedFiles.has(file)">&#10003;</span>
                </span>
                <span
                  class="side-panel__file-status"
                  :class="{
                    'side-panel__file-status--modified': gitStore.status?.modified.includes(file),
                    'side-panel__file-status--added': gitStore.status?.untracked.includes(file),
                    'side-panel__file-status--staged': gitStore.status?.staged.includes(file) && !gitStore.status?.modified.includes(file),
                  }"
                >
                  {{ gitStore.status?.untracked.includes(file) ? 'A' : gitStore.status?.staged.includes(file) && !gitStore.status?.modified.includes(file) ? 'S' : 'M' }}
                </span>
                <span class="side-panel__file-name">{{ file }}</span>
              </div>
              <div v-if="(gitStore.status?.modified.length || 0) + (gitStore.status?.untracked.length || 0) + (gitStore.status?.staged.length || 0) === 0"
                class="side-panel__file-empty">
                沒有變更的檔案
              </div>
              <div class="side-panel__file-actions">
                <button class="side-panel__file-action-btn" @click="selectAllFiles">全選</button>
                <button class="side-panel__file-action-btn" @click="deselectAllFiles">取消全選</button>
                <span class="side-panel__file-selected-count">{{ selectedFiles.size }} 已選</span>
              </div>
            </div>
          </div>

          <!-- Commit message -->
          <div class="side-panel__git-section">
            <div class="side-panel__git-section-title">提交訊息</div>
            <textarea
              v-model="commitMessage"
              class="side-panel__commit-textarea"
              placeholder="feat: describe your changes..."
              rows="2"
              style="min-height: 40px; max-height: 120px"
            />
          </div>

          <!-- Main actions -->
          <div class="side-panel__git-actions">
            <BaseButton
              class="side-panel__git-action-flex"
              :disabled="gitOperating || !commitMessage.trim() || selectedFiles.size === 0"
              @click="handleCommit"
            >
              &#10003; Commit
            </BaseButton>
            <BaseButton
              variant="success"
              :disabled="gitOperating"
              @click="handlePush"
            >
              &#8593; Push
            </BaseButton>
            <BaseButton
              variant="secondary"
              :disabled="gitOperating"
              @click="handlePull"
            >
              &#8595; Pull
            </BaseButton>
          </div>

          <!-- Result message -->
          <div v-if="gitResult" class="side-panel__git-result"
            :class="gitResult.includes('failed') ? 'side-panel__git-result--error' : 'side-panel__git-result--success'"
          >
            {{ gitResult }}
          </div>

          <!-- Branch manager -->
          <div class="side-panel__git-section">
            <div class="side-panel__git-section-title">分支管理</div>
            <div class="side-panel__branch-create">
              <input
                v-model="newBranchName"
                class="side-panel__branch-input"
                placeholder="新分支名稱..."
                @keyup.enter="handleCreateBranch"
              />
              <BaseButton
                variant="secondary"
                size="sm"
                :disabled="gitOperating || !newBranchName.trim()"
                @click="handleCreateBranch"
              >
                建立
              </BaseButton>
            </div>
            <div class="side-panel__branch-list">
              <div
                v-for="branch in gitStore.branches?.all || []"
                :key="branch"
                class="side-panel__branch-item"
                :class="{ 'side-panel__branch-item--current': branch === gitStore.branches?.current }"
                @click="branch !== gitStore.branches?.current && handleCheckout(branch.replace('remotes/', ''))"
              >
                <span
                  class="side-panel__branch-dot"
                  :class="branch === gitStore.branches?.current ? 'side-panel__branch-dot--current' : 'side-panel__branch-dot--default'"
                />
                <span class="side-panel__branch-label">{{ branch.replace('remotes/origin/', '') }}</span>
                <span v-if="branch === gitStore.branches?.current" class="side-panel__branch-current-tag">
                  current
                </span>
                <button
                  v-if="branch !== gitStore.branches?.current && !branch.startsWith('remotes/')"
                  class="side-panel__branch-delete-btn"
                  style="opacity: 0; transition: opacity 0.1s"
                  @click.stop="handleDeleteBranch(branch)"
                  @mouseenter="($event.target as HTMLElement).style.opacity = '1'"
                  @mouseleave="($event.target as HTMLElement).style.opacity = '0'"
                >
                  &#128465;
                </button>
              </div>
            </div>
          </div>

          <!-- Recent commits -->
          <div v-if="gitStore.commits.length > 0" class="side-panel__git-section">
            <div class="side-panel__git-section-title">最近提交</div>
            <div class="side-panel__commit-list">
              <div
                v-for="c in gitStore.commits.slice(0, 5)"
                :key="c.hash"
                class="side-panel__commit-item"
              >
                <div class="side-panel__commit-row">
                  <span class="side-panel__commit-hash">{{ c.hash.slice(0, 7) }}</span>
                  <span class="side-panel__commit-message">{{ c.message }}</span>
                </div>
                <div class="side-panel__commit-meta">{{ c.author }} &middot; {{ c.date.slice(0, 10) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* ── Panel shell ── */
.side-panel {
  width: 500px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-card);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* ── Header ── */
.side-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-default);
  padding: 10px 16px;
}

.side-panel__header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.side-panel__agent-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.side-panel__task-preview {
  font-size: 12px;
  color: var(--color-text-muted);
}

.side-panel__close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.side-panel__close-btn:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* ── Tabs ── */
.side-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border-default);
}

.side-panel__tab {
  flex: 1;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  transition: color 150ms ease, border-color 150ms ease;
}

.side-panel__tab--active {
  border-bottom-color: var(--color-accent);
  color: var(--color-accent-light);
}

.side-panel__tab--inactive {
  color: var(--color-text-muted);
}

.side-panel__tab--inactive:hover {
  color: var(--color-text-primary);
}

/* ── Body ── */
.side-panel__body {
  flex: 1;
  overflow: hidden;
}

/* ── Diff tab ── */
.side-panel__diff {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.side-panel__diff-file-list {
  border-bottom: 1px solid var(--color-border-default);
  padding: 8px;
}

.side-panel__diff-file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 4px;
}

.side-panel__diff-file-count {
  font-size: 11px;
  color: var(--color-text-muted);
}

.side-panel__inline-toggle {
  cursor: pointer;
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--color-text-muted);
  transition: color 150ms ease;
}

.side-panel__inline-toggle:hover {
  color: var(--color-text-primary);
}

.side-panel__diff-file-scroll {
  max-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.side-panel__diff-file-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  cursor: pointer;
  border: none;
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 12px;
  text-align: left;
  transition: background-color 150ms ease, color 150ms ease;
}

.side-panel__diff-file-btn--active {
  background-color: rgba(108, 92, 231, 0.1);
  color: var(--color-accent-light);
}

.side-panel__diff-file-btn--inactive {
  background: transparent;
  color: var(--color-text-secondary);
}

.side-panel__diff-file-btn--inactive:hover {
  background-color: var(--color-bg-hover);
}

.side-panel__diff-file-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.side-panel__diff-file-dot--added {
  background-color: var(--color-success);
}

.side-panel__diff-file-dot--modified {
  background-color: var(--color-warning);
}

.side-panel__diff-file-dot--deleted {
  background-color: var(--color-danger);
}

.side-panel__diff-file-dot--renamed {
  background-color: var(--color-info);
}

.side-panel__diff-file-name {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-panel__diff-insertions {
  font-size: 10px;
  color: var(--color-success);
}

.side-panel__diff-deletions {
  font-size: 10px;
  color: var(--color-danger);
}

.side-panel__diff-content {
  flex: 1;
  overflow-y: auto;
}

.side-panel__diff-pre-wrap {
  padding: 12px;
}

.side-panel__diff-pre {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.side-panel__diff-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ── Output tab ── */
.side-panel__output {
  height: 100%;
  overflow-y: auto;
  background-color: var(--color-bg-base);
  padding: 16px;
}

.side-panel__output-pre {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.side-panel__center-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ── Cost tab ── */
.side-panel__cost {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.side-panel__cost-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.side-panel__cost-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.side-panel__cost-label {
  color: var(--color-text-secondary);
}

.side-panel__cost-value {
  font-weight: 500;
  color: var(--color-text-primary);
}

.side-panel__cost-divider {
  margin-top: 8px;
  border-top: 1px solid var(--color-border-default);
  padding-top: 12px;
}

.side-panel__cost-row--muted {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ── Summary tab ── */
.side-panel__summary {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.side-panel__summary-pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.side-panel__summary-empty {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ── Git tab ── */
.side-panel__git {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.side-panel__git-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.side-panel__branch-info {
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-base);
  padding: 12px;
}

.side-panel__branch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.side-panel__branch-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  background-color: var(--color-accent);
  font-size: 12px;
  color: #fff;
  flex-shrink: 0;
}

.side-panel__branch-text {
  min-width: 0;
  flex: 1;
}

.side-panel__branch-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-panel__branch-remote {
  font-size: 11px;
  color: var(--color-text-muted);
}

.side-panel__branch-badges {
  display: flex;
  gap: 6px;
}

.side-panel__branch-badge {
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
}

.side-panel__branch-badge--ahead {
  background-color: rgba(0, 214, 143, 0.15);
  color: var(--color-success);
}

.side-panel__branch-badge--behind {
  background-color: rgba(51, 154, 240, 0.15);
  color: var(--color-info);
}

/* Git section */
.side-panel__git-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.side-panel__git-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.side-panel__git-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.side-panel__git-file-count {
  border-radius: 9999px;
  background-color: var(--color-bg-hover);
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
}

/* File list */
.side-panel__file-list {
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
}

.side-panel__file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--color-border-default);
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.side-panel__file-row:last-child {
  border-bottom: 0;
}

.side-panel__file-row:hover {
  background-color: var(--color-bg-hover);
}

.side-panel__file-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  flex-shrink: 0;
}

.side-panel__file-checkbox--checked {
  background-color: var(--color-accent);
  color: #fff;
}

.side-panel__file-checkbox--unchecked {
  border: 1px solid var(--color-border-default);
}

.side-panel__file-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.side-panel__file-status--modified {
  background-color: rgba(255, 170, 0, 0.15);
  color: var(--color-warning);
}

.side-panel__file-status--added {
  background-color: rgba(0, 214, 143, 0.15);
  color: var(--color-success);
}

.side-panel__file-status--staged {
  background-color: rgba(51, 154, 240, 0.15);
  color: var(--color-info);
}

.side-panel__file-name {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
  font-size: 11px;
}

.side-panel__file-empty {
  padding: 12px;
  text-align: center;
  font-size: 11px;
  color: var(--color-text-muted);
}

.side-panel__file-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--color-border-default);
  background-color: var(--color-bg-secondary);
  padding: 6px 12px;
}

.side-panel__file-action-btn {
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--color-accent-light);
  cursor: pointer;
}

.side-panel__file-action-btn:hover {
  text-decoration: underline;
}

.side-panel__file-selected-count {
  margin-left: auto;
  font-size: 10px;
  color: var(--color-text-muted);
}

/* Commit textarea */
.side-panel__commit-textarea {
  width: 100%;
  resize: vertical;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-base);
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
}

.side-panel__commit-textarea::placeholder {
  color: var(--color-text-muted);
}

.side-panel__commit-textarea:focus {
  border-color: var(--color-accent);
}

/* Git actions */
.side-panel__git-actions {
  display: flex;
  gap: 8px;
}

.side-panel__git-action-flex {
  flex: 1;
}

/* Git result */
.side-panel__git-result {
  border-radius: var(--radius-lg);
  border: 1px solid;
  padding: 8px 12px;
  font-size: 12px;
}

.side-panel__git-result--success {
  border-color: rgba(0, 214, 143, 0.3);
  background-color: rgba(0, 214, 143, 0.1);
  color: var(--color-success);
}

.side-panel__git-result--error {
  border-color: rgba(255, 107, 107, 0.3);
  background-color: rgba(255, 107, 107, 0.1);
  color: var(--color-danger);
}

/* Branch create */
.side-panel__branch-create {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.side-panel__branch-input {
  flex: 1;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-base);
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-primary);
  outline: none;
}

.side-panel__branch-input::placeholder {
  color: var(--color-text-muted);
}

.side-panel__branch-input:focus {
  border-color: var(--color-accent);
}

/* Branch list */
.side-panel__branch-list {
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
}

.side-panel__branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--color-border-default);
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.side-panel__branch-item:last-child {
  border-bottom: 0;
}

.side-panel__branch-item:hover {
  background-color: var(--color-bg-hover);
}

.side-panel__branch-item--current {
  background-color: var(--color-bg-active);
}

.side-panel__branch-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid;
  flex-shrink: 0;
}

.side-panel__branch-dot--current {
  border-color: var(--color-accent);
  background-color: var(--color-accent);
  box-shadow: inset 0 0 0 2px var(--color-bg-card);
}

.side-panel__branch-dot--default {
  border-color: var(--color-border-default);
  background: transparent;
}

.side-panel__branch-label {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-secondary);
}

.side-panel__branch-current-tag {
  border-radius: var(--radius-sm);
  background-color: rgba(108, 92, 231, 0.2);
  padding: 2px 6px;
  font-size: 10px;
  color: var(--color-accent-light);
}

.side-panel__branch-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 11px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.side-panel__branch-delete-btn:hover {
  background-color: rgba(255, 107, 107, 0.15);
  color: var(--color-danger);
}

/* Recent commits */
.side-panel__commit-list {
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
}

.side-panel__commit-item {
  border-bottom: 1px solid var(--color-border-default);
  padding: 8px 12px;
}

.side-panel__commit-item:last-child {
  border-bottom: 0;
}

.side-panel__commit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.side-panel__commit-hash {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-accent-light);
}

.side-panel__commit-message {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.side-panel__commit-meta {
  margin-top: 2px;
  font-size: 10px;
  color: var(--color-text-muted);
}
</style>
