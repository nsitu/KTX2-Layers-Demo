
import { threadingSupported, optimalThreadCount } from './utils.js';
import { getBasisModule } from './load_basis.js';

// NOTE: Input images are now pre-processed to POT dimensions
// by the image resizer worker before reaching this module

export const ImageToKtx = {
    encode: encodeImageToKtx,
    getBlob: getEncodedBlob
}


// Encoding settings with defaults
let encodingSettings = {
    multithreading: threadingSupported,
    uastcQuality: 1,
    rdoQuality: 1,
    rdoEnabled: false,
    srgb: true,
    mipmaps: true,
    basisTexFormat: 1 // UASTC LDR 4x4
};

let encodedKTX2File = null;



function getEncodedBlob() {
    if (!encodedKTX2File) return null;
    if (!encodedKTX2File.length) return null;
    return new Blob([encodedKTX2File]);
}

function getFileExtension(url) {
    const extension = url;
    // Remove any query parameters or fragments from the extension and convert to lowercase
    const cleanExtension = extension.split(/[\?#]/)[0].toLowerCase();
    return cleanExtension;
}

// Calculate appropriate buffer size for KTX2 encoding based on image data
// Since images are now always square POT dimensions, calculation is simplified
function calculateKTX2BufferSize(imageData) {
    // Try to get image dimensions from the PNG data
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    // IHDR chunk follows at offset 8
    const dataView = new DataView(imageData);

    let size = 1024;  // Default fallback (square)

    try {
        // Check for PNG signature
        if (dataView.getUint32(0) === 0x89504E47 && dataView.getUint32(4) === 0x0D0A1A0A) {
            // PNG format - IHDR chunk starts at offset 16
            const width = dataView.getUint32(16, false);  // big-endian
            const height = dataView.getUint32(20, false); // big-endian

            // Should always be square now, but use smaller dimension as safety
            size = Math.min(width, height);
        }
    } catch (e) {
        console.warn('Could not parse image dimensions, using default size');
    }

    console.log(`Calculating buffer for ${size}x${size} square image`);

    // Calculate buffer size with safety margins
    const pixelCount = size * size;

    // UASTC typically compresses to 8 bits per pixel (4:1 compression from 32bpp)
    // But we need extra space for:
    // - KTX2 headers and metadata (~1KB)
    // - Mipmap levels (adds ~33% for full mipmap chain)
    // - Safety margin for worst-case compression

    const baseSize = pixelCount * 1.0; // 8 bits per pixel in bytes
    const mipmapMultiplier = encodingSettings.mipmaps ? 1.33 : 1.0;
    const safetyMultiplier = 1.5; // 50% safety margin
    const headerSize = 4096; // 4KB for headers and metadata

    const calculatedSize = Math.ceil(baseSize * mipmapMultiplier * safetyMultiplier) + headerSize;

    // Clamp to reasonable bounds based on WASM limitations
    // Max 2048x2048 square = ~4.2M pixels, realistic compressed size is much smaller
    const minSize = 1024 * 1024; // 1MB
    const maxSize = 16 * 1024 * 1024; // 16MB (reduced from 64MB due to WASM constraints)

    const finalSize = Math.max(minSize, Math.min(maxSize, calculatedSize));

    console.log(`Buffer size: ${(finalSize / 1024 / 1024).toFixed(1)}MB for ${size}x${size} square image`);

    return finalSize;
}




function encodeImageToKtx(data, fileName, extension) {
    return new Promise((resolve, reject) => {
        if (!data) {
            reject(new Error('No image data provided'));
            return;
        }

        const cleanExtension = getFileExtension(extension);


        const Module = getBasisModule();
        if (!Module) {
            reject(new Error('BASIS module not loaded'));
            return;
        }

        const { BasisEncoder, initializeBasis } = Module;

        initializeBasis();

        console.log("imageFileDataLoaded URI: " + fileName + '.' + cleanExtension);

        // Create a destination buffer with dynamic size based on image dimensions
        const bufferSize = calculateKTX2BufferSize(data);
        var ktx2FileData = new Uint8Array(bufferSize);

        // Compress using the BasisEncoder class
        console.log('BasisEncoder::encode() started:');

        const basisEncoder = new BasisEncoder();

        console.log(`Using ${optimalThreadCount} threads for encoding (CPU has ${navigator.hardwareConcurrency || 'unknown'} threads)`);
        basisEncoder.controlThreading(encodingSettings.multithreading, optimalThreadCount);


        // Since we only support LDR, force HDR files to error
        const isHDRSourceFile = (cleanExtension === "exr" || cleanExtension === "hdr");

        if (isHDRSourceFile) {
            const errorMsg = 'HDR source files are not supported';
            console.error(errorMsg);
            reject(new Error(errorMsg));
            return;
        }

        basisEncoder.setCreateKTX2File(true);
        basisEncoder.setKTX2UASTCSupercompression(true);
        basisEncoder.setKTX2SRGBTransferFunc(true); // Always true for LDR

        // Only LDR image types supported
        var img_type = Module.ldr_image_type.cPNGImage.value;
        if (cleanExtension != null) {
            if ((cleanExtension === "jpg") || (cleanExtension === "jpeg") || (cleanExtension === "jfif"))
                img_type = Module.ldr_image_type.cJPGImage.value;
        }
        // Settings
        basisEncoder.setSliceSourceImage(0, new Uint8Array(data), 0, 0, img_type);

        basisEncoder.setFormatMode(encodingSettings.basisTexFormat);
        basisEncoder.setPerceptual(encodingSettings.srgb);
        basisEncoder.setMipSRGB(encodingSettings.srgb);
        basisEncoder.setRDOUASTC(encodingSettings.rdoEnabled);
        basisEncoder.setRDOUASTCQualityScalar(encodingSettings.rdoQuality);
        basisEncoder.setMipGen(encodingSettings.mipmaps);
        basisEncoder.setPackUASTCFlags(encodingSettings.uastcQuality);

        console.log('Encoding to UASTC LDR 4x4');

        const startTime = performance.now();

        var num_output_bytes = basisEncoder.encode(ktx2FileData);

        const elapsed = performance.now() - startTime;

        console.log('Encoding Time: ' + elapsed.toFixed(2) + 'ms');

        // Copy the encoded data to a new ArrayBuffer of the correct size

        var actualKTX2FileData = new Uint8Array(ktx2FileData.buffer, 0, num_output_bytes);

        basisEncoder.delete();

        if (num_output_bytes == 0) {
            const errorMsg = 'encodeBasisTexture() failed! Image may be too large to compress using 32-bit WASM.';
            console.error(errorMsg);
            reject(new Error(errorMsg));
        } else {
            console.log('encodeBasisTexture() succeeded, output size ' + num_output_bytes);
            encodedKTX2File = actualKTX2FileData;
            resolve(actualKTX2FileData);
        }
    });
}