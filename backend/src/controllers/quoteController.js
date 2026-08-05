const fs = require('fs');

const asyncHandler = require('../utils/asyncHandler');
const quoteService = require('../services/quoteService');
const { quotePdfDownloadName } = require('../services/pdfService');

// Pricing block shown on create/detail/update. rawPriceAtQuote is the frozen basis every
// number here derives from; livePackageRawPrice is shown alongside purely for context.
function pricingOf(quote) {
  return {
    rawPriceAtQuote: quote.rawPriceAtQuote,
    markupAmount: quote.markupAmount,
    sellingPrice: quote.sellingPrice,
    livePackageRawPrice: quote.package.rawPrice,
    rawPriceChangedSinceQuote: quoteService.rawPriceDrifted(quote, quote.package.rawPrice),
    formula: 'sellingPrice = rawPriceAtQuote + markupAmount (frozen at quote creation)',
  };
}

const create = asyncHandler(async (req, res) => {
  const quote = await quoteService.create(req.body, req.user);

  res.status(201).json({
    message: 'Quote created',
    pricing: pricingOf(quote),
    quote,
  });
});

const list = asyncHandler(async (req, res) => {
  const { quotes, total, limit, offset } = await quoteService.list(req.validatedQuery, req.user);

  res.status(200).json({
    count: quotes.length,
    total,
    limit,
    offset,
    scope: req.user.role === 'admin' ? 'all partners' : 'own quotes only',
    quotes,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const quote = await quoteService.getById(req.params.id, req.user);

  res.status(200).json({ pricing: pricingOf(quote), quote });
});

const update = asyncHandler(async (req, res) => {
  const { quote, rawPriceChangedSinceQuote } = await quoteService.update(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    message: 'Quote updated',
    pricing: pricingOf(quote),
    // Informational: the package has been repriced since this quote froze its basis. No number
    // above is affected — the recompute used rawPriceAtQuote.
    rawPriceChangedSinceQuote,
    quote,
  });
});

const confirmCustomer = asyncHandler(async (req, res) => {
  const quote = await quoteService.confirmCustomer(req.params.id, req.user);

  res.status(200).json({ message: 'Customer approval recorded', status: quote.status, quote });
});

const archive = asyncHandler(async (req, res) => {
  const { quote, alreadyInState } = await quoteService.archive(req.params.id, req.user);

  res.status(200).json({
    message: alreadyInState ? 'Quote was already archived' : 'Quote archived',
    quote,
  });
});

/**
 * Streams the partner's quote PDF. Ownership-checked, and gated by NO payment check —
 * locked rule 3: both quote PDFs are always downloadable, before and without payment.
 */
const downloadQuotePdf = asyncHandler(async (req, res) => {
  const { absolutePath, quote, package: pkg, partnerProfile } = await quoteService.getQuotePdf(
    req.params.id,
    req.user
  );

  const fileName = quotePdfDownloadName(quote, pkg, partnerProfile);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', fs.statSync(absolutePath).size);
  res.setHeader('Cache-Control', 'no-store'); // regenerated whenever the quote is edited

  fs.createReadStream(absolutePath).pipe(res);
});

module.exports = { create, list, getOne, update, confirmCustomer, archive, downloadQuotePdf };
