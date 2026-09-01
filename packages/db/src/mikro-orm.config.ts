/**
 * Entry point the MikroORM CLI loads (see the `mikro-orm.configPaths` field in this
 * package's package.json). Loads `.env` from the repo root so CLI runs pick up local
 * credentials, then hands back the shared config.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv({ path: resolve(repoRoot, '.env') });

const { createOrmConfig } = await import('./config');

export default createOrmConfig();
