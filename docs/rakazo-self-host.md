# Rakazo as MuZe's agent runtime (optional)

Rakazo (https://github.com/elie222/rakazo, Apache-2.0) can host MuZe's agents. MuZe works without it: the runtime stays **Local** and the board tile reads "Rakazo not configured".

## What MuZe talks to (read from Rakazo's source at commit 6bba136, not verified against a live server)
- `GET /ready` for the board tile (`/health` is also public).
- oRPC at `POST /rpc/<namespace>/<procedure>` with body `{"json": input}`: `bots/list`, `bots/get`, `bots/create`, `threads/send`.
- Auth: Rakazo uses better-auth sessions. It has **no long-lived API keys**. `RAKAZO_API_KEY` must be a session token from signing in to your Rakazo (bearer plugin). It stops working when that session ends.

## Environment (server only; never commit values)
| Variable | Meaning |
|---|---|
| `RAKAZO_URL` | Your Rakazo API origin (https, or http on localhost) |
| `RAKAZO_API_KEY` | Rakazo session bearer token |
| `RAKAZO_SPACE_ID` | Optional space id (`x-rakazo-space-id`) |
| `RAKAZO_PROPOSAL_SECRET` | Shared secret Rakazo sends to MuZe's propose_send tool. Unset = endpoint closed |

## Sends go through MuZe, always
Rakazo bots get no send tools from MuZe. In Rakazo, add an **OpenAPI tool source** pointing at `https://<muze>/api/runtime/rakazo/openapi.json`, with header `x-muzebos-runtime-secret: <RAKAZO_PROPOSAL_SECRET>`. Its single operation, `propose_send`, creates a pending `[MUSE plan]` dispatch. Two different reviewers must approve it in Sanctum before `/api/dispatch` can run it, and Meta test mode stays on by default. Every proposal writes a `runtime.rakazo.proposal` evidence row.

## Self-hosting sketch (not run by this project)
Check Rakazo's own README for the current setup. It needs Postgres and a sandbox provider (`SANDBOX_PROVIDER`: boat, e2b, daytona, createos or railway).

```yaml
# docker-compose.rakazo.yml (illustrative, untested here)
services:
  postgres:
    image: postgres:16
    environment: { POSTGRES_USER: rakazo, POSTGRES_PASSWORD: change-me, POSTGRES_DB: rakazo }
    volumes: [rakazo-db:/var/lib/postgresql/data]
  rakazo-api:
    build: { context: ./rakazo, dockerfile: apps/api/Dockerfile }   # path per upstream repo; verify
    environment:
      DATABASE_URL: postgres://rakazo:change-me@postgres:5432/rakazo
      BETTER_AUTH_SECRET: change-me
      SANDBOX_PROVIDER: e2b
    ports: ["3001:3001"]
    depends_on: [postgres]
volumes: { rakazo-db: {} }
```
