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

FIELDS_TO_ADD = {
    "KeyResults": [
        {"field_name": "Due_Date", "type": 5},
    ],
    "Actions": [
        {"field_name": "Plan_Start", "type": 5},
        {"field_name": "Plan_End", "type": 5},
    ],
}


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
TABLES = get_tables(TOKEN)

for table_name, fields in FIELDS_TO_ADD.items():
    table_id = TABLES.get(table_name)
    if not table_id:
        print(f"Table not found: {table_name}")
        continue
    existing = {f.get("field_name") for f in get_fields(TOKEN, table_id)}
    for field in fields:
        if field["field_name"] in existing:
            continue
        print(f"Creating {table_name}.{field['field_name']}")
        create_field(TOKEN, table_id, field)

print("Planning fields ensured.")
