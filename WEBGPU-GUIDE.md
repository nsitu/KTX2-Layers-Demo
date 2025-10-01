# WebGPU/WebGL Hybrid Renderer Guide

## Quick Reference

### The Problem
Android devices with Mali GPUs exhibit a Chromium WebGL bug when rendering ASTC compressed 2D array textures, resulting in pink/incorrect rendering. The official three.js example has the same issue.

**Chromium Bug Tracker:** https://issues.chromium.org/issues/372311606

### The Solution
WebGPU handles ASTC array textures correctly on Android. This project now auto-detects and uses WebGPU when available, falling back to WebGL2 with format policies when needed.

## Usage

### Default Behavior (Recommended)
```
http://localhost:5173/
```
- Auto-selects WebGPU if `navigator.gpu` exists
- Falls back to WebGL2 if WebGPU unavailable
- Shows renderer in title: "KTX2 Array Demo [WebGPU]" or "[WebGL]"

### Query Parameters

**Renderer Selection:**
- `?renderer=webgpu` - Force WebGPU (fixes ASTC on Android)
- `?renderer=webgl` - Force WebGL2 (for testing/comparison)

**Array Mode:**
- `?array=ktx2` - Single KTX2 file with multiple layers
- `?array=slices` - Assemble from multiple single-image KTX2 files (default)

**Format Override (WebGL only):**
- `?force=astc` - Prefer ASTC (will show pink on affected Android)
- `?force=etc2` - Prefer ETC2 (works on all devices)

**Sample Assets:**
- `?sample=spirited` - Load Spirited Away KTX2 array
- `?style=official` - Use official-style plane demo (combine with sample)

### Example URLs

**Test ASTC fix on Android:**
```
?renderer=webgpu&sample=spirited
?renderer=webgpu&array=ktx2
```

**Compare renderers side-by-side:**
```
?renderer=webgpu&array=ktx2    (should work, ASTC)
?renderer=webgl&array=ktx2      (may be pink on Android Mali with ASTC)
?renderer=webgl&array=ktx2&force=etc2  (works, forces ETC2)
```

**Official-style comparison:**
```
?renderer=webgpu&sample=spirited&style=official
?renderer=webgl&sample=spirited&style=official&force=etc2
```

## Architecture

### File Structure

**src/cube.js** - WebGL renderer (original)
- Uses THREE.WebGLRenderer
- KTX2Loader with format policy (Mali → ETC2)
- All array texture loaders
- Diagnostics and GPU detection

**src/cube-webgpu.js** - WebGPU renderer (new)
- Uses THREE.WebGPURenderer
- No format forcing needed (WebGPU handles ASTC correctly)
- Same loader functions, parallel implementation
- Async `initRenderer()` for WebGPU setup

**src/main.js** - Entry point
- `chooseRenderer()` - Detects/selects renderer
- Dynamic imports based on selection
- Shares demo logic between both paths

### How It Works

1. **Initialization:**
   - `chooseRenderer()` checks query params and `navigator.gpu`
   - Dynamically imports either `cube.js` or `cube-webgpu.js`
   - Falls back to WebGL if WebGPU init fails

2. **Demo Execution:**
   - Same `runArrayDemo()` logic works with both renderers
   - Encoder configuration identical (UASTC, mipmaps, no Zstd)
   - Loaders return compatible textures for both APIs

3. **Rendering:**
   - Both use GLSL3 shaders with sampler2DArray
   - WebGPU auto-translates GLSL → WGSL internally
   - Animation loops cycle through array layers identically

## Platform Support

| Platform | WebGPU | WebGL2 | Recommended |
|----------|--------|--------|-------------|
| Chrome Android (modern) | ✅ Yes | ✅ Yes | WebGPU (auto) |
| Firefox Android | ❌ No | ✅ Yes | WebGL2 (auto) |
| Chrome Desktop | ✅ Yes | ✅ Yes | Either works |
| Firefox Desktop | ⚠️ Limited | ✅ Yes | WebGL2 safer |
| Safari Mac | ⚠️ Limited | ✅ Yes | Test both |
| Meta Quest | ✅ Yes | ⚠️ ASTC bug | WebGPU (auto) |

## Testing Checklist

### Android Device (Mali GPU)
- [ ] Default (no params) → Should use WebGPU, no pink
- [ ] `?renderer=webgpu&array=ktx2` → ASTC works correctly
- [ ] `?renderer=webgpu&sample=spirited` → Spirited Away renders
- [ ] `?renderer=webgl&force=etc2` → ETC2 works (no pink)
- [ ] `?renderer=webgl&force=astc` → Pink (documents Chromium bug)

### Desktop
- [ ] `?renderer=webgpu` → Works with ASTC
- [ ] `?renderer=webgl` → Works with ASTC
- [ ] Both renderers produce identical visual output

### Cross-browser
- [ ] Chrome: WebGPU auto-selected
- [ ] Firefox: WebGL2 fallback works
- [ ] Check console for renderer selection logs

## Diagnostics

### Console Logs

**Renderer selection:**
```
[Renderer] chosen= webgpu | hasWebGPU= true | Android= true | force= auto
[Renderer] WebGPU initialized
```

**Format selection (WebGPU):**
```
[WebGPU KTX2 array] GPU-format: ASTC 4x4 (37808) mips= 8
```

**Format selection (WebGL):**
```
[KTX2 cfg] policy = android-mali-etc2 | Android = true | renderer = Mali-G78
[KTX2 slices] GPU-format (first slice): ETC2 RGBA (37496)
```

### Title Bar Indicator
- "[WebGPU]" → Using WebGPU renderer
- "[WebGL]" → Using WebGL2 renderer
- "(Threaded)" → WASM multithreading active

### On-Screen Label
- "Layer X / N" → Current array layer being displayed
- Updates once per second during cycling

## Known Issues

### WebGL ASTC Arrays on Android
**Symptom:** Pink rectangle instead of texture
**Cause:** Chromium bug in glCompressedTexSubImage3D validation
**Status:** Open Chromium issue #372311606
**Workaround:** Use WebGPU (this project's default) or force ETC2 in WebGL

### Firefox Android
**Symptom:** No WebGPU support
**Behavior:** Automatically falls back to WebGL2
**Status:** Expected, works correctly

### Desktop Firefox WebGPU
**Symptom:** Limited/experimental support
**Behavior:** May fall back to WebGL2
**Status:** Expected, set `dom.webgpu.enabled` in about:config to test

## Development Tips

### Adding New Features
- Implement in both `cube.js` and `cube-webgpu.js` for parity
- Test with both `?renderer=webgpu` and `?renderer=webgl`
- Ensure fallback behavior works if WebGPU unavailable

### Debugging Renderer Issues
1. Check console for `[Renderer]` logs
2. Verify which module was imported
3. Test forced selection: `?renderer=webgpu` or `?renderer=webgl`
4. Compare behavior across both paths

### Performance Testing
- WebGPU may have different perf characteristics
- Encoding happens in WASM (same for both)
- GPU upload/rendering differs between APIs
- Use browser dev tools Performance tab

## References

- **Three.js WebGPU:** https://threejs.org/docs/#api/en/renderers/WebGPURenderer
- **Chromium Bug:** https://issues.chromium.org/issues/372311606
- **GitHub Issue:** https://github.com/mrdoob/three.js/issues/29539
- **WebGPU Spec:** https://www.w3.org/TR/webgpu/
- **KTX2 Samples:** https://github.com/donmccurdy/KTX2-Samples
