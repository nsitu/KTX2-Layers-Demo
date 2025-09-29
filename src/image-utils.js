// Utility helpers for image metadata

// Map common file extensions to MIME types; defaults to octet-stream
function extToMime(ext) {
    switch ((ext || '').toLowerCase()) {
        case 'jpg':
        case 'jpeg':
        case 'jfif':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'webp':
            return 'image/webp';
        default:
            return 'application/octet-stream';
    }
}

// Prefer WebCodecs ImageDecoder; fallback to createImageBitmap; else null
export async function sniffImageSize(imageData, ext) {
    const mime = extToMime(ext);
    const u8 = imageData instanceof Uint8Array
        ? imageData
        : imageData instanceof ArrayBuffer
            ? new Uint8Array(imageData)
            : new Uint8Array(imageData.buffer, imageData.byteOffset, imageData.byteLength);

    if ('ImageDecoder' in globalThis) {
        try {
            const dec = new ImageDecoder({ data: u8, type: mime });
            const { image } = await dec.decode({ frameIndex: 0, completeFramesOnly: true });
            const width = image.displayWidth || image.codedWidth || image.width;
            const height = image.displayHeight || image.codedHeight || image.height;
            image.close?.();
            dec.close?.();
            if (width && height) return { width, height };
        } catch (_) {
            // fall through to bitmap path
        }
    }

    try {
        const bmp = await createImageBitmap(new Blob([u8], { type: mime }));
        const size = { width: bmp.width, height: bmp.height };
        bmp.close?.();
        return size;
    } catch (_) {
        // final fallback
    }

    return null;
}

export default { sniffImageSize };
