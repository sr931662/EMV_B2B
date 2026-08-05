const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');

/**
 * Cancellation policies, as something the system can APPLY rather than only print.
 *
 * Written as prose ("50% within 15 days") a policy can only be shown to someone. As tiers it can
 * also answer the question a partner actually asks — "what would it cost to cancel this today" —
 * without anyone reading a paragraph and doing arithmetic in their head. That is the entire reason
 * CancellationTier exists as rows instead of a text column.
 *
 * All money here is returned as a STRING, for the same reason quoteSnapshotService does it: a JSON
 * number is an IEEE double, and a cancellation charge that round-trips through one is not
 * guaranteed to be the charge that was quoted.
 */

/** Whole days between two instants, floor'd, UTC-only so a timezone cannot move a band boundary. */
function daysBetween(from, to) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());

  return Math.floor((b - a) / MS_PER_DAY);
}

/**
 * The tier that applies at `daysBefore` days from travel.
 *
 * Bands are `[min, max)` on days-before-travel, so a cancellation exactly 15 days out falls in the
 * band starting at 15 and not in the one ending there. Stated once, here, because an off-by-one on
 * a band boundary is a charge dispute rather than a rendering glitch.
 *
 * Where bands overlap — which the data permits and an admin can create by mistake — the NARROWEST
 * match wins. A specific band someone added later is much more likely to be the intended answer
 * than a broad one written first.
 */
function tierFor(tiers, daysBefore) {
  const matches = tiers
    .filter((t) => !t.archived)
    .filter((t) => daysBefore >= t.daysBeforeTravelMin)
    .filter((t) => t.daysBeforeTravelMax === null || daysBefore < t.daysBeforeTravelMax);

  if (matches.length === 0) return null;

  const width = (t) =>
    t.daysBeforeTravelMax === null ? Number.POSITIVE_INFINITY : t.daysBeforeTravelMax - t.daysBeforeTravelMin;

  return matches.reduce((best, t) => (width(t) < width(best) ? t : best));
}

/**
 * What cancelling would cost.
 *
 * `tripValue` and `nightlyRate` are decimal strings or numbers; the result is a string. Returns a
 * `chargeable: false` result rather than throwing when no tier matches — a gap in the bands is an
 * admin's data problem, and refusing to answer at all would be less useful than saying so.
 */
function computeCharge({ tiers, travelDate, on = new Date(), tripValue, nightlyRate }) {
  const daysBefore = daysBetween(on, travelDate);

  // Checked BEFORE looking up a tier, not after. Clamping a negative to 0 and letting it match the
  // lowest band would silently charge a no-show the same as a same-day cancellation — a different
  // thing commercially, and one that is settled case by case rather than by a table.
  if (daysBefore < 0) {
    return {
      daysBefore,
      chargeable: false,
      reason: 'The travel date has passed. Cancellation after departure is handled case by case.',
      amount: null,
      currencyCode: null,
      tier: null,
    };
  }

  const tier = tierFor(tiers, daysBefore);

  if (!tier) {
    return {
      daysBefore,
      chargeable: false,
      reason: 'No tier in this policy covers that date. Check the policy for a gap between bands.',
      amount: null,
      currencyCode: null,
      tier: null,
    };
  }

  const value = Number(tripValue ?? 0);
  let amount;

  switch (tier.chargeType) {
    case 'NONE':
      amount = 0;
      break;
    case 'PERCENT_OF_TOTAL':
      amount = (value * Number(tier.chargeValue)) / 100;
      break;
    case 'FIXED_AMOUNT':
      amount = Number(tier.chargeValue);
      break;
    case 'NIGHTS':
      // A nights-based charge needs a nightly rate to become money. Without one the tier is still
      // the right answer — it just cannot be priced yet, which the caller must be able to tell
      // apart from "it costs nothing".
      amount = nightlyRate === undefined || nightlyRate === null
        ? null
        : Number(nightlyRate) * Number(tier.chargeValue);
      break;
    default:
      amount = null;
  }

  return {
    daysBefore,
    chargeable: true,
    amount: amount === null ? null : amount.toFixed(2),
    // A FIXED_AMOUNT tier carries its own currency; a percentage inherits whatever the trip was
    // priced in, which only the caller knows.
    currencyCode: tier.chargeType === 'FIXED_AMOUNT' ? tier.currencyCode : null,
    tier: {
      id: tier.id,
      daysBeforeTravelMin: tier.daysBeforeTravelMin,
      daysBeforeTravelMax: tier.daysBeforeTravelMax,
      chargeType: tier.chargeType,
      chargeValue: String(tier.chargeValue),
    },
  };
}

/**
 * Problems an admin should see before a policy is used in anger.
 *
 * Bands that overlap or leave a gap are silent until the day someone cancels and the system either
 * picks the wrong band or has no answer. Cheap to detect, expensive to discover late.
 */
