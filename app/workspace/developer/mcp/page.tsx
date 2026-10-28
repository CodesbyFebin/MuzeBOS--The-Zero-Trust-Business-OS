import { MCP_TOOLS } from '@/lib/metabos/b3/gst-mcp';
export default function McpPage() {
  return <main className="mb-page mb-v3" aria-labelledby="mcp-h"><h1 id="mcp-h" className="mb-heading">GST MCP server</h1>
    <p className="mb-muted">JSON-RPC over <code>POST /api/b3/mcp</code> for signed-in members (initialize, tools/list, tools/call). Compute-only: these tools never write records or send anything.</p>
    <ul>{MCP_TOOLS.map((t) => <li key={t.name}><code>{t.name}</code> — {t.description}</li>)}</ul>
    <p className="mb-muted">GST math: pre-existing Open-Founder code by CodesbyFebin (pre-kickoff), labelled in the source.</p></main>;
}
