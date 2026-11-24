#!/usr/bin/env python3
"""Export the bigfotolab GitHub roadmap (issues, milestones, PRs) to roadmap.json.

Run on any machine with network access to api.github.com:

    GITHUB_TOKEN=ghp_... python3 export_github_roadmap.py

Env:
    GITHUB_TOKEN   token with repo read scope (or use `gh auth token` fallback)
    GITHUB_REPO    default emmanuel-a-otchere/bigfotolab
    OUT            default ./roadmap.json
"""
import json
import os
import subprocess
import sys
import urllib.request

REPO = os.environ.get("GITHUB_REPO", "emmanuel-a-otchere/bigfotolab")
OUT = os.environ.get("OUT", os.path.join(os.path.dirname(__file__), "roadmap.json"))


def api(path: str):
    # Prefer the authenticated gh CLI (works wherever `gh auth login` was done);
    # fall back to GITHUB_TOKEN + raw REST for machines without gh.
    try:
        out = subprocess.run(
            ["gh", "api", f"repos/{REPO}/{path}"], capture_output=True, text=True, check=True
        ).stdout
        return json.loads(out)
    except Exception:
        token = os.environ.get("GITHUB_TOKEN")
        if not token:
            sys.exit("Set GITHUB_TOKEN or run `gh auth login` first.")
        req = urllib.request.Request(
            f"https://api.github.com/repos/{REPO}/{path}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                     "User-Agent": "bigfotolab-kanban-sync"},
        )
        with urllib.request.urlopen(req) as r:
            return json.load(r)


def main():
    issues = api("issues?state=all&per_page=100")
    milestones = api("milestones?state=all&per_page=100")
    pulls = api("pulls?state=all&per_page=100")
    data = {
        "repo": REPO,
        "exported_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "milestones": [
            {"number": m["number"], "title": m["title"], "state": m["state"],
             "description": m.get("description") or "", "open_issues": m["open_issues"]}
            for m in milestones
        ],
        "issues": [
            {"number": i["number"], "title": i["title"], "state": i["state"], "url": i["html_url"],
             "body": i.get("body") or "",
             "labels": [l["name"] for l in i.get("labels", [])],
             "milestone": (i["milestone"] or {}).get("title")}
            for i in issues if "pull_request" not in i
        ],
        "pulls": [
            {"number": p["number"], "title": p["title"], "state": p["state"], "url": p["html_url"],
             "merged": bool(p.get("merged_at")), "labels": [l["name"] for l in p.get("labels", [])]}
            for p in pulls
        ],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"wrote {OUT}: {len(data['issues'])} issues, {len(data['milestones'])} milestones, {len(data['pulls'])} PRs")


if __name__ == "__main__":
    main()
