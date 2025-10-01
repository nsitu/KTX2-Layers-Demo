import './style.css';
import { loadBasisModule } from './load_basis.js';
import { ImageToKtx } from './img_to_ktx.js';
import { ImagesToKtx } from './images_to_ktx.js';
import { threadingSupported, showLoadingSpinner, hideLoadingSpinner } from './utils.js';

// Renderer selection and imports
let animate, loadKTX2ArrayFromSlices, loadKTX2ArrayFromBuffer, loadKTX2ArrayFromUrl, loadOfficialArrayFromUrl;
let rendererType = 'webgl'; // default

async function chooseRenderer() {
    const params = new URLSearchParams(window.location.search);
    const forceRenderer = (params.get('renderer') || '').toLowerCase();
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isAndroid = /Android/i.test(ua);

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

    console.log('[Renderer] chosen=', rendererType, '| hasWebGPU=', hasWebGPU, '| Android=', isAndroid, '| force=', forceRenderer || 'auto');

    // Dynamic import based on renderer choice
    if (rendererType === 'webgpu') {
        try {
            const module = await import('./cube-webgpu.js');
            animate = module.animate;
            loadKTX2ArrayFromSlices = module.loadKTX2ArrayFromSlices;
            loadKTX2ArrayFromBuffer = module.loadKTX2ArrayFromBuffer;
            loadKTX2ArrayFromUrl = module.loadKTX2ArrayFromUrl;
            loadOfficialArrayFromUrl = module.loadOfficialArrayFromUrl;
            await module.initRenderer();
            console.log('[Renderer] WebGPU initialized');
        } catch (error) {
            console.error('[Renderer] WebGPU failed, falling back to WebGL:', error);
            rendererType = 'webgl';
            const module = await import('./cube.js');
            animate = module.animate;
            loadKTX2ArrayFromSlices = module.loadKTX2ArrayFromSlices;
            loadKTX2ArrayFromBuffer = module.loadKTX2ArrayFromBuffer;
            loadKTX2ArrayFromUrl = module.loadKTX2ArrayFromUrl;
            loadOfficialArrayFromUrl = module.loadOfficialArrayFromUrl;
        }
    } else {
        const module = await import('./cube.js');
        animate = module.animate;
        loadKTX2ArrayFromSlices = module.loadKTX2ArrayFromSlices;
        loadKTX2ArrayFromBuffer = module.loadKTX2ArrayFromBuffer;
        loadKTX2ArrayFromUrl = module.loadKTX2ArrayFromUrl;
        loadOfficialArrayFromUrl = module.loadOfficialArrayFromUrl;
    }

    // Update title to show renderer type
    const titleElement = document.getElementById('titleText');
    if (titleElement) {
        const threading = threadingSupported ? ' (Threaded)' : '';
        const renderer = rendererType === 'webgpu' ? ' [WebGPU]' : ' [WebGL]';
        titleElement.textContent = 'KTX2 Array Demo' + threading + renderer;
    }

    animate();
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
            const style = (params.get('style') || '').toLowerCase();
            if (style === 'official') {
                await loadOfficialArrayFromUrl('./spiritedaway.ktx2');
            } else {
                await loadKTX2ArrayFromUrl('./spiritedaway.ktx2');
            }
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
