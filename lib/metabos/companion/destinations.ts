export const COMPANION_DESTINATIONS = {
  home: { label: 'Dashboard', href: '/', selector: '[data-testid="home-tiles"]' },
  board: { label: 'Systems board', href: '/workspace/builder/business-open-server?view=board', selector: '[data-testid="bos-board"]' },
  issues: { label: 'Issues', href: '/workspace/builder/business-open-server?view=issues', selector: '[data-testid="bos-issues"]' },
  canvas: { label: 'Design canvas', href: '/workspace/builder/business-open-server?view=canvas', selector: '[data-testid="bos-canvas"]' },
  approvals: { label: 'Approval queue', href: '/workspace/brain/inference', selector: 'main' },
  receipts: { label: 'Send receipts', href: '/workspace/builder/business-open-server?view=sanctum', selector: '[data-testid="bos-sanctum"]' },
  evidence: { label: 'Evidence', href: '/workspace/evidence', selector: 'main' },
} as const;
