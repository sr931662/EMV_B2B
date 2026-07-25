// Express 4 does not forward rejected promises to the error handler, so every async
// route/middleware is wrapped in this. Lets us throw freely instead of try/catch per route.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
