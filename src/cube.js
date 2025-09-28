
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Loading spinner control functions
function showLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = 'flex';
    }

    // Hide the cube while loading
    if (cube) {
        cube.visible = false;
    }
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = 'none';
    }

    // Show the cube when done loading
    if (cube) {
        cube.visible = true;
    }
}

// Set up KTX2 loader
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('./');
ktx2Loader.detectSupport(renderer);

// Default texture load removed for array demo focus

// Function to update cube texture
function updateCubeTexture(texture) {
    // Fix horizontal mirroring by adjusting texture properties
    texture.flipY = false; // KTX2 textures typically don't need Y-flip
    texture.wrapS = THREE.RepeatWrapping; // Allow for negative repeat to flip
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.x = -1; // Flip horizontally by using negative repeat
    texture.repeat.y = 1;  // Keep vertical as is
    texture.generateMipmaps = false; // KTX2 files may already contain mipmaps

    if (cube) {
        cube.material.map = texture;
        cube.material.needsUpdate = true;
    }
}

// Function to load KTX2 from blob/buffer
function loadKTX2FromBuffer(buffer, callback) {
    // Show loading spinner
    showLoadingSpinner();

    // Create a blob URL from the buffer
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    ktx2Loader.load(url, (texture) => {
        updateCubeTexture(texture);
        URL.revokeObjectURL(url); // Clean up

        // Hide loading spinner and show cube
        hideLoadingSpinner();

        if (callback) callback(texture);
    }, undefined, (error) => {
        // Hide loading spinner on error too
        hideLoadingSpinner();
        console.error('Error loading KTX2 texture:', error);
    });
}

// Create cube geometry and material (texture will be applied when loaded)
const geometry = new THREE.BoxGeometry(2, 2, 2);

// Optional: If mirroring still occurs, we can manually adjust UV coordinates
// This ensures the texture appears correctly oriented on all faces
const uvAttribute = geometry.attributes.uv;
for (let i = 0; i < uvAttribute.count; i += 4) {
    // For each face (4 vertices), we can flip U coordinates if needed
    // This is commented out by default - uncomment if horizontal mirroring persists

    // uvAttribute.setX(i, 1 - uvAttribute.getX(i));     // Top-left
    // uvAttribute.setX(i + 1, 1 - uvAttribute.getX(i + 1)); // Top-right  
    // uvAttribute.setX(i + 2, 1 - uvAttribute.getX(i + 2)); // Bottom-right
    // uvAttribute.setX(i + 3, 1 - uvAttribute.getX(i + 3)); // Bottom-left
}
uvAttribute.needsUpdate = true;

const material = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Default white color until texture loads
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    // Rotate the cube
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // If an array material is active, advance layer once per second
    updateArrayLayerCycling();

    // Update controls
    controls.update();

    // Render the scene
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


export { animate, loadKTX2FromBuffer, showLoadingSpinner, hideLoadingSpinner };
export { loadKTX2ArrayFromBuffer };
export { loadKTX2ArrayFromSlices };

// ================= Array texture demo support =================

let arrayMaterial = null;
let arrayLayerCount = 0;
let arrayLayer = 0;
let arrayLastSwitchTime = 0;

// Create a shader material that samples from a sampler2DArray
function makeArrayMaterial(arrayTex, layers) {
    arrayLayerCount = layers;
    arrayLayer = 0;
    arrayLastSwitchTime = performance.now();

    const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            uTex: { value: arrayTex },
            uLayer: { value: 0 }
        },
        vertexShader: /* glsl */`
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            precision highp float;
            precision highp sampler2DArray;
            in vec2 vUv;
            uniform sampler2DArray uTex;
            uniform int uLayer;
            out vec4 outColor;
            void main() {
                outColor = textureLod(uTex, vec3(vUv, float(uLayer)), 0.0);
            }
        `,
    });
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
}

