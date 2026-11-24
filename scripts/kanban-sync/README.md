# Kanban sync (LAN board at http://192.168.50.160:7000)

Two-step, idempotent sync of the GitHub roadmap into the LAN kanban:

1. **Export** (any machine with GitHub access; `gh auth login` or `GITHUB_TOKEN`):
   ```bash
   python3 export_github_roadmap.py        # writes ./roadmap.json
   ```
2. **Push** (a machine that can reach the kanban, e.g. on 192.168.50.0/24):
   ```bash
   KANBAN_URL=http://192.168.50.160:7000 KANBAN_TOKEN=<token> \
     python3 push_to_kanban.py --board "bigfotolab roadmap"
   ```
   Re-runs update existing cards instead of duplicating (state in
   `.kanban-sync-state.json`; add it to your local ignores, never commit tokens).

## Mapping

| GitHub | Kanban |
|---|---|
| Epic issue #9 | the board title |
| Milestones (Phase 1–4) | lists/columns, ordered by milestone number |
| Issues #3–#8, #11 | cards in their milestone's list ("Backlog" if none), body = issue body + URL + labels |
| PRs #1, #2, #12, #13 | cards in "Shipped / PRs" |

## Adapter

`push_to_kanban.py` ships a WeKan-compatible REST adapter. If the board at
:7000 is Planka / Focalboard / Vikunja / custom, implement the same 5 methods
(`ensure_board`, `ensure_list`, `ensure_card`) against its API — see the
protocol note in the file header.

## Why not run from the agent sandbox

The Vibe sandbox has no route to the LAN and no kanban connector, so the push
must run from a LAN machine (or via a Mistral Workflow with a credential that
can reach 192.168.50.160). The export side is generated here with `gh`.
