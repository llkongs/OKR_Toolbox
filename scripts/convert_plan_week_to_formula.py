import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

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
    try:
        resp = http_json(
            "POST",
            f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields",
            field_config,
            token,
        )
        return resp
    except RuntimeError as exc:
        return {"code": -1, "msg": str(exc)}


def update_field(token, table_id, field_id, field_config):
    resp = http_json(
        "PATCH",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields/{field_id}",
        field_config,
        token,
    )
    return resp


TOKEN = get_tenant_token()
TABLES = get_tables(TOKEN)

actions_table = TABLES.get("Actions")
if not actions_table:
    print("Actions table not found")
    sys.exit(1)

fields = get_fields(TOKEN, actions_table)
plan_week = next((f for f in fields if f.get("field_name") == "Plan_Week"), None)
plan_end = next((f for f in fields if f.get("field_name") == "Plan_End"), None)
plan_start = next((f for f in fields if f.get("field_name") == "Plan_Start"), None)
plan_date = next((f for f in fields if f.get("field_name") == "Plan_Date"), None)
source_field = plan_end or plan_start or plan_date
if not source_field:
    print("Plan_End/Plan_Start/Plan_Date field not found; cannot build Plan_Week formula.")
    sys.exit(1)

plan_date_ref = f"bitable::$table[{actions_table}].$field[{source_field.get('field_id')}]"
formula_expression = (
    "IF(LEN(WEEKNUM({PLAN_DATE_REF},2))=1, "
    "CONCATENATE(\"第0\", WEEKNUM({PLAN_DATE_REF},2), \"周\"), "
    "CONCATENATE(\"第\", WEEKNUM({PLAN_DATE_REF},2), \"周\"))"
).replace("{PLAN_DATE_REF}", plan_date_ref)

formula_config = {
    "field_name": "Plan_Week",
    "type": 20,
    "property": {"formula_expression": formula_expression},
}

if plan_week and plan_week.get("type") == 20:
    print("Plan_Week already formula.")
    sys.exit(0)

if plan_week:
    print("Plan_Week exists but is not formula. Please delete it in the table UI first, then rerun this script.")
    sys.exit(0)

resp = create_field(TOKEN, actions_table, formula_config)
if resp.get("code") in (0, None):
    print("Created Plan_Week formula field.")
else:
    print(f"Failed to create Plan_Week formula field: {resp}")
    print("Please create it manually with formula_expression: " + formula_expression)
