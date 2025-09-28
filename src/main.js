import './style.css';
import { animate, loadKTX2ArrayFromBuffer, showLoadingSpinner, hideLoadingSpinner } from './cube.js';
import { loadBasisModule } from './load_basis.js';
import { ImagesToKtx } from './images_to_ktx.js';
import { threadingSupported } from './/utils.js';

animate();

async function runArrayDemo() {
    try {
        showLoadingSpinner();
        const titleElement = document.getElementById('titleText');
        if (titleElement) {
            titleElement.textContent = 'KTX2 Array Demo' + (threadingSupported ? ' (Threaded)' : '');
        }

        const names = ['city.jpg', 'leaves.jpg', 'trees.jpg', 'sunflower.jpg'];
        const responses = await Promise.all(names.map(n => fetch(`./${n}`)));
        const ok = responses.every(r => r.ok);
        if (!ok) throw new Error('Failed to fetch one or more demo images');
        const bufs = await Promise.all(responses.map(r => r.arrayBuffer()));
        const layers = bufs.map((data, i) => ({ data, fileName: names[i], extension: names[i].split('.').pop() }));

        const ktxArray = await ImagesToKtx.encode(layers);
        loadKTX2ArrayFromBuffer(ktxArray, names.length);
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
