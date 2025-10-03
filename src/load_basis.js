import {
    threadingSupported,
    logMemoryInfo,
    getMemoryConstraints,
    isIOS,
    isSafari
} from './utils.js';

let basisModule = null;
let basisPromise = null;

export async function loadBasisModule() {
    // Return existing promise if already loading/loaded
    if (basisPromise) {
        return basisPromise;
    }

    // Initial diagnostics using our modular functions
    logMemoryInfo('before-load');
    const constraints = getMemoryConstraints();

    console.log('[BASIS] Memory constraints analysis:', constraints);

    basisPromise = new Promise((resolve, reject) => {
        // Use our constraints analysis to determine which version to load
        const shouldUseThreaded = constraints.recommendThreaded;

        const scriptSrc = shouldUseThreaded ?
            "./basis_encoder_threads.js" :
            "./basis_encoder.js";

        console.log(`[BASIS] Loading ${shouldUseThreaded ? 'threaded' : 'non-threaded'} version`);
        console.log(`[BASIS] Estimated available memory: ${constraints.estimatedAvailable}MB`);

        const script = document.createElement("script");
        script.src = scriptSrc;

        script.onload = async () => {
            try {
                logMemoryInfo('after-script-load');

                // Ensure BASIS is available in global scope
                if (typeof BASIS === 'undefined') {
                    reject(new Error("BASIS is not defined after script load"));
                    return;
                }

                console.log('[BASIS] Script loaded, initializing module...');

                // Configure module with our recommended memory constraints
                const moduleConfig = {
                    onRuntimeInitialized: () => {
                        console.log("BASIS runtime initialized");
                        logMemoryInfo('runtime-initialized');
                    },
                    onAbort: (what) => {
                        console.error('[BASIS] Module aborted:', what);
                        logMemoryInfo('module-aborted');
                    },
                    print: (text) => console.log('[BASIS stdout]:', text),
                    printErr: (text) => console.error('[BASIS stderr]:', text),
                };

                // Apply our recommended initial memory setting
                if (constraints.recommendedInitialMemory) {
                    moduleConfig.INITIAL_MEMORY = constraints.recommendedInitialMemory;
                    console.log(`[BASIS] Using recommended initial memory: ${Math.round(constraints.recommendedInitialMemory / 1024 / 1024)}MB`);
                }

                logMemoryInfo('before-module-init');

                const module = await BASIS(moduleConfig);

                logMemoryInfo('after-module-init');

                if (module.initializeBasis) {
                    console.log("Calling module.initializeBasis()...");
                    module.initializeBasis();
                    console.log("module.initializeBasis() called successfully.");

                    logMemoryInfo('after-basis-init');

                    basisModule = module;
                    resolve(module);
                } else {
                    const error = new Error("module.initializeBasis() is not available.");
                    console.error('[BASIS]', error);
                    reject(error);
                }
            } catch (error) {
                console.error('[BASIS] Initialization error:', error);
                logMemoryInfo('initialization-error');
                reject(new Error(`Error initializing BASIS module: ${error.message}`));
            }
        };

        script.onerror = (error) => {
            console.error('[BASIS] Script load error:', error);
            logMemoryInfo('script-load-error');
            reject(new Error(`Failed to load the Basis module: ${error}`));
        };

        document.head.appendChild(script);
    });

    return basisPromise;
}

export function getBasisModule() {
    return basisModule;
}