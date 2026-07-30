require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const q = `select table_name, column_name, data_type
           from information_schema.columns
           where table_name in ('Destination')
           order by table_name, ordinal_position`;

p.$queryRawUnsafe(q)
  .then((r) => console.table(r))
  .catch((e) => console.log('FAIL', e.message.split('\n')[0]))
  .finally(() => p.$disconnect());
