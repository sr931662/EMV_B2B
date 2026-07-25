require('dotenv').config();
const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);

// Order matters: unmatched route -> 404, then the global error handler must be last.
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`B2B EMV backend listening on port ${PORT}`);
  });
}

module.exports = app;
