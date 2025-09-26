
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

// Set up KTX2 loader
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('/');
ktx2Loader.detectSupport(renderer);

let treesTexture;
// Load default texture
ktx2Loader.load('trees.ktx2', (texture) => {
    treesTexture = texture;
    updateCubeTexture(treesTexture);
});

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
    // Create a blob URL from the buffer
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    ktx2Loader.load(url, (texture) => {
        updateCubeTexture(texture);
        URL.revokeObjectURL(url); // Clean up
        if (callback) callback(texture);
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


export { animate, loadKTX2FromBuffer };