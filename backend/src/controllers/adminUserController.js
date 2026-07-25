const asyncHandler = require('../utils/asyncHandler');
const adminUserService = require('../services/adminUserService');

const list = asyncHandler(async (req, res) => {
  const users = await adminUserService.list(req.validatedQuery);

  res.status(200).json({ count: users.length, includeArchived: req.validatedQuery.includeArchived, users });
});

const create = asyncHandler(async (req, res) => {
  const user = await adminUserService.create(req.body);

  res.status(201).json({ message: `${req.body.role} account created`, user });
});

const suspend = asyncHandler(async (req, res) => {
  const user = await adminUserService.suspend(req.params.id, req.user);

  res.status(200).json({ message: 'Staff account suspended — sessions revoked', user });
});

const activate = asyncHandler(async (req, res) => {
  const user = await adminUserService.activate(req.params.id);

  res.status(200).json({ message: 'Staff account activated', user });
});

module.exports = { list, create, suspend, activate };
