const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const libraryService = require('../services/libraryService');
const auditService = require('../services/auditService');
const attachmentService = require('../services/attachmentService');
const cancellationService = require('../services/cancellationService');
const noteBlockService = require('../services/noteBlockService');
const bulkDataService = require('../services/bulkDataService');
const registry = require('../services/libraryRegistry');

/** Actor context, assembled once so every write records the same way. */
function context(req) {
  return { user: req.user, reason: req.body?.reason, ip: req.ip };
}

/**
 * Warns the caller when field-level permissions dropped part of their payload.
 *
 * Silently discarding a field a user believed they had set is how "I saved it and it did not stick"
 * bugs are born. The write still succeeds — see stripForbiddenFields for why — but the response
 * says what did not land.
 */
function withStripNotice(body, strippedFields, ignoredFields) {
  const notices = [];

  if (strippedFields?.length) {
    notices.push(
      `these fields need an administrator and were not changed: ${strippedFields.join(', ')}`
    );
  }

  // Unknown keys are reported for the same reason, but they mean something different: not "you are
  // not allowed" but "this entity has no such field". Usually a typo or a stale client.
  if (ignoredFields?.length) {
    notices.push(`these fields are not part of this entity and were ignored: ${ignoredFields.join(', ')}`);
  }

  if (notices.length === 0) return body;

  return {
    ...body,
    ...(strippedFields?.length ? { strippedFields } : {}),
    ...(ignoredFields?.length ? { ignoredFields } : {}),
    notice: `Saved, but ${notices.join('; ')}`,
  };
}

const listEntities = asyncHandler(async (_req, res) => {
  const entities = registry.names().map((name) => {
    const config = registry.get(name);

    return {
      entity: name,
      label: config.label,
      entityType: config.entityType,
      scopeField: config.scopeField ?? null,
      requiredFilter: config.requiredFilter ?? null,
      commercialFields: config.commercialFields,
      // The shell renders its editor from these rather than hardcoding a form per entity — the
      // reason adding a library module stays a registry entry.
      fields: config.fields ?? [],
      readOnly: Boolean(config.readOnly),
      // Names a child collection that needs its own editor — a policy's bands, a hotel's rate card.
      // The shell maps this to a component; the server only says one is needed.
      childEditor: config.childEditor ?? null,
      // True where the Library gives this entity its own richer screen. The generic browser skips
      // those so nothing appears twice with two different editors.
      dedicatedScreen: Boolean(config.dedicatedScreen),
    };
  });

  res.status(200).json({ count: entities.length, entities });
});

/** The endpoint every picker in the app calls, for every entity. */
const search = asyncHandler(async (req, res) => {
  const { q, scopeId, type, limit } = req.query;
  const options = await libraryService.search(req.params.entity, {
    q,
    scopeId,
    type,
    limit: limit ? Number(limit) : undefined,
  });

  res.status(200).json({ count: options.length, options });
});

const list = asyncHandler(async (req, res) => {
  const { includeArchived, scopeId, type, q, limit, offset } = req.query;
  const result = await libraryService.list(req.params.entity, {
    includeArchived: includeArchived === 'true',
    scopeId,
    type,
    q,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });

  res.status(200).json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const row = await libraryService.getById(req.params.entity, req.params.id);

  res.status(200).json({ row });
});

const create = asyncHandler(async (req, res) => {
  const { reason, ...payload } = req.body;
  const { row, strippedFields, ignoredFields } = await libraryService.create(
    req.params.entity,
    payload,
    context(req)
  );

  res.status(201).json(withStripNotice({ message: 'Created', row }, strippedFields, ignoredFields));
});

const update = asyncHandler(async (req, res) => {
  const { reason, ...payload } = req.body;
  const { row, strippedFields, ignoredFields } = await libraryService.update(
    req.params.entity,
    req.params.id,
    payload,
    context(req)
  );

  res.status(200).json(withStripNotice({ message: 'Updated', row }, strippedFields, ignoredFields));
});

/** What would break if this were archived. The shell calls it before offering the button. */
const usage = asyncHandler(async (req, res) => {
  const result = await libraryService.usage(req.params.entity, req.params.id);

  res.status(200).json(result);
});

const archive = asyncHandler(async (req, res) => {
  const { row, alreadyInState } = await libraryService.archive(req.params.entity, req.params.id, {
    ...context(req),
    force: req.body?.force === true,
  });

  res.status(200).json({ message: alreadyInState ? 'Already archived' : 'Archived', row });
});

const restore = asyncHandler(async (req, res) => {
  const { row, alreadyInState } = await libraryService.restore(req.params.entity, req.params.id, context(req));

  res.status(200).json({ message: alreadyInState ? 'Was not archived' : 'Restored', row });
});

const hardDelete = asyncHandler(async (req, res) => {
  await libraryService.hardDelete(req.params.entity, req.params.id, context(req));

  res.status(200).json({ message: 'Permanently deleted' });
});