function validateTiers(tiers) {
  const live = tiers.filter((t) => !t.archived).slice().sort((a, b) => a.daysBeforeTravelMin - b.daysBeforeTravelMin);
  const problems = [];

  if (live.length === 0) return [{ kind: 'empty', message: 'This policy has no tiers, so it cannot be applied.' }];

  live.forEach((t) => {
    if (t.daysBeforeTravelMax !== null && t.daysBeforeTravelMax <= t.daysBeforeTravelMin) {
      problems.push({
        kind: 'inverted',
        message: `A band from ${t.daysBeforeTravelMin} to ${t.daysBeforeTravelMax} days never matches anything.`,
      });
    }

    if (t.chargeType === 'FIXED_AMOUNT' && !t.currencyCode) {
      problems.push({
        kind: 'currency',
        message: `The fixed charge at ${t.daysBeforeTravelMin} days has no currency, so it is not an amount anyone can act on.`,
      });
    }

    if (t.chargeType === 'PERCENT_OF_TOTAL' && Number(t.chargeValue) > 100) {
      problems.push({
        kind: 'over-100',
        message: `A charge of ${t.chargeValue}% is more than the trip is worth.`,
      });
    }
  });

  // The lowest band must start at 0, or a cancellation on the day of travel matches nothing.
  if (live[0].daysBeforeTravelMin > 0) {
    problems.push({
      kind: 'gap',
      message: `Nothing covers 0 to ${live[0].daysBeforeTravelMin} days before travel — a last-minute cancellation would have no answer.`,
    });
  }

  for (let i = 0; i < live.length - 1; i += 1) {
    const current = live[i];
    const next = live[i + 1];

    if (current.daysBeforeTravelMax === null) {
      problems.push({
        kind: 'unreachable',
        message: `The open-ended band at ${current.daysBeforeTravelMin} days swallows every band above it.`,
      });
      break;
    }

    if (current.daysBeforeTravelMax < next.daysBeforeTravelMin) {
      problems.push({
        kind: 'gap',
        message: `Nothing covers ${current.daysBeforeTravelMax} to ${next.daysBeforeTravelMin} days before travel.`,
      });
    } else if (current.daysBeforeTravelMax > next.daysBeforeTravelMin) {
      problems.push({
        kind: 'overlap',
        message: `Bands overlap between ${next.daysBeforeTravelMin} and ${current.daysBeforeTravelMax} days. The narrower one will be used.`,
      });
    }
  }

  // The outermost band should be open-ended, or cancelling a year out matches nothing.
  if (live[live.length - 1].daysBeforeTravelMax !== null) {
    problems.push({
      kind: 'open-end',
      message:
        `Nothing covers more than ${live[live.length - 1].daysBeforeTravelMax} days before travel. ` +
        'Leave the last band without a maximum.',
    });
  }

  return problems;
}

async function getWithTiers(policyId) {
  const policy = await prisma.cancellationPolicy.findUnique({
    where: { id: policyId },
    include: { tiers: { where: { archived: false }, orderBy: { daysBeforeTravelMin: 'asc' } } },
  });

  if (!policy) throw ApiError.notFound(`No cancellation policy exists with id ${policyId}`);

  return policy;
}

/** Replaces a policy's tiers wholesale. Editing bands one at a time is how gaps appear. */
async function replaceTiers(policyId, tiers, { user } = {}) {
  await getWithTiers(policyId); // 404 if missing

  return prisma.$transaction(async (tx) => {
    // Archived, not deleted: locked rule 1, and an old band may be cited in a dispute.
    await tx.cancellationTier.updateMany({
      where: { policyId, archived: false },
      data: { archived: true },
    });

    await tx.cancellationTier.createMany({
      data: tiers.map((tier, index) => ({
        policyId,
        daysBeforeTravelMin: tier.daysBeforeTravelMin,
        daysBeforeTravelMax: tier.daysBeforeTravelMax ?? null,
        chargeType: tier.chargeType,
        chargeValue: tier.chargeValue ?? 0,
        currencyCode: tier.chargeType === 'FIXED_AMOUNT' ? tier.currencyCode ?? null : null,
        sortOrder: index,
      })),
    });

    return tx.cancellationPolicy.findUnique({
      where: { id: policyId },
      include: { tiers: { where: { archived: false }, orderBy: { daysBeforeTravelMin: 'asc' } } },
    });
  });
}

/** What a specific quote would cost to cancel today. */
async function quoteCancellation(quoteId, { on = new Date() } = {}) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      travelDate: true,
      sellingPrice: true,
      package: { select: { cancellationPolicy: { include: { tiers: true } } } },
    },
  });

  if (!quote) throw ApiError.notFound(`No quote exists with id ${quoteId}`);

  const policy = quote.package?.cancellationPolicy;

  if (!policy) {
    return {
      applicable: false,
      reason: 'No cancellation policy is attached to this package.',
    };
  }

  return {
    applicable: true,
    policy: { id: policy.id, name: policy.name, notes: policy.notes },
    ...computeCharge({
      tiers: policy.tiers,
      travelDate: new Date(quote.travelDate),
      on,
      // The frozen selling price, never a live one — the same reason quoteService freezes it.
      tripValue: quote.sellingPrice,
    }),
  };
}

module.exports = {
  daysBetween,
  tierFor,
  computeCharge,
  validateTiers,
  getWithTiers,
  replaceTiers,
  quoteCancellation,
};
