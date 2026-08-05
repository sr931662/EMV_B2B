const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const prisma = require('../utils/prisma');
const rateService = require('../services/rateService');
const auditService = require('../services/auditService');
const bulkDataService = require('../services/bulkDataService');

/**
 * Rate cards, supplier contracts, and the one question they exist to answer: what does this cost.
 *
 * Rates are replaced as a SET per (hotel, room type, occupancy) rather than edited row by row, for
 * the same reason cancellation bands are: the rows only make sense against each other, and a gap or
 * a duplicate between two of them is invisible while editing one.
 */

// ---------------------------------------------------------------------------
// Hotel rates
// ---------------------------------------------------------------------------

const listHotelRates = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const { includeArchived, vendorId } = req.query;

  const rates = await prisma.hotelRate.findMany({
    where: {
      hotelId,
      ...(includeArchived === 'true' ? {} : { archived: false }),
      ...(vendorId ? { vendorId } : {}),
    },
    orderBy: [{ roomType: 'asc' }, { occupancy: 'asc' }, { validFrom: 'asc' }],
    include: { vendor: { select: { id: true, name: true } } },
  });

  res.status(200).json({
    count: rates.length,
    rates,
    // Reported, not enforced. A rate card is loaded weeks before it is used, and the day it is used
    // is the worst possible time to find out the season has a hole in it.
    problems: rateService.validateRateCard(rates),
  });
});

const saveHotelRates = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const { rates = [], reason } = req.body;

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true } });
  if (!hotel) throw ApiError.notFound(`No hotel exists with id ${hotelId}`);

  const saved = await prisma.$transaction(async (tx) => {
    const before = await tx.hotelRate.findMany({ where: { hotelId, archived: false } });

    // Archived, never deleted (locked rule 1). An old rate is the evidence for what a package was
    // costed against, and a dispute six months later needs it.
    await tx.hotelRate.updateMany({ where: { hotelId, archived: false }, data: { archived: true } });

    for (const rate of rates) {
      await tx.hotelRate.create({
        data: {
          hotelId,
          hotelVendorId: rate.hotelVendorId ?? null,
          vendorId: rate.vendorId ?? null,
          roomType: rate.roomType,
          mealPlan: rate.mealPlan,
          occupancy: rate.occupancy ?? 'DOUBLE',
          validFrom: new Date(rate.validFrom),
          validTo: new Date(rate.validTo),
          basis: rate.basis ?? 'PER_ROOM_PER_NIGHT',
          amount: rate.amount,
          currencyCode: rate.currencyCode,
          taxPercent: rate.taxPercent ?? null,
          minNights: rate.minNights ?? null,
          maxNights: rate.maxNights ?? null,
          blackoutDates: (rate.blackoutDates ?? []).map((d) => new Date(d)),
          isPublished: rate.isPublished ?? false,
          notes: rate.notes ?? null,
        },
      });
    }

    await auditService.record(tx, {
      entityType: 'Hotel',
      entityId: hotelId,
      action: 'UPDATE',
      before: { rateCount: before.length },
      after: { rateCount: rates.length },
      actor: req.user,
      reason,
      ip: req.ip,
    });

    return tx.hotelRate.findMany({
      where: { hotelId, archived: false },
      orderBy: [{ roomType: 'asc' }, { occupancy: 'asc' }, { validFrom: 'asc' }],
    });
  });

  res.status(200).json({
    message: `${saved.length} rate(s) saved`,
    rates: saved,
    problems: rateService.validateRateCard(saved),
  });
});

/** What a stay costs. The whole reason rate cards exist as rows rather than a price column. */
const priceStay = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const { checkIn, checkOut, occupancy, roomType, mealPlan, vendorId } = req.query;

  if (!checkIn || !checkOut) {
    throw ApiError.badRequest('checkIn and checkOut are required to price a stay');
  }

  res.status(200).json(
    await rateService.priceHotelStay(hotelId, {
      checkIn,
      checkOut,
      occupancy,
      roomType,
      mealPlan,
      vendorId,
    })
  );
});

const exportHotelRates = asyncHandler(async (req, res) => {
  const { buffer, filename } = await bulkDataService.exportHotelRates(req.params.hotelId);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

const importHotelRates = asyncHandler(async (req, res) => {
  const result = await bulkDataService.importHotelRates(req.params.hotelId, req.file.buffer, {
    user: req.user,
    reason: req.body?.reason,
  });

  if (!result.applied) {
    return res.status(400).json({
      message: `Nothing was saved — ${result.errors.length} row(s) had a problem. Fix them and re-upload.`,
      ...result,
    });
  }

  return res.status(200).json({ message: `${result.created} rate(s) saved from file`, ...result });
});

// ---------------------------------------------------------------------------
// Supplier contracts
// ---------------------------------------------------------------------------

const listHotelVendors = asyncHandler(async (req, res) => {
  const contracts = await prisma.hotelVendor.findMany({
    where: { hotelId: req.params.hotelId, archived: false },
    orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }],
    include: {
      vendor: { select: { id: true, name: true, defaultCurrencyCode: true } },
      cancellationPolicy: { select: { id: true, name: true } },
    },
  });

  res.status(200).json({ count: contracts.length, contracts });
});

