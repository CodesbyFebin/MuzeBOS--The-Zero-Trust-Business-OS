# 3-minute demo video script

Rule: show only work built during the hackathon (see HACKATHON.md). Record
only **after** a live run with `META_MODEL_API_KEY` set, and never splice in
mocked output. If a live call fails on camera, show the failure honestly.

| Time | Shot | Voice-over |
| --- | --- | --- |
| 0:00-0:15 | Face cam or title card: "MuzeBOS: AI that proposes, you approve" | "I run my business alone. AI could do half my ops, but I won't give a model write access to my invoices." |
| 0:15-0:30 | HACKATHON.md new-vs-inherited table | "MuzeBOS started as a FounderOS fork. Everything I show today is in this hackathon branch." |
| 0:30-1:10 | Terminal: `META_MODEL_API_KEY=… npm run demo:agent` with the messy invoice/follow-up/restock request | "One messy request. The swarm splits it, short tasks go to Muse Spark 1.3, the big planning task goes to Muse Wonder." Highlight `engine=meta model=muse-wonder-1.0` |
| 1:10-1:35 | Same, with `--baseten` | "The same flow on open-weight Muse Spark Open, served by Baseten." |
| 1:35-2:00 | Show a refused proposal (model tries an unlisted tool) and the test file | "Model output is untrusted data. Anything off the allow-list is refused before it reaches the gate." |
| 2:00-2:40 | Browser at /workspace/brain/runtime: Jev queue, approve one proposal, show evidence log; try a tampered payload, show refusal | "Jev binds approval to the hash of the exact payload. Change one character and it's a different hash." |
| 2:40-3:00 | Architecture diagram + limitations slide | "Meta models think, I decide. Repo is public. Next steps: voice memos via Muse Voice Transcribe." |
