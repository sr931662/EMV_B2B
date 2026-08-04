const asyncHandler = require('../utils/asyncHandler');
const voucherService = require('../services/voucherService');
const quoteTravellerService = require('../services/quoteTravellerService');

/** The whole post-payment trip voucher, assembled server-side so the print view has one source. */
const getVoucher = asyncHandler(async (req, res) => {
  const voucher = await voucherService.getVoucher(req.params.id, req.user);

  res.status(200).json({ voucher });
});

const listTravellers = asyncHandler(async (req, res) => {
  const travellers = await quoteTravellerService.list(req.params.id, req.user);

  res.status(200).json({ count: travellers.length, travellers });
});

const replaceTravellers = asyncHandler(async (req, res) => {
  const travellers = await quoteTravellerService.replaceAll(
    req.params.id,
    req.body.travellers,
    req.user
  );

  res.status(200).json({ message: 'Travellers saved', count: travellers.length, travellers });
});

module.exports = { getVoucher, listTravellers, replaceTravellers };
