/** MeTaBos geometric M mark, recreated as SVG from docs/design/logo-reference.png. */
export const MARK_PATH = 'M4 26V6h5l7 9 7-9h5v20h-5V14l-7 9-7-9v12z';
export function BrandMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={MARK_PATH} fill="currentColor" pathLength={1} className="mb-mark-path" />
    </svg>
  );
}
export function BrandLockup() {
  return (
    <span className="mb-lockup"><BrandMark size={22} /><span className="mb-lockup-text"><span className="mb-lockup-name">METABOS</span><span className="mb-lockup-mode">OPERATOR MODE</span></span></span>
  );
}
