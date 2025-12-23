import json
import os
import sys
from datetime import datetime
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


def get_records(token, table_id):
    resp = http_json(
        "GET",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records?page_size=500",
        None,
        token,
    )
    return resp.get("data", {}).get("items", [])


def update_record(token, table_id, record_id, fields):
    resp = http_json(
        "PUT",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}",
        {"fields": fields},
        token,
    )
    if resp.get("code") not in (0, None):
        print(f"Failed to update record {record_id}: {resp}")
        return False
    return True


def to_ms(date_str):
    return int(datetime.strptime(date_str, "%Y-%m-%d").timestamp() * 1000)


TOKEN = get_tenant_token()
TABLES = get_tables(TOKEN)

# Update KR due date
kr_table = TABLES.get("KeyResults")
if not kr_table:
    print("KeyResults table not found")
    sys.exit(1)

kr_due = to_ms("2026-01-31")
kr_records = get_records(TOKEN, kr_table)
for rec in kr_records:
    fields = rec.get("fields", {})
    if "KR_Title" not in fields:
        continue
    update_record(TOKEN, kr_table, rec.get("record_id"), {"Due_Date": kr_due})

# Update Action plan dates
action_table = TABLES.get("Actions")
if not action_table:
    print("Actions table not found")
    sys.exit(1)

plan_map = {
    "补充对照实验统计，产出价值验证结论": ("2026-01-05", 4),
    "汇总消费价值结论，沉淀 1 页结论 memo": ("2026-01-16", 4),
    "做漏斗分阶段转化对比分析": ("2026-01-12", 4),
    "梳理提效空间与算法策略建议": ("2026-01-22", 4),
    "验证搜索对供给撬动的边界条件": ("2026-01-19", 4),
    "形成冷启动链路方案初稿": ("2026-01-29", 4),
}

records = get_records(TOKEN, action_table)
for rec in records:
    fields = rec.get("fields", {})
    title = fields.get("Action_Title")
    if not title or title not in plan_map:
        continue
    date_str, hours = plan_map[title]
    update_record(
        TOKEN,
        action_table,
        rec.get("record_id"),
        {
            "Plan_Date": to_ms(date_str),
            "Plan_Hours": hours,
        },
    )

print("Plan dates seeded.")
