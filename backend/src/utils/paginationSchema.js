const { z } = require('zod');

/**
 * Shared `limit`/`offset` shape for every list endpoint's query schema.
 *
 * One definition rather than one per schema file, so "what's the default page size" and "what's
 * the largest page a client can ask for" are answered once. `.coerce` because these arrive as query
 * string values ("50", not 50).
 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const paginationFields = {
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
};

module.exports = { paginationFields, DEFAULT_LIMIT, MAX_LIMIT };
