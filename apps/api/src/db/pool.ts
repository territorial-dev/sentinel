import pg from 'pg'
import { DATABASE_URL } from '../config.js'
import { logger } from '../logger.js'

/**
 * Timeouts so no query, connect or transaction can wait forever. Without them one stuck call
 * (a connect waiting on a starved DNS lookup, a lock, a dead socket) holds the result flush, and
 * every later flush joins it: results pile up in memory and the oldest are dropped, with no error
 * ever logged. A timed-out call errors instead; the flush treats that as transient and requeues.
 * The daily aggregation and the batched prunes finish well inside STATEMENT_TIMEOUT_MS.
 */
export const CONNECT_TIMEOUT_MS = 10_000
export const STATEMENT_TIMEOUT_MS = 60_000
/** Client-side bound, past the server's, for a socket that stopped answering altogether. */
export const QUERY_TIMEOUT_MS = 75_000

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  idle_in_transaction_session_timeout: STATEMENT_TIMEOUT_MS,
  query_timeout: QUERY_TIMEOUT_MS,
  keepAlive: true,
})

// An idle client whose connection drops (database restart, network cut) emits 'error' on the
// pool; unhandled, that would crash the process. The pool discards the client and reconnects.
pool.on('error', (err) => {
  logger.error({ event: 'db.pool_client_error', err }, `db: idle client error: ${err.message}`)
})
