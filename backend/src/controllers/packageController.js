const fs = require('fs');

const asyncHandler = require('../utils/asyncHandler');
const packageService = require('../services/packageService');

const create = asyncHandler(async (req, res) => {
  // The actor rides along so attachment changes are recorded against the package in the audit
  // trail — "who added this FAQ" is a question someone asks.
  const pkg = await packageService.create({ ...req.body, actor: req.user });

  res.status(201).json({
    message: 'Package created',
    copied: {
      packageDays: pkg.packageDays.length,
      packageHotels: pkg.packageHotels.length,
    },
    package: pkg,
  });
});

const update = asyncHandler(async (req, res) => {
  const pkg = await packageService.update(req.params.id, { ...req.body, actor: req.user });

  res.status(200).json({
    message: 'Package updated',
    copied: {
      packageDays: pkg.packageDays.length,
      packageHotels: pkg.packageHotels.length,
    },
    package: pkg,
  });
});

const list = asyncHandler(async (req, res) => {
  const filters = req.validatedQuery;
  const { packages, total, limit, offset } = await packageService.list(filters);

  res.status(200).json({ count: packages.length, total, limit, offset, filters, packages });
});

// Itinerary-page payload. destinationArchived is always present so the UI can warn when the
// package is reachable by id but hidden from the marketplace.
const getOne = asyncHandler(async (req, res) => {
  const pkg = await packageService.getById(req.params.id);

  res.status(200).json({ destinationArchived: pkg.destination.archived, package: pkg });
});

const archive = asyncHandler(async (req, res) => {
  const { package: pkg, alreadyInState } = await packageService.archive(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Package was already archived' : 'Package archived',
    package: pkg,
  });
});

const restore = asyncHandler(async (req, res) => {
  const { package: pkg, alreadyInState } = await packageService.restore(req.params.id);

  res.status(200).json({
    message: alreadyInState ? 'Package was not archived' : 'Package restored',
    package: pkg,
  });
});

/**
 * Streams the EMV-branded quote PDF.
 *
 * Open to every authenticated role and gated by NO payment check whatsoever — locked rule 3:
 * both quote PDFs are always downloadable, before and without payment. Payment only ever
 * gates booking confirmation.
 */
const downloadEmvQuote = asyncHandler(async (req, res) => {
  const { absolutePath, package: pkg } = await packageService.getEmvQuotePdfPath(req.params.id);

  const slug =
    pkg.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'package';
  const fileName = `emv-quote-${slug}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', fs.statSync(absolutePath).size);
  res.setHeader('Cache-Control', 'no-store'); // regenerated on every edit

  fs.createReadStream(absolutePath).pipe(res);
});

module.exports = { create, update, list, getOne, archive, restore, downloadEmvQuote };
