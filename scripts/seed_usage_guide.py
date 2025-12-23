import json
import os
import sys
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
    with urlopen(req) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw)


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


def get_primary_field(token, table_id):
    for item in get_fields(token, table_id):
        if item.get("is_primary"):
            return item.get("field_name")
    return None


def create_record(token, table_id, fields):
    resp = http_json(
        "POST",
        f"{api_base}/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records",
        {"fields": fields},
        token,
    )
    rec_id = resp.get("data", {}).get("record", {}).get("record_id")
    if not rec_id:
        print("Failed to create record", resp)
        sys.exit(1)
    return rec_id


TOKEN = get_tenant_token()
TABLES = get_tables(TOKEN)

table_id = TABLES.get("UsageGuide")
if not table_id:
    print("UsageGuide table not found")
    sys.exit(1)

primary_field = get_primary_field(TOKEN, table_id)

steps = [
    {
        "step": 1,
        "title": "初始化模板",
        "instruction": "运行 scripts/init_base.sh 创建 7+ 张表结构，并生成 generated/base_schema.json。",
    },
    {
        "step": 2,
        "title": "录入 OKR",
        "instruction": "在 Objectives 填写 O_Title/Owner/Cycle；在 KeyResults 创建 3-5 条 KR 并关联 Objective。",
    },
    {
        "step": 3,
        "title": "建立 Action Bank",
        "instruction": "在 Actions 为每个 KR 建 5-10 条可执行动作（30-90 分钟粒度）。",
    },
    {
        "step": 4,
        "title": "每日拉取 MIT",
        "instruction": "每天从 Action Bank 选 1-2 条最重要任务，状态改为 Today。",
    },
    {
        "step": 5,
        "title": "产出证据",
        "instruction": "完成 Action 后新增 Evidence，并关联 KR/Action。没有证据就不能算进度。",
    },
    {
        "step": 6,
        "title": "周计划与复盘",
        "instruction": "在 WeeklyPlan 记录本周交付/预算/风险；周末复盘补证据与结论。",
    },
    {
        "step": 7,
        "title": "偏航检测与纠偏",
        "instruction": "关注连续无 Evidence 天数、未关联 KR 的 Action 数量；触发后执行三步纠偏。",
    },
    {
        "step": 8,
        "title": "Parking Lot",
        "instruction": "新任务 >30 分钟且无法关联 KR 时放入 Ideas；探索要有预算和产出。",
    },
]

for item in steps:
    fields = {
        "Step_Number": item["step"],
        "Title": item["title"],
        "Instruction": item["instruction"],
    }
    if primary_field:
        fields[primary_field] = f"{item['step']}. {item['title']}"
    create_record(TOKEN, table_id, fields)

print("Usage guide data created.")
