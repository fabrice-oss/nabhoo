// Proxy CORS entre NABHOO (avrila.fr) et l'API Pennylane
// Cloudflare Worker — déployé sur workers.dev

const ALLOWED_ORIGINS = [
  'https://avrila.fr',
  'https://www.avrila.fr',
  'http://localhost:8080', // dev local
];

const PENNYLANE_BASE = 'https://app.pennylane.com';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Bloque les origines non autorisées
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Reconstruit l'URL Pennylane
    const url    = new URL(request.url);
    const target = PENNYLANE_BASE + url.pathname + url.search;

    // Transmet les headers nécessaires (Authorization + Content-Type avec boundary)
    const fwdHeaders = new Headers();
    const auth = request.headers.get('Authorization');
    if (auth) fwdHeaders.set('Authorization', auth);
    const ct = request.headers.get('Content-Type');
    if (ct) fwdHeaders.set('Content-Type', ct);

    // Appel Pennylane côté serveur (pas de restriction CORS)
    const pennylaneRes = await fetch(target, {
      method: request.method,
      headers: fwdHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });

    // Réponse avec headers CORS ajoutés
    const resHeaders = new Headers(pennylaneRes.headers);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

    return new Response(pennylaneRes.body, {
      status: pennylaneRes.status,
      headers: resHeaders,
    });
  },
};
