import json
import os
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

api_base = os.environ.get("FEISHU_API_BASE", "https://open.feishu.cn")
app_id = os.environ.get("FEISHU_APP_ID")
app_secret = os.environ.get("FEISHU_APP_SECRET")
app_token = os.environ.get("FEISHU_BASE_APP_TOKEN")

if not (app_id and app_secret and app_token):
    print("Missing env vars: FEISHU_APP_ID/FEISHU_APP_SECRET/FEISHU_BASE_APP_TOKEN")
    sys.exit(1)


def http_json(method, url, data=None, token=None):
    body = None
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        body = json.dumps(data).encode("utf-8")
    req = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except HTTPError as exc:
        body = exc.read().decode("utf-8")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc


def get_tenant_token():
    resp = http_json(
        "POST",
        f"{api_base}/open-apis/auth/v3/tenant_access_token/internal",
        {"app_id": app_id, "app_secret": app_secret},
    )
    token = resp.get("tenant_access_token")
    if not token:
        print("Failed to get tenant access token", resp)
        sys.exit(1)
    return token


def get_tables(token):
    resp = http_json(
        "GET",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables?page_size=100",
        None,
        token,
    )
    items = resp.get("data", {}).get("items", [])
    return {item.get("name"): item.get("table_id") for item in items}


def get_fields(token, table_id):
    resp = http_json(
        "GET",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields?page_size=200",
        None,
        token,
    )
    return resp.get("data", {}).get("items", [])


def create_field(token, table_id, field_config):
    resp = http_json(
        "POST",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields",
        field_config,
        token,
    )
    if resp.get("code") not in (0, None):
        print(f"Failed to create field {field_config['field_name']}: {resp}")
        return False
    return True


TOKEN = get_tenant_token()
tables = get_tables(TOKEN)
table_id = tables.get("OKRPlan")
if not table_id:
    print("OKRPlan table not found")
    sys.exit(1)

fields = get_fields(TOKEN, table_id)
existing = {f.get("field_name"): f for f in fields}
if "Score" in existing:
    if existing["Score"].get("type") == 20:
        print("Score formula field already exists.")
        sys.exit(0)
    print("Score field exists but is not formula. Please delete it in the table UI first, then rerun this script.")
    sys.exit(0)

plan_start = existing.get("预期开始")
plan_end = existing.get("预期结束")
progress = existing.get("Action Progress")
if not (plan_start and plan_end and progress):
    print("Missing required fields: 预期开始/预期结束/Action Progress")
    sys.exit(1)

plan_start_ref = f"bitable::$table[{table_id}].$field[{plan_start.get('field_id')}]"
plan_end_ref = f"bitable::$table[{table_id}].$field[{plan_end.get('field_id')}]"
progress_ref = f"bitable::$table[{table_id}].$field[{progress.get('field_id')}]"

progress_ratio = f"IF({progress_ref}>1, {progress_ref}/100, {progress_ref})"
duration_days = f"DATE_DIFF({plan_end_ref}, {plan_start_ref}, \"days\")"
elapsed_days = f"DATE_DIFF(NOW(), {plan_start_ref}, \"days\")"
time_progress = f"IF({duration_days}=0, 1, MIN(1, MAX(0, {elapsed_days}/{duration_days})))"

formula_expression = (
    f"IF(AND({plan_start_ref}<>\"\", {plan_end_ref}<>\"\"), "
    f"MAX(0, ROUND(100*(1+({progress_ratio}-{time_progress}))))"
    f", \"\")"
)

field_config = {
    "field_name": "Score",
    "type": 20,
    "property": {"formula_expression": formula_expression},
}

if create_field(TOKEN, table_id, field_config):
    print("Score formula field created.")
    sys.exit(0)

print("Failed to create Score formula field.")
print("Please create it manually with formula_expression:")
print(formula_expression)
