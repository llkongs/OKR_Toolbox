#!/usr/bin/env bash
set -euo pipefail

APP_ID="${FEISHU_APP_ID:-}"
APP_SECRET="${FEISHU_APP_SECRET:-}"
APP_TOKEN="${FEISHU_BASE_APP_TOKEN:-}"
API_BASE="${FEISHU_API_BASE:-https://open.feishu.cn}"

if [[ -z "$APP_ID" || -z "$APP_SECRET" || -z "$APP_TOKEN" ]]; then
  echo "Missing env vars. Please set FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_BASE_APP_TOKEN." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/generated/base_schema.json"
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python not found. Please install python3 or ensure python is on PATH." >&2
  exit 1
fi

mkdir -p "$(dirname "$SCHEMA_FILE")"

init_schema_file() {
  "$PYTHON_BIN" - <<PY
import json
schema = {
  "app_token": "${APP_TOKEN}",
  "tables": {}
}
with open("${SCHEMA_FILE}", "w", encoding="utf-8") as f:
  json.dump(schema, f, ensure_ascii=False, indent=2)
PY
}

update_table_id() {
  local table_name="$1"
  local table_id="$2"
  "$PYTHON_BIN" - "$table_name" "$table_id" <<PY
import json
import sys
table_name = sys.argv[1]
table_id = sys.argv[2]
path = "${SCHEMA_FILE}"
with open(path, "r", encoding="utf-8") as f:
  data = json.load(f)
if "tables" not in data:
  data["tables"] = {}
if table_name not in data["tables"]:
  data["tables"][table_name] = {"table_id": table_id, "fields": {}}
else:
  data["tables"][table_name]["table_id"] = table_id
with open(path, "w", encoding="utf-8") as f:
  json.dump(data, f, ensure_ascii=False, indent=2)
PY
}

update_field_id() {
  local table_name="$1"
  local field_name="$2"
  local field_id="$3"
  "$PYTHON_BIN" - "$table_name" "$field_name" "$field_id" <<PY
import json
import sys
table_name = sys.argv[1]
field_name = sys.argv[2]
field_id = sys.argv[3]
path = "${SCHEMA_FILE}"
with open(path, "r", encoding="utf-8") as f:
  data = json.load(f)
if "tables" not in data:
  data["tables"] = {}
if table_name not in data["tables"]:
  data["tables"][table_name] = {"table_id": "", "fields": {}}
if "fields" not in data["tables"][table_name]:
  data["tables"][table_name]["fields"] = {}
if field_name:
  data["tables"][table_name]["fields"][field_name] = field_id
with open(path, "w", encoding="utf-8") as f:
  json.dump(data, f, ensure_ascii=False, indent=2)
PY
}

api_post() {
  local url="$1"
  local json="$2"
  curl -sS -X POST "${url}" \
    -H "Authorization: Bearer ${TENANT_ACCESS_TOKEN}" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d "${json}"
}

api_get() {
  local url="$1"
  curl -sS "${url}" \
    -H "Authorization: Bearer ${TENANT_ACCESS_TOKEN}" \
    -H "Content-Type: application/json; charset=utf-8"
}

get_json_value() {
  local key="$1"
  "$PYTHON_BIN" -c $'import json,sys\nkey=sys.argv[1]\nraw=sys.stdin.read()\ntry:\n    data=json.loads(raw)\nexcept Exception:\n    sys.exit(0)\nval=data.get(key, \"\")\nprint(\"\" if val is None else val)\n' "$key"
}

get_table_id_by_name() {
  local json="$1"
  local name="$2"
  "$PYTHON_BIN" - <<PY
import json
name = "${name}"
data = json.loads("""${json}""")
items = data.get("data", {}).get("items", [])
for item in items:
  if item.get("name") == name:
    print(item.get("table_id", ""))
    raise SystemExit(0)
print("")
PY
}

get_field_id_by_name() {
  local json="$1"
  local name="$2"
  "$PYTHON_BIN" - <<PY
import json
name = "${name}"
data = json.loads("""${json}""")
items = data.get("data", {}).get("items", [])
for item in items:
  if item.get("field_name") == name:
    print(item.get("field_id", ""))
    raise SystemExit(0)
print("")
PY
}

