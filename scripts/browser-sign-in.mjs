/** Browser-test helper: sign a fictional owner into a disposable workspace so member-only reads work. Never use against real data. */
const OWNER = { workspace: 'Browser test workspace', name: 'Test Owner', email: 'owner@example.test', password: 'disposable-test-only' };
export async function signInOwner(page, base) {
  const post = (data) => page.request.post(base + '/api/metabos/auth', { headers: { origin: base }, data });
  let r = await post({ action: 'setup', setup: OWNER });
  if (r.status() !== 200) r = await post({ action: 'signIn', credentials: { email: OWNER.email, password: OWNER.password } });
  if (r.status() !== 200) throw new Error(`owner sign-in failed: ${r.status()}`);
}
