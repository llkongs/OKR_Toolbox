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

FIELDS_TO_ADD = [
    {"field_name": "Objective_Title", "type": 1},
    {"field_name": "KR_Title", "type": 1},
    {"field_name": "KR_Type", "type": 3, "property": {"options": [{"name": "Metric"}, {"name": "Milestone"}, {"name": "Deliverable"}]}},
    {"field_name": "KR_Target", "type": 1},
    {"field_name": "KR_Progress", "type": 2},
    {"field_name": "KR_Confidence", "type": 2},
    {"field_name": "KR_Due_Date", "type": 5},
    {"field_name": "KR_Risk", "type": 3, "property": {"options": [{"name": "Green"}, {"name": "Yellow"}, {"name": "Red"}]}},
    {"field_name": "Action_Title", "type": 1},
    {"field_name": "Action_Status", "type": 3, "property": {"options": [{"name": "Backlog"}, {"name": "Today"}, {"name": "Doing"}, {"name": "Done"}, {"name": "Blocked"}]}},
    {"field_name": "Action_Est_Minutes", "type": 2},
    {"field_name": "Action_Due", "type": 5},
    {"field_name": "Action_Plan_Start", "type": 5},
    {"field_name": "Action_Plan_End", "type": 5},
    {"field_name": "Action_Guardrail_Flag", "type": 7},
    {"field_name": "Action_Risk_Tags", "type": 1},
    {"field_name": "Action_Drift_Flag", "type": 7},
]


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

existing = {f.get("field_name") for f in get_fields(TOKEN, table_id)}
for field in FIELDS_TO_ADD:
    if field["field_name"] in existing:
        continue
    print(f"Creating OKRPlan.{field['field_name']}")
    create_field(TOKEN, table_id, field)

print("OKRPlan fields ensured.")