// Load a KTX2 array texture from bytes and apply shader cycling material
function loadKTX2ArrayFromBuffer(buffer, layers) {
    showLoadingSpinner();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    ktx2Loader.load(url, (texture) => {
        URL.revokeObjectURL(url);

        // KTX2Loader will create a DataTexture2DArray when the source is an array
        texture.flipY = false;
        texture.generateMipmaps = false;

        arrayMaterial = makeArrayMaterial(texture, layers);
        cube.material = arrayMaterial;
        cube.material.needsUpdate = true;

        hideLoadingSpinner();
    }, undefined, (error) => {
        hideLoadingSpinner();
        console.error('Error loading KTX2 array texture:', error);
    });
}

// Load multiple single-image KTX2 slices and build a CompressedArrayTexture
async function loadKTX2ArrayFromSlices(buffers) {
    showLoadingSpinner();
    try {
        // Create blob URLs and load each slice as a compressed texture
        const urls = buffers.map((buf) => URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' })));
        const textures = await Promise.all(urls.map((u) => ktx2Loader.loadAsync(u)));
        // Cleanup URLs
        urls.forEach((u) => URL.revokeObjectURL(u));

        // Debug: log slice summaries
        console.log('[KTX2 slices] loaded:', textures.length);
        textures.forEach((t, i) => {
            const w = t.image?.width; const h = t.image?.height;
            const mips = Array.isArray(t.mipmaps) ? t.mipmaps.length : 0;
            console.log(` slice[${i}] format=${t.format} base=${w}x${h} mips=${mips}`);
        });

        // For each texture, get its mipmaps array; ensure at least base level present
        const mipmapsList = textures.map((t, idx) => {
            let mips = t.mipmaps;
            if (!Array.isArray(mips) || mips.length === 0) {
                // Some loaders may store base level in .mipmaps even when no extra mips; if not, try to infer
                const iw = t.image?.width;
                const ih = t.image?.height;
                const idata = t.image?.data; // Usually undefined for compressed textures; included for completeness
                if (idata && typeof iw === 'number' && typeof ih === 'number') {
                    mips = [{ data: idata, width: iw, height: ih }];
                } else {
                    throw new Error(`Slice ${idx}: missing mipmap data`);
                }
            }
            // Validate each mip has ArrayBufferView data
            for (let m = 0; m < mips.length; m++) {
                const level = mips[m];
                if (!level || !level.data) {
                    throw new Error(`Slice ${idx} mip ${m}: missing data`);
                }
                // level.data may be typed array or array-of-typed-arrays
                const d = level.data;
                const isTypedArray = ArrayBuffer.isView(d);
                const isArrayOfTyped = Array.isArray(d) && d.every((x) => ArrayBuffer.isView(x));
                if (!isTypedArray && !isArrayOfTyped) {
                    console.error('Bad mip level:', { idx, mip: m, sample: d });
                    throw new Error(`Slice ${idx} mip ${m}: data must be a typed array or array of typed arrays`);
                }
                if (!(level.width > 0) || !(level.height > 0)) {
                    throw new Error(`Slice ${idx} mip ${m}: invalid dimensions ${level.width}x${level.height}`);
                }
            }
            return mips;
        });

        // Sanity check: format, dimensions, mip count must match across slices
        const f = textures[0].format;
        const baseW = mipmapsList[0][0].width;
        const baseH = mipmapsList[0][0].height;
        const mipsCount = mipmapsList[0].length;
        for (let i = 0; i < textures.length; i++) {
            const t = textures[i];
            const mips = mipmapsList[i];
            if (t.format !== f) throw new Error(`Slice ${i}: format mismatch`);
            if (mips.length !== mipsCount) throw new Error(`Slice ${i}: mip count mismatch (${mips.length} vs ${mipsCount})`);
            if (mips[0].width !== baseW || mips[0].height !== baseH) throw new Error(`Slice ${i}: base dimensions mismatch`);
        }

        // Transform to mip-major structure: for each mip level, provide data array of length=depth
        const depth = mipmapsList.length;
        const mipmapsByLevel = [];
        for (let level = 0; level < mipsCount; level++) {
            const levelWidth = mipmapsList[0][level].width;
            const levelHeight = mipmapsList[0][level].height;
            const levelData = [];
            for (let layer = 0; layer < depth; layer++) {
                const entry = mipmapsList[layer][level];
                // Ensure each entry is a typed array (single layer payload)
                if (Array.isArray(entry.data)) {
                    // If a loader provided array-of-layers per slice (unlikely), take this layer index
                    const maybeTyped = entry.data[layer];
                    if (!ArrayBuffer.isView(maybeTyped)) {
                        throw new Error(`Layer ${layer} mip ${level}: expected typed array, got ${typeof maybeTyped}`);
                    }
                    levelData.push(maybeTyped);
                } else {
                    if (!ArrayBuffer.isView(entry.data)) {
                        throw new Error(`Layer ${layer} mip ${level}: data is not typed array`);
                    }
                    levelData.push(entry.data);
                }
            }
            if (levelData.length !== depth) {
                throw new Error(`Mip ${level}: data array length ${levelData.length} != depth ${depth}`);
            }
            // Flatten per-layer typed arrays into a single contiguous typed array as expected by three.js
            const ctor = levelData[0].constructor; // assume all layers share the same constructor
            if (!levelData.every(d => d.constructor === ctor)) {
                console.warn('[KTX2 array build] Mixed typed array constructors across layers at mip', level, levelData.map(d => d.constructor && d.constructor.name));
            }
            const totalBytes = levelData.reduce((sum, d) => sum + d.byteLength, 0);
            // Use Uint8Array as a safe fallback for compressed payloads since bytes are copied verbatim
            const flat = new Uint8Array(totalBytes);
            let offset = 0;
            for (let i = 0; i < levelData.length; i++) {
                const part = levelData[i];
                flat.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), offset);
                offset += part.byteLength;
            }
            // Debug per-level summary
            console.log(`[KTX2 array build] mip ${level}: ${levelWidth}x${levelHeight}, layers=${levelData.length}, flatBytes=${flat.byteLength}`);
            mipmapsByLevel.push({ data: flat, width: levelWidth, height: levelHeight });
        }

        // Construct CompressedArrayTexture with mip-major mipmaps
        const texArray = new THREE.CompressedArrayTexture(mipmapsByLevel, baseW, baseH, depth, f);
        texArray.needsUpdate = true;
        texArray.flipY = false;
        texArray.generateMipmaps = false;
        texArray.minFilter = mipsCount > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        texArray.magFilter = THREE.LinearFilter;
        texArray.wrapS = THREE.ClampToEdgeWrapping;
        texArray.wrapT = THREE.ClampToEdgeWrapping;
        // Try to propagate color space from the first slice (e.g., SRGBColorSpace)
        if (textures[0].colorSpace) {
            texArray.colorSpace = textures[0].colorSpace;
        }

        // Additional debug of the final texture object
        console.log('[KTX2 array build] final tex image:', texArray.image, 'format=', texArray.format, 'mips=', texArray.mipmaps.length);
        if (texArray.mipmaps[0] && Array.isArray(texArray.mipmaps[0].data)) {
            console.log('[KTX2 array build] mip0 layer types:', texArray.mipmaps[0].data.map(d => d && d.constructor && d.constructor.name));
        }

        arrayMaterial = makeArrayMaterial(texArray, depth);
        cube.material = arrayMaterial;
        cube.material.needsUpdate = true;
    } catch (err) {
        console.error('Failed to build CompressedArrayTexture from slices:', err);
    } finally {
        hideLoadingSpinner();
    }
}

// Update layer once per second when arrayMaterial is active
const ONE_SECOND = 1000;
function updateArrayLayerCycling() {
    if (!arrayMaterial || arrayLayerCount <= 1) return;
    const now = performance.now();
    if (now - arrayLastSwitchTime >= ONE_SECOND) {
        arrayLayer = (arrayLayer + 1) % arrayLayerCount;
        arrayMaterial.uniforms.uLayer.value = arrayLayer;
        arrayLastSwitchTime = now;
    }
}

// Inject array layer cycling into the existing animation loop
// (Call updateArrayLayerCycling() inside the original animate below.)