create_table() {
  local name="$1"
  local body
  body=$("$PYTHON_BIN" - <<PY
import json
print(json.dumps({"table": {"name": "${name}"}}))
PY
)
  api_post "${API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables" "${body}"
}

create_field() {
  local table_id="$1"
  local field_json="$2"
  api_post "${API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${table_id}/fields" "${field_json}"
}

init_schema_file

echo "Requesting tenant access token..."
TOKEN_JSON=$(curl -sS -X POST "${API_BASE}/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"app_id\":\"${APP_ID}\",\"app_secret\":\"${APP_SECRET}\"}")

if [[ -z "$TOKEN_JSON" ]]; then
  echo "Failed to get tenant access token: empty response from ${API_BASE}." >&2
  exit 1
fi

TENANT_ACCESS_TOKEN=$(printf '%s' "$TOKEN_JSON" | get_json_value tenant_access_token)
if [[ -z "$TENANT_ACCESS_TOKEN" ]]; then
  echo "Failed to get tenant access token. Response:" >&2
  echo "$TOKEN_JSON" >&2
  exit 1
fi

TABLE_NAMES=(
  "Objectives"
  "KeyResults"
  "Actions"
  "Evidence"
  "WeeklyPlan"
  "Ideas"
  "TimeLog"
  "UsageGuide"
)

echo "Fetching existing tables..."
TABLES_JSON=$(api_get "${API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables?page_size=100")

