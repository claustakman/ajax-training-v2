#!/usr/bin/env python3
"""
backup-db.py — eksportér Ajax Træning D1-database som JSON
Kør fra projektets rodmappe: python3 scripts/backup-db.py
"""

import subprocess, json, sys, os
from datetime import datetime

WORKER_DIR = os.path.join(os.path.dirname(__file__), '..', 'worker')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'backups')

TABLES = [
    ("teams",            "SELECT * FROM teams"),
    ("users",            "SELECT id, name, email, role, last_seen, created_at FROM users"),
    ("user_teams",       "SELECT * FROM user_teams"),
    ("trainings",        "SELECT * FROM trainings ORDER BY date DESC"),
    ("exercises",        "SELECT * FROM exercises ORDER BY name"),
    ("quarters",         "SELECT * FROM quarters"),
    ("section_types",    "SELECT * FROM section_types ORDER BY team_id, sort_order"),
    ("templates",        "SELECT * FROM templates ORDER BY created_at"),
    ("board_posts",      "SELECT * FROM board_posts WHERE deleted = 0 ORDER BY created_at"),
    ("board_comments",   "SELECT * FROM board_comments WHERE deleted = 0 ORDER BY created_at"),
    ("board_attachments","SELECT * FROM board_attachments ORDER BY created_at"),
]

def run_query(sql):
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "ajax-traening",
         "--remote", "--json", "--command", sql],
        capture_output=True, text=True, cwd=WORKER_DIR
    )
    if result.returncode != 0:
        print(f"  ⚠️  wrangler fejl: {result.stderr[:200]}", file=sys.stderr)
        return []
    data = json.loads(result.stdout)
    return data[0]["results"]

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = os.path.join(OUTPUT_DIR, f"backup_{timestamp}.json")

    print("🗄️  Henter data fra D1 (ajax-traening)...")
    tables = {}
    for name, sql in TABLES:
        print(f"  → {name}")
        tables[name] = run_query(sql)

    data = {
        "exported_at": timestamp,
        "source": "ajax-traening D1 (Cloudflare)",
        "tables": tables,
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    t = tables
    size_kb = round(os.path.getsize(output_file) / 1024, 1)
    print(f"\n✅ Backup gemt: {output_file}")
    print(f"\n📊 Statistik:")
    print(f"   Hold:          {len(t['teams'])}")
    print(f"   Brugere:       {len(t['users'])}")
    print(f"   Træninger:     {len(t['trainings'])}")
    print(f"   Øvelser:       {len(t['exercises'])}")
    print(f"   Skabeloner:    {len(t['templates'])}")
    print(f"   Board-opslag:  {len(t['board_posts'])}")
    print(f"   Kvartaler:     {len(t['quarters'])}")
    print(f"\n   Filstørrelse:  {size_kb} KB")

if __name__ == "__main__":
    main()
