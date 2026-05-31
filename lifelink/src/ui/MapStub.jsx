import React, { useEffect, useRef, useState } from "react";

export default function MapStub({ assigned, patientLocation, ambulanceLocation, status }) {
    const mapRef          = useRef(null);
    const mapInstanceRef  = useRef(null);
    const patientMarkerRef   = useRef(null);
    const ambulanceMarkerRef = useRef(null);
    const routeLineRef    = useRef(null);
    const [mapReady, setMapReady] = useState(false);

    const parseLocation = (locString) => {
        if (!locString || typeof locString !== 'string') return null;
        const match = locString.match(/([\d.]+)[,\s]+([\d.]+)/);
        if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
        return null;
    };

    const defaultCenter   = { lat: 12.9716, lng: 77.5946 };
    const patientCoords   = parseLocation(patientLocation)   || defaultCenter;
    const ambulanceCoords = parseLocation(ambulanceLocation) || { lat: 12.910, lng: 77.640 };

    // Load Leaflet once
    useEffect(() => {
        if (mapInstanceRef.current) return;

        if (!document.getElementById('leaflet-css')) {
            const link  = document.createElement('link');
            link.id     = 'leaflet-css';
            link.rel    = 'stylesheet';
            link.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        if (window.L) {
            initMap();
            return;
        }

        const script  = document.createElement('script');
        script.id     = 'leaflet-js';
        script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => initMap();
        document.head.appendChild(script);

        return () => {
            if (mapInstanceRef.current) {
                try { mapInstanceRef.current.remove(); } catch(e) {}
                mapInstanceRef.current   = null;
                patientMarkerRef.current = null;
                ambulanceMarkerRef.current = null;
                routeLineRef.current     = null;
            }
        };
    }, []);

    const initMap = () => {
        try {
            if (!mapRef.current || mapInstanceRef.current) return;
            const L   = window.L;
            const map = L.map(mapRef.current, {
                center: [patientCoords.lat, patientCoords.lng],
                zoom: 14,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
            }).addTo(map);

            const patientIcon = L.divIcon({
                className: '',
                html: `<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px #ef444466;"></div>`,
                iconSize: [16, 16], iconAnchor: [8, 8],
            });

            patientMarkerRef.current = L.marker(
                [patientCoords.lat, patientCoords.lng],
                { icon: patientIcon }
            ).addTo(map).bindPopup('📍 Patient Location');

            mapInstanceRef.current = map;
            setMapReady(true);
        } catch(err) {
            console.error('Map init error:', err);
        }
    };

    // Update markers when props change
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current || !window.L) return;
        try {
            const L   = window.L;
            const map = mapInstanceRef.current;

            if (patientMarkerRef.current) {
                patientMarkerRef.current.setLatLng([patientCoords.lat, patientCoords.lng]);
            }

            if (assigned) {
                const ambulanceIcon = L.divIcon({
                    className: '',
                    html: `<div style="background:#10b981;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px #10b98166;display:flex;align-items:center;justify-content:center;font-size:11px;">🚑</div>`,
                    iconSize: [20, 20], iconAnchor: [10, 10],
                });

                if (ambulanceMarkerRef.current) {
                    ambulanceMarkerRef.current.setLatLng([ambulanceCoords.lat, ambulanceCoords.lng]);
                } else {
                    ambulanceMarkerRef.current = L.marker(
                        [ambulanceCoords.lat, ambulanceCoords.lng],
                        { icon: ambulanceIcon }
                    ).addTo(map).bindPopup(`🚑 ${status || 'En Route'}`);
                }

                if (routeLineRef.current) { map.removeLayer(routeLineRef.current); }
                routeLineRef.current = L.polyline(
                    [[ambulanceCoords.lat, ambulanceCoords.lng], [patientCoords.lat, patientCoords.lng]],
                    { color: '#6366f1', weight: 3, dashArray: '6,8', opacity: 0.8 }
                ).addTo(map);

                map.fitBounds(
                    L.latLngBounds(
                        [patientCoords.lat, patientCoords.lng],
                        [ambulanceCoords.lat, ambulanceCoords.lng]
                    ),
                    { padding: [40, 40] }
                );
            } else {
                if (ambulanceMarkerRef.current) {
                    try { map.removeLayer(ambulanceMarkerRef.current); } catch(e) {}
                    ambulanceMarkerRef.current = null;
                }
                if (routeLineRef.current) {
                    try { map.removeLayer(routeLineRef.current); } catch(e) {}
                    routeLineRef.current = null;
                }
                map.setView([patientCoords.lat, patientCoords.lng], 14);
            }
        } catch(err) {
            console.error('Map update error:', err);
        }
    }, [mapReady, assigned, patientLocation, ambulanceLocation, status]);

    return (
        <div className="relative h-64 md:h-72 w-full rounded-3xl overflow-hidden shadow-inner border border-white/60">
            <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

            <div className="absolute bottom-3 left-3 z-[999] bg-white/90 backdrop-blur px-3 py-2 rounded-xl shadow text-xs text-slate-700">
                <p className="font-semibold mb-1">🗺️ Live Map</p>
                <p>📍 Patient: <span className="font-medium">{patientLocation || 'Detecting...'}</span></p>
                <p>🚑 Ambulance: <span className="font-medium">{assigned ? (status || 'En Route') : 'Searching...'}</span></p>
            </div>

            {!assigned && (
                <div className="absolute inset-0 z-[998] flex items-center justify-center pointer-events-none">
                    <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl shadow text-sm font-semibold text-slate-600 animate-pulse">
                        🔍 Searching for ambulance...
                    </div>
                </div>
            )}
        </div>
    );
}
