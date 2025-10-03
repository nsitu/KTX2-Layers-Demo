import './style.css';
import { loadBasisModule } from './load_basis.js';
import { ImageToKtx } from './image_to_ktx.js';
import { ImagesToKtx } from './images_to_ktx.js';
import { threadingSupported, isAndroid, showLoadingSpinner, hideLoadingSpinner } from './utils.js';

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

try {
    await chooseRenderer();
    await loadBasisModule();
    await runArrayDemo();
} catch (error) {
    console.error('Failed to initialize application:', error);
}
