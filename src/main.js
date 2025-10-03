import './style.css';
import { loadBasisModule } from './load_basis.js';
import { ImageToKtx } from './image_to_ktx.js';
import { ImagesToKtx } from './images_to_ktx.js';
import {
    threadingSupported,
    isAndroid,
    showLoadingSpinner,
    hideLoadingSpinner,
    logMemoryInfo,
    getMemoryConstraints,
    estimateAvailableMemory,
    testMemoryAllocation,
    findMaxAllocatableMemory
} from './utils.js';

// Pre-import both renderer modules to ensure Vite includes them in production build
// We'll use dynamic imports to actually load them, but this ensures dependencies are bundled
import * as cubeWebGL from './renderer-webgl.js';
import * as cubeWebGPU from './renderer-webgpu.js';

// Renderer selection and imports
let animate, loadKTX2ArrayFromSlices, loadKTX2ArrayFromBuffer, loadKTX2ArrayFromUrl;
let rendererType = 'webgl'; // default

async function chooseRenderer() {
    const params = new URLSearchParams(window.location.search);
    const forceRenderer = (params.get('renderer') || '').toLowerCase();
    const isAndroidDevice = isAndroid();

    // Check WebGPU availability
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

    if (forceRenderer === 'webgpu') {
        rendererType = 'webgpu';
    } else if (forceRenderer === 'webgl') {
        rendererType = 'webgl';
    } else {
        // Auto-detect: prefer WebGPU if available (fixes ASTC array issues on Android)
        rendererType = hasWebGPU ? 'webgpu' : 'webgl';
    }

    console.log('[Renderer] chosen=', rendererType, '| hasWebGPU=', hasWebGPU, '| Android=', isAndroidDevice, '| force=', forceRenderer || 'auto');

    // Use pre-imported modules (already loaded above for Vite bundling)
    if (rendererType === 'webgpu') {
        try {
            console.log('Using WebGPU renderer');
            animate = cubeWebGPU.animate;
            loadKTX2ArrayFromSlices = cubeWebGPU.loadKTX2ArrayFromSlices;
            loadKTX2ArrayFromBuffer = cubeWebGPU.loadKTX2ArrayFromBuffer;
            loadKTX2ArrayFromUrl = cubeWebGPU.loadKTX2ArrayFromUrl;
            await cubeWebGPU.initRenderer();
            console.log('[Renderer] WebGPU initialized');
        } catch (error) {
            console.error('[Renderer] WebGPU failed, falling back to WebGL:', error);
            rendererType = 'webgl';
            animate = cubeWebGL.animate;
            loadKTX2ArrayFromSlices = cubeWebGL.loadKTX2ArrayFromSlices;
            loadKTX2ArrayFromBuffer = cubeWebGL.loadKTX2ArrayFromBuffer;
            loadKTX2ArrayFromUrl = cubeWebGL.loadKTX2ArrayFromUrl;
            animate();
        }
    } else {
        console.log('Using WebGL renderer');
        animate = cubeWebGL.animate;
        loadKTX2ArrayFromSlices = cubeWebGL.loadKTX2ArrayFromSlices;
        loadKTX2ArrayFromBuffer = cubeWebGL.loadKTX2ArrayFromBuffer;
        loadKTX2ArrayFromUrl = cubeWebGL.loadKTX2ArrayFromUrl;
        animate();
    }

    // Update title to show renderer type
    const titleElement = document.getElementById('titleText');
    if (titleElement) {
        const threading = threadingSupported ? ' (Threaded)' : '';
        const renderer = rendererType === 'webgpu' ? ' [WebGPU]' : ' [WebGL]';
        titleElement.textContent = 'KTX2 Array Demo' + threading + renderer;
    }
}

