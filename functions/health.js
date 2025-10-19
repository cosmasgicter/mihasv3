export async function onRequestGet() {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    platform: 'cloudflare-pages'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}