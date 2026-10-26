import type { MetadataRoute } from 'next';
// Installable web app manifest. No service worker: the app needs its local server, so there is no offline mode.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MuzeBOS', short_name: 'MuzeBOS', description: 'Local-first business workspace with an approval-gated AI runtime.',
    start_url: '/workspace/brain/runtime', scope: '/', display: 'standalone', background_color: '#0A0A0A', theme_color: '#0A0A0A',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
  };
}
