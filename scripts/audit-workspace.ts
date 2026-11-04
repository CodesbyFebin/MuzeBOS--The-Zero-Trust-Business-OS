import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { ALL_FEATURES, MENUS, statusCounts } from '../lib/metabos/registry';
import { businessServers } from '../lib/metabos/server/servers';

const servers = businessServers();
const menus = servers.flatMap(server => server.menus);
assert.deepEqual([...menus].sort(), MENUS.map(menu => menu.id).sort(), 'Each menu must belong to one server');
const categories = servers.flatMap(server => {
  assert.ok(server.categories.length, `Empty server: ${server.id}`);
  return server.categories;
});
for (const category of categories) assert.ok(category.channels.length, `Empty category: ${category.id}`);
assert.equal(new Set(categories.map(category => category.id)).size, categories.length, 'Duplicate category IDs');
const routes = categories.flatMap(category => category.channels.map(channel => channel.route));
assert.equal(new Set(routes).size, routes.length, 'Duplicate channel routes');
assert.deepEqual([...routes].sort(), ALL_FEATURES.map(feature => feature.route).sort(), 'Channels must match the registry');
for (const route of new Set([...routes, ...MENUS.map(menu => menu.route)])) {
  const segments = route.split('/').filter(Boolean);
  const page = (parts: string[]) => existsSync(`app/${parts.length ? parts.join('/') + '/' : ''}page.tsx`);
  const genericWorkspace = segments[0] === 'workspace' && (segments.length === 2
    ? page(['workspace', '[section]'])
    : segments.length === 3 && page(['workspace', '[section]', '[page]']));
  assert.ok(page(segments) || genericWorkspace, `No page for ${route}`);
}
const result = {
  summary: { menus: menus.length, spaces: servers.length, categories: categories.length, channels: routes.length, statuses: statusCounts() },
  servers,
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary, null, 2));
