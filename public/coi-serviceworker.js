/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        // Safari/iOS specific: Handle case-sensitive file paths
        let requestUrl = r.url;
        try {
            // Normalize URL for case-sensitivity issues on iOS Safari
            const url = new URL(requestUrl);
            if (url.pathname !== url.pathname.toLowerCase()) {
                console.warn('[COI ServiceWorker] Case-sensitive path detected on iOS/Safari:', url.pathname);
            }
        } catch (e) {
            console.warn('[COI ServiceWorker] URL parsing error:', e);
        }

        const request = (coepCredentialless && r.mode === "no-cors")
            ? new Request(r, {
                credentials: "omit",
            })
            : r;

        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Safari/iOS: Ensure we always return a valid Response
                    if (!response) {
                        console.error('[COI ServiceWorker] Received null response on Safari/iOS');
                        return new Response('Service Worker Error: Null response', {
                            status: 500,
                            statusText: 'Internal Server Error',
                            headers: new Headers({
                                'Content-Type': 'text/plain',
                                'Cross-Origin-Embedder-Policy': coepCredentialless ? "credentialless" : "require-corp",
                                'Cross-Origin-Opener-Policy': 'same-origin'
                            })
                        });
                    }

                    if (response.status === 0) {
                        return response;
                    }

                    try {
                        const newHeaders = new Headers(response.headers);
                        newHeaders.set("Cross-Origin-Embedder-Policy",
                            coepCredentialless ? "credentialless" : "require-corp"
                        );
                        if (!coepCredentialless) {
                            newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                        }
                        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                        return new Response(response.body, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: newHeaders,
                        });
                    } catch (headerError) {
                        // Safari/iOS: Fallback if header manipulation fails
                        console.error('[COI ServiceWorker] Header manipulation failed on Safari/iOS:', headerError);
                        return response; // Return original response as fallback
                    }
                })
                .catch((e) => {
                    // Safari/iOS: Always return a proper Response object, never undefined
                    console.error('[COI ServiceWorker] Fetch failed on Safari/iOS:', e);

                    // Determine if this is a CORS issue
                    const isCorsError = e.message && (
                        e.message.includes('CORS') ||
                        e.message.includes('cross-origin') ||
                        e.message.includes('network')
                    );

                    const errorMessage = isCorsError
                        ? 'CORS Error: Cross-origin request blocked'
                        : `Network Error: ${e.message || 'Unknown error'}`;

                    // Return a proper Response object with error information
                    return new Response(errorMessage, {
                        status: isCorsError ? 403 : 503,
                        statusText: isCorsError ? 'Forbidden' : 'Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'text/plain',
                            'Cross-Origin-Embedder-Policy': coepCredentialless ? "credentialless" : "require-corp",
                            'Cross-Origin-Opener-Policy': 'same-origin',
                            'X-Error-Source': 'COI-ServiceWorker-Safari-iOS'
                        })
                    });
                })
        );
    });

} else {
    (() => {
        // You can customize the behavior of this script through a global `coi` variable.
        const coi = {
            shouldRegister: () => true,
            shouldDeregister: () => false,
            coepCredentialless: () => !(window.chrome || window.netscape),
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi
        };

        const n = navigator;

        if (n.serviceWorker && n.serviceWorker.controller) {
            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value: coi.coepCredentialless(),
            });

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // If we're already coi: do nothing. Perhaps it's due to this script doing its job, or COOP/COEP are
        // already set from the origin server. Also if the browser has no notion of crossOriginIsolated, just give up here.
        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet && console.log("COOP/COEP Service Worker not registered, a secure context is required.");
            return;
        }

        // In some environments (e.g. Chrome incognito mode) this won't be available
        if (n.serviceWorker) {
            // Safari/iOS specific: Add additional error handling for registration
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

            if (isIOS || isSafari) {
                !coi.quiet && console.log('[COI ServiceWorker] Detected Safari/iOS, using enhanced error handling');
            }

            n.serviceWorker.register(window.document.currentScript.src).then(
                (registration) => {
                    !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

                    registration.addEventListener("updatefound", () => {
                        !coi.quiet && console.log("Reloading page to make use of updated COOP/COEP Service Worker.");

                        // Safari/iOS: Add delay before reload to prevent race conditions
                        if (isIOS || isSafari) {
                            setTimeout(() => coi.doReload(), 100);
                        } else {
                            coi.doReload();
                        }
                    });

                    // If the registration is active, but it's not controlling the page
                    if (registration.active && !n.serviceWorker.controller) {
                        !coi.quiet && console.log("Reloading page to make use of COOP/COEP Service Worker.");

                        // Safari/iOS: Add delay before reload to prevent race conditions
                        if (isIOS || isSafari) {
                            setTimeout(() => coi.doReload(), 100);
                        } else {
                            coi.doReload();
                        }
                    }
                },
                (err) => {
                    !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);

                    // Safari/iOS: Provide more specific error information
                    if (isIOS || isSafari) {
                        console.error('[COI ServiceWorker] Safari/iOS specific error details:', {
                            userAgent: navigator.userAgent,
                            isSecureContext: window.isSecureContext,
                            crossOriginIsolated: window.crossOriginIsolated,
                            serviceWorkerSupport: !!n.serviceWorker,
                            error: err
                        });
                    }
                }
            );
        }
    })();
}
