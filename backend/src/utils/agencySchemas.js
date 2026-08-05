const { z } = require('zod');
const { paginationFields } = require('./paginationSchema');

const idParamSchema = z.object({ id: z.uuid('id must be a valid UUID') });

const listAgenciesSchema = z
  .object({
    search: z.string().trim().min(1).max(255).optional(),
    status: z
      .enum(['active', 'suspended', 'unverified'], {
        error: "status must be 'active', 'suspended', or 'unverified'",
      })
      .optional(),
    includeArchived: z
      .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
    ...paginationFields,
  })
  .strict();

module.exports = { idParamSchema, listAgenciesSchema };
