import * as pty from 'node-pty';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { agentLoader } from './agent-loader';
import { promptAssembler } from './prompt-assembler';
import { gitManager } from './git-manager';
import { EventParser, type ParsedEvent } from './event-parser';
import { eventBus } from './event-bus';
import { database } from './database';
import { logger } from '../utils/logger';
import { hookManager } from './hook-manager';
import { getSessionLogsDir, getClaudeConversationsDir } from '../utils/paths';

/**
 * Strip ANSI escape codes + TUI control sequences from raw PTY output.
 * Converts terminal-rendered output to readable plain text.
 */
function stripAnsiAndControl(raw: string): string {
  return raw
    // Remove OSC sequences: ESC] ... (BEL or ST)
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    // Replace CSI cursor-movement sequences with a space (to preserve word separation)
    .replace(/\x1b\[[0-9;?]*[ABCDEFGHJKST]/g, ' ')
    // Remove all other CSI sequences
    .replace(/\x1b\[[0-9;?]*[a-zA-Z@]/g, '')
    // Remove remaining ESC sequences
    .replace(/\x1b[^[(\x1b]/g, '')
    // Remove other control chars (except newline, tab, carriage return)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Remove TUI spinner characters (Claude Code animation)
    .replace(/[✽✻✶✢·*●]/g, '')
    // Remove bracketed paste markers
    .replace(/200~[\s\S]*?201~/g, '')
    // Remove Claude Code TUI noise: repeated status words, thinking indicators, spinner text
    .replace(/(?:Dilly-dallying|Ebbing|Garnishing|Harmonizing|Orchestrating|Frosting|Crystallizing)…/g, '')
    .replace(/\(thinking\)/g, '')
    .replace(/\(thought for \d+s\)/g, '')
    // Remove lines that are only box-drawing / decoration
    .replace(/^[─━═┌┐└┘├┤┬┴┼╭╮╰╯│▪▐▛▜▝▘▌❯\s]+$/gm, '')
    // Remove "esc to interrupt" and "? for shortcuts" prompts
    .replace(/esc to interrupt/g, '')
    .replace(/\? for shortcuts/g, '')
    // Collapse multiple spaces
    .replace(/ {2,}/g, ' ')
    // Collapse multiple blank lines into max 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
import type {
  SpawnParams,
  SpawnResult,
  ActiveSession,
  SessionStatus,
  SessionEvent,
  DelegationRequest,
  SendDelegationParams,
  ResumableSession,
} from '../types';

interface CompletionCallback {
  resolve: (output: string) => void;
  reject: (error: Error) => void;
}

interface ManagedSession {
  sessionId: string;
  ptyId: string;
  agentId: string;
  agentName: string;
  task: string;
  taskId: string | null;
  model: string;
  projectId: string | null;
  status: SessionStatus;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
  turnsCount: number;
  startedAt: string;
  ptyProcess: pty.IPty;
  eventParser: EventParser;
  tmpFile: string | null;
  interactive: boolean;
  completionCallbacks: CompletionCallback[];
  outputBuffer: string;
  /** Track last checkpoint position in outputBuffer */
  lastCheckpointLen: number;
  /** Timer for waiting on summary response during graceful stop */
  summaryTimer: ReturnType<typeof setInterval> | null;
  /** Working directory used for this session's PTY */
  workDir: string;
  /** Timer for detecting interactive idle state (no PTY output for N seconds) */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Queued messages to send when session becomes idle */
  pendingMessages: string[];
}

const CHECKPOINT_THRESHOLD = 200 * 1024; // 200KB
/** How long (ms) to wait after last PTY output before considering interactive session idle */
const INTERACTIVE_IDLE_MS = 3000;


/**
 * Strip all terminal escape sequences and Claude Code TUI artifacts from raw
 * PTY output, leaving only the meaningful text content.
 */
function stripTerminalOutput(raw: string): string {
  let text = raw;

  // 1. CSI sequences: \x1b[ (optionally ?) digits/semicolons then a letter
  text = text.replace(/\x1b\[\??[0-9;]*[a-zA-Z]/g, '');

  // 2. OSC sequences: \x1b] ... (terminated by BEL \x07 or ST \x1b\\)
  text = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '');

  // 3. Remaining bare ESC + single char
  text = text.replace(/\x1b[^[\]]/g, '');

  // 4. Stray control characters (except \n and \t)
  text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // 5. Bare carriage returns not followed by newline (TUI in-place rewrite residue)
  text = text.replace(/\r(?!\n)/g, '');

  // 6. TUI spinner / decoration characters
  text = text.replace(/[·✢✶✻✽●⠐⠂✳]/g, '');

  // 7. Separator lines (box-drawing)
  text = text.replace(/[─━]{3,}/g, '');

  // 8. Claude Code TUI chrome lines
  text = text.replace(/❯\s*/g, '');
  text = text.replace(/esc\s*to\s*interrupt/gi, '');
  text = text.replace(/\?\s*for\s*shortcuts/gi, '');
  text = text.replace(/⎿\s*.*$/gm, '');
  text = text.replace(/Tip:\s*Run\s.*$/gm, '');
  text = text.replace(/\(thinking\)/g, '');
  text = text.replace(/\(thought for \d+s?\)/g, '');

  // 9. TUI token counter and model info residue
  //    e.g. "1.0k tokens)" "500 tokens)" "23.5k tokens"
  text = text.replace(/[\d.]+k?\s*tokens?\)?/gi, '');
  //    e.g. "claude-sonnet-4-6" "opus" etc. appearing as status line fragments
  text = text.replace(/claude[-\w]*/gi, '');
  //    e.g. "(sonnet)" "(opus)" standalone model markers
  text = text.replace(/\((?:sonnet|opus|haiku)\)/gi, '');

  // 10. Spinner animation fragments — "Gitifying" and its garbled remnants
  text = text.replace(/Gitifying…/g, '');
  text = text.replace(/[*Gitfy…]{2,}/g, ''); // garbled spinner residue

  // 11. Standalone single-char lines from TUI spinner (*, single letters)
  text = text.replace(/^\*\s*$/gm, '');
  text = text.replace(/^[a-zA-Z]\s*$/gm, '');

  // 12. Collapse excessive whitespace
  text = text.replace(/[ \t]+$/gm, '');   // trailing spaces per line
  text = text.replace(/\n{3,}/g, '\n\n'); // max 2 consecutive newlines
  text = text.trim();

  return text;
}

/**
 * Write a message to a PTY and submit it with Enter.
 * Uses bracketed paste mode (\x1b[200~ ... \x1b[201~) so multi-line text
 * is treated as a single paste by the TUI, preventing \n from being
 * interpreted as individual Enter key-presses.
 */
function ptyWriteAndSubmit(ptyProcess: pty.IPty, text: string): void {
  ptyProcess.write('\x1b[200~' + text + '\x1b[201~');
  // Give TUI time to process the bracketed paste before sending Enter
  setTimeout(() => {
    try {
      ptyProcess.write('\r');
    } catch { /* PTY already closed */ }
  }, 500);
}

class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private delegations = new Map<string, DelegationRequest>();
  private claudePath: string | null = null;
  private lastSummaryAt = new Map<string, number>();
  private readonly MIN_SUMMARY_INTERVAL = 15 * 60 * 1000; // 15 minutes

  /**
   * Detect the claude CLI path.
   */
  /**
   * Listen for gate review events to update awaiting_approval sessions.
   */
  setupGateListener(): void {
    eventBus.on('gate:reviewed', ({ decision, sprintId }: { decision: string; sprintId: string | null }) => {
      if (!sprintId) return;
      for (const [sessionId, session] of this.sessions) {
        if (session.status !== 'awaiting_approval') continue;
        // Find sessions linked to tasks in this sprint
        if (!session.taskId) continue;
        try {
          const rows = database.prepare(
            'SELECT sprint_id FROM tasks WHERE id = ?',
            [session.taskId],
          );
          if (rows.length > 0 && rows[0].sprint_id === sprintId) {
            const newStatus = decision === 'approved' ? 'running' : 'failed';
            logger.info(`Gate reviewed (${decision}): session ${sessionId} → ${newStatus}`);
            this.updateStatus(sessionId, newStatus as any);
          }
        } catch (err) {
          logger.warn('Failed to check task sprint for gate review', err);
        }
      }
    });
  }

  detectClaude(): void {
    // Allow E2E tests to inject a mock CLI via environment variable
    if (process.env.MOCK_CLAUDE_CLI) {
      this.claudePath = process.env.MOCK_CLAUDE_CLI;
      logger.info(`Using mock Claude CLI: ${this.claudePath}`);
      return;
    }

    try {
      const result = execSync('where claude', { encoding: 'utf-8', timeout: 5000 }).trim();
      const lines = result.split('\n').map((l) => l.trim()).filter(Boolean);
      // Prefer .cmd on Windows (required for cmd.exe /c execution)
      const cmdPath = lines.find((l) => l.endsWith('.cmd'));
      this.claudePath = cmdPath || lines[0] || null;
      if (this.claudePath) {
        logger.info(`Claude CLI found at: ${this.claudePath}`);
      }
    } catch {
      logger.warn('Claude CLI not found in PATH. Session spawning will fail.');
    }
  }

  getClaudePath(): string | null {
    return this.claudePath;
  }

  isClaudeAvailable(): boolean {
    return this.claudePath !== null;
  }

  /**
   * Spawn a new Claude Code session via node-pty.
   */
  spawn(params: SpawnParams): SpawnResult {
    if (!this.claudePath) {
      throw new Error('Claude CLI is not available. Please install Claude Code CLI.');
    }

    const isResume = !!params.resumeSessionId;
    const isDirectResume = !!params.resumeConversationId;

    const agent = (isResume || isDirectResume) ? null : agentLoader.getById(params.agentId);
    if (!isResume && !isDirectResume && !agent) {
      throw new Error(`Agent not found: ${params.agentId}`);
    }

    // For resume: create a new Maestro session ID, but use Claude's conversation ID for --resume
    const sessionId = randomUUID();
    const ptyId = `pty-${sessionId.slice(0, 8)}`;
    const model = params.model || agent?.model || 'sonnet';
    const maxTurns = params.maxTurns || 10;
    const interactive = params.interactive ?? true; // default to interactive
    const now = new Date().toISOString();

    let tmpFile: string | null = null;
    let args: string[];

    if (isDirectResume) {
      // Direct resume by conversation ID (from file-system scan)
      args = ['--resume', params.resumeConversationId!];
      logger.info(`Direct resume conversation ${params.resumeConversationId} as new session ${sessionId}`);
    } else if (isResume) {
      // Look up the Claude conversation ID from the original session
      let claudeConvId: string | null = null;
      try {
        const rows = database.prepare(
          'SELECT claude_conversation_id FROM claude_sessions WHERE id = ?',
          [params.resumeSessionId],
        );
        if (rows.length > 0) claudeConvId = rows[0].claude_conversation_id;
      } catch (err) {
        logger.warn('Failed to look up claude_conversation_id', err);
      }

      if (!claudeConvId) {
        throw new Error(`Cannot resume: no Claude conversation ID found for session ${params.resumeSessionId}`);
      }

      // Resume mode: claude --resume <claude-conversation-id>
      args = ['--resume', claudeConvId];
      logger.info(`Resuming session ${params.resumeSessionId} (claude conv: ${claudeConvId}) as new session ${sessionId}`);
    } else {
      // Normal mode: assemble system prompt and write to temp file
      const systemPrompt = promptAssembler.assemble(params.agentId, params.projectId, {
        parentSessionId: params.parentSessionId,
      });
      const promptDir = join(process.cwd(), '.maestro-prompts');
      if (!existsSync(promptDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(promptDir, { recursive: true });
      }
      tmpFile = join(promptDir, `prompt-${sessionId.slice(0, 8)}.md`);
      writeFileSync(tmpFile, systemPrompt, 'utf-8');

      // Build CLI arguments
      args = [
        '--model', model,
        '--system-prompt-file', tmpFile,
      ];

      // Apply project-level permission settings
      if (params.projectId) {
        try {
          const permRows = database.prepare(
            "SELECT value FROM user_preferences WHERE key = ?",
            [`project.${params.projectId}.permission-mode`],
          );
          if (permRows.length > 0 && permRows[0].value) {
            const mode = permRows[0].value;
            if (mode === 'bypassPermissions') {
              // bypassPermissions needs the standalone flag
              args.push('--dangerously-skip-permissions');
            } else {
              args.push('--permission-mode', mode);
            }
            logger.info(`Session ${sessionId} permission mode: ${mode}`);
          }

          const toolRows = database.prepare(
            "SELECT value FROM user_preferences WHERE key = ?",
            [`project.${params.projectId}.allowed-tools`],
          );
          if (toolRows.length > 0 && toolRows[0].value) {
            const tools: string[] = JSON.parse(toolRows[0].value);
            if (tools.length > 0) {
              args.push('--allowedTools', ...tools);
              logger.info(`Session ${sessionId} allowed tools: ${tools.join(', ')}`);
            }
          }
        } catch (err) {
          logger.warn('Failed to load project permission settings', err);
        }
      }

      // 8A-2: Generate SKILL.md if skill sync is enabled for this project
      if (params.projectId) {
        try {
          const syncRows = database.prepare(
            "SELECT value FROM user_preferences WHERE key = ?",
            [`project.${params.projectId}.skill-sync`],
          );
          if (syncRows.length > 0 && syncRows[0].value === 'true') {
            const projRows = database.prepare(
              'SELECT work_dir FROM projects WHERE id = ?',
              [params.projectId],
            );
            const workDir = projRows[0]?.work_dir as string | null;
            if (workDir) {
              const { generateSkillFile } = require('../utils/skill-generator') as {
                generateSkillFile: (wd: string, aid: string, force?: boolean) => { status: string };
              };
              const result = generateSkillFile(workDir, params.agentId);
              logger.info(`Skill sync for ${params.agentId}: ${result.status}`);
            }
          }
        } catch (err) {
          logger.warn('Failed to generate skill file', err);
        }
      }

      if (interactive) {
        // Interactive mode: Claude Code TUI, user can type commands in terminal
        // No -p, no --output-format, no --verbose
      } else {
        // One-shot mode: execute task and exit
        args.push('--max-turns', String(maxTurns));
        args.push('--output-format', 'stream-json');
        args.push('--verbose');
        args.push('-p', params.task);
      }
    }

    logger.info(`Spawning session ${sessionId} for agent ${params.agentId}`, { model, maxTurns, isResume });

    // For resume, look up original session info from DB (must happen before spawnCwd resolution)
    let resumeInfo: { agent_id?: string; task?: string; task_id?: string; project_id?: string } = {};
    if (isResume) {
      try {
        const rows = database.prepare(
          'SELECT agent_id, task, task_id, project_id FROM claude_sessions WHERE id = ?',
          [params.resumeSessionId],
        );
        if (rows.length > 0) resumeInfo = rows[0];
      } catch (err) {
        logger.warn('Failed to look up original session for resume', err);
      }
    }

    // Resolve working directory: prefer project's workDir, fallback to process.cwd()
    // Exception: company-manager always uses AgentHub (process.cwd()) as workDir
    const effectiveAgentId = isResume ? (resumeInfo.agent_id || params.agentId) : params.agentId;
    let spawnCwd = process.cwd();

    // Direct resume: use the provided projectPath directly
    if (isDirectResume && params.projectPath) {
      spawnCwd = params.projectPath;
    }

    const projectId = isResume ? (resumeInfo.project_id || null) : (params.projectId || null);
    if (!isDirectResume && projectId && effectiveAgentId !== 'company-manager') {
      try {
        const projRows = database.prepare(
          'SELECT work_dir FROM projects WHERE id = ?',
          [projectId],
        );
        if (projRows.length > 0 && projRows[0].work_dir) {
          spawnCwd = projRows[0].work_dir;
        }
      } catch (err) {
        logger.warn('Failed to look up project work_dir', err);
      }
    }

    // Ensure the working directory exists
    if (!existsSync(spawnCwd)) {
      mkdirSync(spawnCwd, { recursive: true });
    }

    logger.info(`Session ${sessionId} working directory: ${spawnCwd}`);

    // Inject hooks into child project (skills already deployed via PROJECT_CREATE → .claude/commands/)
    hookManager.tryInjectHooks(spawnCwd);

    // Spawn PTY
    // On Windows: use cmd /s /c with bare 'claude' command (let PATH resolve).
    // Only quote args that contain spaces; avoid quoting paths as cmd.exe
    // treats quotes as literal path characters under /s /c.
    //
    // When MOCK_CLAUDE_CLI is set (E2E testing), run the mock script via node
    // instead of the real claude binary.
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const escapeArg = (a: string) =>
      process.platform === 'win32'
        ? (a.includes(' ') ? `"${a}"` : a)
        : `'${a.replace(/'/g, "'\\''")}'`;
    const argsStr = args.map(escapeArg).join(' ');

    let shellArgs: string[];
    if (process.env.MOCK_CLAUDE_CLI) {
      // Use node to run the mock script — ensures Windows compatibility
      const mockPath = process.env.MOCK_CLAUDE_CLI;
      const mockEscaped = process.platform === 'win32'
        ? (mockPath.includes(' ') ? `"${mockPath}"` : mockPath)
        : `'${mockPath.replace(/'/g, "'\\''")}'`;
      shellArgs = process.platform === 'win32'
        ? ['/s', '/c', `node ${mockEscaped} ${argsStr}`]
        : ['-c', `node ${mockEscaped} ${argsStr}`];
    } else {
      const cmdName = process.platform === 'win32' ? 'claude' : (this.claudePath || 'claude');
      shellArgs = process.platform === 'win32'
        ? ['/s', '/c', `${cmdName} ${argsStr}`]
        : ['-c', `${cmdName} ${argsStr}`];
    }

    // Remove CLAUDECODE env var to allow spawning Claude CLI from within a Claude Code session
    const spawnEnv = { ...process.env } as Record<string, string>;
    delete spawnEnv.CLAUDECODE;

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: spawnCwd,
      env: spawnEnv,
    });

    // Create event parser
    const eventParser = new EventParser();

    const agentId = isDirectResume
      ? (params.agentId || '(resumed)')
      : isResume ? (resumeInfo.agent_id || params.agentId) : params.agentId;
    const agentName = isDirectResume
      ? (params.agentId || '(resumed)')
      : isResume ? (resumeInfo.agent_id || params.agentId) : (agent?.name || params.agentId);
    const taskText = isDirectResume
      ? (params.task || '(resumed)')
      : isResume ? (resumeInfo.task || '(resumed)') : params.task;

    // Create managed session
    const session: ManagedSession = {
      sessionId,
      ptyId,
      agentId,
      agentName,
      task: taskText,
      taskId: isResume ? (resumeInfo.task_id || null) : (params.taskId || null),
      model,
      projectId: isResume ? (resumeInfo.project_id || null) : (params.projectId || null),
      status: 'starting',
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      toolCallsCount: 0,
      turnsCount: 0,
      startedAt: now,
      ptyProcess,
      eventParser,
      tmpFile,
      interactive,
      completionCallbacks: [],
      outputBuffer: '',
      lastCheckpointLen: 0,
      summaryTimer: null,
      workDir: spawnCwd,
      idleTimer: null,
      pendingMessages: [],
    };

    this.sessions.set(sessionId, session);

    // Insert DB record
    try {
      const parentId = isDirectResume ? null : isResume ? params.resumeSessionId! : (params.parentSessionId || null);
      database.run(
        `INSERT INTO claude_sessions (id, agent_id, task, task_id, project_id, model, status, started_at, parent_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, agentId, taskText, session.taskId, session.projectId, model, 'starting', now, parentId],
      );
    } catch (err) {
      logger.error('Failed to insert session into DB', err);
    }

    // 9B: Session 啟動 → Task auto in_progress
    if (session.taskId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { taskManager } = require('./task-manager') as {
          taskManager: { transition: (p: { taskId: string; toStatus: string }) => unknown };
        };
        taskManager.transition({ taskId: session.taskId, toStatus: 'in_progress' });
        logger.info(`Task ${session.taskId} auto → in_progress (session ${sessionId})`);
      } catch (err) {
        logger.warn('Auto-transition task to in_progress failed (non-fatal)', err);
      }
    }

    // Auto-branch: create agent/{agentId}/{taskId|date} branch if in a git repo
    this.tryAutoBranch(sessionId, spawnCwd, agentId, session.taskId);

    // Wire up PTY data
    const MAX_OUTPUT_BUFFER = 1024 * 1024; // 1MB limit
    ptyProcess.onData((data: string) => {
      // Buffer output for waitForCompletion (with size limit)
      if (session.outputBuffer.length < MAX_OUTPUT_BUFFER) {
        session.outputBuffer += data;
        if (session.outputBuffer.length > MAX_OUTPUT_BUFFER) {
          session.outputBuffer = session.outputBuffer.slice(-MAX_OUTPUT_BUFFER);
        }
      }

      // Forward raw data to renderer for xterm.js display
      eventBus.emitPtyData({ ptyId, data });

      // Feed to event parser for JSON extraction (only in non-interactive mode)
      if (!interactive) {
        eventParser.feed(data);
      }

      // Interactive mode: parse token usage from Claude Code TUI status lines
      // Claude Code displays usage like: "12.3k tokens" or "(input: 800, output: 400)"
      if (interactive) {
        this.parseInteractiveTokenUsage(sessionId, data);

        // Reset idle timer — when PTY output stops for INTERACTIVE_IDLE_MS,
        // transition to waiting_input so delegation queue + report delivery trigger.
        if (session.status !== 'summarizing') {
          if (session.idleTimer) clearTimeout(session.idleTimer);
          // If we were idle and new output arrives, go back to running
          if (session.status === 'waiting_input') {
            this.updateStatus(sessionId, 'running');
          }
          session.idleTimer = setTimeout(() => {
            const s = this.sessions.get(sessionId);
            if (s && s.interactive && !['completed', 'failed', 'stopped', 'summarizing', 'waiting_input'].includes(s.status)) {
              this.updateStatus(sessionId, 'waiting_input');
            }
          }, INTERACTIVE_IDLE_MS);
        }
      }

      // Periodic checkpoint: disabled — auto-injected prompts interfere with agent workflow
      // if (
      //   session.interactive &&
      //   session.status !== 'summarizing' &&
      //   session.outputBuffer.length - session.lastCheckpointLen >= CHECKPOINT_THRESHOLD
      // ) {
      //   this.requestCheckpoint(sessionId);
      //   session.lastCheckpointLen = session.outputBuffer.length;
      // }

      // Auto-compact detection: save snapshot when Claude Code compacts context
      if (session.interactive && data.includes('ontext') && data.includes('compact')) {
        this.saveCompactSnapshot(sessionId);
      }
    });

    // Wire up parsed events (only useful in non-interactive / stream-json mode)
    if (!interactive) {
      eventParser.on('event', (parsed: ParsedEvent) => {
        this.handleParsedEvent(sessionId, parsed);
      });
    }

    // Wire up exit
    ptyProcess.onExit(({ exitCode }) => {
      logger.info(`Session ${sessionId} exited with code ${exitCode}`);
      if (!interactive) eventParser.flush();

      const finalStatus: SessionStatus = exitCode === 0 ? 'completed' : 'failed';
      this.finalizeSession(sessionId, finalStatus, exitCode !== 0 ? `Exit code: ${exitCode}` : null);
    });

    // Emit status change
    this.updateStatus(sessionId, interactive ? 'running' : 'starting');

    // In interactive mode, send initial task as first user message after Claude TUI is ready
    // Skip for resume — Claude Code --resume restores the full conversation automatically
    if (!isResume && interactive && params.task.trim()) {
      // Wait a moment for the TUI to initialize, then type the task
      setTimeout(() => {
        try {
          ptyWriteAndSubmit(ptyProcess, params.task.trim());
        } catch (err) {
          logger.warn('Failed to write initial task to PTY', err);
        }
      }, 2000);
    }

    // Capture Claude Code's conversation ID after TUI initialises.
    // We snapshot the conversations dir before spawn and detect the new file.
    this.captureClaudeConversationId(sessionId);

    return { sessionId, ptyId };
  }

  /**
   * Stop a running session.
   * When force=false (default), enters 'summarizing' state and asks Agent for a summary.
   * When force=true or already summarizing, kills immediately.
   */
  stop(sessionId: string, force = false): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Force stop: skip summary
    if (force || session.status === 'summarizing') {
      logger.info(`Force stopping session ${sessionId}`);
      if (session.summaryTimer) {
        clearInterval(session.summaryTimer);
        session.summaryTimer = null;
      }
      try { session.ptyProcess.kill(); } catch { /* ignore */ }
      this.finalizeSession(sessionId, 'stopped');
      return;
    }

    // Graceful stop: directly kill without requesting summary
    // (user can use /resume to review session history)
    logger.info(`Graceful stopping session ${sessionId}`);
    try { session.ptyProcess.kill(); } catch { /* ignore */ }
    this.finalizeSession(sessionId, 'stopped');
  }

  /**
   * Send input to PTY.
   */
  writeInput(ptyId: string, data: string): void {
    const session = this.findByPtyId(ptyId);
    if (session) {
      session.ptyProcess.write(data);
    }
  }

  /**
   * Assign a new task to an active session by injecting a message into its PTY.
   */
  assignTask(sessionId: string, taskId: string, taskTitle: string, taskDescription: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (['completed', 'failed', 'stopped'].includes(session.status)) {
      throw new Error(`Session ${sessionId} is not active (status: ${session.status})`);
    }

    // Update in-memory + DB
    session.taskId = taskId;
    database.run('UPDATE claude_sessions SET task_id = ? WHERE id = ?', [taskId, sessionId]);

    // Inject task instruction into PTY
    const message = [
      '',
      '---',
      `接下來請處理新任務：${taskTitle}`,
      '',
      taskDescription,
      '',
    ].join('\n');
    ptyWriteAndSubmit(session.ptyProcess, message);

    logger.info(`Task ${taskId} assigned to session ${sessionId}`);
    eventBus.emitSessionStatus({ sessionId, status: session.status, agentId: session.agentId });
  }

  /**
   * Send a delegation: inject instruction into target session and track for report delivery.
   */
  sendDelegation(params: SendDelegationParams): DelegationRequest {
    const source = this.sessions.get(params.sourceSessionId);
    const target = this.sessions.get(params.targetSessionId);
    if (!source) throw new Error(`Source session not found: ${params.sourceSessionId}`);
    if (!target) throw new Error(`Target session not found: ${params.targetSessionId}`);
    if (['completed', 'failed', 'stopped'].includes(target.status)) {
      throw new Error(`Target session ${params.targetSessionId} is not active`);
    }

    const delegation: DelegationRequest = {
      id: randomUUID(),
      sourceSessionId: params.sourceSessionId,
      targetSessionId: params.targetSessionId,
      instruction: params.instruction,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    };

    this.delegations.set(delegation.id, delegation);

    // Build formatted instruction message
    const sourceLabel = source.agentName || source.agentId;
    const message = [
      '',
      `--- [來自 ${sourceLabel} 的指派] ---`,
      '',
      params.instruction,
      '',
      '完成後請整理一份簡要報告說明你做了什麼。',
      '',
    ].join('\n');

    // Queue or send immediately depending on target's state
    if (target.interactive && target.status !== 'waiting_input') {
      // Target is busy — queue the message to send when it becomes idle
      target.pendingMessages.push(message);
      logger.info(
        `Delegation ${delegation.id}: ${source.agentId} → ${target.agentId} (queued, target busy) "${params.instruction.slice(0, 50)}"`,
      );
    } else {
      ptyWriteAndSubmit(target.ptyProcess, message);
      logger.info(
        `Delegation ${delegation.id}: ${source.agentId} → ${target.agentId} "${params.instruction.slice(0, 50)}"`,
      );
    }

    return delegation;
  }

  /**
   * Get all active delegations.
   */
  listDelegations(): DelegationRequest[] {
    return Array.from(this.delegations.values());
  }

  /**
   * Check and deliver delegation reports when a target session completes.
   * Called from finalizeSession / gracefulFinalize.
   */
  private deliverDelegationReports(completedSessionId: string): void {
    // Find delegations where the completed session is the target
    for (const [id, delegation] of this.delegations) {
      if (delegation.targetSessionId !== completedSessionId) continue;
      if (delegation.status === 'completed') continue;

      // Get result_summary from DB
      let report = '';
      try {
        const rows = database.prepare(
          'SELECT result_summary FROM claude_sessions WHERE id = ?',
          [completedSessionId],
        );
        report = rows[0]?.result_summary || '';
      } catch { /* ignore */ }

      // Fallback: use last portion of output buffer
      if (!report) {
        const target = this.sessions.get(completedSessionId);
        if (target && target.outputBuffer) {
          const raw = target.outputBuffer.slice(-2000);
          report = stripTerminalOutput(raw).slice(-500) || '(無摘要)';
        }
      }

      delegation.report = report;
      delegation.status = 'completed';

      // Inject report back into source session's PTY
      const source = this.sessions.get(delegation.sourceSessionId);
      if (source && !['completed', 'failed', 'stopped'].includes(source.status)) {
        const targetSession = this.sessions.get(completedSessionId);
        const targetLabel = targetSession?.agentName || targetSession?.agentId || completedSessionId.slice(0, 8);
        const reportMessage = [
          '',
          `--- [${targetLabel} 執行報告] ---`,
          '',
          report,
          '',
          '--- [報告結束] ---',
          '以上是指派任務的執行結果，請根據此結果繼續。',
          '',
        ].join('\n');
        ptyWriteAndSubmit(source.ptyProcess, reportMessage);
        logger.info(`Delegation ${id}: report delivered back to ${source.agentId}`);
      }

      // Notify renderer
      eventBus.emit('delegation:report', {
        delegationId: id,
        sourceSessionId: delegation.sourceSessionId,
        targetSessionId: completedSessionId,
        report,
      });
    }
  }

  /**
   * Resize PTY.
   */
  resizePty(ptyId: string, cols: number, rows: number): void {
    const session = this.findByPtyId(ptyId);
    if (session) {
      try {
        session.ptyProcess.resize(cols, rows);
      } catch (err) {
        logger.warn(`Failed to resize PTY ${ptyId}`, err);
      }
    }
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.sessions.values())
      .filter((s) => !['completed', 'failed', 'stopped'].includes(s.status))
      .map((s) => this.toActiveSession(s));
  }

  /**
   * Get session count (active).
   */
  getActiveCount(): number {
    return this.getActiveSessions().length;
  }

  /**
   * List all sessions (active + completed from DB).
   * Supports optional filtering by taskId or projectId.
   */
  listFromDb(filters?: { limit?: number; taskId?: string; projectId?: string }): any[] {
    const limit = filters?.limit ?? 50;
    try {
      let sql = `SELECT cs.*, t.title as task_title
       FROM claude_sessions cs
       LEFT JOIN tasks t ON cs.task_id = t.id
       WHERE 1=1`;
      const params: unknown[] = [];

      if (filters?.taskId) {
        sql += ' AND cs.task_id = ?';
        params.push(filters.taskId);
      }
      if (filters?.projectId) {
        sql += ' AND cs.project_id = ?';
        params.push(filters.projectId);
      }

      sql += ' ORDER BY cs.started_at DESC LIMIT ?';
      params.push(limit);

      return database.prepare(sql, params);
    } catch {
      return [];
    }
  }

  /**
   * Wait for a session to complete. Returns the accumulated output.
   */
  waitForCompletion(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error(`Session not found: ${sessionId}`));
    }

    // If already done
    if (['completed', 'failed', 'stopped'].includes(session.status)) {
      if (session.status === 'completed') {
        return Promise.resolve(session.outputBuffer);
      }
      return Promise.reject(new Error(`Session ended with status: ${session.status}`));
    }

    return new Promise((resolve, reject) => {
      session.completionCallbacks.push({ resolve, reject });
    });
  }

  /**
   * Cleanup all sessions on app exit.
   */
  cleanup(): void {
    for (const [sessionId, session] of this.sessions) {
      try {
        session.ptyProcess.kill();
      } catch { /* ignore */ }
      this.cleanupTmpFile(session);
    }
    this.sessions.clear();
    logger.info('All sessions cleaned up');
  }

  private handleParsedEvent(sessionId: string, parsed: ParsedEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Update statistics from event
    if (parsed.inputTokens) session.inputTokens += parsed.inputTokens;
    if (parsed.outputTokens) session.outputTokens += parsed.outputTokens;
    if (parsed.costUsd) session.costUsd += parsed.costUsd;
    if (parsed.type === 'tool_use') session.toolCallsCount++;

    // Infer status from event type
    let newStatus: SessionStatus | null = null;
    switch (parsed.type) {
      case 'assistant':
        newStatus = 'thinking';
        session.turnsCount++;
        break;
      case 'tool_use':
        newStatus = 'executing_tool';
        break;
      case 'result':
        // Final statistics from result event
        if (parsed.costUsd) session.costUsd = parsed.costUsd;
        if (parsed.inputTokens) session.inputTokens = parsed.inputTokens;
        if (parsed.outputTokens) session.outputTokens = parsed.outputTokens;
        if (parsed.durationMs) {
          // Will be set on finalize
        }
        break;
    }

    if (newStatus && newStatus !== session.status) {
      this.updateStatus(sessionId, newStatus);
    }

    // Emit session event
    const sessionEvent: SessionEvent = {
      sessionId,
      type: parsed.type,
      subtype: parsed.subtype,
      content: parsed.content,
      toolName: parsed.toolName,
      toolInput: parsed.toolInput,
      costUsd: session.costUsd,
      inputTokens: session.inputTokens,
      outputTokens: session.outputTokens,
      durationMs: Date.now() - new Date(session.startedAt).getTime(),
      timestamp: new Date().toISOString(),
    };

    eventBus.emitSessionEvent(sessionEvent);

    // Persist event to DB
    try {
      database.run(
        `INSERT INTO session_events (session_id, type, subtype, data, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          sessionId,
          parsed.type,
          parsed.subtype || null,
          parsed.content || parsed.toolName || '',
          sessionEvent.timestamp,
        ],
      );
    } catch (err) {
      logger.warn('Failed to insert session event', err);
    }
  }

  private updateStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;

    eventBus.emitSessionStatus({
      sessionId,
      status,
      agentId: session.agentId,
    });

    // Update DB
    try {
      database.run(
        `UPDATE claude_sessions SET status = ? WHERE id = ?`,
        [status, sessionId],
      );
    } catch (err) {
      logger.warn('Failed to update session status in DB', err);
    }

    // When a session returns to idle, flush queued messages
    if (status === 'waiting_input' || status === 'awaiting_approval') {
      this.flushPendingMessages(sessionId);
    }
    // Delegation reports should only be delivered when truly idle (not during gate review)
    if (status === 'waiting_input') {
      this.checkPendingDelegationReports(sessionId);
    }
  }

  /**
   * Send all queued messages to a session that has become idle.
   */
  /**
   * Trigger a session summary with rate limiting (min 5 min interval).
   * Returns the summary string, or null if the interval has not elapsed.
   */
  triggerSummary(sessionId: string): string | null {
    const last = this.lastSummaryAt.get(sessionId) || 0;
    if (Date.now() - last < this.MIN_SUMMARY_INTERVAL) {
      logger.info(`Summary skipped for ${sessionId}: too recent (${Date.now() - last}ms ago)`);
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    this.lastSummaryAt.set(sessionId, Date.now());

    // Collect recent output as summary, prefixed with role context for survival
    const raw = session.outputBuffer.slice(-5000);
    const outputSummary = stripTerminalOutput(raw).slice(-1200) || '(無輸出)';

    // Include role context in summary so it survives context compaction
    const agent = agentLoader.getById(session.agentId);
    const rolePrefix = agent
      ? `[角色: ${agent.name} (${agent.id}) | 部門: ${agent.department} | 層級: ${agent.level}]\n\n`
      : '';
    const summary = rolePrefix + outputSummary;


    return summary;
  }

  /**
   * Get historical summaries for a session.
   */
  getSessionSummaries(sessionId: string): Array<{ content: string; createdAt: string }> {
    try {
      const rows = database.prepare(
        `SELECT content, created_at FROM memory_blocks
         WHERE session_id = ? AND block_type = 'summary'
         ORDER BY created_at DESC LIMIT 20`,
        [sessionId],
      );
      return rows.map((r: any) => ({ content: r.content, createdAt: r.created_at }));
    } catch (err) {
      logger.warn('Failed to get session summaries', err);
      return [];
    }
  }

  private flushPendingMessages(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.pendingMessages.length === 0) return;

    const messages = session.pendingMessages.splice(0);
    const combined = messages.join('\n');
    logger.info(`Flushing ${messages.length} pending message(s) to session ${sessionId}`);
    ptyWriteAndSubmit(session.ptyProcess, combined);
  }

  /**
   * Check and deliver delegation reports when a target session returns to idle.
   * Unlike deliverDelegationReports (which runs on session exit), this triggers
   * when B finishes work and goes back to waiting state in interactive mode.
   */
  private checkPendingDelegationReports(sessionId: string): void {
    for (const [id, delegation] of this.delegations) {
      if (delegation.targetSessionId !== sessionId) continue;
      if (delegation.status === 'completed') continue;

      const target = this.sessions.get(sessionId);
      if (!target) continue;

      // Extract recent output as report
      let report = '';
      const raw = target.outputBuffer.slice(-3000);
      report = stripTerminalOutput(raw).slice(-800) || '(無摘要)';

      delegation.report = report;
      delegation.status = 'completed';

      // Inject report back into source session's PTY
      const source = this.sessions.get(delegation.sourceSessionId);
      if (source && !['completed', 'failed', 'stopped'].includes(source.status)) {
        const label = target.agentName || target.agentId;
        const msg = [
          '',
          `--- [${label} 執行報告] ---`,
          '',
          report,
          '',
          '--- [報告結束] ---',
          '以上是指派任務的執行結果，請根據此結果繼續。',
          '',
        ].join('\n');
        ptyWriteAndSubmit(source.ptyProcess, msg);
        logger.info(`Delegation ${id}: report delivered back to ${source.agentId} (idle trigger)`);
      }

      eventBus.emit('delegation:report', {
        delegationId: id,
        sourceSessionId: delegation.sourceSessionId,
        targetSessionId: sessionId,
        report,
      });
    }
  }

  private async tryAutoBranch(
    sessionId: string,
    cwd: string,
    agentId: string,
    taskId: string | null,
  ): Promise<void> {
    try {
      const status = await gitManager.getStatus(cwd);
      if (!status.isRepo) return;

      const suffix = taskId || new Date().toISOString().slice(0, 10);
      const branchName = `agent/${agentId}/${suffix}`;

      // Check if branch already exists
      const branches = await gitManager.getBranches(cwd);
      if (branches.all.includes(branchName)) {
        await gitManager.checkout(cwd, branchName);
        logger.info(`Session ${sessionId} checked out existing branch ${branchName}`);
      } else {
        await gitManager.createBranch(cwd, branchName, true);
        logger.info(`Session ${sessionId} created auto-branch ${branchName}`);
      }
    } catch (err) {
      logger.warn(`Session ${sessionId} auto-branch failed (non-fatal)`, err);
    }
  }

  private async tryAutoCommit(
    sessionId: string,
    cwd: string,
    agentId: string,
    taskSummary?: string,
  ): Promise<void> {
    try {
      const status = await gitManager.getStatus(cwd);
      if (!status.isRepo) return;

      const hasChanges = status.modified.length > 0 || status.untracked.length > 0 || status.staged.length > 0;
      if (!hasChanges) return;

      const summary = taskSummary ? taskSummary.slice(0, 72) : 'session completed';
      const message = `[Maestro] ${agentId}: ${summary}`;

      await gitManager.stage(cwd);
      const result = await gitManager.commit({ cwd, message });
      logger.info(`Session ${sessionId} auto-committed ${result.hash.slice(0, 7)}: ${result.filesChanged} files`);
    } catch (err) {
      logger.warn(`Session ${sessionId} auto-commit failed (non-fatal)`, err);
    }
  }

  private finalizeSession(
    sessionId: string,
    status: SessionStatus,
    error?: string | null,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Guard against double finalization (stop() + onExit both call this)
    if (['completed', 'failed', 'stopped'].includes(session.status)) return;

    // Clear timers
    if (session.summaryTimer) {
      clearInterval(session.summaryTimer);
      session.summaryTimer = null;
    }
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    session.status = status;
    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(session.startedAt).getTime();

    // Auto-commit changes if session completed successfully
    if (status === 'completed' && session.workDir) {
      this.tryAutoCommit(sessionId, session.workDir, session.agentId, session.task);
    }

    // 9B: Session completed → Task auto done
    if (status === 'completed' && session.taskId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { taskManager } = require('./task-manager') as {
          taskManager: { transition: (p: { taskId: string; toStatus: string }) => unknown };
        };
        taskManager.transition({ taskId: session.taskId, toStatus: 'done' });
        logger.info(`Task ${session.taskId} auto → done (session ${sessionId})`);
      } catch (err) {
        logger.warn('Auto-transition task to done failed (non-fatal)', err);
      }
    }

    // Update DB
    try {
      database.run(
        `UPDATE claude_sessions
         SET status = ?, ended_at = ?, duration_ms = ?,
             input_tokens = ?, output_tokens = ?, cost_usd = ?,
             tool_calls_count = ?, turns_count = ?,
             error_message = ?
         WHERE id = ?`,
        [
          status, endedAt, durationMs,
          session.inputTokens, session.outputTokens, session.costUsd,
          session.toolCallsCount, session.turnsCount,
          error || null,
          sessionId,
        ],
      );
    } catch (err) {
      logger.error('Failed to finalize session in DB', err);
    }

    // Save full output log to disk
    try {
      const logsDir = getSessionLogsDir();
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      writeFileSync(join(logsDir, `${sessionId}.log`), stripAnsiAndControl(session.outputBuffer), 'utf-8');
    } catch (err) {
      logger.warn('Failed to save session log', err);
    }

    // Deliver delegation reports if this session was a delegation target
    this.deliverDelegationReports(sessionId);

    // Emit status
    eventBus.emitSessionStatus({
      sessionId,
      status,
      agentId: session.agentId,
      error: error || undefined,
    });

    // Resolve completion callbacks
    for (const cb of session.completionCallbacks) {
      if (status === 'completed') {
        cb.resolve(session.outputBuffer);
      } else {
        cb.reject(new Error(`Session ended with status: ${status}${error ? ` - ${error}` : ''}`));
      }
    }
    session.completionCallbacks = [];

    // Cleanup temp file
    this.cleanupTmpFile(session);

    // Remove from active map after a short delay (let renderer process the event)
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5000);
  }

  private cleanupTmpFile(session: ManagedSession): void {
    if (session.tmpFile && existsSync(session.tmpFile)) {
      try {
        unlinkSync(session.tmpFile);
      } catch { /* ignore */ }
    }
  }

  /**
   * Finalize a graceful stop: extract summary from output, save to DB, then kill.
   */

  /**
   * Request a checkpoint from the agent (inject prompt to produce structured summary).
   */
  private requestCheckpoint(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'summarizing') return;

    const prompt = '請用繁體中文整理到目前為止的工作紀錄，用以下格式回覆：```ai-studio:memory {"type":"checkpoint","content":"1. 問題背景：… 2. 分析與決策：… 3. 已完成工作：… 4. 目前進度與下一步：…"} ```';

    try {
      ptyWriteAndSubmit(session.ptyProcess, prompt);
      logger.info(`Requested checkpoint for session ${sessionId}`);
    } catch {
      // PTY already closed, ignore
    }
  }

  /**
   * Save a snapshot of the output buffer when auto-compact is detected.
   */
  private saveCompactSnapshot(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const logsDir = getSessionLogsDir();
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      writeFileSync(
        join(logsDir, `${sessionId}.compact-${Date.now()}.log`),
        session.outputBuffer,
        'utf-8',
      );
      logger.info(`Saved compact snapshot for session ${sessionId}`);
    } catch (err) {
      logger.warn('Failed to save compact snapshot', err);
    }
  }

  /**
   * Parse token usage from Claude Code TUI output in interactive mode.
   * Claude Code displays usage info in its status line, e.g.:
   *   ">"  with token counts, or after each response showing total usage.
   * We look for patterns like "12.3k total tokens" or "input: 800 output: 400"
   * and accumulate the values on the session.
   */
  private parseInteractiveTokenUsage(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Pattern 1: Claude Code cost line — "$0.05 total cost" or "cost: $0.123"
    const costMatch = data.match(/\$(\d+\.?\d*)\s*(?:total\s*)?cost/i);
    if (costMatch) {
      const cost = parseFloat(costMatch[1]);
      if (cost > session.costUsd) {
        session.costUsd = cost;
      }
    }

    // Pattern 2: Token count from Claude Code status — e.g. "12.3k tokens"
    // Claude Code shows cumulative totals; we take the latest (largest) value.
    const tokenMatches = data.matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?\s*total\s*tokens/gi);
    for (const m of tokenMatches) {
      let count = parseFloat(m[1]);
      const unit = (m[2] || '').toLowerCase();
      if (unit === 'k') count *= 1000;
      else if (unit === 'm') count *= 1000000;
      const total = Math.round(count);
      // Assume roughly 30/70 input/output split if we only get total
      if (total > session.inputTokens + session.outputTokens) {
        session.inputTokens = Math.round(total * 0.3);
        session.outputTokens = total - session.inputTokens;
      }
    }

    // Pattern 3: Explicit input/output breakdown — "input: 1234 output: 5678"
    const ioMatch = data.match(/input[:\s]+(\d+(?:\.\d+)?k?)[\s,]*output[:\s]+(\d+(?:\.\d+)?k?)/i);
    if (ioMatch) {
      const parseTokenCount = (s: string): number => {
        const lower = s.toLowerCase();
        if (lower.endsWith('k')) return parseFloat(lower) * 1000;
        return parseInt(lower, 10);
      };
      const inp = parseTokenCount(ioMatch[1]);
      const out = parseTokenCount(ioMatch[2]);
      if (inp > session.inputTokens) session.inputTokens = Math.round(inp);
      if (out > session.outputTokens) session.outputTokens = Math.round(out);
    }
  }

  /**
   * Detect the Claude Code conversation ID created by a spawned session.
   * We poll the Claude conversations directory for a new .jsonl file and
   * read its first user message to match by sessionId/cwd.
   */
  private captureClaudeConversationId(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const cwd = session?.workDir || process.cwd();
    const convDir = getClaudeConversationsDir(cwd);

    // Snapshot existing files before Claude Code creates a new one
    let existingFiles: Set<string>;
    try {
      existingFiles = new Set(
        existsSync(convDir)
          ? readdirSync(convDir).filter((f) => f.endsWith('.jsonl'))
          : [],
      );
    } catch {
      existingFiles = new Set();
    }

    // Poll for new file (check every 2s for up to 30s)
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (attempts > 15 || !this.sessions.has(sessionId)) {
        clearInterval(timer);
        return;
      }

      try {
        if (!existsSync(convDir)) return;
        const currentFiles = readdirSync(convDir).filter((f) => f.endsWith('.jsonl'));
        const newFiles = currentFiles.filter((f) => !existingFiles.has(f));

        if (newFiles.length === 0) return;

        // Pick the most recently modified new file
        let best: { file: string; mtime: number } | null = null;
        for (const f of newFiles) {
          try {
            const st = statSync(join(convDir, f));
            if (!best || st.mtimeMs > best.mtime) {
              best = { file: f, mtime: st.mtimeMs };
            }
          } catch { /* skip */ }
        }

        if (best) {
          const convId = best.file.replace('.jsonl', '');
          try {
            database.run(
              'UPDATE claude_sessions SET claude_conversation_id = ? WHERE id = ?',
              [convId, sessionId],
            );
            logger.info(`Captured Claude conversation ID ${convId} for session ${sessionId}`);
          } catch (err) {
            logger.warn('Failed to save claude_conversation_id', err);
          }
          clearInterval(timer);
        }
      } catch (err) {
        logger.warn('Error during conversation ID capture', err);
      }
    }, 2000);
  }

  /**
   * Get the output buffer for a PTY (used for terminal replay on remount).
   */
  getOutputBuffer(ptyId: string): string {
    const session = this.findByPtyId(ptyId);
    return session?.outputBuffer || '';
  }

  /**
   * Get the saved log file for a historical session.
   */
  getSessionLog(sessionId: string): string {
    try {
      const logPath = join(getSessionLogsDir(), `${sessionId}.log`);
      if (existsSync(logPath)) {
        return stripAnsiAndControl(readFileSync(logPath, 'utf-8'));
      }
    } catch (err) {
      logger.warn(`Failed to read session log for ${sessionId}`, err);
    }
    return '';
  }

  private findByPtyId(ptyId: string): ManagedSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.ptyId === ptyId) return session;
    }
    return undefined;
  }

  private toActiveSession(s: ManagedSession): ActiveSession {
    return {
      sessionId: s.sessionId,
      agentId: s.agentId,
      agentName: s.agentName,
      task: s.task,
      taskId: s.taskId,
      projectId: s.projectId,
      model: s.model,
      status: s.status,
      costUsd: s.costUsd,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      toolCallsCount: s.toolCallsCount,
      turnsCount: s.turnsCount,
      durationMs: Date.now() - new Date(s.startedAt).getTime(),
      startedAt: s.startedAt,
      ptyId: s.ptyId,
    };
  }

  /**
   * Scan all registered project work directories for resumable Claude Code conversations.
   * Returns conversations sorted by last modified time (most recent first).
   */
  scanResumableSessions(limit = 50): ResumableSession[] {
    const results: ResumableSession[] = [];

    // Collect work directories: AgentHub itself + all projects with work_dir
    const dirs: { path: string; name: string }[] = [
      { path: process.cwd(), name: 'AgentHub' },
    ];

    try {
      const projects = database.prepare(
        "SELECT id, name, work_dir FROM projects WHERE work_dir IS NOT NULL AND work_dir != ''",
      );
      for (const p of projects) {
        if (p.work_dir) {
          dirs.push({ path: p.work_dir, name: p.name || p.id });
        }
      }
    } catch {
      // DB may not be ready
    }

    for (const dir of dirs) {
      const convDir = getClaudeConversationsDir(dir.path);
      if (!existsSync(convDir)) continue;

      let files: string[];
      try {
        files = readdirSync(convDir).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = join(convDir, file);
        try {
          const stat = statSync(filePath);
          const conversationId = file.replace('.jsonl', '');

          // Read first few lines to extract first user message
          const firstMessage = this.extractFirstUserMessage(filePath);

          results.push({
            conversationId,
            projectPath: dir.path,
            projectName: dir.name,
            firstMessage: firstMessage || '(no message)',
            lastModified: stat.mtime.toISOString(),
            fileSize: stat.size,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }

    // Sort by lastModified descending, take limit
    results.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    return results.slice(0, limit);
  }

  /**
   * Read the first user message from a Claude Code conversation .jsonl file.
   * Each line is a JSON object. We look for the first line with type 'human' or role 'user'.
   */
  private extractFirstUserMessage(filePath: string): string | null {
    try {
      const fd = openSync(filePath, 'r');
      const buf = Buffer.alloc(4096); // Read first 4KB — enough for first message
      const bytesRead = readSync(fd, buf, 0, 4096, 0);
      closeSync(fd);

      const text = buf.toString('utf-8', 0, bytesRead);
      const lines = text.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          // Claude Code format: type 'human' with message content
          if (obj.type === 'human' && obj.message) {
            const content = typeof obj.message === 'string'
              ? obj.message
              : Array.isArray(obj.message)
                ? obj.message.find((m: { type: string; text?: string }) => m.type === 'text')?.text || ''
                : '';
            return content.slice(0, 200); // Truncate to 200 chars
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File read error
    }
    return null;
  }

}

export const sessionManager = new SessionManager();
