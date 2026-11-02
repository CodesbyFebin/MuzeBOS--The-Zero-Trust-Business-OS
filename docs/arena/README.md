# Arena & Skill Forge

Open `/workspace/brain/arena` after workspace sign-in. This is nested inside Brain; the restored 18-menu shell is retained.

1. Inspect existing task records and their actual lease/approval states on the office floor or accessible list.
2. Load one of the starter examples into the editor. Loading does not persist or execute anything.
3. Save version 1, or edit a saved version and save the next version. A stale expected version is refused.
4. Supply context and choose **Propose drafts to Jev**. Each step creates an independent pending inference draft, not a model call or automatic action.
5. Review each exact payload in the existing inference queue. Worker/provider setup and later approval remain separate.
6. Download JSON, YAML or Markdown from a saved version.

Files:

- [Upstream review and license boundaries](UPSTREAM-REVIEW.md)
- [Architecture and execution boundaries](ARCHITECTURE.md)
- [Deeper technical notes from the reviewed sources](TECHNICAL-NOTES.md)
- [JSON Schema](skill.schema.json)
- Starter manifests: [invoice review](starter-pack/invoice-review.json), [customer reply](starter-pack/customer-reply.json), [incident review](starter-pack/incident-review.json)

These examples draft from merchant-supplied context. They do not fetch live tax rules, verify bank statements, send messages, heal systems or provision computers. No compatibility with another agent runtime is promised by the export formats. No Refly code or separately licensed Munder Difflin artwork is included.
