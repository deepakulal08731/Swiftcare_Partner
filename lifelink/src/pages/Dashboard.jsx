import React, { useState, useEffect } from "react";
import Navbar from "../ui/Navbar.jsx";
import FeatureCard from "../ui/FeatureCard.jsx";
import MapStub from "../ui/MapStub.jsx";
import VideoCallStub from "../ui/VideoCallStub.jsx";
import AIHelp from "../ui/AIHelp.jsx";
import { Stethoscope, Bot, MapPinned, XCircle } from "lucide-react";
import axios from 'axios';
import { socket } from "../socket.js";
import { useAuth } from "../auth/AuthContext.jsx";

const API_BASE_URL = "http://localhost:5000/api/ambulance";

export default function Dashboard({ emergencyMode = false }) {
    const { user, token } = useAuth();

    const [assigned, setAssigned]               = useState(false);
    const [isLoading, setIsLoading]             = useState(false);
    const [assignment, setAssignment]           = useState(null);
    const [error, setError]                     = useState("");
    const [userLocation, setUserLocation]       = useState("Detecting location...");
    const [completionMessage, setCompletionMessage] = useState(null);
    const [searchingDriver, setSearchingDriver] = useState(false); // NEW: searching state

    // ── Detect user location ──────────────────────────────────
    useEffect(() => {
        if (assignment?.patientLocation) {
            setUserLocation(assignment.patientLocation);
            return;
        }

        const sessionLoc  = sessionStorage.getItem("swift_location");
        const isManualFlag = sessionStorage.getItem("location_type") === "manual";

        if (sessionLoc && sessionLoc.trim() !== "" && sessionLoc !== "Detecting location...") {
            setUserLocation(sessionLoc);
            if (isManualFlag || !sessionLoc.includes("lat")) return;
        }

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const freshLoc = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
                    setUserLocation(freshLoc);
                    sessionStorage.setItem("swift_location", freshLoc);
                    sessionStorage.setItem("location_type", "auto");
                },
                () => {
                    const fallback = sessionStorage.getItem("swift_location") || user?.location;
                    setUserLocation(fallback || "Location Required");
                },
                { timeout: 5000 }
            );
        }
    }, [user, assignment?.patientLocation]);

    // ── Real-time socket listener ─────────────────────────────
    useEffect(() => {
        // Always listen for status_update — filter by ID inside
        const handleStatusUpdate = (data) => {
            try {
                const myId = String(assignment?.id || assignment?._id || '');
                if (!myId || String(data.id) !== myId) return;

                const newStatus = data.status;

                if (newStatus === 'completed') {
                    setAssigned(false);
                    setSearchingDriver(false);
                    setAssignment(null);
                    setCompletionMessage("✅ Service completed successfully! Stay safe.");
                    setTimeout(() => setCompletionMessage(null), 8000);

                } else if (newStatus === 'cancelled' || newStatus === 'searching') {
                    setSearchingDriver(true);
                    setAssigned(false);
                    setAssignment(prev => prev ? {
                        ...prev,
                        status: 'pending',
                        ambulanceName: null,
                        driverName: null,
                        driverPhone: null,
                    } : null);
                    setCompletionMessage("⚠️ Driver cancelled. Searching for another driver...");
                    setTimeout(() => setCompletionMessage(null), 5000);

                } else if (newStatus === 'en-route') {
                    setSearchingDriver(false);
                    setAssigned(true);
                    setAssignment(prev => prev ? {
                        ...prev,
                        status:        'en-route',
                        ambulanceName: data.ambulanceName || prev.ambulanceName || 'SwiftCare',
                        driverName:    data.driverName    || prev.driverName    || 'Driver',
                        driverPhone:   data.driverPhone   || prev.driverPhone   || 'N/A',
                        hospitalName:  data.hospitalName  || prev.hospitalName  || 'N/A',
                    } : null);

                } else {
                    setAssignment(prev => prev ? { ...prev, status: newStatus } : null);
                }
            } catch (err) {
                console.error('Socket status_update error:', err);
            }
        };

        socket.on('status_update', handleStatusUpdate);
        return () => socket.off('status_update', handleStatusUpdate);
    }, [assignment?.id, assignment?._id]);

    // Join assignment room when we get an assignment ID
    useEffect(() => {
        const assignmentId = assignment?.id || assignment?._id;
        if (assignmentId) {
            socket.emit('join_assignment', assignmentId);
            console.log('Joined assignment room:', assignmentId);
        }
    }, [assignment?.id, assignment?._id]);

    // ── Assign ambulance ──────────────────────────────────────
    const handleAssignAmbulance = async () => {
        if (!userLocation || userLocation.includes("Detecting")) {
            setError("Location missing. Please wait or enter manually.");
            return;
        }
        if (!token && !emergencyMode) {
            setError("Please sign in or use Emergency Mode.");
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const payload = {
                patientName:     user?.name     || "Emergency User",
                patientEmail:    user?.email    || "unauthenticated_emergency",
                patientLocation: userLocation,
                emergencyType:   emergencyMode ? "Critical Emergency" : "General Emergency",
                patientMobile:   user?.mobileNumber,
            };

            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await axios.post(`${API_BASE_URL}/assign`, payload, { headers });

            if (res.data.success) {
                // Start in SEARCHING state — wait for driver to accept
                setSearchingDriver(true);
                setAssigned(false);
                setAssignment(res.data.assignment);
            } else {
                setError(res.data.message || "Failed to request ambulance.");
            }
        } catch (err) {
            setError(err.response?.data?.message || "Backend not reachable.");
        } finally {
            setIsLoading(false);
        }
    };

    // ── Cancel assignment ─────────────────────────────────────
    const handleCancelAssignment = async () => {
        if (!assignment) return;
        if (!window.confirm("Cancel this request?")) return;
        setIsLoading(true);
        try {
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const id = assignment.id || assignment._id;
            await axios.patch(`${API_BASE_URL}/assignment/${id}/cancel`, {}, { headers });
            setAssigned(false);
            setSearchingDriver(false);
            setAssignment(null);
            setError("");
        } catch (err) {
            setError("Error during cancellation.");
        } finally {
            setIsLoading(false);
        }
    };

    // ── Status label for button ───────────────────────────────
    const getButtonLabel = () => {
        if (isLoading) return "Processing...";
        if (searchingDriver) return "🔍 Searching for Driver...";
        if (assigned && assignment) return `🚑 Status: ${assignment.status?.toUpperCase()}`;
        return "Assign Ambulance";
    };

    return (
        <div className="min-h-screen bg-mesh">
            <Navbar emergencyMode={emergencyMode} />

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
                <section className="bg-white/80 backdrop-blur rounded-3xl p-6 md:p-8 shadow-glow ring-1 ring-white mb-8">
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-4">
                            <h1 className="text-3xl md:text-4xl font-extrabold bg-clip-text text-transparent bg-rainbow">
                                {emergencyMode ? "🚨 Emergency Mode" : "SwiftCare Dashboard"}
                            </h1>

                            <div className="text-slate-600">
                                {emergencyMode ? "Instant ambulance booking active." : "Assign nearest ambulance and stream vitals."}
                            </div>

                            <p className="text-sm text-emerald-700 font-medium bg-emerald-50 p-2 rounded-lg inline-block border border-emerald-100">
                                📍 Pickup Point: <b>{userLocation}</b>
                            </p>

                            <div className="flex flex-wrap gap-4">
                                <button
                                    onClick={handleAssignAmbulance}
                                    disabled={isLoading || searchingDriver || assigned}
                                    className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-white bg-gradient-to-r from-emerald-500 to-sky-500 hover:opacity-90 transition shadow-lg disabled:opacity-60"
                                >
                                    <MapPinned className="w-5 h-5" />
                                    {getButtonLabel()}
                                </button>

                                {(searchingDriver || assigned) && assignment && (
                                    <button
                                        onClick={handleCancelAssignment}
                                        disabled={isLoading}
                                        className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 font-semibold text-white bg-red-600 hover:bg-red-700 transition shadow-lg"
                                    >
                                        <XCircle className="w-5 h-5" />
                                        Cancel
                                    </button>
                                )}
                            </div>

                            {completionMessage && (
                                <p className="font-bold text-green-600 animate-bounce">{completionMessage}</p>
                            )}
                            {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

                            {/* Searching state */}
                            {searchingDriver && !assigned && (
                                <div className="mt-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200 animate-pulse">
                                    <h3 className="font-bold text-yellow-700">🔍 Searching for Driver...</h3>
                                    <p className="text-sm text-slate-600 mt-1">
                                        Request sent to all available drivers. Please wait...
                                    </p>
                                </div>
                            )}

                            {/* Assigned state — driver accepted */}
                            {assigned && assignment && (
                                <div className="mt-4 p-4 bg-white rounded-xl shadow border border-emerald-100">
                                    <h3 className="font-bold text-green-700">🚑 Driver Accepted!</h3>
                                    {assignment.ambulanceName && (
                                        <p className="text-sm text-slate-700 mt-1">
                                            Ambulance: <b>{assignment.ambulanceName}</b>
                                        </p>
                                    )}
                                    {assignment.driverName && (
                                        <p className="text-sm text-slate-700">
                                            Driver: <b>{assignment.driverName}</b>
                                        </p>
                                    )}
                                    {assignment.driverPhone && (
                                        <p className="text-sm text-slate-700">
                                            Phone: <b>{assignment.driverPhone}</b>
                                        </p>
                                    )}
                                    {assignment.hospitalName && (
                                        <p className="text-sm text-slate-700">
                                            Hospital: <b>{assignment.hospitalName}</b>
                                        </p>
                                    )}
                                    <p className="text-xs text-orange-600 font-bold mt-2 uppercase">
                                        Status: {assignment.status}
                                    </p>
                                </div>
                            )}
                        </div>

                        <MapStub
                            assigned={assigned}
                            ambulanceLocation={assignment?.ambulanceLocation}
                            patientLocation={userLocation}
                            status={assignment?.status}
                        />
                    </div>
                </section>

                <section className="grid md:grid-cols-2 gap-6 mb-8">
                    <FeatureCard title="Doctor Video" desc="Instant consultation." icon={<Stethoscope />} gradient="from-rose-400 to-indigo-400" />
                    <FeatureCard title="AI First-Aid" desc="Triage support." icon={<Bot />} gradient="from-amber-400 to-pink-400" />
                </section>

                <div className="grid xl:grid-cols-3 gap-8 pb-10">
                    <div className="xl:col-span-2 space-y-8">
                        <VideoCallStub />
                        {!emergencyMode && <AIHelp />}
                    </div>
                </div>
            </div>
        </div>
    );
}
