const { PrismaClient } = require('@prisma/client');

// Single shared client for the whole process. Re-instantiating PrismaClient per
// request exhausts the Postgres connection pool.
const prisma = new PrismaClient();

module.exports = prisma;
