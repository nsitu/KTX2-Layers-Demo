import { threadingSupported } from './utils.js';

let basisModule = null;
let basisPromise = null;

export async function loadBasisModule() {
    // Return existing promise if already loading/loaded
    if (basisPromise) {
        return basisPromise;
    }

    basisPromise = new Promise((resolve, reject) => {
        // Choose script depending on threading support
        // Use absolute paths from public directory for Vite compatibility
        const scriptSrc = threadingSupported ?
            "./basis_encoder_threads.js" :
            "./basis_encoder.js";

        const script = document.createElement("script");
        script.src = scriptSrc;

        script.onload = async () => {
            try {
                // Ensure BASIS is available in global scope
                if (typeof BASIS === 'undefined') {
                    reject(new Error("BASIS is not defined after script load"));
                    return;
                }

                const module = await BASIS({
                    onRuntimeInitialized: () => {
                        console.log("BASIS runtime initialized");
                    }
                });

                if (module.initializeBasis) {
                    module.initializeBasis();
                    console.log("module.initializeBasis() called successfully.");
                    basisModule = module;
                    resolve(module);
                } else {
                    reject(new Error("module.initializeBasis() is not available."));
                }
            } catch (error) {
                reject(new Error(`Error initializing BASIS module: ${error.message}`));
            }
        };

        script.onerror = (error) => {
            reject(new Error(`Failed to load the Basis module: ${error}`));
        };

        document.head.appendChild(script);
    });

    return basisPromise;
}

export function getBasisModule() {
    return basisModule;
}