const { z } = require('zod');

// Optional date range applied only to the payment aggregates (see reportService.getSummary).
const reportSummarySchema = z
  .object({
    from: z.coerce.date({ error: 'from must be a valid date' }).optional(),
    to: z.coerce.date({ error: 'to must be a valid date' }).optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    error: 'from cannot be after to',
    path: ['from'],
  });

module.exports = { reportSummarySchema };
