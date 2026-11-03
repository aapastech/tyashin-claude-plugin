#!/usr/bin/env node
// Tyashin website MCP server — stdio, JSON-RPC 2.0, zero dependencies.
//
// Runs on the user's own computer, started by their Claude client. It talks
// only to the public Tyashin API (TYASHIN_API_URL, default
// https://website-api.tyashin.com) with the user's own access token, obtained
// through the device sign-in flow. Logs go to stderr; stdout is protocol only.

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { apiBaseFrom, ApiError, createApi } from './api.mjs';
import { loadToken } from './credentials.mjs';
import { createTools } from './tools.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, '..', '.claude-plugin', 'plugin.json'), 'utf8'));
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * Check a tool call's arguments against the tool's inputSchema (top level:
 * required names and basic types), so a wrong argument name gets a clear
 * message instead of a raw Node error from deep inside the tool.
 * @returns {string|null} the problem, or null when the arguments are usable
 */
export function validateArgs(tool, args) {
  const schema = tool.inputSchema ?? {};
  const props = schema.properties ?? {};
  if (typeOf(args) !== 'object') return `${tool.name}: arguments must be an object`;
  const problems = [];
  const missing = (schema.required ?? []).filter((k) => args[k] === undefined || args[k] === null);
  if (missing.length) {
    const unknown = Object.keys(args).filter((k) => !(k in props));
    problems.push(
      `missing required argument${missing.length > 1 ? 's' : ''} ${missing.map((k) => `"${k}"`).join(', ')}` +
        (unknown.length ? ` (got unknown ${unknown.map((k) => `"${k}"`).join(', ')} — check the argument names)` : '')
    );
  }
  for (const [k, v] of Object.entries(args)) {
    const want = props[k]?.type;
    if (!want || v === undefined) continue;
    const got = typeOf(v);
    const ok = want === 'number' ? got === 'number' && Number.isFinite(v) : got === want;
    if (!ok) problems.push(`"${k}" must be ${want === 'array' || want === 'object' ? 'an' : 'a'} ${want}, got ${got}`);
  }
  if (!problems.length) return null;
  return `${tool.name}: ${problems.join('; ')}. Expected arguments: ${Object.keys(props).map((k) => ((schema.required ?? []).includes(k) ? `${k} (required)` : k)).join(', ') || 'none'}.`;
}

export function createServer({ env = process.env, fetchImpl, sleep, now, opener } = {}) {
  const apiBase = apiBaseFrom(env);
  const api = createApi({
    base: apiBase,
    fetchImpl,
    userAgent: `tyashin-claude-plugin/${pkg.version}`,
    getToken: async () => (await loadToken(apiBase, env))?.token ?? null,
  });
  const tools = createTools({ api, apiBase, env, sleep, now, ...(opener ? { opener } : {}) });
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function handle(msg) {
    const { id, method, params } = msg;
    const reply = (result) => ({ jsonrpc: '2.0', id, result });
    const error = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        return reply({
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'tyashin', version: pkg.version },
          instructions:
            "Build and publish the user's website on Tyashin (free plan). Follow the build-tyashin-website skill: intake interview first, never invent facts, check the spec, get the user's yes before publishing.",
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({
          tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
        });
      case 'tools/call': {
        const tool = byName.get(params?.name);
        if (!tool) return error(-32602, `Unknown tool: ${params?.name}`);
        const args = params.arguments ?? {};
        const invalid = validateArgs(tool, args);
        if (invalid)
          return reply({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: invalid, code: 'INVALID_ARGUMENTS' }, null, 2) }] });
        try {
          return reply(await tool.run(args));
        } catch (err) {
          const detail =
            err instanceof ApiError
              ? { error: err.message, code: err.code, status: err.status, ...(err.data && typeof err.data === 'object' ? { data: err.data } : {}) }
              : { error: err.message };
          return reply({ isError: true, content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }] });
        }
      }
      default:
        if (id === undefined) return null; // notification (e.g. notifications/initialized)
        return error(-32601, `Method not found: ${method}`);
    }
  }
  return { handle, tools, apiBase };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let server;
  try {
    server = createServer();
  } catch (err) {
    process.stderr.write(`[tyashin] ${err.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`[tyashin] MCP server ${pkg.version} → ${server.apiBase}\n`);
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    const out = await server.handle(msg);
    if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
  });
}
