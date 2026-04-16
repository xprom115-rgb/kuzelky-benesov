import json
from datetime import datetime, timezone
from pathlib import Path

BASE = Path("data/teams")
BASE.mkdir(parents=True, exist_ok=True)

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

now = datetime.now(timezone.utc).isoformat(timespec="seconds")

for name in ["A", "B", "C", "DOROST"]:
    path = BASE / f"{name}.json"
    if not path.exists():
        print(f"SKIP: {path} neexistuje")
        continue

    data = load_json(path)
    data["updatedAt"] = now
    save_json(path, data)
    print(f"OK: updatedAt updated for {path}")

print("DONE")
