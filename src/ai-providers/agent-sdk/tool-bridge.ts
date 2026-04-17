/**
 * Tool bridge — converts ToolCenter's Vercel AI SDK tools to an Agent SDK MCP server.
 *
 * Uses shared MCP export utilities from `core/mcp-export.ts` for schema extraction
 * (with number coercion) and execute wrapping.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import type { Tool } from 'ai'
import { extractMcpShape, wrapToolExecute } from '../../core/mcp-export.js'

/**
 * Build an Agent SDK MCP server from a Vercel AI SDK tool map.
 *
 * @param tools  Record<name, Tool> from ToolCenter.getVercelTools()
 * @param disabledTools  Optional list of tool names to exclude
 * @returns McpSdkServerConfigWithInstance ready for `query({ options: { mcpServers } })`
 */
export function buildAgentSdkMcpServer(
  tools: Record<string, Tool>,
  disabledTools?: string[],
) {
  const disabledSet = new Set(disabledTools ?? [])

  const sdkTools = Object.entries(tools)
    .filter(([name, t]) => t.execute && !disabledSet.has(name))
    .map(([name, t]) => {
      return tool(name, t.description ?? name, extractMcpShape(t), wrapToolExecute(t))
    })

  return createSdkMcpServer({ name: 'open-alice', tools: sdkTools })
}
