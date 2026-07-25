const { Prisma } = require('@prisma/client');

const prisma = require('../utils/prisma');

// Mirror schema.prisma's enums so every status always appears in the summary with a count
// (0 where there's no data yet), rather than the dashboard silently omitting empty buckets.
const QUOTE_STATUSES = [
  'QUOTE_GENERATED',
  'CUSTOMER_APPROVED',
  'PAYMENT_SUBMITTED',
  'PENDING_VERIFICATION',
  'BOOKING_CONFIRMED',
  'ORDER_COMPLETED',
  'REJECTED',
];
const VISA_REQUEST_STATUSES = [
  'APPLICATION_SUBMITTED',
  'PAYMENT_SUBMITTED',
  'PENDING_VERIFICATION',
  'PAYMENT_APPROVED',
  'VISA_PROCESSING_STARTED',
  'COMPLETED',
  'REJECTED',
];

function zeroFilledStatusMap(statuses, groups) {
  const map = Object.fromEntries(statuses.map((s) => [s, 0]));
  groups.forEach((g) => {
    map[g.status] = g._count;
  });
  return map;
}

/**
 * Single dashboard payload for the admin CMS. Kept to a handful of grouped/aggregate queries
 * (no per-row loops) regardless of how much data exists — the query count here does not grow
 * with the number of agencies/quotes/payments.
 *
 * `from`/`to` apply ONLY to the payment aggregates, per the brief — agency/package/quote/visa
 * counts are point-in-time totals, not history over a window.
 */
async function getSummary({ from, to } = {}) {
  const dateWhere = {};
  if (from || to) {
    dateWhere.createdAt = {};
    if (from) dateWhere.createdAt.gte = from;
    if (to) dateWhere.createdAt.lte = to;
  }

  const [
    totalAgencies,
    suspendedAgencies,
    unverifiedAgencies,
    activePackages,
    quoteGroups,
    visaGroups,
    totalSubmitted,
    pendingVerification,
    approvedPackagePayments,
    approvedVisaAgg,
    rejected,
    recentActivity,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'partner' } }),
    prisma.user.count({ where: { role: 'partner', archived: true } }),
    prisma.user.count({ where: { role: 'partner', archived: false, isVerified: false } }),
    prisma.package.count({ where: { archived: false } }),
    prisma.quote.groupBy({ by: ['status'], _count: true, where: { archived: false } }),
    prisma.visaRequest.groupBy({ by: ['status'], _count: true, where: { archived: false } }),
    prisma.payment.count({ where: dateWhere }), // activity metric: every submission ever, including superseded rows
    prisma.payment.count({
      where: { ...dateWhere, status: 'PENDING_VERIFICATION', archived: false },
    }),
    // Package revenue is the QUOTE's sellingPrice (the true expected revenue), not
    // payment.amount — a partner may legitimately part-pay or round (reconciliationMismatch).
    prisma.payment.findMany({
      where: { ...dateWhere, type: 'PACKAGE', status: 'APPROVED', archived: false },
      select: { quote: { select: { sellingPrice: true } } },
    }),
    // VisaRequest carries no price field at all, so payment.amount is the only number that
    // exists for visa revenue.
    prisma.payment.aggregate({
      where: { ...dateWhere, type: 'VISA', status: 'APPROVED', archived: false },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.count({ where: { ...dateWhere, status: 'REJECTED', archived: false } }),
    prisma.payment.findMany({
      where: { archived: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        amount: true,
        status: true,
        createdAt: true,
        quote: {
          select: { partner: { select: { partnerProfile: { select: { companyName: true } } } } },
        },
        visaRequest: {
          select: { partner: { select: { partnerProfile: { select: { companyName: true } } } } },
        },
      },
    }),
  ]);

  const packageRevenue = approvedPackagePayments.reduce(
    (sum, p) => sum.plus(new Prisma.Decimal(p.quote?.sellingPrice ?? 0)),
    new Prisma.Decimal(0)
  );
  const visaRevenue = new Prisma.Decimal(approvedVisaAgg._sum.amount ?? 0);

  return {
    generatedAt: new Date(),
    dateRange: from || to ? { from: from ?? null, to: to ?? null } : null,
    agencies: {
      total: totalAgencies,
      active: totalAgencies - suspendedAgencies - unverifiedAgencies,
      suspended: suspendedAgencies,
      unverified: unverifiedAgencies,
    },
    packages: { active: activePackages },
    quotes: {
      total: quoteGroups.reduce((sum, g) => sum + g._count, 0),
      byStatus: zeroFilledStatusMap(QUOTE_STATUSES, quoteGroups),
    },
    visaRequests: {
      total: visaGroups.reduce((sum, g) => sum + g._count, 0),
      byStatus: zeroFilledStatusMap(VISA_REQUEST_STATUSES, visaGroups),
    },
    payments: {
      totalSubmitted,
      pendingVerification,
      approved: {
        count: approvedPackagePayments.length + approvedVisaAgg._count,
        revenue: packageRevenue.plus(visaRevenue),
      },
      rejected,
    },
    recentActivity: recentActivity.map((p) => ({
      paymentId: p.id,
      agencyName:
        p.quote?.partner?.partnerProfile?.companyName ??
        p.visaRequest?.partner?.partnerProfile?.companyName ??
        null,
      type: p.type,
      amount: p.amount,
      status: p.status,
      date: p.createdAt,
    })),
  };
}

module.exports = { getSummary };
