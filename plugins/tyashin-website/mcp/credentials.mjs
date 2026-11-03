// Where the user's Tyashin access token lives on THEIR machine.
//
// - TYASHIN_TOKEN (env) wins, for CI or people who manage secrets themselves.
// - Otherwise ~/.config/tyashin/credentials.json (or $TYASHIN_CONFIG_DIR),
//   written with mode 0600 inside a 0700 directory.
// - The token is never returned to the model, logged, or written anywhere else.
//   Tools report "signed in as <email>", never the token itself.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function configDir(env = process.env) {
  if (env.TYASHIN_CONFIG_DIR) return env.TYASHIN_CONFIG_DIR;
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'tyashin');
}

function credentialsFile(env) {
  return path.join(configDir(env), 'credentials.json');
}

/** Credentials are keyed by API base URL so a test environment never borrows a production token. */
export async function loadToken(apiBase, env = process.env) {
  if (env.TYASHIN_TOKEN) return { token: env.TYASHIN_TOKEN, source: 'env' };
  try {
    const raw = JSON.parse(await fs.readFile(credentialsFile(env), 'utf8'));
    const entry = raw?.[apiBase];
    if (entry?.token) return { token: entry.token, source: 'file', savedAt: entry.savedAt };
  } catch {
    /* no file yet */
  }
  return null;
}

export async function saveToken(apiBase, token, env = process.env) {
  const dir = configDir(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = credentialsFile(env);
  let all = {};
  try {
    all = JSON.parse(await fs.readFile(file, 'utf8')) || {};
  } catch {
    /* fresh */
  }
  all[apiBase] = { token, savedAt: new Date().toISOString() };
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
  await fs.chmod(file, 0o600).catch(() => undefined);
}

export async function clearToken(apiBase, env = process.env) {
  const file = credentialsFile(env);
  try {
    const all = JSON.parse(await fs.readFile(file, 'utf8')) || {};
    delete all[apiBase];
    await fs.writeFile(file, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  } catch {
    /* nothing stored */
  }
}
