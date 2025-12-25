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

FIELDS_TO_DELETE = {
    "Actions": ["Plan_Date", "Plan_Hours", "Plan_Week", "Plan"],
    "FocusBlocks": ["Plan"],
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


def delete_field(token, table_id, field_id):
    resp = http_json(
        "DELETE",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields/{field_id}",
        None,
        token,
    )
    if resp.get("code") not in (0, None):
        print(f"Failed to delete field {field_id}: {resp}")
        return False
    return True


TOKEN = get_tenant_token()
tables = get_tables(TOKEN)

for table_name, field_names in FIELDS_TO_DELETE.items():
    table_id = tables.get(table_name)
    if not table_id:
        print(f"Table not found: {table_name}")
        continue
    fields = get_fields(TOKEN, table_id)
    name_to_id = {f.get("field_name"): f.get("field_id") for f in fields}
    for field_name in field_names:
        field_id = name_to_id.get(field_name)
        if not field_id:
            print(f"Field not found: {table_name}.{field_name}")
            continue
        print(f"Deleting field: {table_name}.{field_name} ({field_id})")
        delete_field(TOKEN, table_id, field_id)

print("Field cleanup done.")
