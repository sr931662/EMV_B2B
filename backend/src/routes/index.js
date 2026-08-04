const express = require('express');

const authRoutes = require('./authRoutes');
const destinationRoutes = require('./destinationRoutes');
const dayTemplateRoutes = require('./dayTemplateRoutes');
const hotelRoutes = require('./hotelRoutes');
const packageRoutes = require('./packageRoutes');
const quoteRoutes = require('./quoteRoutes');
const adminPaymentRoutes = require('./adminPaymentRoutes');
const uploadRoutes = require('./uploadRoutes');
const visaCountryRoutes = require('./visaCountryRoutes');
const visaProductRoutes = require('./visaProductRoutes');
const visaDocumentRoutes = require('./visaDocumentRoutes');
const visaRequestRoutes = require('./visaRequestRoutes');
const adminVisaRoutes = require('./adminVisaRoutes');
const notificationRoutes = require('./notificationRoutes');
const adminAgencyRoutes = require('./adminAgencyRoutes');
const adminUserRoutes = require('./adminUserRoutes');
const emailTemplateRoutes = require('./emailTemplateRoutes');
const adminReportRoutes = require('./adminReportRoutes');
const dashboardRoutes = require('./dashboardRoutes');

const router = express.Router();

router.use('/auth', authRoutes);

// Data libraries (build step 3). Source data only — packages copy from these later.
router.use('/destinations', destinationRoutes);
router.use('/day-templates', dayTemplateRoutes);
router.use('/hotels', hotelRoutes);

// Packages + auto-generated EMV quote (build step 4).
router.use('/packages', packageRoutes);

// Partner white-label quotes (build step 5). Also carries POST /quotes/:id/payment (step 6).
router.use('/quotes', quoteRoutes);

// Admin verification queue (build step 6, extended in step 7 for VISA payments). Admin-only.
router.use('/admin/payments', adminPaymentRoutes);

// Signed direct-to-Cloudinary image uploads. No files pass through this server — see
// cloudinaryService for why.
router.use('/uploads', uploadRoutes);

// Visa services (build step 7).
// Registered before '/visa-products' only for readability — the two paths never collide since
// '/visa-products/:id' (single segment) cannot match '/visa-products/:productId/documents...'
// (two extra segments), so mount order does not matter here.
//
// The checklist hangs off the PRODUCT, not the country: one country can offer several visa
// options and each asks for different paperwork.
router.use('/visa-products/:productId/documents', visaDocumentRoutes);
router.use('/visa-products', visaProductRoutes);
router.use('/visa-countries', visaCountryRoutes);
router.use('/visa-requests', visaRequestRoutes);
router.use('/admin/visa-requests', adminVisaRoutes);

// In-app notifications (build step 8). Every authenticated role, own notifications only.
router.use('/notifications', notificationRoutes);

// Admin CMS (build step 9). All admin-only.
router.use('/admin/agencies', adminAgencyRoutes);
router.use('/admin/users', adminUserRoutes);
router.use('/admin/email-templates', emailTemplateRoutes);
router.use('/admin/reports', adminReportRoutes);

// Partner dashboard (build step 9). Partner-only.
router.use('/dashboard', dashboardRoutes);

module.exports = router;
