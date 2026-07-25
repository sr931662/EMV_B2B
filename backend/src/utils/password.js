const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword };
