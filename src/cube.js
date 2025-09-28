
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