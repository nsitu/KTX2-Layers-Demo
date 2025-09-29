import './style.css';
import { animate, loadKTX2ArrayFromSlices, loadKTX2ArrayFromBuffer } from './cube.js';
import { loadBasisModule } from './load_basis.js';
import { ImageToKtx } from './img_to_ktx.js';
import { ImagesToKtx } from './images_to_ktx.js';
import { threadingSupported, showLoadingSpinner, hideLoadingSpinner } from './utils.js';

animate();

async function runArrayDemo() {
    try {
        showLoadingSpinner();
        const titleElement = document.getElementById('titleText');
        if (titleElement) {
            titleElement.textContent = 'KTX2 Array Demo' + (threadingSupported ? ' (Threaded)' : '');
        }

        // Configure encoder(s): mipmaps on, Zstd supercompression disabled
        ImageToKtx.configure({ mipmaps: true, supercompression: false });
        console.log('[Encoder config] mipmaps=true, supercompression=false');

        const names = ['city.jpg', 'leaves.jpg', 'trees.jpg', 'sunflower.jpg'];
        const responses = await Promise.all(names.map(n => fetch(`./${n}`)));
        const ok = responses.every(r => r.ok);
        if (!ok) throw new Error('Failed to fetch one or more demo images');
        const rawImages = await Promise.all(responses.map(r => r.arrayBuffer()));

        // A/B switch: ?array=ktx2 or ?array=slices (default: slices)
        const params = new URLSearchParams(window.location.search);
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
    await loadBasisModule();
    await runArrayDemo();
} catch (error) {
    console.error('Failed to initialize application:', error);
}
