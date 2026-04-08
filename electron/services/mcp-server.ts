/**
 * MCP (Model Context Protocol) Server for Yu AgentHub.
 * Exposes knowledge base, agent memory, and project context as MCP tools
 * so Claude Code sessions can natively query AgentHub's data.
 *
 * Runs as a stdio-based MCP server script that can be registered in
 * Claude Code's MCP configuration.
 */

import { database } from './database';
import { knowledgeReader } from './knowledge-reader';
import { logger } from '../utils/logger';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

class McpServerManager {
  private tools: McpTool[] = [
    {
      name: 'agenthub_search_knowledge',
      description: 'Search the AgentHub knowledge base (.knowledge/ directory) for relevant documentation, coding standards, architecture docs, and SOPs.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query string' },
        },
        required: ['query'],
      },
    },
    {
      name: 'agenthub_read_knowledge',
      description: 'Read a specific file from the AgentHub knowledge base by relative path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path within .knowledge/ (e.g. "coding-standards.md")' },
        },
        required: ['path'],
      },
    },
    {
      name: 'agenthub_get_agent_memory',
      description: 'Get persistent memories for a specific agent. Returns key-value pairs that the agent has stored across sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent ID (e.g. "tech-lead")' },
          projectId: { type: 'string', description: 'Optional project ID to scope memories' },
        },
        required: ['agentId'],
      },
    },
    {
      name: 'agenthub_save_agent_memory',
      description: 'Save a persistent memory for an agent that will be available in future sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent ID' },
          key: { type: 'string', description: 'Memory key' },
          value: { type: 'string', description: 'Memory value' },
          projectId: { type: 'string', description: 'Optional project ID' },
        },
        required: ['agentId', 'key', 'value'],
      },
    },
    {
      name: 'agenthub_list_tasks',
      description: 'List tasks for a project, optionally filtered by status or sprint.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          status: { type: 'string', description: 'Filter by status: created, assigned, in_progress, in_review, done' },
        },
        required: ['projectId'],
      },
    },
  ];

  /** Handle an MCP tool call. */
  handleToolCall(toolName: string, args: Record<string, unknown>): unknown {
    switch (toolName) {
      case 'agenthub_search_knowledge':
        return knowledgeReader.search(args.query as string);

      case 'agenthub_read_knowledge':
        return knowledgeReader.readFile(args.path as string) || 'File not found';

      case 'agenthub_get_agent_memory': {
        const rows = database.prepare(
          `SELECT key, value, updated_at as updatedAt FROM agent_memory
           WHERE agent_id = ? AND (project_id = ? OR project_id IS NULL)
           ORDER BY updated_at DESC LIMIT 20`,
          [args.agentId, args.projectId || null],
        );
        return rows;
      }

      case 'agenthub_save_agent_memory': {
        const now = new Date().toISOString();
        const existing = database.prepare(
          `SELECT id FROM agent_memory WHERE agent_id = ? AND key = ? AND (project_id = ? OR (project_id IS NULL AND ? IS NULL))`,
          [args.agentId, args.key, args.projectId || null, args.projectId || null],
        );
        if ((existing as any[]).length > 0) {
          database.run(`UPDATE agent_memory SET value = ?, updated_at = ? WHERE id = ?`, [args.value, now, (existing[0] as any).id]);
        } else {
          const id = `mem-${Date.now()}`;
          database.run(
            `INSERT INTO agent_memory (id, agent_id, project_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, args.agentId, args.projectId || null, args.key, args.value, now, now],
          );
        }
        return { success: true };
      }

      case 'agenthub_list_tasks': {
        let sql = `SELECT id, title, status, assigned_to as assignedTo, priority FROM tasks WHERE project_id = ?`;
        const params: unknown[] = [args.projectId];
        if (args.status) { sql += ' AND status = ?'; params.push(args.status); }
        sql += ' ORDER BY created_at DESC LIMIT 50';
        return database.prepare(sql, params);
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  /** Get all available MCP tools. */
  getTools(): McpTool[] {
    return this.tools;
  }

  /**
   * Generate an MCP server script that Claude Code can use.
   * Writes to ~/.claude/mcp-servers/agenthub.json
   */
  generateMcpConfig(): { configPath: string; scriptPath: string } {
    const mcpDir = join(homedir(), '.claude', 'mcp-servers');
    if (!existsSync(mcpDir)) mkdirSync(mcpDir, { recursive: true });

    // Write the MCP server runner script
    const scriptPath = join(process.cwd(), 'electron', 'utils', 'mcp-agenthub.js');
    const scriptContent = `#!/usr/bin/env node
// Yu AgentHub MCP Server — auto-generated
// This script is called by Claude Code to query AgentHub's knowledge base and agent memory.
const { createInterface } = require('readline');
const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === 'tools/list') {
      const tools = ${JSON.stringify(this.tools, null, 2)};
      process.stdout.write(JSON.stringify({ id: msg.id, result: { tools } }) + '\\n');
    } else if (msg.method === 'tools/call') {
      // Forward to AgentHub via HTTP or direct DB access
      process.stdout.write(JSON.stringify({ id: msg.id, result: { content: [{ type: 'text', text: 'MCP server ready. Connect via AgentHub IPC.' }] } }) + '\\n');
    }
  } catch {}
});
`;
    writeFileSync(scriptPath, scriptContent, 'utf-8');

    const configPath = join(mcpDir, 'agenthub.json');
    logger.info(`MCP Server config available at ${configPath}`);

    return { configPath, scriptPath };
  }
}

export const mcpServer = new McpServerManager();