for table_name in "${TABLE_NAMES[@]}"; do
  table_id=$(get_table_id_by_name "$TABLES_JSON" "$table_name")
  if [[ -z "$table_id" ]]; then
    echo "Creating table: ${table_name}"
    response=$(create_table "$table_name")
    table_id=$(printf '%s' "$response" | "$PYTHON_BIN" -c 'import sys,json; data=json.load(sys.stdin); print(data.get("data", {}).get("table_id", ""))')
    if [[ -z "$table_id" ]]; then
      echo "Failed to create table ${table_name}. Response:" >&2
      echo "$response" >&2
      exit 1
    fi
  else
    echo "Found table: ${table_name} (${table_id})"
  fi
  update_table_id "$table_name" "$table_id"

  if [[ "$table_name" == "Objectives" ]]; then
    fields=(
      '{"field_name":"O_Title","type":1}'
      '{"field_name":"Owner","type":11}'
      '{"field_name":"Cycle","type":1}'
    )
  elif [[ "$table_name" == "KeyResults" ]]; then
    fields=(
      '{"field_name":"KR_Title","type":1}'
      '{"field_name":"KR_Type","type":3,"property":{"options":[{"name":"Metric"},{"name":"Milestone"},{"name":"Deliverable"}]}}'
      '{"field_name":"Target","type":1}'
      '{"field_name":"Progress","type":99002}'
      '{"field_name":"Confidence","type":99004}'
      '{"field_name":"Due_Date","type":5}'
    )
  elif [[ "$table_name" == "Actions" ]]; then
    fields=(
      '{"field_name":"Action_Title","type":1}'
      '{"field_name":"Status","type":3,"property":{"options":[{"name":"Backlog"},{"name":"Today"},{"name":"Doing"},{"name":"Done"},{"name":"Blocked"}]}}'
      '{"field_name":"Est_Minutes","type":2}'
      '{"field_name":"Due","type":5}'
      '{"field_name":"Plan_Date","type":5}'
      '{"field_name":"Plan_Hours","type":2}'
      '{"field_name":"Guardrail_Flag","type":7}'
    )
  elif [[ "$table_name" == "Evidence" ]]; then
    fields=(
      '{"field_name":"Evidence_Title","type":1}'
      '{"field_name":"Evidence_Type","type":3,"property":{"options":[{"name":"Doc"},{"name":"Dashboard"},{"name":"PR"},{"name":"SQL"},{"name":"Experiment"},{"name":"Note"}]}}'
      '{"field_name":"Link","type":15}'
      '{"field_name":"Date","type":5}'
    )
  elif [[ "$table_name" == "WeeklyPlan" ]]; then
    fields=(
      '{"field_name":"Week_Start","type":5}'
      '{"field_name":"Deliverable","type":1}'
      '{"field_name":"Risk","type":1}'
      '{"field_name":"Time_Budget_Min","type":2}'
    )
  elif [[ "$table_name" == "Ideas" ]]; then
    fields=(
      '{"field_name":"Idea_Title","type":1}'
      '{"field_name":"Est_Minutes","type":2}'
      '{"field_name":"Status","type":3,"property":{"options":[{"name":"Parking"},{"name":"Approved"},{"name":"Doing"},{"name":"Dropped"}]}}'
      '{"field_name":"Notes","type":1}'
    )
  elif [[ "$table_name" == "TimeLog" ]]; then
    fields=(
      '{"field_name":"Start","type":5}'
      '{"field_name":"Minutes","type":2}'
      '{"field_name":"Note","type":1}'
    )
  elif [[ "$table_name" == "UsageGuide" ]]; then
    fields=(
      '{"field_name":"Step_Number","type":2}'
      '{"field_name":"Title","type":1}'
      '{"field_name":"Instruction","type":1}'
      '{"field_name":"Link","type":15}'
    )
  else
    fields=()
  fi

  for field_json in "${fields[@]}"; do
    response=$(create_field "$table_id" "$field_json")
    field_id=$(printf '%s' "$response" | "$PYTHON_BIN" -c 'import sys,json; data=json.load(sys.stdin); print(data.get("data", {}).get("field", {}).get("field_id", ""))')
    field_name=$(printf '%s' "$field_json" | "$PYTHON_BIN" -c 'import sys,json; data=json.load(sys.stdin); print(data.get("field_name", ""))')
    if [[ -z "$field_id" ]]; then
      fields_json=$(api_get "${API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${table_id}/fields?page_size=100")
      field_id=$(get_field_id_by_name "$fields_json" "$field_name")
    fi
    if [[ -z "$field_id" ]]; then
      echo "Failed to create field ${field_name} in ${table_name}. Response:" >&2
      echo "$response" >&2
      exit 1
    fi
    update_field_id "$table_name" "$field_name" "$field_id"
  done

  if [[ "$table_name" == "Actions" ]]; then
    fields_json=$(api_get "${API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${table_id}/fields?page_size=200")
    plan_week_id=$(get_field_id_by_name "$fields_json" "Plan_Week")
    if [[ -z "$plan_week_id" ]]; then
      plan_date_id=$(get_field_id_by_name "$fields_json" "Plan_Date")
      if [[ -n "$plan_date_id" ]]; then
        formula_expression="IF(LEN(WEEKNUM(bitable::\\$table[${table_id}].\\$field[${plan_date_id}],2))=1, CONCATENATE(\\\"第0\\\", WEEKNUM(bitable::\\$table[${table_id}].\\$field[${plan_date_id}],2), \\\"周\\\"), CONCATENATE(\\\"第\\\", WEEKNUM(bitable::\\$table[${table_id}].\\$field[${plan_date_id}],2), \\\"周\\\"))"
        field_json=$(printf '{"field_name":"Plan_Week","type":20,"property":{"formula_expression":"%s"}}' "$formula_expression")
        response=$(create_field "$table_id" "$field_json")
        field_id=$(printf '%s' "$response" | "$PYTHON_BIN" -c 'import sys,json; data=json.load(sys.stdin); print(data.get("data", {}).get("field", {}).get("field_id", ""))')
        if [[ -z "$field_id" ]]; then
          echo "Failed to create Plan_Week formula field in Actions. Response:" >&2
          echo "$response" >&2
          exit 1
        fi
        update_field_id "$table_name" "Plan_Week" "$field_id"
      fi
    fi
  fi

done

