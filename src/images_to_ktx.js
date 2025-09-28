import { threadingSupported, optimalThreadCount } from './utils.js';
import { getBasisModule } from './load_basis.js';

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
    mipmaps: false,    // true to generate full mipmap chain per-layer
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

// Attempt to parse PNG width/height, else return null
function tryParsePngSize(imageData) {
    try {
        const dv = new DataView(imageData);
        if (dv.getUint32(0) === 0x89504E47 && dv.getUint32(4) === 0x0D0A1A0A) {
            const width = dv.getUint32(16, false);
            const height = dv.getUint32(20, false);
            return { width, height };
        }
    } catch (e) {
        // ignore
    }
    return null;
}

// Calculate a reasonable destination buffer size for a KTX2 texture array
function calculateKTX2BufferSizeForLayers(firstImageData, layerCount) {
    let size = 1024; // default POT fallback
    const pngSize = tryParsePngSize(firstImageData);
    if (pngSize) {
        // Project uses square POT dimensions upstream; pick the smaller as safety
        size = Math.min(pngSize.width, pngSize.height);
    }

    console.log(`Calculating buffer for ${layerCount} layer(s) of ${size}x${size} squares`);

    const pixelsPerLayer = size * size;
    const pixelCountTotal = pixelsPerLayer * Math.max(1, layerCount);

    // UASTC typically ~1 byte/pixel. Add mipmaps and safety multipliers.
    const baseSize = pixelCountTotal * 1.0; // bytes
    const mipmapMultiplier = encodingSettings.mipmaps ? 1.33 : 1.0;
    const safetyMultiplier = 1.6; // a bit more for multi-layer safety
    const headerSize = 4096; // headers/metadata

    const calculated = Math.ceil(baseSize * mipmapMultiplier * safetyMultiplier) + headerSize;

    // Clamp to a conservative range. Increase upper bound vs single-image to accommodate arrays.
    const minSize = 1 * 1024 * 1024;   // 1MB
    const maxSize = 32 * 1024 * 1024;  // 32MB

    const finalSize = Math.max(minSize, Math.min(maxSize, calculated));
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

            // Allocate destination buffer
            const bufferSize = calculateKTX2BufferSizeForLayers(normalized[0].data, normalized.length);
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
        } catch (err) {
            reject(err);
        }
    });
}

// Optional: allow callers to tweak settings
export function setImagesToKtxSettings(partial) {
    encodingSettings = { ...encodingSettings, ...(partial || {}) };
}
