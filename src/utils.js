// Function to check for WebAssembly threading support
const checkIsWasmThreadingSupported = function () {
    try {
        if (typeof WebAssembly === "object" && typeof WebAssembly.Memory === "function") {
            const testMemory = new WebAssembly.Memory({
                initial: 1,
                maximum: 1,
                shared: true,
            });
            return testMemory instanceof WebAssembly.Memory;
        }
        return false;
    } catch (e) {
        return false;
    }
}

const threadingSupported = checkIsWasmThreadingSupported();

if (threadingSupported) {
    console.log("Threading is supported");
}
else {
    console.log("Threading is NOT supported");
}


// Get the number of available CPU threads, with a reasonable fallback
const getOptimalThreadCount = () => {
    const cpuThreads = navigator.hardwareConcurrency || 4; // fallback to 4 if not available
    return Math.min(cpuThreads, 18); // cap at 18 to avoid potential issues
};

const optimalThreadCount = getOptimalThreadCount();

export { threadingSupported, optimalThreadCount };