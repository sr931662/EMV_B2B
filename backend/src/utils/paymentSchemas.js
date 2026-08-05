const { z } = require('zod');
const { paginationFields } = require('./paginationSchema');

const MAX_PRICE = 9999999999.99; // Decimal(12,2)

const uuidField = (label) => z.uuid(`${label} must be a valid UUID`);

const idParamSchema = z.object({ id: uuidField('id') });

// Multipart fields all arrive as strings, hence z.coerce throughout.
const submitPaymentSchema = z
  .object({
    transactionId: z
      .string({ error: 'transactionId is required' })
      .trim()
      .min(3, 'transactionId must be at least 3 characters')
      .max(120, 'transactionId must be at most 120 characters'),
    amount: z.coerce
      .number({ error: 'amount is required and must be a number' })
      .positive('amount must be greater than zero')
      .max(MAX_PRICE, `amount must be at most ${MAX_PRICE}`)
      .refine((v) => Math.round(v * 100) / 100 === v, 'amount may have at most 2 decimal places'),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

// Optional on approve — an approval needs no justification.
const approvePaymentSchema = z
  .object({ adminRemarks: z.string().trim().max(2000).optional() })
  .strict();

// Required on reject and request-info: the partner has to be told what to fix, otherwise they
// resubmit the same thing and the queue churns.
const remarksRequiredSchema = z
  .object({
    adminRemarks: z
      .string({ error: 'adminRemarks is required — explain what the partner must fix' })
      .trim()
      .min(5, 'adminRemarks must be at least 5 characters — explain what the partner must fix')
      .max(2000),
  })
  .strict();

const listPaymentsSchema = z
  .object({
    status: z
      .enum(['PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'INFO_REQUESTED'], {
        error: 'status is not a valid payment status',
      })
      .optional(),
    type: z.enum(['PACKAGE', 'VISA'], { error: "type must be 'PACKAGE' or 'VISA'" }).optional(),
    includeArchived: z
      .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
    ...paginationFields,
  })
  .strict();

module.exports = {
  idParamSchema,
  submitPaymentSchema,
  approvePaymentSchema,
  remarksRequiredSchema,
  listPaymentsSchema,
};
