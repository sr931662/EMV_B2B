const prisma = require('../utils/prisma');
const packageService = require('./packageService');
const notificationService = require('./notificationService');

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
 * One dashboard payload for the logged-in partner — their own quotes/visa-requests/payments
 * only (every query below is scoped by `partnerId: user.id`), plus a marketplace teaser.
 * Same grouped-query shape as reportService.getSummary, just pre-filtered to one partner.
 */
async function getForPartner(user) {
  const partnerId = user.id;

  const [
    quoteGroups,
    visaGroups,
    pendingPayments,
    approvedOrders,
    recentPayments,
    unreadNotifications,
    latestPackages,
  ] = await Promise.all([
    prisma.quote.groupBy({
      by: ['status'],
      _count: true,
      where: { partnerId, archived: false },
    }),
    prisma.visaRequest.groupBy({
      by: ['status'],
      _count: true,
      where: { partnerId, archived: false },
    }),
    prisma.payment.count({
      where: {
        status: 'PENDING_VERIFICATION',
        archived: false,
        OR: [{ quote: { partnerId } }, { visaRequest: { partnerId } }],
      },
    }),
    prisma.payment.count({
      where: {
        status: 'APPROVED',
        archived: false,
        OR: [{ quote: { partnerId } }, { visaRequest: { partnerId } }],
      },
    }),
    prisma.payment.findMany({
      where: {
        archived: false,
        OR: [{ quote: { partnerId } }, { visaRequest: { partnerId } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        amount: true,
        status: true,
        updatedAt: true,
        quote: { select: { package: { select: { title: true } } } },
        visaRequest: { select: { applicationNumber: true } },
      },
    }),
    notificationService.unreadCount(user),
    packageService.list({}),
  ]);

  return {
    quotes: {
      total: quoteGroups.reduce((sum, g) => sum + g._count, 0),
      byStatus: zeroFilledStatusMap(QUOTE_STATUSES, quoteGroups),
    },
    visaRequests: {
      total: visaGroups.reduce((sum, g) => sum + g._count, 0),
      byStatus: zeroFilledStatusMap(VISA_REQUEST_STATUSES, visaGroups),
    },
    pendingPayments,
    approvedOrders,
    recentActivity: recentPayments.map((p) => ({
      paymentId: p.id,
      subject: p.quote?.package?.title ?? p.visaRequest?.applicationNumber ?? null,
      type: p.type,
      amount: p.amount,
      status: p.status,
      date: p.updatedAt,
    })),
    unreadNotifications,
    latestPackages: latestPackages.slice(0, 5),
  };
}

module.exports = { getForPartner };
