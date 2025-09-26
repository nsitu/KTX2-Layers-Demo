import './style.css'
import { animate, loadKTX2FromBuffer } from './cube.js'
animate();


// RDO = Rate-Distortion Optimization
// LDR = Low Dynamic Range
// UASTC = Universal Adaptive Scalable Texture Compression

import { threadingSupported } from './/utils.js';
import { ImageToKtx } from './img_to_ktx.js';
import { loadBasisModule } from './load_basis.js';
import { resizeImageToPOT } from './image-resizer.js';


let currentImageData = null
let currentImageName = ''
let currentImageExt = ''


// Helper function to handle file loading from both drag&drop and file input
function handleFileLoad(file) {
    var reader = new FileReader()
    var type = file.name.substring(file.name.lastIndexOf('.') + 1, file.name.length);
    var name = file.name.substring(0, file.name.lastIndexOf('.'));

    reader.readAsArrayBuffer(file);

    reader.onload = async function (e) {
        currentImageData = e.target.result;
        currentImageName = name;
        currentImageExt = type;
        console.log('Image loaded:', name + '.' + type);

        // Resize image to POT dimensions before encoding
        console.log('Processing image for cube texture...');
        try {
            const resizeResult = await resizeImageToPOT(currentImageData, name, type);

            // Provide detailed feedback about processing
            let processingInfo = `Processed ${name}.${type}:\n`;
            processingInfo += `  Original: ${resizeResult.originalDimensions.width}x${resizeResult.originalDimensions.height}`;

            if (resizeResult.wasCropped) {
                processingInfo += `\n  Cropped to square: ${resizeResult.cropDimensions.width}x${resizeResult.cropDimensions.height}`;
            }

            if (resizeResult.wasResized) {
                processingInfo += `\n  Resized to POT: ${resizeResult.newDimensions.width}x${resizeResult.newDimensions.height}`;
            }

            if (!resizeResult.wasCropped && !resizeResult.wasResized) {
                processingInfo += ` (already optimal square POT size)`;
            }

            console.log(processingInfo);

            // Update current image data with processed version
            currentImageData = resizeResult.data;
            currentImageExt = resizeResult.fileExtension; // Now PNG

            await encodeCurrentImage();
        } catch (error) {
            console.error('Error processing image:', error);
            // Fall back to encoding without processing
            await encodeCurrentImage();
        }
    }
}

const dropElement = (e) => {
    e.preventDefault();
    let file
    if (e.dataTransfer.items) file = e.dataTransfer.files[0]
    else return;

    handleFileLoad(file);
}

const saveResult = async () => {
    let blob = ImageToKtx.getBlob();

    if (blob) {
        // User has loaded and processed an image
        let fileName = currentImageName + '.ktx2';

        // Create download link and trigger download
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Clean up the object URL
        URL.revokeObjectURL(downloadLink.href);

        console.log('File saved:', fileName);
    } else {
        // No user image loaded, download the default tree.ktx2
        console.log('No user image loaded, downloading default tree.ktx2');

        try {
            const response = await fetch('./trees.ktx2');
            if (response.ok) {
                const defaultBlob = await response.blob();

                const downloadLink = document.createElement('a');
                downloadLink.href = URL.createObjectURL(defaultBlob);
                downloadLink.download = 'trees.ktx2';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);

                // Clean up the object URL
                URL.revokeObjectURL(downloadLink.href);

                console.log('Default tree.ktx2 downloaded');
            } else {
                console.error('Could not fetch default tree.ktx2');
            }
        } catch (error) {
            console.error('Error downloading default tree.ktx2:', error);
        }
    }
}




async function encodeCurrentImage() {
    if (!currentImageData) {
        console.log('No image loaded!');
        return;
    }

    try {
        console.log('Starting encoding process...');

        // Encode image to KTX2
        const ktx2Data = await ImageToKtx.encode(currentImageData, currentImageName, currentImageExt);

        // Load the encoded KTX2 data into Three.js cube
        loadKTX2FromBuffer(ktx2Data, (texture) => {
            console.log('KTX2 texture loaded and applied to cube:', {
                width: texture.image.width,
                height: texture.image.height,
                format: texture.format
            });
        });

        console.log('Encoding completed successfully');
    } catch (error) {
        console.error('Error during encoding:', error);
    }
}



function init() {
    // Set up drag and drop
    document.addEventListener('dragover', function (e) { e.preventDefault() }, false);
    document.addEventListener('dragend', function (e) { e.preventDefault() }, false);
    document.addEventListener('dragleave', function (e) { e.preventDefault() }, false);
    document.addEventListener('drop', dropElement, false);

    // Update title to show threading support
    const titleElement = document.getElementById('titleText');
    if (titleElement) {
        titleElement.textContent = 'IMAGE to KTX2' + (threadingSupported ? ' THREADED' : ' SIMPLE');
    }

    // Set up button event listeners
    const loadBtn = document.getElementById('loadBtn');
    const saveBtn = document.getElementById('saveBtn');
    const fileInput = document.getElementById('fileInput');

    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveResult();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileLoad(file);
            }
        });
    }
}

try {
    await loadBasisModule()
    init()
} catch (error) {
    console.error("Failed to initialize application:", error);
}
