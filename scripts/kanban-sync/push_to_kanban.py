#!/usr/bin/env python3
"""Push roadmap.json to the LAN kanban board (idempotent).

Run from a machine that can reach the kanban (e.g. on 192.168.50.0/24):

    KANBAN_URL=http://192.168.50.160:7000 \
    KANBAN_TOKEN=<api token> \
    python3 push_to_kanban.py [--board "bigfotolab roadmap"]

Adapter: WeKan-compatible REST API by default. If your kanban is Planka,
Focalboard, Vikunja or custom, implement the KanbanAdapter protocol below
(same 5 methods) and point KANBAN_ADAPTER at it.

Mapping (kept stable so re-runs update instead of duplicating):
    GitHub milestone  -> kanban list (column), order = milestone number
    GitHub issue      -> card in its milestone list ("Backlog" if none)
    GitHub PR         -> card in the "Shipped / PRs" list
    GitHub epic #9    -> the board itself (title = epic title)
State file .kanban-sync-state.json maps GitHub numbers -> kanban IDs.
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROADMAP = os.path.join(HERE, "roadmap.json")
STATE = os.path.join(HERE, ".kanban-sync-state.json")


class WeKanAdapter:
    """WeKan REST adapter. Token via KANBAN_TOKEN (Authorization: Bearer)."""

    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.token = token

    def _call(self, method: str, path: str, payload=None):
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            method=method,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return json.loads(body) if body else {}

    def ensure_board(self, title: str) -> str:
        boards = self._call("GET", "/api/boards")
        if isinstance(boards, dict):
            boards = boards.get("boards", [])
        for b in boards:
            if b.get("title") == title:
                return b["_id"]
        b = self._call("POST", "/api/boards", {"title": title})
        return b["_id"]

    def ensure_list(self, board_id: str, title: str, position: int) -> str:
        lists = self._call("GET", f"/api/boards/{board_id}/lists")
        for l in lists:
            if l.get("title") == title:
                return l["_id"]
        l = self._call("POST", f"/api/boards/{board_id}/lists", {"title": title, "position": position})
        return l["_id"]

    def ensure_card(self, list_id: str, title: str, description: str, external_id: str) -> str:
        cards = self._call("GET", f"/api/lists/{list_id}/cards")
        for c in cards:
            if c.get("title") == title:
                self._call("PUT", f"/api/cards/{c['_id']}", {"description": description})
                return c["_id"]
        c = self._call("POST", f"/api/lists/{list_id}/cards", {"title": title, "description": description})
        return c["_id"]


def load_state() -> dict:
    if os.path.exists(STATE):
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    return {"board": None, "lists": {}, "cards": {}}


def save_state(s: dict) -> None:
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default="bigfotolab roadmap")
    args = ap.parse_args()

    base = os.environ.get("KANBAN_URL", "http://192.168.50.160:7000")
    token = os.environ.get("KANBAN_TOKEN", "")
    if not token:
        sys.exit("Set KANBAN_TOKEN (kanban API token). Never commit it.")
    with open(ROADMAP, encoding="utf-8") as f:
        roadmap = json.load(f)

    adapter = WeKanAdapter(base, token)
    state = load_state()

    epic = next((i for i in roadmap["issues"] if "epic" in i["title"].lower()), None)
    board_title = args.board if not epic else f"{args.board} — {epic['title']}"
    board_id = state["board"] or adapter.ensure_board(board_title)
    state["board"] = board_id
    print(f"board: {board_title} ({board_id})")

    for idx, ms in enumerate(sorted(roadmap["milestones"], key=lambda m: m["number"]), start=1):
        lid = state["lists"].get(str(ms["number"])) or adapter.ensure_list(board_id, ms["title"], idx)
        state["lists"][str(ms["number"])] = lid

    backlog = state["lists"].get("backlog") or adapter.ensure_list(board_id, "Backlog", 99)
    state["lists"]["backlog"] = backlog
    shipped = state["lists"].get("shipped") or adapter.ensure_list(board_id, "Shipped / PRs", 100)
    state["lists"]["shipped"] = shipped

    for issue in roadmap["issues"]:
        lid = state["lists"].get(str(next((m["number"] for m in roadmap["milestones"]
                                            if m["title"] == issue["milestone"]), "backlog")), backlog)
        desc = f"{issue['url']}\n\nLabels: {', '.join(issue['labels']) or '-'}\n\n{issue['body'][:4000]}"
        cid = state["cards"].get(f"issue-{issue['number']}") or adapter.ensure_card(
            lid, f"#{issue['number']} {issue['title']}", desc, f"issue-{issue['number']}")
        state["cards"][f"issue-{issue['number']}"] = cid
        print(f"  card #{issue['number']}: {issue['title'][:60]} [{issue['state']}]")

    for pr in roadmap["pulls"]:
        desc = f"{pr['url']}\n\nLabels: {', '.join(pr['labels']) or '-'}"
        cid = state["cards"].get(f"pr-{pr['number']}") or adapter.ensure_card(
            shipped, f"PR #{pr['number']} {pr['title']}", desc, f"pr-{pr['number']}")
        state["cards"][f"pr-{pr['number']}"] = cid
        print(f"  card PR #{pr['number']}: {pr['title'][:60]} [{'merged' if pr['merged'] else pr['state']}]")

    save_state(state)
    print(f"done -> {STATE}")


if __name__ == "__main__":
    main()
