const { z } = require('zod');

const idParamSchema = z.object({ id: z.uuid('id must be a valid UUID') });

// Machine-readable key, not a human display name — code looks it up verbatim
// (emailService.renderTemplate), so it's constrained to a safe identifier shape.
const nameField = z
  .string({ error: 'name is required' })
  .trim()
  .min(1, 'name is required')
  .max(100, 'name must be at most 100 characters')
  .regex(/^[a-z][a-z0-9_]*$/, 'name must be lowercase letters, numbers, and underscores, starting with a letter');

const requiredText = (label, max) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max);

const createEmailTemplateSchema = z
  .object({
    name: nameField,
    subject: requiredText('subject', 255),
    body: requiredText('body', 20000),
  })
  .strict();

// name is absent: a template's lookup key never changes once code may already reference it.
const updateEmailTemplateSchema = z
  .object({
    subject: requiredText('subject', 255).optional(),
    body: requiredText('body', 20000).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update (subject, body)',
  });

const listEmailTemplatesSchema = z
  .object({
    includeArchived: z
      .enum(['true', 'false'], { error: "includeArchived must be 'true' or 'false'" })
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();

module.exports = {
  idParamSchema,
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  listEmailTemplatesSchema,
};
