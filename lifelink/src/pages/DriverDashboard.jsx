import React, { useState, useEffect, useCallback } from "react";
import axios from 'axios';
import { useAuth } from "../auth/AuthContext.jsx";
import { Truck, MapPin, Phone, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { socket } from "../socket.js";

const API_BASE_URL = "http://localhost:5000/api/ambulance";

export default function DriverDashboard() {
    const { user, token } = useAuth();

    const [pendingRequests, setPendingRequests] = useState([]); // All pending (not yet accepted)
    const [myAssignment, setMyAssignment]       = useState(null); // This driver's active job
    const [error, setError]   = useState("");
    const [loading, setLoading] = useState(true);

    const getAuthHeaders = useCallback(() => {
        if (!token) { setError("Please log in."); return null; }
        return { Authorization: `Bearer ${token}` };
    }, [token]);

    // Fetch active assignments and split into pending vs mine
    const fetchAssignments = useCallback(async () => {
        const headers = getAuthHeaders();
        if (!headers) { setLoading(false); return; }
        try {
            const res = await axios.get(`${API_BASE_URL}/assignments/active`, { headers });
            const all = res.data;

            // Pending = no driver yet
            const pending = all.filter(a =>
                a.status === 'pending' && !a.driver_email
            );

            // My job = assigned to my email and active
            const mine = all.find(a =>
                a.driver_email === user?.email &&
                ['en-route', 'arrived'].includes(a.status)
            );

            setPendingRequests(pending);
            setMyAssignment(mine || null);
            setError("");
        } catch (err) {
            setError("Failed to fetch assignments.");
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, user?.email]);

    // Accept a request — first driver to click wins
    const handleAccept = async (id) => {
        const headers = getAuthHeaders();
        if (!headers) return;
        try {
            const res = await axios.patch(
                `${API_BASE_URL}/assignment/${id}/accept`,
                { driverEmail: user.email },
                { headers }
            );
            if (res.data.success) {
                fetchAssignments();
            } else {
                alert(res.data.message || "Could not accept — already taken.");
                fetchAssignments();
            }
        } catch (err) {
            alert(err.response?.data?.message || "Already taken by another driver.");
            fetchAssignments();
        }
    };

    // Update status (arrived / completed)
    const updateStatus = async (id, newStatus) => {
        const headers = getAuthHeaders();
        if (!headers) return;
        try {
            await axios.patch(
                `${API_BASE_URL}/assignment/${id}/status`,
                { status: newStatus },
                { headers }
            );
            fetchAssignments();
        } catch (err) {
            alert("Status update failed.");
        }
    };

    // Cancel current job → rebroadcasts to all drivers
    const handleCancel = async (id) => {
        if (!window.confirm("Cancel this assignment? It will be rebroadcast to all drivers.")) return;
        const headers = getAuthHeaders();
        if (!headers) return;
        try {
            await axios.patch(`${API_BASE_URL}/assignment/${id}/cancel`, {}, { headers });
            setMyAssignment(null);
            fetchAssignments();
        } catch (err) {
            alert("Cancellation failed.");
        }
    };

    // Socket.IO real-time listeners
    useEffect(() => {
        if (!user || user.role !== 'driver') return;

        fetchAssignments();

        socket.emit('join_dispatch');
        socket.emit('join_driver_room', user.email);

        // New emergency broadcast → add to pending list
        socket.on('new_emergency', (data) => {
            console.log("🚨 New emergency received:", data);
            setPendingRequests(prev => {
                const exists = prev.find(r => r.id === data.id);
                if (exists) return prev;
                return [...prev, data];
            });
        });

        // Another driver accepted → remove from pending
        socket.on('emergency_taken', ({ id }) => {
            console.log("✅ Emergency taken by another driver:", id);
            setPendingRequests(prev => prev.filter(r => String(r.id) !== String(id)));
        });

        // General updates
        socket.on('assignment_updated', () => fetchAssignments());

        return () => {
            socket.off('new_emergency');
            socket.off('emergency_taken');
            socket.off('assignment_updated');
        };
    }, [user, fetchAssignments]);

    const StatusBadge = ({ status }) => {
        const colors = {
            pending:    "bg-yellow-100 text-yellow-700 border border-yellow-200",
            'en-route': "bg-blue-100 text-blue-700 border border-blue-200",
            arrived:    "bg-emerald-100 text-emerald-700 border border-emerald-200",
            cancelled:  "bg-red-100 text-red-700 border border-red-200",
        };
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${colors[status] || "bg-slate-100 text-slate-600"}`}>
                {status.toUpperCase().replace('-', ' ')}
            </span>
        );
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-slate-600 font-medium">Connecting to Dispatch...</p>
        </div>
    );

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-sans">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        <Truck className="w-8 h-8 text-indigo-600" /> Driver Console
                    </h1>
                    <div className="text-right">
                        <p className="text-xs text-slate-400">Logged in as</p>
                        <p className="text-sm font-bold text-slate-800">{user?.name || user?.email}</p>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">🟢 Online</span>
                    </div>
                </header>

                {error && (
                    <div className="p-4 mb-6 text-red-700 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">{error}</span>
                    </div>
                )}

                {/* ── MY ACTIVE JOB ── */}
                {myAssignment && (
                    <div className="mb-8">
                        <h2 className="text-lg font-bold text-slate-700 mb-3">🚑 Your Active Job</h2>
                        <div className="bg-white p-6 rounded-3xl shadow-md border-2 border-indigo-200">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-black text-xl text-slate-900">
                                        Emergency #{String(myAssignment.id).slice(-5).toUpperCase()}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">
                                        {myAssignment.emergency_type || 'General Emergency'}
                                    </p>
                                </div>
                                <StatusBadge status={myAssignment.status} />
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <MapPin className="w-5 h-5 text-indigo-500" />
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Pickup Location</p>
                                        <p className="text-sm font-bold text-slate-800">{myAssignment.patient_location}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Phone className="w-5 h-5 text-emerald-500" />
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Patient Contact</p>
                                        <p className="text-sm font-bold text-slate-800">{myAssignment.patient_mobile || 'Not Provided'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => updateStatus(myAssignment.id, 'arrived')}
                                    disabled={myAssignment.status !== 'en-route'}
                                    className={`flex-1 min-w-[140px] px-6 py-3 rounded-2xl text-white text-sm font-black transition-all ${
                                        myAssignment.status === 'en-route'
                                        ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                                >
                                    ✅ I HAVE ARRIVED
                                </button>
                                <button
                                    onClick={() => updateStatus(myAssignment.id, 'completed')}
                                    disabled={myAssignment.status !== 'arrived'}
                                    className={`flex-1 min-w-[140px] px-6 py-3 rounded-2xl text-white text-sm font-black transition-all ${
                                        myAssignment.status === 'arrived'
                                        ? 'bg-slate-900 hover:bg-black shadow-lg'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                                >
                                    🏁 END SERVICE
                                </button>
                                <button
                                    onClick={() => handleCancel(myAssignment.id)}
                                    className="flex-1 min-w-[140px] px-6 py-3 rounded-2xl text-white text-sm font-black bg-red-500 hover:bg-red-600 shadow-lg transition-all"
                                >
                                    ❌ CANCEL JOB
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── PENDING REQUESTS ── */}
                <div>
                    <h2 className="text-lg font-bold text-slate-700 mb-3">
                        🚨 Incoming Requests
                        {pendingRequests.length > 0 && (
                            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
                                {pendingRequests.length} NEW
                            </span>
                        )}
                    </h2>

                    {pendingRequests.length === 0 ? (
                        <div className="bg-white p-12 rounded-3xl shadow-sm text-center border-2 border-dashed border-slate-200">
                            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Truck className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">No Incoming Requests</h3>
                            <p className="text-slate-500 max-w-xs mx-auto mt-2 text-sm">
                                You are on standby. New emergency calls will appear here in real-time.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {pendingRequests.map((a) => (
                                <div key={a.id} className="bg-white p-6 rounded-3xl shadow-md border border-red-100 animate-pulse-border">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-black text-xl text-slate-900">
                                                🚨 Emergency #{String(a.id).slice(-5).toUpperCase()}
                                            </h3>
                                            <p className="text-xs text-red-500 mt-1 font-bold uppercase tracking-widest">
                                                {a.emergencyType || a.emergency_type || 'General Emergency'}
                                            </p>
                                        </div>
                                        <StatusBadge status="pending" />
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-4 mb-4 bg-slate-50 p-4 rounded-2xl">
                                        <div className="flex items-center gap-3">
                                            <MapPin className="w-5 h-5 text-red-500" />
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Patient Location</p>
                                                <p className="text-sm font-bold text-slate-800">
                                                    {a.patientLocation || a.patient_location || 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Phone className="w-5 h-5 text-emerald-500" />
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Patient Name</p>
                                                <p className="text-sm font-bold text-slate-800">
                                                    {a.patientName || a.patient_name || 'Anonymous'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Only show Accept if driver has no active job */}
                                    {!myAssignment ? (
                                        <button
                                            onClick={() => handleAccept(a.id)}
                                            className="w-full px-6 py-3 rounded-2xl text-white text-sm font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95"
                                        >
                                            🚑 ACCEPT & START TRIP
                                        </button>
                                    ) : (
                                        <div className="w-full px-6 py-3 rounded-2xl text-center text-sm font-bold bg-slate-100 text-slate-400">
                                            You are currently on another job
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            <footer className="mt-12 text-center">
                <p className="text-xs text-slate-400 italic">SwiftCare Emergency Dispatch • Real-time</p>
            </footer>
        </div>
    );
}
