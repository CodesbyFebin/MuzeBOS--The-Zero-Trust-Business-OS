# Demo script (about 6 minutes)

Before you start: `npm run build && MUZEBOS_DB=/tmp/demo.db MUZEBOS_CLAW_DIR=/workspace/claw-local MUZEBOS_LOCAL_LLM_URL=http://127.0.0.1:8089/v1 MUZEBOS_LOCAL_GUARD_URL=http://127.0.0.1:8090/v1 PORT=4130 npm start`. Set up the owner at `/setup`. A fresh database shows "No records yet" everywhere, and that is expected.

1. **Mission Control** (`/`): the empty state is honest; there are no sample numbers.
2. **Claw swarms** (`/workspace/builder/swarms`): show the 10 swarms, then a sub-cluster, then the 1000 definition cards. Filter by Jev required. Open a lead card, type "Draft a one-line Diwali pre-order caption for a Kochi bakery", and click **Run on local swarm** (takes 20–40 s). Point out the Brain draft, "Llama Guard: safe" and "Waiting in Jev; nothing was sent". The cost is $0 because it runs on local Llama.
3. **Agent Hub** (`/workspace/builder/agent-hub`): the same swarm is now a workspace. #runs and #approvals show that draft. Click **Create channel** and enter `diwali-launch`. Click **Build agent**, choose a tool from the swarm, and note that external tools force Jev. In the composer, pick Instagram and write a post. It becomes a draft with "Jev: pending" and nothing is posted.
4. **Jev** (`/workspace/brain/runtime`): approve or reject. Only approved items can reach `/api/dispatch`.
5. **MUSE** (`/workspace/brain/voice`): MUSE listens and speaks. Type "create a task to call the flour supplier" and it proposes the task in Jev. Show the panels: the Evidence ledger (chain verified), Fleet, Memory and Tools. Switch the coat to violet, then back to ember.
6. **Evidence** (`/workspace/evidence`): every step above is in the hash chain.

Say aloud: Yao runs are wired and the engine works, but the in-app Yao run needs a Yao access token (BLOCKED on this machine). Do not claim production readiness.