# Create link fields after tables exist
OBJECTIVES_ID=$("$PYTHON_BIN" -c 'import json; data=json.load(open("'"${SCHEMA_FILE}"'")); print(data["tables"]["Objectives"]["table_id"])')
KEYRESULTS_ID=$("$PYTHON_BIN" -c 'import json; data=json.load(open("'"${SCHEMA_FILE}"'")); print(data["tables"]["KeyResults"]["table_id"])')
ACTIONS_ID=$("$PYTHON_BIN" -c 'import json; data=json.load(open("'"${SCHEMA_FILE}"'")); print(data["tables"]["Actions"]["table_id"])')
EVIDENCE_ID=$("$PYTHON_BIN" -c 'import json; data=json.load(open("'"${SCHEMA_FILE}"'")); print(data["tables"]["Evidence"]["table_id"])')
WEEKLY_ID=$("$PYTHON_BIN" -c 'import json; data=json.load(open("'"${SCHEMA_FILE}"'")); print(data["tables"]["WeeklyPlan"]["table_id"])')
IDEAS_ID=$("$PYTHON_BIN" -c 'import json; data=json.load(open("'"${SCHEMA_FILE}"'")); print(data["tables"]["Ideas"]["table_id"])')
TIMELOG_ID=$("$PYTHON_BIN" -c 'import json; data=json.load(open("'"${SCHEMA_FILE}"'")); print(data["tables"]["TimeLog"]["table_id"])')

link_fields=(
  "${KEYRESULTS_ID}|Objective|{\"field_name\":\"Objective\",\"type\":18,\"property\":{\"table_id\":\"${OBJECTIVES_ID}\",\"multiple\":false}}"
  "${ACTIONS_ID}|KeyResult|{\"field_name\":\"KeyResult\",\"type\":18,\"property\":{\"table_id\":\"${KEYRESULTS_ID}\",\"multiple\":false}}"
  "${EVIDENCE_ID}|KeyResult|{\"field_name\":\"KeyResult\",\"type\":18,\"property\":{\"table_id\":\"${KEYRESULTS_ID}\",\"multiple\":false}}"
  "${EVIDENCE_ID}|Action|{\"field_name\":\"Action\",\"type\":18,\"property\":{\"table_id\":\"${ACTIONS_ID}\",\"multiple\":false}}"
  "${WEEKLY_ID}|KeyResults|{\"field_name\":\"KeyResults\",\"type\":18,\"property\":{\"table_id\":\"${KEYRESULTS_ID}\",\"multiple\":true}}"
  "${IDEAS_ID}|KeyResults|{\"field_name\":\"KeyResults\",\"type\":18,\"property\":{\"table_id\":\"${KEYRESULTS_ID}\",\"multiple\":true}}"
  "${TIMELOG_ID}|Action|{\"field_name\":\"Action\",\"type\":18,\"property\":{\"table_id\":\"${ACTIONS_ID}\",\"multiple\":false}}"
)

echo "Creating link fields..."
for entry in "${link_fields[@]}"; do
  IFS='|' read -r table_id field_name field_json <<< "$entry"
  response=$(create_field "$table_id" "$field_json")
  field_id=$(printf '%s' "$response" | "$PYTHON_BIN" -c 'import sys,json; data=json.load(sys.stdin); print(data.get("data", {}).get("field", {}).get("field_id", ""))')
  if [[ -z "$field_id" ]]; then
    fields_json=$(api_get "${API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${table_id}/fields?page_size=200")
    field_id=$(get_field_id_by_name "$fields_json" "$field_name")
  fi
  if [[ -z "$field_id" ]]; then
    echo "Failed to create link field ${field_name}. Response:" >&2
    echo "$response" >&2
    exit 1
  fi
  table_name=$("$PYTHON_BIN" - <<PY
import json
path = "${SCHEMA_FILE}"
with open(path, "r", encoding="utf-8") as f:
  data = json.load(f)
for name, meta in data.get("tables", {}).items():
  if meta.get("table_id") == "${table_id}":
    print(name)
    break
PY
)
  update_field_id "$table_name" "$field_name" "$field_id"

done

echo "Schema saved to ${SCHEMA_FILE}"
cat "${SCHEMA_FILE}"