const saveHotelVendor = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const { vendorId, contractRef = '', ...rest } = req.body;

  if (!vendorId) throw ApiError.badRequest('vendorId is required');

  const data = {
    contractFrom: rest.contractFrom ? new Date(rest.contractFrom) : null,
    contractTo: rest.contractTo ? new Date(rest.contractTo) : null,
    allocationRooms: rest.allocationRooms ?? null,
    releaseDays: rest.releaseDays ?? null,
    cancellationPolicyId: rest.cancellationPolicyId ?? null,
    isPreferred: rest.isPreferred ?? false,
    notes: rest.notes ?? null,
    archived: false,
  };

  // Upsert on the natural key rather than create: re-saving a contract that was archived should
  // revive it, not fail on the unique constraint with an error nobody can act on.
  const contract = await prisma.hotelVendor.upsert({
    where: { hotelId_vendorId_contractRef: { hotelId, vendorId, contractRef } },
    create: { hotelId, vendorId, contractRef, ...data },
    update: data,
    include: { vendor: { select: { id: true, name: true } } },
  });

  res.status(200).json({ message: 'Contract saved', contract });
});

const archiveHotelVendor = asyncHandler(async (req, res) => {
  const contract = await prisma.hotelVendor.update({
    where: { id: req.params.contractId },
    data: { archived: true },
  });

  res.status(200).json({ message: 'Contract archived', contract });
});

// ---------------------------------------------------------------------------
// Activity rates
// ---------------------------------------------------------------------------

const listActivityRates = asyncHandler(async (req, res) => {
  const rates = await prisma.activityRate.findMany({
    where: { activityId: req.params.activityId, archived: false },
    orderBy: [{ paxType: 'asc' }, { validFrom: 'asc' }],
    include: { vendor: { select: { id: true, name: true } } },
  });

  res.status(200).json({ count: rates.length, rates });
});

const saveActivityRates = asyncHandler(async (req, res) => {
  const { activityId } = req.params;
  const { rates = [], reason } = req.body;

  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: { id: true } });
  if (!activity) throw ApiError.notFound(`No activity exists with id ${activityId}`);

  const saved = await prisma.$transaction(async (tx) => {
    const before = await tx.activityRate.count({ where: { activityId, archived: false } });

    await tx.activityRate.updateMany({ where: { activityId, archived: false }, data: { archived: true } });

    for (const rate of rates) {
      await tx.activityRate.create({
        data: {
          activityId,
          vendorId: rate.vendorId ?? null,
          paxType: rate.paxType ?? 'ADULT',
          transfer: rate.transfer ?? 'SIC',
          validFrom: new Date(rate.validFrom),
          validTo: new Date(rate.validTo),
          amount: rate.amount,
          currencyCode: rate.currencyCode,
          minPax: rate.minPax ?? null,
          maxPax: rate.maxPax ?? null,
          isPublished: rate.isPublished ?? false,
          notes: rate.notes ?? null,
        },
      });
    }

    await auditService.record(tx, {
      entityType: 'Activity',
      entityId: activityId,
      action: 'UPDATE',
      before: { rateCount: before },
      after: { rateCount: rates.length },
      actor: req.user,
      reason,
      ip: req.ip,
    });

    return tx.activityRate.findMany({
      where: { activityId, archived: false },
      orderBy: [{ paxType: 'asc' }, { validFrom: 'asc' }],
    });
  });

  res.status(200).json({ message: `${saved.length} rate(s) saved`, rates: saved });
});

const priceActivity = asyncHandler(async (req, res) => {
  const { date, paxType, transfer, pax } = req.query;

  if (!date) throw ApiError.badRequest('date is required to price an activity');

  res.status(200).json(
    await rateService.priceActivityOn(req.params.activityId, {
      date,
      paxType,
      transfer,
      pax: pax ? Number(pax) : 1,
    })
  );
});

module.exports = {
  listHotelRates,
  saveHotelRates,
  exportHotelRates,
  importHotelRates,
  priceStay,
  listHotelVendors,
  saveHotelVendor,
  archiveHotelVendor,
  listActivityRates,
  saveActivityRates,
  priceActivity,
};
