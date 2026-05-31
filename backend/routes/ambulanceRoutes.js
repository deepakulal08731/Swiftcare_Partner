// backend/routes/ambulanceRoutes.js

const express = require('express');
const router  = express.Router();
const ambulanceController = require('../controllers/ambulanceController');
const { getPool } = require('../db/mysql');

// Public — assign ambulance (works without login for emergency mode)
router.post('/assign', ambulanceController.assignAmbulance);

// Driver/Admin routes
router.patch('/assignment/:id/status',  ambulanceController.updateAssignmentStatus);
router.patch('/assignment/:id/accept',  ambulanceController.acceptAssignment);
router.patch('/assignment/:id/cancel',  ambulanceController.cancelAssignment);
router.get('/assignments/active',       ambulanceController.getActiveAssignments);

// Admin — get all ambulances
router.get('/all', async (req, res) => {
    const pool = getPool();
    try {
        const [rows] = await pool.execute('SELECT * FROM ambulances');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not fetch ambulances.' });
    }
});

module.exports = router;
