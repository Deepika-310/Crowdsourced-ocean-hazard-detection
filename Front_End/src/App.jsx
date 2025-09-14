import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';

// --- STYLES (with blinking animation for recording) ---
const GlobalStyles = () => (
    <style>{`
        :root {
            --bg-primary: #f9fafb; --bg-secondary: #ffffff; --panel-bg: rgba(255, 255, 255, 0.8);
            --text-primary: #1f2937; --text-secondary: #4b5563; --text-muted: #6b7280;
            --border-color: #e5e7eb; --popup-bg: #ffffff; --btn-bg: #ffffff;
        }
        html.dark {
            --bg-primary: #111827; --bg-secondary: #1f2937; --panel-bg: rgba(17, 24, 39, 0.85);
            --text-primary: #f9fafb; --text-secondary: #d1d5db; --text-muted: #9ca3af;
            --border-color: #374151; --popup-bg: #2d3748; --btn-bg: #1f2937;
        }
        body { font-family: 'Inter', sans-serif; overflow: hidden; background-color: var(--bg-primary); color: var(--text-primary); margin: 0; }
        #map { height: 100vh; width: 100%; z-index: 10; background-color: var(--bg-primary); }
        .gm-style .gm-style-iw-c {
            /* Google Maps InfoWindow Customization */
            background-color: var(--popup-bg) !important;
            border-radius: 8px !important;
            padding: 0 !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
        .gm-style .gm-style-iw-d {
            overflow: hidden !important;
        }
        .gm-style .gm-style-iw-t::after {
            background: var(--popup-bg) !important;
        }
        .gm-control-active.gm-fullscreen-control {
            margin-top: 120px !important;
        }
        * { transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, opacity 0.3s ease; }
        ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: var(--bg-secondary); }
        ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; } ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
        .accordion-content { transition: max-height 0.5s ease-in-out, padding 0.5s ease-in-out; }
        #app { position: relative; height: 100vh; width: 100vw; overflow: hidden; transition: none; }
        #sidebar { transition: transform 0.3s ease-in-out; }
        #top-left-controls, #credits-footer { transition: all 0.3s ease-in-out; }
        .sidebar-open .gm-control-active.gm-fullscreen-control { margin-left: 384px; transition: margin-left 0.3s ease-in-out;}
        input[type=range] { -webkit-appearance: none; background: transparent; width: 100%; height: 16px; }
        input[type=range]:focus { outline: none; }
        input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 6px; cursor: pointer; background: linear-gradient(to right, #3b82f6 var(--progress-percent, 0%), var(--border-color) var(--progress-percent, 0%)); border-radius: 6px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 18px; width: 18px; border-radius: 50%; background: var(--bg-secondary); cursor: pointer; margin-top: -6px; border: 3px solid #3b82f6; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        @keyframes blink { 50% { opacity: 0; } }
        .rec-blinking { animation: blink 1s linear infinite; }
    `}</style>
);

// --- MOCK DATA & HELPERS ---
const hazardTypes = { tsunami: { name: 'Tsunami Warning', color: '#dc2626', baseRadius: 50000, icon: 'fa-house-tsunami' }, stormSurge: { name: 'Storm Surge', color: '#f97316', baseRadius: 40000, icon: 'fa-wind' }, highWave: { name: 'High Waves', color: '#3b82f6', baseRadius: 15000, icon: 'fa-water' }, swellSurge: { name: 'Swell Surge', color: '#6366f1', baseRadius: 10000, icon: 'fa-water' }, coastalCurrent: { name: 'Strong Currents', color: '#eab308', baseRadius: 3000, icon: 'fa-arrows-up-down' }, pollution: { name: 'Pollution Event', color: '#84cc16', baseRadius: 2000, icon: 'fa-biohazard' }, oilSpill: { name: 'Oil Spill', color: '#4b5563', baseRadius: 5000, icon: 'fa-oil-can' }, };
const coastLinePoints = [ [23.0225, 69.6714], [18.9220, 72.8347], [15.4909, 73.8278], [9.9312, 76.2673], [8.0883, 77.5385], [13.0827, 80.2707], [17.6868, 83.2185], [21.6947, 88.0283] ];
const totalEvents = 150;
const allMockHazards = Array.from({ length: totalEvents }, (_, i) => { const segmentIndex = Math.floor(Math.random() * (coastLinePoints.length - 1)); const startPoint = coastLinePoints[segmentIndex]; const endPoint = coastLinePoints[segmentIndex + 1]; const t = Math.random(); const lat = startPoint[0] + (endPoint[0] - startPoint[0]) * t; const lng = startPoint[1] + (endPoint[1] - startPoint[1]) * t; let finalLat, finalLng; const type = Object.keys(hazardTypes)[Math.floor(Math.random() * Object.keys(hazardTypes).length)]; if (type === 'oilSpill') { const offshoreOffset = 0.5 + Math.random(); finalLng = lng < 78 ? lng - offshoreOffset : lng + offshoreOffset; finalLat = lat + (Math.random() - 0.5) * 0.2; } else { const offset = (Math.random() - 0.5) * 0.05; finalLat = lat + offset; finalLng = lng + offset / Math.cos(lat * Math.PI / 180); } const duration = 15 + Math.floor(Math.random() * 15); return { id: `rep-${i}`, lat: finalLat, lng: finalLng, type, title: hazardTypes[type].name, severity: Math.ceil(Math.random() * 5), description: `Verified report.`, timestamp: i, status: 'reported', duration }; }).sort((a, b) => a.timestamp - b.timestamp);
const predictiveMLModel = (currentReports) => { const predictions = []; const hotspotRadiusKm = 25; const predictionOffsetKm = 20; const haversineDist = (lat1, lon1, lat2, lon2) => { const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; }; for (const report of currentReports) { const nearbyReports = currentReports.filter(other => report.id !== other.id && report.type === other.type && haversineDist(report.lat, report.lng, other.lat, other.lng) < hotspotRadiusKm); if (nearbyReports.length >= 1) { const angle = Math.random() * 2 * Math.PI; const latOffset = (predictionOffsetKm / 111.32) * Math.cos(angle); const lngOffset = (predictionOffsetKm / (111.32 * Math.cos(report.lat * Math.PI / 180))) * Math.sin(angle); const duration = 10 + Math.floor(Math.random() * 10); predictions.push({ id: `pred-${report.id}-${predictions.length}`, lat: report.lat + latOffset, lng: report.lng + lngOffset, type: report.type, title: `Predicted: ${hazardTypes[report.type].name}`, description: 'High probability based on hotspot detection.', timestamp: report.timestamp + 5, status: 'predicted', severity: report.severity, duration }); } } return predictions.slice(0, 20); };
const useScript = (url) => { const [state, setState] = useState({ loaded: false, error: false }); useEffect(() => { if (window.google) { setState({ loaded: true, error: false }); return; } const script = document.createElement('script'); script.src = url; script.async = true; script.defer = true; const onScriptLoad = () => setState({ loaded: true, error: false }); const onScriptError = () => { setState({ loaded: false, error: true }); console.error(`Error loading script: ${url}`); }; script.addEventListener('load', onScriptLoad); script.addEventListener('error', onScriptError); document.head.appendChild(script); return () => { script.removeEventListener('load', onScriptLoad); script.removeEventListener('error', onScriptError); }; }, [url]); return state; };

