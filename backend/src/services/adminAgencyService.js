const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const authService = require('./authService');

const AGENCY_LIST_SELECT = {
  id: true,
  email: true,
  isVerified: true,
  archived: true,
  createdAt: true,
  partnerProfile: {
    select: { companyName: true, ownerName: true, businessEmail: true, city: true },
  },
  _count: {
    select: {
      quotes: { where: { archived: false } },
      visaRequests: { where: { archived: false } },
    },
  },
};

function toAgencyRow(user) {
  return {
    id: user.id,
    email: user.email,
    companyName: user.partnerProfile?.companyName ?? null,
    ownerName: user.partnerProfile?.ownerName ?? null,
    businessEmail: user.partnerProfile?.businessEmail ?? null,
    city: user.partnerProfile?.city ?? null,
    isVerified: user.isVerified,
    archived: user.archived,
    createdAt: user.createdAt,
    quoteCount: user._count.quotes,
    visaRequestCount: user._count.visaRequests,
  };
}

/**
 * `status` and `includeArchived` both touch visibility of suspended (archived) agencies, and
 * `status` wins when both are present: asking for `status=suspended` is itself a request to see
 * archived rows, so requiring `includeArchived=true` on top would be a redundant second filter.
 * Buckets are mutually exclusive by construction (suspended is archived regardless of
 * isVerified; unverified is archived:false AND isVerified:false; active is the remainder), so
 * they can never double-count a row.
 */
async function list({ search, status, includeArchived = false } = {}) {
  const where = { role: 'partner' };

  if (status === 'suspended') {
    where.archived = true;
  } else if (status === 'unverified') {
    where.archived = false;
    where.isVerified = false;
  } else if (status === 'active') {
    where.archived = false;
    where.isVerified = true;
  } else if (!includeArchived) {
    where.archived = false;
  }

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { partnerProfile: { is: { companyName: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  const agencies = await prisma.user.findMany({
    where,
    select: AGENCY_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  });

  return agencies.map(toAgencyRow);
}

/**
 * Full detail: profile + quote/visa-request summaries + combined payment history.
 *
 * Deliberately includes archived quotes/visa-requests too (unlike the partner-facing lists) —
 * this is an admin audit view of one agency's whole history, not a browsing list, same reasoning
 * as every other service's `getById` returning archived rows for inspection.
 */
async function getById(id) {
  const agency = await prisma.user.findUnique({
    where: { id },
    include: { partnerProfile: true },
  });

  if (!agency || agency.role !== 'partner') {
    throw ApiError.notFound(`No agency exists with id ${id}`);
  }

  const [quotes, visaRequests, payments] = await Promise.all([
    prisma.quote.findMany({
      where: { partnerId: id },
      select: {
        id: true,
        status: true,
        sellingPrice: true,
        archived: true,
        createdAt: true,
        package: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.visaRequest.findMany({
      where: { partnerId: id },
      select: {
        id: true,
        applicationNumber: true,
        status: true,
        archived: true,
        createdAt: true,
        country: { select: { name: true } },
        _count: { select: { passengers: { where: { archived: false } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    // A Payment has no direct partnerId column — it belongs to a Quote or a VisaRequest, each
    // of which does. This single OR-across-relations query lets Prisma express both joins in
    // one round trip rather than fetching quotes/visa-requests first and querying per row.
    prisma.payment.findMany({
      where: { OR: [{ quote: { partnerId: id } }, { visaRequest: { partnerId: id } }] },
      select: {
        id: true,
        type: true,
        transactionId: true,
        amount: true,
        status: true,
        archived: true,
        createdAt: true,
        quote: { select: { package: { select: { title: true } } } },
        visaRequest: { select: { applicationNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    id: agency.id,
    email: agency.email,
    isVerified: agency.isVerified,
    archived: agency.archived,
    createdAt: agency.createdAt,
    profile: agency.partnerProfile,
    quotes: quotes.map((q) => ({
      id: q.id,
      packageTitle: q.package.title,
      status: q.status,
      sellingPrice: q.sellingPrice,
      archived: q.archived,
      createdAt: q.createdAt,
    })),
    visaRequests: visaRequests.map((v) => ({
      id: v.id,
      applicationNumber: v.applicationNumber,
      countryName: v.country.name,
      status: v.status,
      passengerCount: v._count.passengers,
      archived: v.archived,
      createdAt: v.createdAt,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      type: p.type,
      subject: p.quote?.package?.title ?? p.visaRequest?.applicationNumber ?? null,
      transactionId: p.transactionId,
      amount: p.amount,
      status: p.status,
      archived: p.archived,
      createdAt: p.createdAt,
    })),
  };
}

async function assertIsAgency(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });

  if (!user || user.role !== 'partner') {
    throw ApiError.notFound(`No agency exists with id ${id}`);
  }
}

/**
 * Suspend = archive + revoke. `archived: true` alone already blocks `authMiddleware` (it checks
 * archived independently of tokenVersion), so the tokenVersion bump is defence in depth, not the
 * primary block — sequencing the two as separate writes is safe even if the second one failed,
 * the account is already locked out.
 */
async function suspend(id) {
  await assertIsAgency(id);

  await prisma.user.update({ where: { id }, data: { archived: true } });
  await authService.incrementTokenVersion(id);

  return getById(id);
}

/** Restore access. tokenVersion is deliberately left untouched — they just log in fresh. */
async function activate(id) {
  await assertIsAgency(id);

  await prisma.user.update({ where: { id }, data: { archived: false } });

  return getById(id);
}

module.exports = { list, getById, suspend, activate };
