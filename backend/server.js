// backend/server.js

const express  = require('express');
const dotenv   = require('dotenv');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const { connectDB, getPool } = require('./db/mysql');

dotenv.config();

const authRoutes      = require('./routes/authRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');
const reportRoutes    = require('./routes/reportRoutes');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173'],
        methods: ['GET', 'POST', 'PATCH'],
        credentials: true,
    },
});

app.set('socketio', io);

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join_driver_room', (driverEmail) => {
        if (driverEmail) {
            socket.join(`room_${driverEmail}`);
            console.log(`Driver [${driverEmail}] joined room_${driverEmail}`);
        }
    });

    socket.on('join_dispatch', () => {
        socket.join('dispatch_room');
        console.log('Socket joined dispatch_room');
    });

    socket.on('join_assignment', (assignmentId) => {
        socket.join(`assignment_${assignmentId}`);
        console.log(`Client joined assignment_${assignmentId}`);
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

app.use('/api/auth',      authRoutes);
app.use('/api/ambulance', ambulanceRoutes);
app.use('/api/reports',   reportRoutes);

app.get('/', (req, res) => res.send('SwiftCare Backend Running (MySQL + Gemini).'));

const start = async () => {
    try {
        await connectDB();

        // Reset all ambulances to available on startup
        const pool = getPool();
        await pool.execute('UPDATE ambulances SET available = 1');
        console.log('Ambulance availability reset successfully.');

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Startup error:', err.message);
        process.exit(1);
    }
};

start();
