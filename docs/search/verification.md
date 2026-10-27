# MuzeBOS verification and feature status

Feature availability describes a bounded implementation, not a production
readiness score. A page, model adapter or credential field does not establish
successful external execution. Check both code scope and executed evidence.

| Label | Meaning |
| --- | --- |
| Available | An implemented local scope; read its limits |
| Existing | An inherited screen with its own configuration and limits |
| Needs credentials | Local records/configuration may work; provider execution needs qualification |
| Planned / blocked | A roadmap item or explicit missing dependency |

## What has been checked?

Commerce, stock transactions, exact approvals, idempotency, audit evidence,
workflow state, local modules and inference protocol boundaries have automated
tests. Desktop/mobile browser checks use disposable records. Local protocol
fixtures verify software behavior; they do not establish actual model inference,
provider settlement or production uptime.

See the [integration/search release record](../MUZEBOS-SEARCH-RELEASE.md),
[commerce verification](../MUZEBOS-VERIFICATION.md),
[inference verification](../MUZEBOS-INFERENCE-VERIFICATION.md) and
[project board](../PROJECTS.md). Reports apply to their named source revision and
environment; older counts must not be presented as current test execution.

## What is not verified?

Live Meta/OpenRouter/Ollama inference, physical WebGPU devices, 24-hour operation,
Muse Code/Wonder Full, Claw tools, zkVM proofs, provider settlements and an
independent security assessment remain unverified unless a later report records
an executed gate with reproducible evidence.

## What evidence should I check before deployment?

Check the current source revision, test environment, failure cases and remaining
live gates. Software fixtures establish the tested application rules; live
inference, payment settlement, authentication deployment and recovery need their
own executed evidence. A passing build is one useful check, not a substitute for
those deployment checks.

Return to the [documentation hub](README.md) or [project README](../../README.md).
