// backend/routes/reportRoutes.js

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/auth');

// POST /api/reports/ai-chat — Public route, no auth required (anyone helping a patient can use it)
router.post('/ai-chat', reportController.aiChat);

// POST /api/reports/ — Save a report (authenticated users only)
router.post('/', protect, restrictTo('user', 'patient'), reportController.generateReport);

// GET /api/reports/ — All reports (Admin/Doctor only)
router.get('/', protect, restrictTo('admin', 'doctor'), reportController.getAllReports);

// GET /api/reports/myreports/:email — Patient's own reports
router.get('/myreports/:email', protect, reportController.getPatientReports);

module.exports = router;
