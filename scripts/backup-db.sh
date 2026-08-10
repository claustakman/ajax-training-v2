#!/usr/bin/env bash
# backup-db.sh — eksportér Ajax Træning D1-database som JSON
# Kør fra projektets rodmappe: bash scripts/backup-db.sh

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="backups"
OUTPUT_FILE="$OUTPUT_DIR/backup_$TIMESTAMP.json"
WORKER_DIR="worker"
TMP_DIR=$(mktemp -d)

mkdir -p "$OUTPUT_DIR"

echo "🗄️  Henter data fra D1 (ajax-traening)..."

run_query() {
  local sql="$1"
  local out="$2"
  cd "$WORKER_DIR"
  npx wrangler d1 execute ajax-traening --remote --json --command "$sql" 2>&1 \
    | python3 -c "import sys,json; data=json.loads(sys.stdin.read()); print(json.dumps(data[0]['results'], ensure_ascii=False))" \
    > "$out"
  cd ..
}

echo "  → teams"
run_query "SELECT * FROM teams" "$TMP_DIR/teams.json"

echo "  → users (uden password_hash)"
run_query "SELECT id, name, email, role, last_seen, created_at FROM users" "$TMP_DIR/users.json"

echo "  → user_teams"
run_query "SELECT * FROM user_teams" "$TMP_DIR/user_teams.json"

echo "  → trainings"
run_query "SELECT * FROM trainings ORDER BY date DESC" "$TMP_DIR/trainings.json"

echo "  → exercises"
run_query "SELECT * FROM exercises ORDER BY name" "$TMP_DIR/exercises.json"

echo "  → quarters"
run_query "SELECT * FROM quarters" "$TMP_DIR/quarters.json"

echo "  → section_types"
run_query "SELECT * FROM section_types ORDER BY team_id, sort_order" "$TMP_DIR/section_types.json"

echo "  → templates"
run_query "SELECT * FROM templates ORDER BY created_at" "$TMP_DIR/templates.json"

echo "  → board_posts (ikke slettede)"
run_query "SELECT * FROM board_posts WHERE deleted = 0 ORDER BY created_at" "$TMP_DIR/board_posts.json"

echo "  → board_comments (ikke slettede)"
run_query "SELECT * FROM board_comments WHERE deleted = 0 ORDER BY created_at" "$TMP_DIR/board_comments.json"

echo "  → board_attachments"
run_query "SELECT * FROM board_attachments ORDER BY created_at" "$TMP_DIR/board_attachments.json"

python3 - "$OUTPUT_FILE" "$TIMESTAMP" "$TMP_DIR" <<'PYEOF'
import json, sys, os

output_file = sys.argv[1]
timestamp = sys.argv[2]
tmp_dir = sys.argv[3]

def load(name):
    with open(os.path.join(tmp_dir, name + ".json"), encoding="utf-8") as f:
        return json.load(f)

tables = {
    "teams":             load("teams"),
    "users":             load("users"),
    "user_teams":        load("user_teams"),
    "trainings":         load("trainings"),
    "exercises":         load("exercises"),
    "quarters":          load("quarters"),
    "section_types":     load("section_types"),
    "templates":         load("templates"),
    "board_posts":       load("board_posts"),
    "board_comments":    load("board_comments"),
    "board_attachments": load("board_attachments"),
}

data = {
    "exported_at": timestamp,
    "source": "ajax-traening D1 (Cloudflare)",
    "tables": tables,
}

with open(output_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

t = tables
print(f"\n✅ Backup gemt: {output_file}")
print(f"\n📊 Statistik:")
print(f"   Hold:          {len(t['teams'])}")
print(f"   Brugere:       {len(t['users'])}")
print(f"   Træninger:     {len(t['trainings'])}")
print(f"   Øvelser:       {len(t['exercises'])}")
print(f"   Skabeloner:    {len(t['templates'])}")
print(f"   Board-opslag:  {len(t['board_posts'])}")
print(f"   Kvartaler:     {len(t['quarters'])}")
size_kb = round(os.path.getsize(output_file) / 1024, 1)
print(f"\n   Filstørrelse:  {size_kb} KB")
PYEOF

rm -rf "$TMP_DIR"