// --- SUB-COMPONENTS ---
const AccordionItem = ({ title, children, startOpen = false }) => {
    const [isOpen, setIsOpen] = useState(startOpen);
    const contentRef = useRef(null);
    return (
        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button style={{ width: '100%', padding: '12px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setIsOpen(!isOpen)}>
                <h3 style={{ margin: 0, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</h3>
                <i className={`fas fa-chevron-down`} style={{ transition: 'transform 0.3s', transform: isOpen ? 'rotate(180deg)' : 'none' }}></i>
            </button>
            <div ref={contentRef} style={{ maxHeight: isOpen ? (contentRef.current ? `${contentRef.current.scrollHeight}px` : '500px') : '0px', overflow: 'hidden' }} className="accordion-content">
                {children}
            </div>
        </div>
    );
};

const MapComponent = forwardRef(({ hazardsToDisplay, theme, isSidebarOpen }, ref) => {
    const mapContainerRef = useRef(null);
    const mapInstance = useRef(null);
    const hazardCircles = useRef([]);
    const infoWindow = useRef(null);

    // IMPORTANT: Replace with your Google Maps API key
    const GOOGLE_MAPS_API_KEY = 'AIzaSyDPqe6FbrXgIAEiTfjv2w5ip-DYGRfm9iM';
    const { loaded: googleScriptLoaded, error: googleScriptError } = useScript(`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`);
    
    // Define map styles for light and dark themes
    const mapStyles = {
        dark: [{"elementType":"geometry","stylers":[{"color":"#242f3e"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#746855"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#242f3e"}]},{"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#263c3f"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#6b9a76"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#38414e"}]},{"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#212a37"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#9ca5b3"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#746855"}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#1f2835"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#f3d19c"}]},{"featureType":"transit","elementType":"geometry","stylers":[{"color":"#2f3948"}]},{"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#17263c"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#515c6d"}]},{"featureType":"water","elementType":"labels.text.stroke","stylers":[{"color":"#17263c"}]}],
        light: [{"elementType":"geometry","stylers":[{"color":"#f5f5f5"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#f5f5f5"}]},{"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#ffffff"}]},{"featureType":"road.arterial","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#dadada"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"transit.station","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#c9c9c9"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]}]
    };

    useImperativeHandle(ref, () => ({
        flyTo(lat, lng) {
            if (mapInstance.current) {
                mapInstance.current.panTo({ lat, lng });
                mapInstance.current.setZoom(10);
            }
        }
    }));

    useEffect(() => {
        if (googleScriptLoaded && !mapInstance.current && mapContainerRef.current) {
            const google = window.google;
            mapInstance.current = new google.maps.Map(mapContainerRef.current, {
                center: { lat: 11.1271, lng: 78.6569 },
                zoom: 6,
                disableDefaultUI: true,
                zoomControl: true,
                fullscreenControl: true,
                styles: theme === 'dark' ? mapStyles.dark : mapStyles.light,
            });
            infoWindow.current = new google.maps.InfoWindow();
        }
    }, [googleScriptLoaded, theme]);

    useEffect(() => {
        if (mapInstance.current) {
            mapInstance.current.setOptions({ styles: theme === 'dark' ? mapStyles.dark : mapStyles.light });
        }
    }, [theme]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (mapInstance.current && window.google) {
                window.google.maps.event.trigger(mapInstance.current, "resize");
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [isSidebarOpen]);

    useEffect(() => {
        if (mapInstance.current && window.google) {
            // Clear existing circles
            hazardCircles.current.forEach(circle => circle.setMap(null));
            hazardCircles.current = [];

            hazardsToDisplay.forEach(hazard => {
                const info = hazardTypes[hazard.type];
                const radius = info.baseRadius + (hazard.severity * (info.baseRadius / 10));
                let opts;

                if (hazard.status === 'predicted-resolved') {
                    opts = { strokeColor: info.color, strokeWeight: 2, fillOpacity: 0, radius, zIndex: 1 };
                } else if (hazard.status === 'reported') {
                    opts = { strokeColor: info.color, strokeWeight: 1, fillColor: info.color, fillOpacity: 0.4, radius, zIndex: 2 };
                } else { // predicted
                    opts = { strokeColor: info.color, strokeWeight: 2, fillColor: info.color, fillOpacity: 0.1, radius, zIndex: 1 };
                }

                const circle = new window.google.maps.Circle({
                    ...opts,
                    map: mapInstance.current,
                    center: { lat: hazard.lat, lng: hazard.lng }
                });

                circle.addListener('click', () => {
                    const content = `<div style="padding: 12px; max-width: 250px;">` +
                        `<h4 style="font-weight: 700; font-size: 1.125rem; color:${info.color}; margin: 0 0 4px 0;">${hazard.title}</h4>` +
                        `<p style="margin: 0; font-size: 0.875rem; color: var(--text-primary);">${hazard.description}</p>` +
                        `<p style="margin: 4px 0 0 0; font-size: 0.75rem; color: var(--text-muted);">Status: ${hazard.status}</p>` +
                        `</div>`;
                    infoWindow.current.setContent(content);
                    infoWindow.current.setPosition(circle.getCenter());
                    infoWindow.current.open(mapInstance.current);
                });

                hazardCircles.current.push(circle);
            });
        }
    }, [hazardsToDisplay, googleScriptLoaded]);

    if (googleScriptError) return <div id="map" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px'}}><h2 style={{fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', marginBottom: '8px'}}>Map Error</h2><p style={{color: 'var(--text-secondary)'}}>The Google Maps library could not be loaded. Please check your API key and internet connection.</p></div>;
    if (!googleScriptLoaded) return <div id="map" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Loading Map...</div>;
    return <div id="map" ref={mapContainerRef}></div>;
});

const LoginPage = ({ onLogin, onBack }) => (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '28rem', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: '1.875rem', fontWeight: 700, textAlign: 'center', color: 'var(--text-primary)', margin: 0 }}>Login to SeaTrace</h2>
            <form style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} onSubmit={onLogin}>
                <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Email address</label>
                    <input type="email" name="email" style={{ marginTop: '4px', width: '100%', padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }} placeholder="you@example.com" defaultValue="user@example.com" />
                </div>
                <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Password</label>
                    <input type="password" name="password" style={{ marginTop: '4px', width: '100%', padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }} placeholder="••••••••" defaultValue="password" />
                </div>
                <button type="submit" style={{ width: '100%', padding: '12px 16px', color: 'white', backgroundColor: '#2563eb', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Login</button>
            </form>
            <button onClick={onBack} style={{ width: '100%', padding: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>Back to Map</button>
        </div>
    </div>
);

const SignupPage = ({ onSignup, onBack }) => (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '28rem', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: '1.875rem', fontWeight: 700, textAlign: 'center', color: 'var(--text-primary)', margin: 0 }}>Create an Account</h2>
            <form style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} onSubmit={onSignup}>
                <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Full Name</label>
                    <input type="text" style={{ marginTop: '4px', width: '100%', padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }} placeholder="John Doe" />
                </div>
                <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Email address</label>
                    <input type="email" style={{ marginTop: '4px', width: '100%', padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }} placeholder="you@example.com" />
                </div>
                <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Password</label>
                    <input type="password" style={{ marginTop: '4px', width: '100%', padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }} placeholder="••••••••" />
                </div>
                <button type="submit" style={{ width: '100%', padding: '12px 16px', color: 'white', backgroundColor: '#2563eb', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Create Account</button>
            </form>
            <button onClick={onBack} style={{ width: '100%', padding: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>Back to Map</button>
        </div>
    </div>
);

const MediaCaptureOverlay = ({ onClose }) => {
    const [mode, setMode] = useState('select'); // 'select', 'cameraPhoto', 'previewPhoto', 'cameraVideo', 'previewVideo', 'error'
    const [stream, setStream] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [capturedImage, setCapturedImage] = useState(null);
    const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

    // --- Core Media Logic (Client-Side) ---
    // This component handles all media capture directly in the browser (client-side),
    // making it perfect for local hosting or applications without a backend.
    // It uses standard Web APIs like getUserMedia and MediaRecorder.

    // Function to gracefully stop the camera stream and release hardware.
    const stopStream = (s) => {
        if (s) {
            s.getTracks().forEach(track => track.stop()); // Stops each track (video, audio)
            setStream(null); // Clears the stream from state
        }
    };

    // Cleanup effect: Ensures the camera is turned off when the component is removed.
    useEffect(() => {
        return () => {
            stopStream(stream);
        };
    }, [stream]);

    // Asynchronously starts the camera using the getUserMedia API.
    const startCamera = async (constraints) => {
        stopStream(stream); // Ensure any previous stream is stopped first.
        setStatusMessage('');
        // Check for browser support for the MediaDevices API.
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                // Request camera/microphone access from the user.
                const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                setStream(mediaStream);
                if (videoRef.current) {
                    // Attach the live stream to the <video> element for display.
                    videoRef.current.srcObject = mediaStream;
                }
                return mediaStream; // Return the stream on success
            } catch (err) {
                // Handle errors like permission denial or no camera found.
                console.error("Camera access error:", err);
                setStatusMessage(`Could not access the camera. Please check permissions. Error: ${err.message}`);
                setMode('error');
                return null;
            }
        } else {
            // Handle cases where the browser doesn't support the API.
            setStatusMessage('Camera API is not supported on this device.');
            setMode('error');
            return null;
        }
    };
    
    // Handlers to initiate photo or video capture modes.
    const handleTakePhoto = async () => {
        // Request video-only stream, preferring the rear camera.
        const didStart = await startCamera({ video: { facingMode: 'environment' } });
        if(didStart) setMode('cameraPhoto');
    };

    const handleTakeVideo = async () => {
        // Request video and audio stream.
        const didStart = await startCamera({ video: { facingMode: 'environment' }, audio: true });
        if(didStart) setMode('cameraVideo');
    };

    // Captures a single frame from the video stream to create a photo.
    const handleCapturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        // Set canvas dimensions to match the video's intrinsic size.
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        // Draw the current video frame onto the hidden canvas.
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Generate a base64 Data URL from the canvas. This is a self-contained
        // string representation of the image, ideal for local use without file storage.
        setCapturedImage(canvas.toDataURL('image/jpeg'));
        stopStream(stream); // Release the camera.
        setMode('previewPhoto'); // Switch to the preview view.
    };

    // Starts recording the video stream using the MediaRecorder API.
    const handleStartRecording = () => {
        if (!stream) return;
        setIsRecording(true);
        recordedChunksRef.current = []; // Clear any previous recording chunks.
        
        // Initialize the MediaRecorder with the live stream.
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
        
        // Event listener to collect data chunks as the recording progresses.
        mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        // Event listener for when the recording is stopped.
        mediaRecorderRef.current.onstop = () => {
            // Combine all recorded chunks into a single Blob. A Blob is a file-like object
            // representing raw data, which is handled entirely in the browser's memory.
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            
            // Create a temporary, local URL for the Blob. This URL can be used as the 'src'
            // for a <video> element, allowing preview without uploading or saving a file.
            setRecordedVideoUrl(URL.createObjectURL(blob));
            
            setIsRecording(false);
            stopStream(stream); // Release camera and microphone.
            setMode('previewVideo'); // Switch to video preview.
        };
        
        mediaRecorderRef.current.start(); // Begin recording.
    };

    // Stops the active recording.
    const handleStopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }
    };
    
    // Main close handler for the overlay.
    const handleClose = () => {
        stopStream(stream); // Ensure camera is off.
        
        // Important: Revoke the temporary video URL to prevent memory leaks.
        if (recordedVideoUrl) {
            URL.revokeObjectURL(recordedVideoUrl);
        }
        
        onClose(); // Call the parent component's close function.
    };

    const renderContent = () => {
        switch (mode) {
            case 'cameraPhoto':
                return (
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}></video>
                        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                        <button onClick={handleCapturePhoto} style={{ position: 'absolute', bottom: '24px', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'white', border: '4px solid #2563eb', cursor: 'pointer' }} aria-label="Take Picture"></button>
                         <button onClick={handleClose} style={{ position: 'absolute', top: '16px', left: '16px', width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}><i className="fas fa-times"></i></button>
                    </div>
                );
            case 'previewPhoto':
                 return (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Photo Captured</h3>
                        <img src={capturedImage} alt="Captured" style={{ maxWidth: '100%', maxHeight: '40vh', borderRadius: '8px' }} />
                        <div style={{ display: 'flex', gap: '16px' }}>
                             <button onClick={handleTakePhoto} style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer' }}>Retake</button>
                             <button onClick={handleClose} style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Done</button>
                        </div>
                    </div>
                 );
            case 'cameraVideo':
                return (
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}></video>
                        {isRecording && <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: '4px' }}><i className="fas fa-circle rec-blinking" style={{ color: '#ef4444', fontSize: '0.75rem' }}></i> REC</div>}
                        <button onClick={isRecording ? handleStopRecording : handleStartRecording} style={{ position: 'absolute', bottom: '24px', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: isRecording ? '#dc2626' : 'white', border: '4px solid #2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label={isRecording ? "Stop Recording" : "Start Recording"}>
                            {isRecording && <div style={{width: '24px', height: '24px', backgroundColor: 'white', borderRadius: '4px'}}></div>}
                        </button>
                         <button onClick={handleClose} style={{ position: 'absolute', top: '16px', left: '16px', width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}><i className="fas fa-times"></i></button>
                    </div>
                );
            case 'previewVideo':
                 return (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Video Recorded</h3>
                        <video src={recordedVideoUrl} controls style={{ maxWidth: '100%', maxHeight: '40vh', borderRadius: '8px' }} />
                        <div style={{ display: 'flex', gap: '16px' }}>
                             <button onClick={handleTakeVideo} style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer' }}>Retake</button>
                             <button onClick={handleClose} style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Done</button>
                        </div>
                    </div>
                 );
            case 'error':
                 return (
                    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'var(--text-primary)' }}>
                        <i className="fas fa-exclamation-triangle" style={{ fontSize: '2rem', color: '#ef4444' }}></i>
                        <p style={{ margin: 0, fontWeight: 500, textAlign: 'center' }}>{statusMessage}</p>
                        <button onClick={handleClose} style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Close</button>
                    </div>
                );
            case 'select':
            default:
                return (
                    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
                         <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Report a Hazard</h3>
                         <div style={{ display: 'flex', gap: '16px' }}>
                             <button onClick={handleTakePhoto} style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
                                 <i className="fas fa-camera" style={{ fontSize: '2rem', color: '#3b82f6' }}></i>
                                 <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Take Photo</span>
                             </button>
                             <button onClick={handleTakeVideo} style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
                                 <i className="fas fa-video" style={{ fontSize: '2rem', color: '#3b82f6' }}></i>
                                 <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Take Video</span>
                             </button>
                         </div>
                    </div>
                );
        }
    };
    
    return (
         <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: '500px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', position: 'relative', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mode !== 'cameraPhoto' && mode !== 'cameraVideo' && <button onClick={handleClose} style={{ position: 'absolute', top: '8px', right: '8px', width: '32px', height: '32px', borderRadius: '50%', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}><i className="fas fa-times"></i></button>}
                {renderContent()}
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
export default function App() {
    const [theme, setTheme] = useState('dark');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentPage, setCurrentPage] = useState('map');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [activeFilters, setActiveFilters] = useState(new Set(Object.keys(hazardTypes)));
    const [statusFilters, setStatusFilters] = useState(new Set(['active', 'resolved']));
    const [showPredictions, setShowPredictions] = useState(true);
    const [isSimulationRunning, setIsSimulationRunning] = useState(false);
    const [isCaptureOverlayOpen, setIsCaptureOverlayOpen] = useState(false);
    const mapRef = useRef(null);
    
    const { startDate, totalMsInRange, todayMarkerPosition, predictionThreshold } = useMemo(() => { const today = new Date('2025-09-14T18:58:00+05:30'); const startDate = new Date(today); startDate.setDate(today.getDate() - 2); startDate.setHours(0, 0, 0, 0); const endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 7); const totalMs = endDate.getTime() - startDate.getTime(); const todayOffset = today.getTime() - startDate.getTime(); const todayPosition = (todayOffset / totalMs) * 100; const threshold = totalEvents * (todayOffset / totalMs); return { startDate, totalMsInRange: totalMs, todayMarkerPosition: `${todayPosition}%`, predictionThreshold: threshold }; }, []);
    const lastDayOfSimulation = useMemo(() => { const lastDay = new Date(startDate); lastDay.setDate(startDate.getDate() + 6); return lastDay; }, [startDate]);
    useEffect(() => { 
        // No longer need to add Leaflet CSS. Font Awesome is still needed.
        const fontAwesomeLink = document.createElement('link'); 
        fontAwesomeLink.rel = 'stylesheet'; 
        fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
        fontAwesomeLink.integrity = 'sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=='; 
        fontAwesomeLink.crossOrigin = 'anonymous'; 
        fontAwesomeLink.referrerPolicy = 'no-referrer'; 
        document.head.appendChild(fontAwesomeLink); 
        return () => { document.head.removeChild(fontAwesomeLink); }; 
    }, []);
    const simulatedDate = useMemo(() => { if (currentTime === 0 && !isSimulationRunning) return null; const progress = currentTime / totalEvents; return new Date(startDate.getTime() + progress * totalMsInRange); }, [currentTime, isSimulationRunning, startDate, totalMsInRange]);
    useEffect(() => { let interval; if (isSimulationRunning) { interval = setInterval(() => { setCurrentTime(prevTime => { if (prevTime >= totalEvents) { clearInterval(interval); setIsSimulationRunning(false); return totalEvents; } return prevTime + 1; }); }, 100); } return () => clearInterval(interval); }, [isSimulationRunning]);
    useEffect(() => { const savedTheme = localStorage.getItem('theme') || 'dark'; setTheme(savedTheme); document.documentElement.className = savedTheme; }, []);
    const handleThemeToggle = () => { const newTheme = theme === 'light' ? 'dark' : 'light'; setTheme(newTheme); localStorage.setItem('theme', newTheme); document.documentElement.className = newTheme; };
    const handleFilterToggle = (hazardKey) => { setActiveFilters(prevFilters => { const newFilters = new Set(prevFilters); if (newFilters.has(hazardKey)) newFilters.delete(hazardKey); else newFilters.add(hazardKey); return newFilters; }); };
    const handleStatusFilterToggle = (status) => { setStatusFilters(prev => { const newFilters = new Set(prev); if (newFilters.has(status)) newFilters.delete(status); else newFilters.add(status); return newFilters; }); };
    const handleLogin = (e) => { e.preventDefault(); setIsLoggedIn(true); setCurrentPage('map'); }; const handleLogout = () => { setIsLoggedIn(false); };
    const handleTimeChange = (e) => { if (isSimulationRunning) setIsSimulationRunning(false); setCurrentTime(parseInt(e.target.value, 10)); };
    const toggleSimulation = () => { if (currentTime >= totalEvents) { setCurrentTime(0); setIsSimulationRunning(true); } else { setIsSimulationRunning(!isSimulationRunning); } };
    const resetSimulation = () => { setIsSimulationRunning(false); setCurrentTime(0); };
    const handleHazardSelect = (hazard) => { if (mapRef.current) { mapRef.current.flyTo(hazard.lat, hazard.lng); } setIsSidebarOpen(false); };
    const futurePredictions = useMemo(() => { if (!showPredictions) return []; const contextReports = allMockHazards.filter(h => h.timestamp <= predictionThreshold && activeFilters.has(h.type)); const rawPredictions = predictiveMLModel(contextReports); const predictionTimeRange = totalEvents - predictionThreshold; if (rawPredictions.length === 0) return []; return rawPredictions.map((p, index) => ({ ...p, timestamp: predictionThreshold + (index / rawPredictions.length) * predictionTimeRange, status: 'predicted' })); }, [activeFilters, showPredictions, predictionThreshold]);
    const hazardsToDisplay = useMemo(() => { const historicalReports = allMockHazards.filter(h => activeFilters.has(h.type) && h.timestamp <= currentTime); const visibleHistoricalHazards = historicalReports.filter(h => { const resolvedTime = h.timestamp + h.duration; if (resolvedTime <= predictionThreshold) { return currentTime < resolvedTime; } return true; }).map(h => { const resolvedTime = h.timestamp + h.duration; if (currentTime >= resolvedTime) return { ...h, status: 'predicted-resolved' }; if (currentTime > predictionThreshold) return { ...h, status: 'predicted' }; return { ...h, status: 'reported' }; }); let visiblePredictions = []; if (showPredictions && currentTime > predictionThreshold) { visiblePredictions = futurePredictions.filter(p => activeFilters.has(p.type) && p.timestamp <= currentTime).map(p => ({ ...p, status: (p.timestamp + p.duration) <= currentTime ? 'predicted-resolved' : 'predicted' })); } const allVisibleHazards = [...visibleHistoricalHazards, ...visiblePredictions]; return allVisibleHazards.filter(hazard => { const isActive = hazard.status === 'reported' || hazard.status === 'predicted'; const isResolved = hazard.status === 'predicted-resolved'; if (statusFilters.has('active') && isActive) return true; if (statusFilters.has('resolved') && isResolved) return true; return false; }); }, [currentTime, activeFilters, statusFilters, showPredictions, predictionThreshold, futurePredictions]);
    const reportedHazardsInFeed = useMemo(() => { return allMockHazards.filter(h => h.timestamp <= currentTime && (h.timestamp + h.duration) > currentTime && activeFilters.has(h.type)).sort((a,b) => b.timestamp - a.timestamp).slice(0, 20); }, [currentTime, activeFilters]);
    const progressPercent = (currentTime / totalEvents) * 100;
    const showFutureFilters = currentTime > predictionThreshold;
    
    const renderPage = () => {
        switch (currentPage) {
            case 'login': return <LoginPage onLogin={handleLogin} onBack={() => setCurrentPage('map')} />;
            case 'signup': return <SignupPage onSignup={handleLogin} onBack={() => setCurrentPage('map')} />;
            default: return null;
        }
    };

    return (
        <React.Fragment>
            <GlobalStyles />
            <div id="app" className={isSidebarOpen ? 'sidebar-open' : ''}>
                <MapComponent ref={mapRef} hazardsToDisplay={hazardsToDisplay} theme={theme} isSidebarOpen={isSidebarOpen} />

                {/* --- UI OVERLAYS --- */}
                <div id="top-left-controls" style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 30, display: 'flex', alignItems: 'flex-start', gap: '16px', opacity: isSidebarOpen ? 0 : 1, pointerEvents: isSidebarOpen ? 'none' : 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                         <button onClick={() => setIsSidebarOpen(true)} aria-label="Open menu" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', cursor: 'pointer' }}>
                             <i className="fas fa-bars"></i>
                         </button>
                         <button onClick={() => setIsCaptureOverlayOpen(true)} aria-label="Capture Media" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', cursor: 'pointer' }}>
                            <i className="fas fa-camera"></i>
                        </button>
                    </div>
                    <header>
                        <div style={{ textAlign: 'left' }}>
                            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#3b82f6', textShadow: '0 1px 3px rgba(0,0,0,0.2)', margin: 0, marginTop: '4px' }}>SeaTrace</h1>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textShadow: '0 1px 3px rgba(0,0,0,0.1)', margin: 0 }}>Collective Hazard Mapping for Safer Shores</p>
                        </div>
                    </header>
                </div>
                
                <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {!isLoggedIn ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button onClick={() => setCurrentPage('login')} style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', cursor: 'pointer' }}>Login</button>
                                        <button onClick={() => setCurrentPage('signup')} style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer' }}>Sign Up</button>
                                    </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)' }}>
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)'}}>Welcome, User!</span>
                                    <button onClick={handleLogout} style={{ padding: '4px 12px', fontSize: '0.875rem', fontWeight: 500, backgroundColor: '#dc2626', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Logout</button>
                                </div>
                            )}
                            <button onClick={handleThemeToggle} aria-label="Toggle theme" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', cursor: 'pointer' }}>
                                <i className="fas fa-cog"></i>
                            </button>
                        </div>
                        <div style={{ backgroundColor: 'var(--panel-bg)', backdropFilter: 'blur(4px)', padding: '12px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', transition: 'opacity 0.5s', opacity: showFutureFilters ? 1 : 0, pointerEvents: showFutureFilters ? 'auto' : 'none' }}>
                            <h4 style={{ margin: 0, marginBottom: '8px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>Forecast Filters</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={statusFilters.has('active')} onChange={() => handleStatusFilterToggle('active')} style={{ width: '16px', height: '16px', borderRadius: '4px' }} />
                                    <span style={{ color: 'var(--text-primary)' }}>Show Active</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={statusFilters.has('resolved')} onChange={() => handleStatusFilterToggle('resolved')} style={{ width: '16px', height: '16px', borderRadius: '4px' }}/>
                                    <span style={{ color: 'var(--text-primary)' }}>Show Resolved</span>
                                </label>
                            </div>
                        </div>
                </div>

                <aside id="sidebar" style={{ position: 'absolute', top: 0, left: 0, height: '100vh', backgroundColor: 'var(--panel-bg)', backdropFilter: 'blur(4px)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)', zIndex: 40, width: '100%', maxWidth: '384px', display: 'flex', flexDirection: 'column', padding: '16px', borderRight: '1px solid var(--border-color)', transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
                            <header>
                                <div style={{ textAlign: 'left' }}>
                                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6', margin: 0 }}>SeaTrace</h1>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>Menu & Controls</p>
                                </div>
                            </header>
                            <button onClick={() => setIsSidebarOpen(false)} aria-label="Close menu" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'transparent', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}>
                                <i className="fas fa-times" style={{ fontSize: '1.25rem' }}></i>
                            </button>
                        </div>
                        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <AccordionItem title="Filter Hazards" startOpen={true}>
                                <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.75rem' }}>
                                        {Object.entries(hazardTypes).map(([key, { name, icon, color }]) => {
                                            const isActive = activeFilters.has(key);
                                            return ( <button key={key} onClick={() => handleFilterToggle(key)} style={{ padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: 'none', color: 'white', backgroundColor: isActive ? color : 'var(--border-color)', opacity: isActive ? 1 : 0.6, cursor: 'pointer' }}>
                                                <i className={`fas ${icon}`}></i> <span>{name}</span>
                                            </button> );
                                        })}
                                    </div>
                                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <button onClick={() => setActiveFilters(new Set(Object.keys(hazardTypes)))} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>Show All Types</button>
                                        <button onClick={() => setShowPredictions(!showPredictions)} style={{ width: '100%', padding: '8px', color: 'white', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, border: 'none', backgroundColor: showPredictions ? '#4f46e5' : '#6b7280', cursor: 'pointer' }}>{showPredictions ? 'Hide Predictions' : 'Show Predictions'}</button>
                                    </div>
                                </div>
                            </AccordionItem>
                            <AccordionItem title="Real-time Hazard Feed">
                                <div style={{ borderTop: '1px solid var(--border-color)', maxHeight: '256px', overflowY: 'auto' }}>
                                    {reportedHazardsInFeed.length > 0 ? reportedHazardsInFeed.map(hazard => (
                                        <div key={hazard.id} onClick={() => handleHazardSelect(hazard)} style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ color: hazardTypes[hazard.type].color, fontSize: '1.25rem', width: '24px', textAlign: 'center' }}><i className={`fas ${hazardTypes[hazard.type].icon}`}></i></div>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{hazard.title}</p>
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Time: T={hazard.timestamp}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <p style={{ fontSize: '0.875rem', textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>No active events.</p>}
                                </div>
                            </AccordionItem>
                            <AccordionItem title="Timeline Forecast" startOpen={true}>
                                <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)'}}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ textAlign: 'center', height: '64px' }}>
                                            {simulatedDate ? (
                                                <>
                                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                                                        {simulatedDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                    </p>
                                                    <p style={{ margin: 0, fontWeight: 700, fontSize: '1.5rem', color: '#3b82f6' }}>
                                                        {simulatedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                    </p>
                                                </>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '1.125rem', color: 'var(--text-muted)' }}>Timeline Paused</p>
                                                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Press play or drag slider</p>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ position: 'relative', padding: '4px 0' }}>
                                            <input type="range" min="0" max={totalEvents} value={currentTime} onChange={handleTimeChange} aria-label="Timeline scrubber" style={{'--progress-percent': `${progressPercent}%`}} />
                                            <div style={{ position: 'absolute', top: 0, bottom: 0, display: 'flex', alignItems: 'center', pointerEvents: 'none', left: todayMarkerPosition }}>
                                                <div style={{ width: '1px', height: '100%', backgroundColor: '#ef4444' }}></div>
                                                <span style={{ position: 'absolute', top: '-20px', transform: 'translateX(-50%)', fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>Today</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <span>{startDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                            <span>{lastDayOfSimulation.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', paddingTop: '8px' }}>
                                            <button onClick={resetSimulation} aria-label="Reset simulation" style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'var(--btn-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', fontSize: '1.25rem', cursor: 'pointer' }}>
                                                <i className="fas fa-redo"></i>
                                            </button>
                                            <button onClick={toggleSimulation} aria-label={isSimulationRunning ? "Pause simulation" : "Play simulation"} style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: '#2563eb', color: 'white', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)', fontSize: '1.875rem', border: 'none', cursor: 'pointer' }}>
                                                <i className={`fas ${isSimulationRunning ? 'fa-pause' : 'fa-play'}`}></i>
                                            </button>
                                            <div style={{ width: '48px', height: '48px' }}></div>
                                        </div>
                                    </div>
                                </div>
                            </AccordionItem>
                        </div>
                        <div style={{ marginTop: 'auto', textAlign: 'center', flexShrink: 0, paddingTop: '16px' }}>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>by Team PrismShift</p>
                        </div>
                </aside>
                <div id="credits-footer" style={{ position: 'absolute', bottom: '16px', left: '16px', zIndex: 20, pointerEvents: 'none', opacity: isSidebarOpen ? 0 : 1 }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>by Team PrismShift</p>
                </div>

                {renderPage()}
                 {isCaptureOverlayOpen && <MediaCaptureOverlay onClose={() => setIsCaptureOverlayOpen(false)} />}
            </div>
        </React.Fragment>
    );
}