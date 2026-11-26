import os
import subprocess
import requests
import json
import time

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
DATABASE_ID = os.environ["NOTION_DATABASE_ID"]
REPO_NAME = os.environ["REPO_NAME"]
COMMITS_JSON = os.environ.get("COMMITS_JSON", "[]")
IS_BACKFILL = os.environ.get("IS_BACKFILL", "false").lower() == "true"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}

def get_branch():
    ref = os.environ.get("GITHUB_REF", "")
    return ref.replace("refs/heads/", "") if ref.startswith("refs/heads/") else ref

def get_commits():
    """Get commits: full history for backfill, event payload for normal pushes."""
    if IS_BACKFILL:
        print("Backfill mode: fetching full git history...")
        result = subprocess.run(
            ["git", "log", "--format=%H|%s|%an|%aI", "--reverse"],
            capture_output=True, text=True
        )
        commits = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            sha, message, author, date_str = line.split("|", 3)
            commits.append({"sha": sha[:7], "message": message, "author": author, "date": date_str})
        return commits

    # Normal push: use event payload (reliable, no git range issues)
    raw = json.loads(COMMITS_JSON)
    if not raw:
        print("No commits in event payload.")
        return []
    return [
        {
            "sha": c["id"][:7],
            "message": c["message"],
            "author": c["author"]["name"],
            "date": c["timestamp"],
        }
        for c in raw
    ]

def commit_exists_in_notion(sha):
    """Check if a commit SHA is already logged in Notion."""
    query_url = f"https://api.notion.com/v1/databases/{DATABASE_ID}/query"
    payload = {
        "filter": {
            "property": "Commit SHA",
            "rich_text": {"equals": sha}
        }
    }
    response = requests.post(query_url, headers=HEADERS, data=json.dumps(payload))
    if response.status_code != 200:
        print(f"⚠️ Failed to query Notion for {sha}: {response.text}")
        return False
    return len(response.json().get("results", [])) > 0

def log_commit(commit):
    if commit_exists_in_notion(commit["sha"]):
        print(f"⏭️ Skipping {commit['sha']} (already logged)")
        return

    payload = {
        "parent": {"database_id": DATABASE_ID},
        "properties": {
            "Commit Message": {
                "title": [{"text": {"content": commit["message"]}}]
            },
            "Repo Name": {
                "select": {"name": REPO_NAME}
            },
            "Commit SHA": {
                "rich_text": [{"text": {"content": commit["sha"]}}]
            },
            "Author": {
                "rich_text": [{"text": {"content": commit["author"]}}]
            },
            "Date": {
                "date": {"start": commit["date"]}
            },
            "Branch": {
                "rich_text": [{"text": {"content": get_branch()}}]
            },
        }
    }

    response = requests.post(
        "https://api.notion.com/v1/pages",
        headers=HEADERS,
        data=json.dumps(payload)
    )

    if response.status_code != 200:
        print(f"❌ Failed to log commit {commit['sha']}: {response.text}")
    else:
        print(f"✅ Logged: {commit['sha']} — {commit['message']}")

def log_commits_in_batches(commits, batch_size=10, delay=0.5):
    """Send commits to Notion in batches to avoid rate limits."""
    for i in range(0, len(commits), batch_size):
        batch = commits[i:i+batch_size]
        print(f"Processing batch {i//batch_size + 1} ({len(batch)} commits)...")
        for commit in batch:
            log_commit(commit)
        time.sleep(delay)

if __name__ == "__main__":
    commits = get_commits()
    print(f"Found {len(commits)} commit(s) to log.")
    log_commits_in_batches(commits)
