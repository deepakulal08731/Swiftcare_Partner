// backend/routes/authRoutes.js

const express = require('express');
const router  = express.Router();
const { getPool } = require('../db/mysql');
const authController = require('../controllers/ambulanceController');

router.post('/register', authController.registerUser);
router.post('/login',    authController.loginUser);

// GET all users (Admin Panel)
router.get('/users', async (req, res) => {
    const pool = getPool();
    try {
        const [rows] = await pool.execute('SELECT id, name, email, role, mobile_number, created_at FROM users');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error fetching users.' });
    }
});

module.exports = router;
