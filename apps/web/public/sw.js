const CACHE_NAME = 'vibepilot-v1';
const PRECACHE_URLS = ['/', '/manifest.json'];

// Tunnel request prefix
const TUNNEL_PREFIX = '/__tunnel__/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if this is a tunnel request: /__tunnel__/<port>/<path>
  if (url.pathname.startsWith(TUNNEL_PREFIX)) {
    event.respondWith(handleTunnelRequest(event.request, url));
    return;
  }

  // Default: cache-first for precached assets
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});

async function handleTunnelRequest(request, url) {
  // Parse /__tunnel__/<port>/<path>
  const pathAfterPrefix = url.pathname.substring(TUNNEL_PREFIX.length);
  const slashIndex = pathAfterPrefix.indexOf('/');
  const port = parseInt(
    slashIndex === -1 ? pathAfterPrefix : pathAfterPrefix.substring(0, slashIndex),
    10
  );
  const targetPath = slashIndex === -1 ? '/' : pathAfterPrefix.substring(slashIndex);

  if (isNaN(port)) {
    return new Response('Invalid tunnel port', { status: 400 });
  }

  // Get the controlling client to forward the request
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length === 0) {
    return new Response('No active VibePilot client', { status: 503 });
  }

  // Serialize request headers
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Read body if present
  let body = undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) {
      // Convert to base64
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      body = btoa(binary);
    }
  }

  // Send request to main page via MessageChannel
  const tunnelRequest = {
    type: 'tunnel-fetch',
    port,
    path: targetPath + url.search,
    method: request.method,
    headers,
    body,
  };

  try {
    const response = await sendToClient(clients[0], tunnelRequest);

    if (response.error) {
      return new Response(response.error, { status: 502 });
    }

    // Decode base64 body if present
    let responseBody = null;
    if (response.body) {
      const binary = atob(response.body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      responseBody = bytes.buffer;
    }

    // Build response headers, rewriting Location headers for redirects
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(response.headers || {})) {
      // Rewrite Location headers to go through tunnel
      if (key.toLowerCase() === 'location' && value.startsWith('/')) {
        responseHeaders.set(key, `${TUNNEL_PREFIX}${port}${value}`);
      } else {
        responseHeaders.set(key, value);
      }
    }

    return new Response(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response('Tunnel request failed: ' + err.message, { status: 502 });
  }
}

function sendToClient(client, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      reject(new Error('Tunnel request timed out'));
    }, 30000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data);
    };

    client.postMessage(message, [channel.port2]);
  });
}
