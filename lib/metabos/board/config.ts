/** Board layout stored in SQLite (mb_board): tile order, size and hidden flag. Unknown tile ids are rejected. */
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { TILE_IDS } from './registry';
export type BoardTile = { id: string; size: 'sm' | 'md' | 'lg'; hidden: boolean };
export type Board = { tiles: BoardTile[]; updatedAt: string | null };
const ensure = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_board(id TEXT PRIMARY KEY, config TEXT NOT NULL, updatedAt TEXT NOT NULL)');
export const BoardInput = z.object({ tiles: z.array(z.object({ id: z.string().max(40), size: z.enum(['sm', 'md', 'lg']), hidden: z.boolean() }).strict()).max(64) }).strict();
/** Saved order first, then any registry tiles added since, so a new check is never silently missing. */
export function normalise(saved: BoardTile[]): BoardTile[] {
  const seen = new Set<string>(); const out: BoardTile[] = [];
  for (const t of saved) if (TILE_IDS.includes(t.id) && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  for (const id of TILE_IDS) if (!seen.has(id)) out.push({ id, size: 'md', hidden: false });
  return out;
}
export function getBoard(s: BusinessStore): Board {
  ensure(s); const row = s.db.prepare("SELECT config, updatedAt FROM mb_board WHERE id='default'").get() as { config: string; updatedAt: string } | undefined;
  return { tiles: normalise(row ? (JSON.parse(row.config) as BoardTile[]) : []), updatedAt: row?.updatedAt ?? null };
}
export function putBoard(s: BusinessStore, actor: string, raw: unknown): Board {
  const b = BoardInput.parse(raw); const bad = b.tiles.find((t) => !TILE_IDS.includes(t.id)); if (bad) throw new BusinessError(`Unknown tile ${bad.id}`, 400);
  if (new Set(b.tiles.map((t) => t.id)).size !== b.tiles.length) throw new BusinessError('Duplicate tile', 400);
  ensure(s); const tiles = normalise(b.tiles); const at = new Date().toISOString();
  s.db.prepare("INSERT INTO mb_board(id,config,updatedAt) VALUES('default',?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config, updatedAt=excluded.updatedAt").run(JSON.stringify(tiles), at);
  s.appendEvidence('board.layout', 'default', JSON.stringify({ by: actor, order: tiles.map((t) => t.id), hidden: tiles.filter((t) => t.hidden).map((t) => t.id) }));
  return { tiles, updatedAt: at };
}
