/**
 * Runs `fn` for its side effects (email, in-app notification) and swallows any error it
 * throws, logging instead. Call this AFTER a `prisma.$transaction(...)` (or any write) has
 * already resolved — never from inside one.
 *
 * The reason this exists: a notification INSERT or an email send can fail for reasons that
 * have nothing to do with whether the real state change (payment approved, booking confirmed)
 * was valid. If either were awaited *inside* the transaction and threw, Prisma would roll the
 * whole transaction back — undoing a payment approval because a Notification write hiccuped.
 * By running here, after commit, the worst case is a missed notification/email, never a
 * reverted business transaction.
 */
async function afterCommit(fn, { label = 'post-commit side effect' } = {}) {
  try {
    await fn();
  } catch (err) {
    console.error(`[afterCommit] ${label} failed:`, err);
  }
}

module.exports = afterCommit;
