// backend/controllers/ambulanceController.js
// Fully rewritten: ALL drivers notified, first to accept wins, cancel rebroadcasts

const { getPool } = require('../db/mysql');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const generateToken = (id, role) =>
    jwt.sign({ id, role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '30d' });

// ── AUTH ─────────────────────────────────────────────────────

exports.registerUser = async (req, res) => {
    const { name, email, password, role, mobileNumber } = req.body;
    const pool = getPool();
    try {
        const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0)
            return res.status(400).json({ success: false, message: 'User already exists' });

        const hashed = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password, role, mobile_number) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashed, role || 'user', mobileNumber || null]
        );

        res.status(201).json({
            success: true,
            user: { id: result.insertId, name, email, role: role || 'user' },
            token: generateToken(result.insertId, role || 'user'),
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    const pool = getPool();
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        res.json({
            success: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
            token: generateToken(user.id, user.role),
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── AMBULANCE ASSIGNMENT ──────────────────────────────────────
// Patient calls → create a PENDING assignment → notify ALL drivers

exports.assignAmbulance = async (req, res) => {
    const { patientEmail, patientName, patientLocation, emergencyType, patientMobile } = req.body;
    if (!patientLocation)
        return res.status(400).json({ success: false, message: 'Patient location required.' });

    const pool = getPool();
    try {
        const isRegistered = patientEmail !== 'unauthenticated_emergency';
        const finalEmail   = isRegistered ? patientEmail  : 'N/A';
        const finalName    = isRegistered ? patientName   : 'Emergency User (Anonymous)';
        const finalMobile  = isRegistered && patientMobile ? patientMobile : 'Not provided';

        // Create assignment in PENDING state (no ambulance assigned yet)
        const [result] = await pool.execute(
            `INSERT INTO assignments
             (patient_email, patient_name, patient_mobile, patient_location,
              emergency_type, ambulance_id, ambulance_name, driver_name,
              driver_phone, driver_email, hospital_name, status)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'pending')`,
            [finalEmail, finalName, finalMobile, patientLocation,
             emergencyType || 'General Emergency']
        );

        const assignment = {
            id:              result.insertId,
            _id:             result.insertId,
            patientEmail:    finalEmail,
            patientName:     finalName,
            patientMobile:   finalMobile,
            patientLocation,
            emergencyType:   emergencyType || 'General Emergency',
            status:          'pending',
        };

        // Notify ALL drivers at once via broadcast
        const io = req.app.get('socketio');
        io.to('dispatch_room').emit('new_emergency', assignment);
        console.log(`🚨 New emergency broadcast to all drivers. ID: ${result.insertId}`);

        res.status(201).json({ success: true, message: 'Request sent to all drivers.', assignment });

    } catch (err) {
        console.error('Assign error:', err);
        res.status(500).json({ success: false, message: 'Server error during assignment.' });
    }
};

// ── DRIVER ACCEPTS ────────────────────────────────────────────
// First driver to accept locks the assignment

exports.acceptAssignment = async (req, res) => {
    const { id }         = req.params;
    const { driverEmail } = req.body; // frontend sends logged-in driver email
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // Check assignment is still pending (not yet taken)
        const [rows] = await conn.execute(
            'SELECT * FROM assignments WHERE id = ? AND status = ? FOR UPDATE',
            [id, 'pending']
        );

        if (rows.length === 0) {
            await conn.rollback();
            return res.status(409).json({
                success: false,
                message: 'This request was already accepted by another driver.',
            });
        }

        // Find an available ambulance for this driver
        const [ambulances] = await conn.execute(
            'SELECT * FROM ambulances WHERE driver_email = ? AND available = 1 LIMIT 1',
            [driverEmail]
        );

        if (ambulances.length === 0) {
            await conn.rollback();
            return res.status(409).json({
                success: false,
                message: 'No available ambulance found for your account.',
            });
        }

        const amb = ambulances[0];

        // Lock the ambulance
        await conn.execute('UPDATE ambulances SET available = 0 WHERE id = ?', [amb.id]);

        // Update assignment to en-route with driver details
        await conn.execute(
            `UPDATE assignments SET
                status        = 'en-route',
                ambulance_id  = ?,
                ambulance_name = ?,
                driver_name   = ?,
                driver_phone  = ?,
                driver_email  = ?,
                hospital_name = ?
             WHERE id = ?`,
            [amb.id, amb.ambulance_name, amb.driver_name,
             amb.driver_phone, amb.driver_email, amb.hospital_name, id]
        );

        await conn.commit();

        const updatedAssignment = {
            id,
            _id:           id,
            status:        'en-route',
            ambulanceName: amb.ambulance_name,
            driverName:    amb.driver_name,
            driverPhone:   amb.driver_phone,
            driverEmail:   amb.driver_email,
            hospitalName:  amb.hospital_name,
            patientLocation: rows[0].patient_location,
            patientName:   rows[0].patient_name,
            patientMobile: rows[0].patient_mobile,
        };

        const io = req.app.get('socketio');

        // Tell ALL drivers this request is now taken → they remove it from their list
        io.to('dispatch_room').emit('emergency_taken', { id });

        // Tell the patient their ambulance is assigned
        io.to(`assignment_${id}`).emit('status_update', {
            id,
            status:        'en-route',
            ambulanceName: amb.ambulance_name,
            driverName:    amb.driver_name,
            driverPhone:   amb.driver_phone,
            hospitalName:  amb.hospital_name,
        });

        console.log(`✅ Assignment ${id} accepted by ${driverEmail}`);
        res.json({ success: true, assignment: updatedAssignment });

    } catch (err) {
        await conn.rollback();
        console.error('Accept error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        conn.release();
    }
};

// ── DRIVER CANCELS ────────────────────────────────────────────
// Cancels current job → rebroadcasts to all drivers

exports.cancelAssignment = async (req, res) => {
    const { id } = req.params;
    const pool = getPool();
    try {
        const [rows] = await pool.execute('SELECT * FROM assignments WHERE id = ?', [id]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Not found' });

        const assignment = rows[0];

        // Free the ambulance
        if (assignment.ambulance_id) {
            await pool.execute('UPDATE ambulances SET available = 1 WHERE id = ?', [assignment.ambulance_id]);
        }

        // Reset assignment back to pending so other drivers can accept
        await pool.execute(
            `UPDATE assignments SET
                status        = 'pending',
                ambulance_id  = NULL,
                ambulance_name = NULL,
                driver_name   = NULL,
                driver_phone  = NULL,
                driver_email  = NULL,
                hospital_name = NULL
             WHERE id = ?`,
            [id]
        );

        const rebroadcast = {
            id,
            _id:             id,
            patientEmail:    assignment.patient_email,
            patientName:     assignment.patient_name,
            patientMobile:   assignment.patient_mobile,
            patientLocation: assignment.patient_location,
            emergencyType:   assignment.emergency_type,
            status:          'pending',
        };

        const io = req.app.get('socketio');

        // Rebroadcast to ALL drivers again
        io.to('dispatch_room').emit('new_emergency', rebroadcast);

        // Tell patient → back to searching
        io.to(`assignment_${id}`).emit('status_update', { id, status: 'searching' });

        console.log(`🔄 Assignment ${id} cancelled and rebroadcast to all drivers.`);
        res.json({ success: true, message: 'Cancelled and rebroadcast to all drivers.' });

    } catch (err) {
        console.error('Cancel error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── UPDATE STATUS ─────────────────────────────────────────────

exports.updateAssignmentStatus = async (req, res) => {
    const { status } = req.body;
    const { id }     = req.params;
    const pool = getPool();
    try {
        const [rows] = await pool.execute('SELECT * FROM assignments WHERE id = ?', [id]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Not found' });

        await pool.execute('UPDATE assignments SET status = ? WHERE id = ?', [status, id]);

        if (status === 'completed' && rows[0].ambulance_id) {
            await pool.execute('UPDATE ambulances SET available = 1 WHERE id = ?', [rows[0].ambulance_id]);
        }

        const io = req.app.get('socketio');
        io.to(`assignment_${id}`).emit('status_update', { id, status });
        io.to('dispatch_room').emit('assignment_updated', { ...rows[0], status });

        res.json({ success: true, assignment: { ...rows[0], status } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── GET ACTIVE ASSIGNMENTS ────────────────────────────────────

exports.getActiveAssignments = async (req, res) => {
    const pool = getPool();
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM assignments
             WHERE status IN ('pending','en-route','arrived')
             ORDER BY assigned_at ASC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Fetch failed' });
    }
};
