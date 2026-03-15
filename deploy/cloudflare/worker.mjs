const readAssetJson = async (env, requestUrl, assetPath) => {
  const assetResponse = await env.ASSETS.fetch(new URL(assetPath, requestUrl));
  if (!assetResponse.ok) {
    return {
      ok: false,
      response: Response.json({ error: `${assetPath} not found in assets output` }, { status: 500 })
    };
  }

  return {
    ok: true,
    payload: await assetResponse.json()
  };
};

const RESERVED_PATHS = new Set(['/health', '/bundle.json', '/metadata.json', '/index.html']);
const RESERVED_PREFIXES = ['/api/', '/assets/'];
const STATIC_ASSET_PATTERN = /\.[a-z0-9]+$/iu;

const isSpaNavigationRequest = (request, url) => {
  if (!(request.method === 'GET' || request.method === 'HEAD')) {
    return false;
  }

  if (RESERVED_PATHS.has(url.pathname)) {
    return false;
  }

  if (RESERVED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return false;
  }

  if (STATIC_ASSET_PATTERN.test(url.pathname)) {
    return false;
  }

  return true;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (url.pathname === '/health' || url.pathname.startsWith('/api/')) {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
      }
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, readOnly: true, runtime: 'cloudflare-workers' });
    }

    if (url.pathname === '/api/views') {
      const bundle = await readAssetJson(env, url, '/bundle.json');
      if (!bundle.ok) {
        return bundle.response;
      }

      return Response.json(bundle.payload.graph?.views ?? []);
    }

    if (url.pathname === '/api/metadata') {
      const metadata = await readAssetJson(env, url, '/metadata.json');
      if (!metadata.ok) {
        return metadata.response;
      }

      return Response.json(metadata.payload);
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404 || !isSpaNavigationRequest(request, url)) {
      return assetResponse;
    }

    return env.ASSETS.fetch(new URL('/index.html', url));
  }
};
