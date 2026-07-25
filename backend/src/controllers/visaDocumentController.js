const asyncHandler = require('../utils/asyncHandler');
const visaDocumentService = require('../services/visaDocumentService');

const create = asyncHandler(async (req, res) => {
  const document = await visaDocumentService.create(req.params.countryId, req.body);

  res.status(201).json({ message: 'Required document created', document });
});

const list = asyncHandler(async (req, res) => {
  const { includeArchived } = req.validatedQuery;
  const documents = await visaDocumentService.list(req.params.countryId, { includeArchived });

  res.status(200).json({ count: documents.length, includeArchived, documents });
});

const update = asyncHandler(async (req, res) => {
  const document = await visaDocumentService.update(req.params.countryId, req.params.docId, req.body);

  res.status(200).json({ message: 'Required document updated', document });
});

const archive = asyncHandler(async (req, res) => {
  const { document, alreadyInState } = await visaDocumentService.archive(
    req.params.countryId,
    req.params.docId
  );

  res.status(200).json({
    message: alreadyInState ? 'Required document was already archived' : 'Required document archived',
    document,
  });
});

const restore = asyncHandler(async (req, res) => {
  const { document, alreadyInState } = await visaDocumentService.restore(
    req.params.countryId,
    req.params.docId
  );

  res.status(200).json({
    message: alreadyInState ? 'Required document was not archived' : 'Required document restored',
    document,
  });
});

module.exports = { create, list, update, archive, restore };
