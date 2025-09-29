import { threadingSupported, optimalThreadCount } from './utils.js';
import { getBasisModule } from './load_basis.js';
import { sniffImageSize } from './image-utils.js';

// Multi-image encoder: encodes N input images (identical dimensions) as a KTX2 2D texture array
// Mirrors the single-image implementation in img_to_ktx.js but sets multiple slices.

export const ImagesToKtx = {
    encode: encodeImagesToKtxArray,
    getBlob: getEncodedBlob
};

// Encoding settings with defaults (kept independent from single-image settings)
let encodingSettings = {
    multithreading: threadingSupported,
    uastcQuality: 1,
    rdoQuality: 1,
    rdoEnabled: false,
    srgb: true,
    mipmaps: true,    // generate full mipmap chain per-layer (to match single-image path)
    basisTexFormat: 1  // UASTC LDR 4x4
};

let encodedKTX2File = null;

function getEncodedBlob() {
    if (!encodedKTX2File || !encodedKTX2File.length) return null;
    return new Blob([encodedKTX2File]);
}

function getFileExtension(ext) {
    const cleanExtension = (ext || '').toString().split(/[\?#]/)[0].toLowerCase();
    return cleanExtension;
}


// Calculate a reasonable destination buffer size for a KTX2 texture array
async function calculateKTX2BufferSizeForLayers(firstImageData, firstExt, layerCount) {
    let width = 1024, height = 1024;
    const meta = await sniffImageSize(firstImageData, firstExt);
    if (meta) { width = meta.width; height = meta.height; }

    console.log(`Calculating buffer for ${layerCount} layer(s) of ${width}x${height} squares`);

    // UASTC block-based estimate across mips for all layers
    const blockBytes = 16, blockDim = 4;
    let bytesPerLayer = 0;
    let w = width, h = height;
    do {
        bytesPerLayer += Math.ceil(w / blockDim) * Math.ceil(h / blockDim) * blockBytes;
        w = Math.max(1, w >> 1);
        h = Math.max(1, h >> 1);
    } while (encodingSettings.mipmaps && (w > 1 || h > 1));

    const totalBytes = bytesPerLayer * Math.max(1, layerCount);
    const safety = 1.35; // a bit more for multi-layer
    const header = 4096;
    const total = Math.ceil(totalBytes * safety) + header;

    const minSize = 1 * 1024 * 1024;
    const maxSize = 32 * 1024 * 1024;
    const finalSize = Math.max(minSize, Math.min(maxSize, total));
    console.log(`Buffer size: ${(finalSize / 1024 / 1024).toFixed(1)}MB for ${layerCount} layer(s)`);
    return finalSize;
}

/**
 * Encode multiple LDR images as a KTX2 2D texture array.
 * @param {Array<{ data:ArrayBuffer, fileName?:string, extension:string }>} layers - Ordered list of input images.
 * @returns {Promise<Uint8Array>} Resolves with encoded KTX2 bytes.
 */
function encodeImagesToKtxArray(layers) {
    return new Promise((resolve, reject) => {
        try {
            if (!Array.isArray(layers) || layers.length === 0) {
                reject(new Error('No input layers provided'));
                return;
            }

            // Basic HDR rejection and extension normalization
            const normalized = layers.map((l, idx) => {
                if (!l || !l.data) throw new Error(`Layer ${idx}: missing data`);
                const ext = getFileExtension(l.extension);
                if (ext === 'exr' || ext === 'hdr') throw new Error('HDR source files are not supported');
                return { data: l.data, fileName: l.fileName || `layer_${idx}`, ext };
            });

            const Module = getBasisModule();
            if (!Module) {
                reject(new Error('BASIS module not loaded'));
                return;
            }

            const { BasisEncoder, initializeBasis } = Module;
            initializeBasis();

            // Allocate destination buffer (async)
            calculateKTX2BufferSizeForLayers(normalized[0].data, normalized[0].ext, normalized.length)
                .then((bufferSize) => {
                    const ktx2FileData = new Uint8Array(bufferSize);

                    console.log('BasisEncoder::encode() for texture array started');
                    const basisEncoder = new BasisEncoder();
                    console.log(`Using ${optimalThreadCount} threads (multithreading=${encodingSettings.multithreading})`);
                    basisEncoder.controlThreading(encodingSettings.multithreading, optimalThreadCount);

                    // Configure for KTX2 + UASTC LDR
                    basisEncoder.setCreateKTX2File(true);
                    // Supercompression (Zstd) currently disabled to match single-image path; enable if desired
                    basisEncoder.setKTX2UASTCSupercompression(false);
                    basisEncoder.setKTX2SRGBTransferFunc(true);

                    // If the enum/method exists, explicitly request a 2D array texture type
                    try {
                        if (Module.cBASISTexType && basisEncoder.setTexType && Module.cBASISTexType.cBASISTexType2DArray !== undefined) {
                            basisEncoder.setTexType(Module.cBASISTexType.cBASISTexType2DArray);
                        }
                    } catch (_) { /* optional */ }

                    // Feed each slice
                    for (let i = 0; i < normalized.length; i++) {
                        const layer = normalized[i];
                        let img_type = Module.ldr_image_type.cPNGImage.value;
                        if (layer.ext === 'jpg' || layer.ext === 'jpeg' || layer.ext === 'jfif') {
                            img_type = Module.ldr_image_type.cJPGImage.value;
                        }
                        basisEncoder.setSliceSourceImage(i, new Uint8Array(layer.data), 0, 0, img_type);
                    }

                    // Common settings
                    basisEncoder.setFormatMode(encodingSettings.basisTexFormat);
                    basisEncoder.setPerceptual(encodingSettings.srgb);
                    basisEncoder.setMipSRGB(encodingSettings.srgb);
                    basisEncoder.setRDOUASTC(encodingSettings.rdoEnabled);
                    basisEncoder.setRDOUASTCQualityScalar(encodingSettings.rdoQuality);
                    basisEncoder.setMipGen(encodingSettings.mipmaps);
                    basisEncoder.setPackUASTCFlags(encodingSettings.uastcQuality);

                    console.log(`Encoding ${normalized.length} layer(s) to UASTC LDR 4x4`);
                    const startTime = performance.now();
                    const num_output_bytes = basisEncoder.encode(ktx2FileData);
                    const elapsed = performance.now() - startTime;
                    console.log('Encoding Time: ' + elapsed.toFixed(2) + 'ms');

                    const actualKTX2FileData = new Uint8Array(ktx2FileData.buffer, 0, num_output_bytes);
                    basisEncoder.delete();

                    if (num_output_bytes === 0) {
                        reject(new Error('encodeBasisTexture(array) failed! Output buffer may be too small or inputs mismatched.'));
                        return;
                    }

                    console.log(`encodeBasisTexture(array) succeeded, output size ${num_output_bytes}`);
                    encodedKTX2File = actualKTX2FileData;
                    resolve(actualKTX2FileData);
                })
                .catch(reject);
        } catch (err) {
            reject(err);
        }
    });
}

// Optional: allow callers to tweak settings
export function setImagesToKtxSettings(partial) {
    encodingSettings = { ...encodingSettings, ...(partial || {}) };
}
