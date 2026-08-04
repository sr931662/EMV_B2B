const { Prisma } = require('@prisma/client');

const prisma = require('../utils/prisma');

/**
 * Operational settings an admin must be able to change without a deploy.
 *
 * Values are stored as strings and parsed by whoever reads them, so adding a setting never needs a
 * migration.
 */

const TCS_RATE_KEY = 'TCS_RATE_PERCENT';

async function get(key, fallback = null) {
  const row = await prisma.appSetting.findUnique({ where: { key } });

  return row ? row.value : fallback;
}

async function set(key, value) {
  return prisma.appSetting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  });
}

async function list() {
  return prisma.appSetting.findMany({ orderBy: { key: 'asc' } });
}

/**
 * The TCS percentage to apply to new quotes.
 *
 * Falls back to 0, NOT to a statutory figure. TCS on overseas tour packages is set by policy and
 * changes with each budget, so a hardcoded default would put a number nobody confirmed onto real
 * invoices. Zero is visibly wrong and prompts someone to set it; a plausible-looking wrong rate
 * would ship silently.
 */
async function getTcsRate() {
  const raw = await get(TCS_RATE_KEY, '0');
  const parsed = new Prisma.Decimal(raw || 0);

  return parsed.isNaN() || parsed.lessThan(0) ? new Prisma.Decimal(0) : parsed;
}

/** Rounded to 2dp because it lands in a Decimal(12,2) column and on a printed invoice. */
function computeTcs(sellingPrice, tcsRate) {
  return new Prisma.Decimal(sellingPrice)
    .times(new Prisma.Decimal(tcsRate))
    .dividedBy(100)
    .toDecimalPlaces(2);
}

module.exports = { get, set, list, getTcsRate, computeTcs, TCS_RATE_KEY };
