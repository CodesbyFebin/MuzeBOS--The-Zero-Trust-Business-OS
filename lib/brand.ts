/**
 * The product name and mark this deployment shows. One codebase ships as two
 * products: the operator's own instance (GLADOS_BRAND=glados) and the
 * invite-only client build, which is the default so a fresh clone needs no
 * setting. next.config.mjs inlines GLADOS_BRAND at build, so this reads the
 * same on the server and in the browser.
 */
export type Brand = { id: 'glados' | 'founderos' | 'muzebos'; name: string; title: string; mark: string };

const BRANDS: Record<Brand['id'], Brand> = {
  muzebos: { id: 'muzebos', name: 'MuzeBOS', title: 'MuzeBOS — The Zero-Trust Business OS', mark: '/brand/muzebos-mark.svg' },
  glados: { id: 'glados', name: 'GladOS', title: 'GLADOS', mark: '/brand/glados-mark.png' },
  founderos: { id: 'founderos', name: 'FounderOS', title: 'FOUNDEROS', mark: '/brand/founderos-mark.png' },
};

export function brandFor(raw: string | undefined): Brand {
  return raw?.trim().toLowerCase() === 'glados' ? BRANDS.glados : raw?.trim().toLowerCase() === 'founderos' ? BRANDS.founderos : BRANDS.muzebos;
}

export const BRAND: Brand = brandFor(process.env.GLADOS_BRAND);
