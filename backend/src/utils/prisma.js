const { AsyncLocalStorage } = require('node:async_hooks');

const { PrismaClient, Prisma } = require('@prisma/client');

// Single shared client for the whole process. Re-instantiating PrismaClient per
// request exhausts the Postgres connection pool.
const base = new PrismaClient({
  /**
   * Interactive transaction budget.
   *
   * Prisma's default is 5 seconds, which assumes the database is next to the application. This one
   * is not: the Neon branch is in us-east-2 while the service runs in ap-south-1, so every round
   * trip inside a transaction costs a couple of hundred milliseconds before the query does any work.
   *
   * Quote creation is the case that breaks. It writes the quote and captures its snapshot in one
   * transaction — deliberately, because a quote without a frozen copy of what it promised is the
   * bug Phase 1 existed to fix — and the snapshot alone makes several round trips with deep
   * includes. Measured against this database it lands between four and six seconds, so the default
   * fails intermittently with "Transaction already closed", an error that names the symptom and
   * none of the cause.
   *
   * 20s is generous rather than tuned: this bounds a pathological case, it is not a target. Work
   * that legitimately needs longer belongs outside a transaction, not behind a bigger number.
   */
  transactionOptions: {
    timeout: 20_000,
    // How long to wait for a free connection before starting. Raised for the same reason: a cold
    // pool on a cross-region link should queue rather than fail.
    maxWait: 10_000,
  },
});

/**
 * Retries queries that failed because the database was asleep.
 *
 * WHY THIS EXISTS
 * Neon suspends a branch's compute after a few minutes of inactivity. The next query has to wait
 * for it to boot, and what the driver sees in the meantime is a connection that will not complete —
 * reported as P1001 "Can't reach database server", which reads exactly like an outage. It is not:
 * the host is fine and the same query works a second later.
 *
 * Raising `connect_timeout` in the URL helps but does not fix it, because the failure is not always
 * a timeout — a suspended compute can refuse or drop the connection outright while it starts.
 *
 * The symptom in practice: the first person to use the app after a quiet spell gets a 500, and by
 * the time anyone investigates it works. On ECS this hits every idle period, so it is a production
 * problem and not just a local annoyance.
 *
 * WHAT IS SAFE TO RETRY
 * Only errors that mean "the query never reached the database":
 *   P1001  cannot reach the server
 *   P1002  the server was reached but timed out
 *   P1017  the server closed the connection
 * A query that never arrived cannot have had an effect, so re-running it cannot double-write. Every
 * other error — a constraint violation, a bad argument — is a real answer and is thrown at once.
 *
 * INSIDE A TRANSACTION, NOTHING IS RETRIED. This is not a nicety — retrying there actively breaks
 * things, and it did:
 *
 *   Prisma gives an interactive transaction a fixed budget (5s by default) from the moment it opens.
 *   A retry that waits 250ms and then 750ms spends a fifth of that budget before the statement even
 *   runs again, and once the budget is gone the transaction is closed on the server. Every
 *   subsequent statement then fails with P2028 "Transaction not found" — an error that points at
 *   nothing useful and looks nothing like the timeout it actually is.
 *
 *   The transaction as a whole is retried instead (see the $transaction wrapper below), which is
 *   both correct and safe: a transaction either committed or it rolled back, so there is no half
 *   state to re-run into.
 */

// Marks the async context of an open interactive transaction, so per-query retry can stand down.
const transactionContext = new AsyncLocalStorage();

const RETRYABLE = new Set(['P1001', 'P1002', 'P1017']);

// Three attempts over roughly two seconds. Enough for a Neon compute to accept connections, short
// enough that a genuine outage still fails fast rather than holding a request open.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [250, 750];

