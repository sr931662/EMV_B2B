const ApiError = require('../utils/ApiError');

// validate(schema)            -> validates req.body, replaces it with the parsed result
// validate(schema, 'params')  -> validates route params, result on req.validatedParams
// validate(schema, 'query')   -> validates query string, result on req.validatedQuery
//
// Parsed query/params land on new properties rather than overwriting req.query / req.params:
// those are prototype getters in Express and assigning to them is unreliable. Bodies are a
// plain property, so replacing req.body is safe and keeps controllers reading req.body.
//
// On failure: 400 naming every offending field.
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const input = source === 'query' ? req.query : source === 'params' ? req.params : req.body;

    const result = schema.safeParse(input ?? {});

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.length ? issue.path.join('.') : `(${source})`,
        message: issue.message,
      }));

      const fieldList = [...new Set(details.map((d) => d.field))].join(', ');

      return next(ApiError.badRequest(`Validation failed for: ${fieldList}`, details));
    }

    if (source === 'query') req.validatedQuery = result.data;
    else if (source === 'params') req.validatedParams = result.data;
    else req.body = result.data;

    return next();
  };
}

module.exports = validate;
