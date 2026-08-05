const { z } = require('zod');
const { paginationFields } = require('./paginationSchema');

const idParamSchema = z.object({ id: z.uuid('id must be a valid UUID') });

const listNotificationsSchema = z
  .object({
    unreadOnly: z
      .enum(['true', 'false'], { error: "unreadOnly must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
    ...paginationFields,
  })
  .strict();

module.exports = { idParamSchema, listNotificationsSchema };
