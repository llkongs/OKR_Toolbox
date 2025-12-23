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

DESIRED_TYPES = {
    "Objectives": {
        "Owner": 11,
    },
    "KeyResults": {
        "Progress": 99002,
        "Confidence": 99004,
    },
    "Evidence": {
        "Link": 15,
    },
    "UsageGuide": {
        "Link": 15,
    },
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


def update_field(token, table_id, field_id, field_name, field_type):
    payload = {"field_name": field_name, "type": field_type}
    try:
        resp = http_json(
            "PATCH",
            f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields/{field_id}",
            payload,
            token,
        )
    except RuntimeError as exc:
        print(f"- Update not supported for {field_name}: {exc}")
        return False
    if resp.get("code") not in (0, None):
        print(f"- Failed to update {field_name}: {resp}")
        return False
    return True


TOKEN = get_tenant_token()
TABLES = get_tables(TOKEN)

for table_name, fields in DESIRED_TYPES.items():
    table_id = TABLES.get(table_name)
    if not table_id:
        print(f"Table not found: {table_name}")
        continue
    existing = {f.get("field_name"): f for f in get_fields(TOKEN, table_id)}
    for field_name, desired_type in fields.items():
        meta = existing.get(field_name)
        if not meta:
            print(f"- Field missing: {table_name}.{field_name}")
            continue
        current_type = meta.get("type")
        if current_type == desired_type:
            continue
        print(f"Updating {table_name}.{field_name}: {current_type} -> {desired_type}")
        update_field(TOKEN, table_id, meta.get("field_id"), field_name, desired_type)

print("Field type normalization done.")
