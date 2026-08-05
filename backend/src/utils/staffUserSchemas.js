const { z } = require('zod');
const { paginationFields } = require('./paginationSchema');

const idParamSchema = z.object({ id: z.uuid('id must be a valid UUID') });

const listStaffUsersSchema = z
  .object({
    includeArchived: z
      .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
    ...paginationFields,
  })
  .strict();

const createStaffUserSchema = z
  .object({
    email: z
      .string({ error: 'email is required' })
      .trim()
      .toLowerCase()
      .pipe(z.email('email must be a valid email address')),
    password: z
      .string({ error: 'password is required' })
      .min(8, 'password must be at least 8 characters')
      .max(72, 'password must be at most 72 characters')
      .regex(/[A-Za-z]/, 'password must contain at least one letter')
      .regex(/[0-9]/, 'password must contain at least one number'),
    role: z.enum(['admin', 'data_feeder'], { error: "role must be 'admin' or 'data_feeder'" }),
  })
  .strict();

module.exports = { idParamSchema, listStaffUsersSchema, createStaffUserSchema };
