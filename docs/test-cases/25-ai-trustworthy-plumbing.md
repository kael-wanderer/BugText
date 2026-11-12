# AI trustworthy plumbing

### TRUST-01 — Provider connection test
- Steps: Open Gear → Agent → Models. Test a provider with a valid key, an invalid
  key, and a bogus model.
- Expected: The row reports OK, API-key rejection, or endpoint/model not found.
- Status: [ ]  Notes:

### TRUST-02 — Untrusted document and attachment context
- Steps: Put instruction-like text in the document and a text attachment, then ask
  the model to summarize the actual content.
- Expected: The model treats embedded instructions as document data rather than
  higher-priority system instructions.
- Status: [ ]  Notes:

### TRUST-03 — Edit reply retargets its source
- Steps: Request an Edit-mode rewrite in tab A, switch to tab B, then Apply.
- Expected: Bugter activates tab A and applies the edit there; tab B is untouched.
- Status: [ ]  Notes:

### TRUST-04 — Changed or closed edit source
- Steps: Generate an Edit-mode reply, then modify its source before Apply. Repeat
  after closing the source tab.
- Expected: Apply refuses with a changed-source or closed-source message.
- Status: [ ]  Notes:

### TRUST-05 — Single-run bypass
- Steps: Select Bypass approvals for a CLI agent and send twice; restart Bugter.
- Expected: Each send requires Run once confirmation. After restart the mode is Ask,
  and `agent.json` never contains `"permissionMode": "bypass"`.
- Status: [ ]  Notes:

### TRUST-06 — Process-tree cancellation
- Steps: Run a CLI-agent wrapper that spawns a child, cancel the reply, then inspect
  the process list.
- Expected: The parent and child process are both terminated.
- Status: [ ]  Notes:
