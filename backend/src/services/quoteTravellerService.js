const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * The named people travelling on a quote.
 *
 * Separate from Quote.adults/children/infants on purpose: those are the counts the trip was PRICED
 * on and must not move once money is in flight, while these are names collected later, often after
 * payment, as the customer confirms who is actually going. Editing a name never touches the price.
 *
 * Replace-in-place rather than the archive-and-replace pattern used for passengers: a traveller row
 * carries no uploads or snapshots hanging off it, so there is no history to preserve, and archiving
 * would leave the voucher having to filter rows nobody wants.
 */

/** Tenancy + existence in one place; a partner may only touch their own trips. */
async function loadQuoteForUser(quoteId, user) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, partnerId: true, adults: true, children: true, infants: true },
  });

  if (!quote) throw ApiError.notFound(`No quote exists with id ${quoteId}`);

  if (user.role === 'partner' && quote.partnerId !== user.id) {
    // 404 rather than 403: whether a quote exists is itself information a partner should not get
    // about another agency's trips.
    throw ApiError.notFound(`No quote exists with id ${quoteId}`);
  }

  return quote;
}

async function list(quoteId, user) {
  await loadQuoteForUser(quoteId, user);

  return prisma.quoteTraveller.findMany({
    where: { quoteId, archived: false },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Replaces the whole traveller list in one call.
 *
 * Deliberately NOT validated against the quote's passenger counts. A partner filling names in as
 * their customer sends them must be able to save two of four and come back later; refusing a
 * partial list would just make them keep it in a notepad instead. The voucher shows both the count
 * the trip was priced on and the names known so far, so a mismatch is visible rather than blocked.
 */
async function replaceAll(quoteId, travellers, user) {
  await loadQuoteForUser(quoteId, user);

  return prisma.$transaction(async (tx) => {
    await tx.quoteTraveller.deleteMany({ where: { quoteId } });

    if (travellers.length > 0) {
      await tx.quoteTraveller.createMany({
        data: travellers.map((t) => ({ ...t, quoteId })),
      });
    }

    return tx.quoteTraveller.findMany({ where: { quoteId }, orderBy: { createdAt: 'asc' } });
  });
}

module.exports = { list, replaceAll };
