import { createOrmConfig } from './lib/db/config'

// Entry point for the MikroORM CLI (`npm run db:migration:create`).
// Evaluated only when the CLI runs, so DATABASE_URL is required at that point.
export default createOrmConfig()
