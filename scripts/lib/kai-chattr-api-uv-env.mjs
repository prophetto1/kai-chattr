import os from 'node:os';
import path from 'node:path';

export const KAI_CHATTR_API_UV_ENV_NAME = 'kai-chattr-services-api';

/** uv project environment path for services/api (no repo-local .venv). */
export function kaiChattrApiUvEnvironmentPath() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'uv', 'envs', KAI_CHATTR_API_UV_ENV_NAME);
  }

  return path.join(os.homedir(), '.local', 'share', 'uv', 'envs', KAI_CHATTR_API_UV_ENV_NAME);
}
