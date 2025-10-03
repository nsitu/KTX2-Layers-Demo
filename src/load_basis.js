import { threadingSupported } from './utils.js';

let basisModule = null;
let basisPromise = null;

export async function loadBasisModule() {
    // Return existing promise if already loading/loaded
    if (basisPromise) {
        return basisPromise;
    }

    basisPromise = new Promise((resolve, reject) => {
        // Safari/iOS detection
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

        // Choose script depending on threading support
        // Use absolute paths from public directory for Vite compatibility
        const scriptSrc = threadingSupported ?
            "./basis_encoder_threads.js" :
            "./basis_encoder.js";

        if (isIOS || isSafari) {
            console.log('[BASIS] Detected Safari/iOS, loading:', scriptSrc);
            console.log('[BASIS] Threading supported:', threadingSupported);
        }

        const script = document.createElement("script");
        script.src = scriptSrc;

        script.onload = async () => {
            try {
                // Ensure BASIS is available in global scope
                if (typeof BASIS === 'undefined') {
                    const errorMsg = "BASIS is not defined after script load";
                    console.error('[BASIS] Safari/iOS Error:', errorMsg);
                    reject(new Error(errorMsg));
                    return;
                }

                // Safari/iOS: Add additional initialization checks
                if (isIOS || isSafari) {
                    console.log('[BASIS] Safari/iOS: BASIS defined, initializing...');
                }

                const module = await BASIS({
                    onRuntimeInitialized: () => {
                        console.log("BASIS runtime initialized");
                        if (isIOS || isSafari) {
                            console.log('[BASIS] Safari/iOS: Runtime initialization complete');
                        }
                    }
                });

                if (module.initializeBasis) {
                    module.initializeBasis();
                    console.log("module.initializeBasis() called successfully.");

                    // Safari/iOS: Additional validation
                    if (isIOS || isSafari) {
                        console.log('[BASIS] Safari/iOS: Module initialized successfully');
                        console.log('[BASIS] Safari/iOS: Available methods:', Object.keys(module).filter(k => typeof module[k] === 'function'));
                    }

                    basisModule = module;
                    resolve(module);
                } else {
                    const errorMsg = "module.initializeBasis() is not available.";
                    console.error('[BASIS] Safari/iOS Error:', errorMsg);
                    reject(new Error(errorMsg));
                }
            } catch (error) {
                const errorMsg = `Error initializing BASIS module: ${error.message}`;
                console.error('[BASIS] Safari/iOS Error:', errorMsg);

                // Safari/iOS: Provide additional debugging information
                if (isIOS || isSafari) {
                    console.error('[BASIS] Safari/iOS Debug Info:', {
                        userAgent: navigator.userAgent,
                        threadingSupported,
                        scriptSrc,
                        basisDefined: typeof BASIS !== 'undefined',
                        error: error
                    });
                }

                reject(new Error(errorMsg));
            }
        };

        script.onerror = (error) => {
            const errorMsg = `Failed to load the Basis module: ${error}`;
            console.error('[BASIS] Safari/iOS Script Load Error:', errorMsg);

            // Safari/iOS: Provide additional debugging information
            if (isIOS || isSafari) {
                console.error('[BASIS] Safari/iOS Script Error Debug Info:', {
                    userAgent: navigator.userAgent,
                    scriptSrc,
                    isSecureContext: window.isSecureContext,
                    crossOriginIsolated: window.crossOriginIsolated,
                    error: error
                });
            }

            reject(new Error(errorMsg));
        };

        document.head.appendChild(script);
    });

    return basisPromise;
}

export function getBasisModule() {
    return basisModule;
}