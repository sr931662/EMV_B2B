const express = require('express');

const controller = require('../controllers/rateController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { uploadSpreadsheet, requireFile } = require('../middleware/upload');
const { CAN_READ_LIBRARY } = require('../utils/roles');

const router = express.Router();

router.use(authMiddleware);

/**
 * Rate cards and supplier contracts (Phase 5).
 *
 * READS are open to every role that can read the library, because "what does this cost on these
 * dates" is the question a partner is trying to answer when they build a quote — sending them to ask
 * an admin is how people go back to typing prices by hand.
 *
 * WRITES are ADMIN ONLY, which is stricter than the rest of the library. What a supplier charges is
 * not something a data feeder maintains, and unlike a description a wrong number here is money.
 */

// Hotel rate cards.
router.get('/hotels/:hotelId/rates', roleMiddleware(...CAN_READ_LIBRARY), controller.listHotelRates);
router.put('/hotels/:hotelId/rates', roleMiddleware('admin'), controller.saveHotelRates);
router.get('/hotels/:hotelId/rates/export', roleMiddleware(...CAN_READ_LIBRARY), controller.exportHotelRates);
router.post(
  '/hotels/:hotelId/rates/import',
  roleMiddleware('admin'),
  uploadSpreadsheet('file'),
  requireFile('file'),
  controller.importHotelRates
);
router.get('/hotels/:hotelId/price', roleMiddleware(...CAN_READ_LIBRARY), controller.priceStay);

// Supplier contracts for a hotel.
router.get('/hotels/:hotelId/vendors', roleMiddleware(...CAN_READ_LIBRARY), controller.listHotelVendors);
router.put('/hotels/:hotelId/vendors', roleMiddleware('admin'), controller.saveHotelVendor);
router.delete('/hotel-vendors/:contractId', roleMiddleware('admin'), controller.archiveHotelVendor);
router.post('/hotel-vendors/:contractId/restore', roleMiddleware('admin'), controller.restoreHotelVendor);

// Activity rate cards.
router.get(
  '/activities/:activityId/rates',
  roleMiddleware(...CAN_READ_LIBRARY),
  controller.listActivityRates
);
router.put('/activities/:activityId/rates', roleMiddleware('admin'), controller.saveActivityRates);
router.get(
  '/activities/:activityId/price',
  roleMiddleware(...CAN_READ_LIBRARY),
  controller.priceActivity
);

module.exports = router;
