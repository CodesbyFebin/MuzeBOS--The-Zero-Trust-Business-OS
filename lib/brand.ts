/** Public identity shared by all legacy deployment profiles. */
export type Brand = { id: 'glados' | 'founderos' | 'metabos'; name: string; wordmark: string; title: string; mark: string };

const BRANDS: Record<Brand['id'], Brand> = {
  metabos: { id: 'metabos', name: 'MuZe', wordmark: 'MuZe/>', title: 'MuZe — Agentic Business Orchestration Server', mark: '/brand/metabos-mark.svg' },
  glados: { id: 'glados', name: 'MuZe', wordmark: 'MuZe/>', title: 'MuZe — Agentic Business Orchestration Server', mark: '/brand/metabos-mark.svg' },
  founderos: { id: 'founderos', name: 'MuZe', wordmark: 'MuZe/>', title: 'MuZe — Agentic Business Orchestration Server', mark: '/brand/metabos-mark.svg' },
};

export function brandFor(raw: string | undefined): Brand {
  return raw?.trim().toLowerCase() === 'glados' ? BRANDS.glados : raw?.trim().toLowerCase() === 'founderos' ? BRANDS.founderos : BRANDS.metabos;
}

export const BRAND: Brand = brandFor(process.env.GLADOS_BRAND);
