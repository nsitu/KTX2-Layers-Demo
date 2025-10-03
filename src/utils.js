// Detailed diagnostics for WebAssembly threading prerequisites
function getWasmThreadingDiagnostics() {
    const hasWebAssembly = typeof WebAssembly === 'object';
    const hasWasmMemoryCtor = hasWebAssembly && typeof WebAssembly.Memory === 'function';
    const hasSharedArrayBufferCtor = typeof SharedArrayBuffer === 'function';
    // COOP/COEP cross-origin isolation is required to use SAB in most browsers
    const coi = typeof self !== 'undefined' && !!self.crossOriginIsolated;

    let canConstructSharedMemory = false;
    let sharedMemoryIsSharedBuffer = false;
    try {
        if (hasWasmMemoryCtor) {
            const mem = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
            canConstructSharedMemory = mem instanceof WebAssembly.Memory;
            // If constructed, its .buffer should be a SharedArrayBuffer
            sharedMemoryIsSharedBuffer = typeof SharedArrayBuffer === 'function' && mem.buffer instanceof SharedArrayBuffer;
        }
    } catch (_) {
        canConstructSharedMemory = false;
        sharedMemoryIsSharedBuffer = false;
    }

    // Final support requires being able to make shared memory
    const isSupported = !!(hasWasmMemoryCtor && canConstructSharedMemory && sharedMemoryIsSharedBuffer);

    return {
        hasWebAssembly,
        hasWasmMemoryCtor,
        hasSharedArrayBufferCtor,
        crossOriginIsolated: coi,
        canConstructSharedMemory,
        sharedMemoryIsSharedBuffer,
        isSupported,
    };
}

// Function to check for WebAssembly threading support (boolean)
const checkIsWasmThreadingSupported = function () {
    try {
        return getWasmThreadingDiagnostics().isSupported;
    } catch {
        return false;
    }
}

const threadingSupported = checkIsWasmThreadingSupported();

if (threadingSupported) {
    console.log("Threading is supported");
} else {
    const d = getWasmThreadingDiagnostics();
    // Compact, explicit diagnostics so we know why it failed
    console.groupCollapsed('[WASM Threads] Not supported — diagnostics');
    console.log('hasWebAssembly:', d.hasWebAssembly);
    console.log('hasWasmMemoryCtor:', d.hasWasmMemoryCtor);
    console.log('hasSharedArrayBufferCtor:', d.hasSharedArrayBufferCtor);
    console.log('crossOriginIsolated:', d.crossOriginIsolated);
    console.log('canConstructSharedMemory:', d.canConstructSharedMemory);
    console.log('sharedMemoryIsSharedBuffer:', d.sharedMemoryIsSharedBuffer);
    console.groupEnd();
}


// Get the number of available CPU threads, with a reasonable fallback
const getOptimalThreadCount = () => {
    const cpuThreads = navigator.hardwareConcurrency || 4; // fallback to 4 if not available
    return Math.min(cpuThreads, 18); // cap at 18 to avoid potential issues
};

const optimalThreadCount = getOptimalThreadCount();

// Android detection utility
function isAndroid() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    return /Android/i.test(ua);
}

// Safari/iOS detection utilities
function isIOS() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    return /iPad|iPhone|iPod/.test(ua);
}

function isSafari() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    return /Safari/.test(ua) && !/Chrome/.test(ua);
}

// Safari/iOS specific diagnostics
function getSafariIOSDiagnostics() {
    const isIOSDevice = isIOS();
    const isSafariBrowser = isSafari();
    const hasServiceWorker = 'serviceWorker' in navigator;
    const hasController = navigator.serviceWorker?.controller ? true : false;
    const isSecure = window.isSecureContext;
    const isCrossOriginIsolated = window.crossOriginIsolated;

    return {
        isIOS: isIOSDevice,
        isSafari: isSafariBrowser,
        hasServiceWorker,
        hasController,
        isSecureContext: isSecure,
        crossOriginIsolated: isCrossOriginIsolated,
        userAgent: navigator.userAgent,
        // Safari/iOS specific capabilities
        hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        hasWebAssembly: typeof WebAssembly !== 'undefined',
        hasWebWorker: typeof Worker !== 'undefined',
        threadingDiagnostics: getWasmThreadingDiagnostics()
    };
}

// Safari/iOS specific error handler for common issues
function handleSafariIOSErrors() {
    if (!isIOS() && !isSafari()) return;

    // Listen for unhandled promise rejections (common with service workers on Safari/iOS)
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[Safari/iOS] Unhandled Promise Rejection:', event.reason);

        // Check if it's a service worker related error
        if (event.reason && typeof event.reason === 'object') {
            const reason = event.reason.toString ? event.reason.toString() : JSON.stringify(event.reason);
            if (reason.includes('respondWith') || reason.includes('FetchEvent') || reason.includes('serviceworker')) {
                console.error('[Safari/iOS] Service Worker Error Detected:', reason);

                // Attempt to recover by unregistering and reregistering service worker
                if (navigator.serviceWorker) {
                    navigator.serviceWorker.getRegistrations().then((registrations) => {
                        registrations.forEach((registration) => {
                            console.log('[Safari/iOS] Attempting to recover service worker registration');
                            registration.unregister().then(() => {
                                setTimeout(() => {
                                    location.reload();
                                }, 1000);
                            });
                        });
                    });
                }
            }
        }
    });

    // Listen for general errors
    window.addEventListener('error', (event) => {
        console.error('[Safari/iOS] Global Error:', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error
        });
    });

    console.log('[Safari/iOS] Error handlers initialized');
}

// Initialize Safari/iOS error handling
if (isIOS() || isSafari()) {
    handleSafariIOSErrors();

    // Log Safari/iOS diagnostics if detected
    console.group('[Safari/iOS] Compatibility Diagnostics');
    const diagnostics = getSafariIOSDiagnostics();
    Object.entries(diagnostics).forEach(([key, value]) => {
        if (typeof value === 'object') {
            console.log(`${key}:`, value);
        } else {
            console.log(`${key}: ${value}`);
        }
    });
    console.groupEnd();
}

// Loading spinner control functions
function showLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    const cube = document.querySelector('canvas');
    if (spinner) {
        spinner.style.display = 'flex';
    }

    // Hide the cube while loading
    if (cube) {
        cube.style.display = 'none';
    }
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    const cube = document.querySelector('canvas');
    if (spinner) {
        spinner.style.display = 'none';
    }

    // Show the cube when done loading
    if (cube) {
        cube.style.display = 'block';
    }
}

export { threadingSupported, optimalThreadCount, isAndroid, isIOS, isSafari, getSafariIOSDiagnostics, showLoadingSpinner, hideLoadingSpinner, getWasmThreadingDiagnostics };