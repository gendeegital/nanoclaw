import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Parse the .env file and return values for the requested keys.
 * Does NOT load anything into process.env — callers decide what to
 * do with the values. This keeps secrets out of the process environment
 * so they don't leak to child processes.
 */
export function readEnvFile(keys: string[]): Record<string, string> {
  const envFile = path.join(process.cwd(), '.env');
  let content: string;
  try {
    content = fs.readFileSync(envFile, 'utf-8');
  } catch (err) {
    logger.debug({ err }, '.env file not found, using defaults');
    return {};
  }

  const result: Record<string, string> = {};
  const wanted = new Set(keys);

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!wanted.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }

  return result;
}

const LLM_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
] as const;

/**
 * Read LLM-related env from .claude/settings.json and .claude/settings.local.json.
 * Merges env objects (local overrides project). Returns only allowed keys with string values.
 * Used so OpenRouter and other project-level LLM config propagate into containers.
 */
export function readClaudeSettingsEnv(): Record<string, string> {
  const root = process.cwd();
  const result: Record<string, string> = {};
  const allowed = new Set<string>(LLM_ENV_KEYS);

  for (const name of ['settings.json', 'settings.local.json']) {
    const filePath = path.join(root, '.claude', name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    let data: { env?: Record<string, unknown> };
    try {
      data = JSON.parse(content);
    } catch (err) {
      logger.debug({ err, file: filePath }, 'Invalid JSON in Claude settings');
      continue;
    }
    const env = data.env;
    if (env == null || typeof env !== 'object' || Array.isArray(env)) continue;
    for (const [key, value] of Object.entries(env)) {
      if (allowed.has(key) && typeof value === 'string') result[key] = value;
    }
  }

  return result;
}
