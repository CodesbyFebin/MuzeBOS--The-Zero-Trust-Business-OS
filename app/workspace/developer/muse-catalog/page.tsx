import { MuseCatalog } from '@/components/metabos/muse/MuseCatalog';
export default function MuseCatalogPage() {
  return <main className="mb-page mb-v3" aria-labelledby="mc-h"><h1 id="mc-h" className="mb-heading">MUSE skills &amp; MCP catalog</h1>
    <p className="mb-muted">Third-party, pre-existing material listed with its real licence. Adoptable skills are vendored (SKILL.md text only) under <code>vendor/muse-skills</code> with LICENSE and attribution. GPL and unlicensed entries are reference only; proprietary and deprecated ones are blocked. MCP servers stay Not connected until their env is set and an operator starts them.</p>
    <MuseCatalog limit={50} /></main>;
}