async function runArrayDemo() {
    try {
        showLoadingSpinner();

        // Configure encoder(s): mipmaps on, Zstd supercompression disabled
        ImageToKtx.configure({ mipmaps: true, supercompression: false });
        console.log('[Encoder config] mipmaps=true, supercompression=false');

        const names = ['city.jpg', 'leaves.jpg', 'trees.jpg', 'sunflower.jpg'];
        const responses = await Promise.all(names.map(n => fetch(`./${n}`)));
        const ok = responses.every(r => r.ok);
        if (!ok) throw new Error('Failed to fetch one or more demo images');
        const params = new URLSearchParams(window.location.search);
        // Quick path: test a known KTX2 array file from public for ASTC/ETC2 behavior
        const sample = (params.get('sample') || '').toLowerCase();
        if (sample === 'spirited') {
            // Use the pre-encoded Spirited Away texture array
            await loadKTX2ArrayFromUrl('./spiritedaway.ktx2');
            return;
        }

        const rawImages = await Promise.all(responses.map(r => r.arrayBuffer()));


        // A/B switch: ?array=ktx2 or ?array=slices (default: slices)
        const mode = (params.get('array') || 'slices').toLowerCase();
        console.log(`[Array Mode] ${mode}`);

        if (mode === 'ktx2') {
            // Encode a single KTX2 with multiple layers (2D array)
            const layers = names.map((name, i) => ({
                data: rawImages[i],
                fileName: name,
                extension: name.split('.').pop()
            }));
            const arrayKtx = await ImagesToKtx.encode(layers);
            await loadKTX2ArrayFromBuffer(arrayKtx, names.length);
        } else {
            // Encode each image to a single-image KTX2 file (one slice per file)
            const singleKtx2Buffers = [];
            for (let i = 0; i < rawImages.length; i++) {
                const data = rawImages[i];
                const ext = names[i].split('.').pop();
                const base = names[i];
                const ktx = await ImageToKtx.encode(data, base, ext);
                singleKtx2Buffers.push(ktx);
            }
            await loadKTX2ArrayFromSlices(singleKtx2Buffers);
        }
    } catch (err) {
        console.error('Array demo failed:', err);
        hideLoadingSpinner();
    }
}

// Memory diagnostics and initialization check
async function runMemoryDiagnostics() {
    console.group('[Memory Diagnostics] Pre-BASIS Analysis');

    // Log initial memory state
    const initialMemory = logMemoryInfo('app-start');

    // Get comprehensive memory constraints
    const constraints = getMemoryConstraints();
    console.log('[Memory] Constraints analysis:', constraints);

    // Estimate and warn about potential issues
    const estimated = estimateAvailableMemory();
    console.log(`[Memory] Estimated available: ${estimated}MB`);

    // Check URL parameters for deep memory testing
    const params = new URLSearchParams(window.location.search);
    const deepTest = params.get('memtest') === 'true';

    if (deepTest) {
        console.log('[Memory] 🧪 Running deep memory allocation tests...');

        // Test specific allocations that BASIS might need
        const tests = [64, 128, 256, 512];
        for (const sizeMB of tests) {
            const result = await testMemoryAllocation(sizeMB);
            console.log(`[Memory Test] ${sizeMB}MB:`, result.success ? '✅' : '❌', result.error || `${result.timeMs}ms`);
        }

        // Find maximum allocatable memory
        const maxMB = await findMaxAllocatableMemory(Math.min(1024, estimated * 2));
        console.log(`[Memory Test] Maximum allocatable: ${maxMB}MB`);
    }

    if (estimated < 150) {
        console.warn('[Memory] ⚠️ LOW MEMORY WARNING: Basis encoding may fail on this device');
        console.warn('[Memory] Consider using alternative compression or reducing image sizes');
        console.warn('[Memory] Add ?memtest=true to URL for detailed memory allocation tests');
    } else if (estimated < 300) {
        console.warn('[Memory] ⚠️ MODERATE MEMORY: Using conservative settings');
    } else {
        console.log('[Memory] ✅ Sufficient memory available for Basis encoding');
    }

    // Threading recommendation
    if (constraints.recommendThreaded) {
        console.log('[Memory] ✅ Threading recommended and will be used');
    } else {
        console.log('[Memory] ℹ️ Non-threaded version will be used for compatibility');
    }

    console.groupEnd();

    return constraints;
}

try {
    await chooseRenderer();

    // Run comprehensive memory diagnostics before loading BASIS
    const memoryConstraints = runMemoryDiagnostics();

    await loadBasisModule();
    await runArrayDemo();
} catch (error) {
    console.error('Failed to initialize application');
    console.error(error);

    // Log memory state on error for debugging
    logMemoryInfo('app-error');
}