const history = asyncHandler(async (req, res) => {
  const config = libraryService.configFor(req.params.entity);
  const { entries, total, limit, offset } = await auditService.history(config.entityType, req.params.id, {
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });

  res.status(200).json({ count: entries.length, total, limit, offset, entries });
});

// ---------------------------------------------------------------------------
// Cancellation tiers (Phase 4)
//
// Not part of the generic entity surface: a policy's bands are edited as a set, because editing them
// one at a time is exactly how a gap or an overlap appears between two of them.
// ---------------------------------------------------------------------------

const getTiers = asyncHandler(async (req, res) => {
  const policy = await cancellationService.getWithTiers(req.params.id);

  res.status(200).json({
    policy,
    // Reported rather than enforced. A half-built policy is a normal state to save in; it is being
    // APPLIED with a gap in it that costs money, and the shell surfaces this before that happens.
    problems: cancellationService.validateTiers(policy.tiers),
  });
});

const setTiers = asyncHandler(async (req, res) => {
  const policy = await cancellationService.replaceTiers(req.params.id, req.body.tiers ?? [], {
    user: req.user,
  });

  res.status(200).json({
    message: 'Cancellation tiers saved',
    policy,
    problems: cancellationService.validateTiers(policy.tiers),
  });
});

/** "What would this cost to cancel today" — the question the tier table exists to answer. */
const previewCancellation = asyncHandler(async (req, res) => {
  const policy = await cancellationService.getWithTiers(req.params.id);
  const { travelDate, tripValue, nightlyRate } = req.query;

  if (!travelDate) throw ApiError.badRequest('travelDate is required to preview a cancellation charge');

  res.status(200).json(
    cancellationService.computeCharge({
      tiers: policy.tiers,
      travelDate: new Date(travelDate),
      tripValue,
      nightlyRate,
    })
  );
});

// ---------------------------------------------------------------------------
// Attachments (Phase 4)
// ---------------------------------------------------------------------------

const getAttachments = asyncHandler(async (req, res) => {
  const { ownerType, ownerId } = req.params;
  const { entity, role } = req.query;

  const result = entity
    ? await attachmentService.getLinked(entity, ownerType, ownerId, { role })
    : await attachmentService.getAllForOwner(ownerType, ownerId);

  res.status(200).json({ ownerType, ownerId, attachments: result });
});

const setAttachments = asyncHandler(async (req, res) => {
  const { ownerType, ownerId } = req.params;
  const { entity, role = 'default', itemIds = [] } = req.body;

  const links = await attachmentService.setLinks(entity, ownerType, ownerId, itemIds, {
    user: req.user,
    reason: req.body.reason,
    ip: req.ip,
    role,
  });

  res.status(200).json({ message: 'Attachments saved', count: links.length, links });
});

// ---------------------------------------------------------------------------
// Note-block health
// ---------------------------------------------------------------------------

/**
 * Which company-wide blocks a voucher needs and nobody has written.
 *
 * Exists because the failure it reports is completely silent otherwise: voucherService omits a
 * missing block, so every voucher printed so far has carried no terms and conditions at all.
 */
const noteBlockHealth = asyncHandler(async (_req, res) => {
  const missing = await noteBlockService.missingRequired();

  res.status(200).json({
    required: noteBlockService.REQUIRED_VOUCHER_BLOCKS,
    missing,
    healthy: missing.length === 0,
  });
});

const ensureNoteBlockStubs = asyncHandler(async (req, res) => {
  const result = await noteBlockService.ensureStubs({ user: req.user });

  res.status(200).json({
    message: `${result.created.length} stub(s) created. Wording still has to be written.`,
    ...result,
  });
});

// ---------------------------------------------------------------------------
// Bulk import/export (Excel)
// ---------------------------------------------------------------------------

const exportEntity = asyncHandler(async (req, res) => {
  const { includeArchived, type } = req.query;
  const { buffer, filename } = await bulkDataService.exportEntity(req.params.entity, {
    includeArchived: includeArchived === 'true',
    type,
    user: req.user,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

const importEntity = asyncHandler(async (req, res) => {
  const result = await bulkDataService.importEntity(req.params.entity, req.file.buffer, {
    ...context(req),
    type: req.body?.type,
  });

  res.status(200).json({
    message: `${result.created} created, ${result.updated} updated, ${result.skipped} blank row(s) skipped` +
      (result.errors.length ? `, ${result.errors.length} row(s) failed` : ''),
    ...result,
  });
});

module.exports = {
  listEntities,
  search,
  list,
  getOne,
  create,
  update,
  usage,
  archive,
  restore,
  hardDelete,
  history,
  getTiers,
  setTiers,
  previewCancellation,
  getAttachments,
  setAttachments,
  noteBlockHealth,
  ensureNoteBlockStubs,
  exportEntity,
  importEntity,
};