function isRetryable(error) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;

  return error?.code !== undefined && RETRYABLE.has(error.code);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const prisma = base.$extends({
  name: 'retry-on-cold-start',
  query: {
    $allModels: {
      async $allOperations({ args, query, model, operation }) {
        // Inside a transaction the retry belongs to the transaction, not to the statement. Waiting
        // here would burn the transaction's own time budget and close it mid-flight.
        if (transactionContext.getStore()) return query(args);

        let lastError;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          try {
            return await query(args);
          } catch (error) {
            if (!isRetryable(error)) throw error;

            lastError = error;

            if (attempt < MAX_ATTEMPTS - 1) {
              // Logged, not silent. A cold start that happens once an hour is normal; one that
              // happens on every request means something else is wrong, and the only way to tell
              // the two apart is to be able to count them.
              console.warn(
                `[prisma] ${model}.${operation} — database asleep or unreachable ` +
                  `(${error.code ?? 'init'}), retrying in ${BACKOFF_MS[attempt]}ms ` +
                  `(attempt ${attempt + 2}/${MAX_ATTEMPTS})`
              );
              await sleep(BACKOFF_MS[attempt]);
            }
          }
        }

        console.error(
          `[prisma] ${model}.${operation} failed after ${MAX_ATTEMPTS} attempts — the database is ` +
            'genuinely unreachable, not merely idle.'
        );

        throw lastError;
      },
    },
  },
});

/**
 * Retries a whole transaction that never reached the database.
 *
 * Safe in a way that retrying a single statement inside one is not: a transaction either committed
 * or it rolled back, so re-running it cannot land on top of a half-applied earlier attempt. That is
 * the same reasoning behind the standard serialization-failure retry.
 *
 * `isRetryable` is doing the important work here. It matches connection-level failures only, so a
 * transaction that got as far as violating a constraint — or one that timed out with P2028 — is
 * thrown straight through rather than replayed.
 *
 * The callback must contain no side effects outside the database, since a retry runs it twice.
 * Everything in this codebase that opens a transaction only touches Prisma.
 */
// Captured from the EXTENDED client, before the property below replaces it. Going through the
// extended client keeps every extension applied inside transactions too — the retry stands down in
// there because of the AsyncLocalStorage guard, not because the extension is bypassed. Binding the
// base client instead would work today, when retry is the only extension, and quietly skip the next
// one somebody adds.
const runTransaction = prisma.$transaction.bind(prisma);

Object.defineProperty(prisma, '$transaction', {
  configurable: true,
  writable: true,
  value: async function transactionWithRetry(...callArgs) {
    let lastError;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        // The flag has to cover the callback's whole async life, which is exactly what
        // AsyncLocalStorage tracks and a plain boolean would not under concurrent requests.
        return await transactionContext.run(true, () => runTransaction(...callArgs));
      } catch (error) {
        if (!isRetryable(error)) throw error;

        lastError = error;

        if (attempt < MAX_ATTEMPTS - 1) {
          console.warn(
            `[prisma] transaction could not reach the database (${error.code ?? 'init'}), ` +
              `retrying in ${BACKOFF_MS[attempt]}ms (attempt ${attempt + 2}/${MAX_ATTEMPTS})`
          );
          await sleep(BACKOFF_MS[attempt]);
        }
      }
    }

    console.error(`[prisma] transaction failed after ${MAX_ATTEMPTS} attempts.`);

    throw lastError;
  },
});

/**
 * Wakes the database at boot.
 *
 * Costs one query at startup and means the FIRST real request does not pay the cold start. On ECS
 * this runs while the task is still out of the load balancer's rotation, so the wait is invisible.
 * Failure is logged and ignored: the retry wrapper above will handle it on the first query, and a
 * server that refuses to boot because the database is briefly asleep is worse than one that starts.
 */
async function warmUp() {
  try {
    await base.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.warn('[prisma] warm-up query failed; the first request will retry:', error.code ?? error.message);
    return false;
  }
}

module.exports = prisma;
module.exports.warmUp = warmUp;
module.exports.isRetryable = isRetryable;
