const asyncHandler = require('../utils/asyncHandler');
const visaProductService = require('../services/visaProductService');

const create = asyncHandler(async (req, res) => {
  const product = await visaProductService.create(req.body);

  res.status(201).json({ message: 'Visa product created', product });
});

/**
 * Marketplace list. Echoes the filters back alongside the results, the same way
 * packageController.list does, so the client can confirm what the server actually applied rather
 * than assuming its query string survived validation intact.
 */
const list = asyncHandler(async (req, res) => {
  const filters = req.validatedQuery;
  const { products, total, limit, offset } = await visaProductService.list(filters);

  res.status(200).json({ count: products.length, total, limit, offset, filters, products });
});

const getOne = asyncHandler(async (req, res) => {
  // travelDate is optional here too, so a product detail page can show the same
  // "ready in time / too late" answer the list does without a second endpoint.
  const product = await visaProductService.getById(req.params.id, {
    travelDate: req.validatedQuery?.travelDate,
    includeSimilar: req.validatedQuery?.includeSimilar ?? false,
  });

  res.status(200).json({ product });
});

const update = asyncHandler(async (req, res) => {
  const product = await visaProductService.update(req.params.id, req.body);

  res.status(200).json({ message: 'Visa product updated', product });
});

const archive = asyncHandler(async (req, res) => {
  const product = await visaProductService.setArchived(req.params.id, true);

  res.status(200).json({ message: 'Visa product archived', product });
});

const restore = asyncHandler(async (req, res) => {
  const product = await visaProductService.setArchived(req.params.id, false);

  res.status(200).json({ message: 'Visa product restored', product });
});

module.exports = { create, list, getOne, update, archive, restore };
