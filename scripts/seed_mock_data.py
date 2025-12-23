import json
import os
import sys
import time
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


def get_field_meta(token, table_id):
    items = get_fields(token, table_id)
    name_to_options = {}
    primary_field_name = None
    for item in items:
        if item.get("is_primary"):
            primary_field_name = item.get("field_name")
        prop = item.get("property") or {}
        options = prop.get("options") if isinstance(prop, dict) else None
        if options:
            name_to_options[item.get("field_name")] = {opt.get("name"): opt.get("id") for opt in options}
    return name_to_options, primary_field_name


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


def now_ms():
    return int(time.time() * 1000)


def set_select(payload, field_name, option_name, options_map):
    if field_name in options_map and option_name in options_map[field_name]:
        payload[field_name] = option_name


# Main
TOKEN = get_tenant_token()
TABLES = get_tables(TOKEN)

# Objectives
obj_table = TABLES.get("Objectives")
if not obj_table:
    print("Objectives table not found")
    sys.exit(1)
obj_options, obj_primary = get_field_meta(TOKEN, obj_table)
objective_title = "O1 - 优质UGC搜索价值验证"
obj_payload = {}
if obj_primary:
    obj_payload[obj_primary] = objective_title
obj_payload["O_Title"] = objective_title
obj_payload["Cycle"] = "2025 Q1"
objective_id = create_record(TOKEN, obj_table, obj_payload)

# KeyResults
kr_table = TABLES.get("KeyResults")
kr_options, kr_primary = get_field_meta(TOKEN, kr_table)
kr_list = [
    {"title": "完成优质UGC价值验证结论", "type": "Milestone", "progress": 30, "confidence_rating": 3},
    {"title": "完成漏斗效率分析并明确提效空间", "type": "Deliverable", "progress": 20, "confidence_rating": 3},
    {"title": "验证搜索对优质UGC供给的撬动上限", "type": "Milestone", "progress": 10, "confidence_rating": 2},
]
kr_ids = []
for kr in kr_list:
    payload = {}
    if kr_primary:
        payload[kr_primary] = kr["title"]
    payload["KR_Title"] = kr["title"]
    payload["Target"] = ""
    payload["Progress"] = kr["progress"]
    set_select(payload, "KR_Type", kr["type"], kr_options)
    payload["Confidence"] = kr["confidence_rating"]
    payload["Objective"] = [objective_id]
    kr_ids.append(create_record(TOKEN, kr_table, payload))

# Actions
action_table = TABLES.get("Actions")
action_options, action_primary = get_field_meta(TOKEN, action_table)
action_templates = [
    (0, "补充对照实验统计，产出价值验证结论", 90),
    (0, "汇总消费价值结论，沉淀 1 页结论 memo", 60),
    (1, "做漏斗分阶段转化对比分析", 90),
    (1, "梳理提效空间与算法策略建议", 60),
    (2, "验证搜索对供给撬动的边界条件", 90),
    (2, "形成冷启动链路方案初稿", 60),
]

action_ids = []
for kr_index, title, minutes in action_templates:
    payload = {}
    if action_primary:
        payload[action_primary] = title
    payload["Action_Title"] = title
    payload["Est_Minutes"] = minutes
    payload["Due"] = now_ms()
    set_select(payload, "Status", "Backlog", action_options)
    payload["KeyResult"] = [kr_ids[kr_index]]
    action_ids.append(create_record(TOKEN, action_table, payload))

# Evidence
evidence_table = TABLES.get("Evidence")
evidence_options, evidence_primary = get_field_meta(TOKEN, evidence_table)
evidence_templates = [
    (0, "价值验证实验对照分析", "Experiment"),
    (1, "漏斗效率分析结果", "Dashboard"),
]

for idx, (kr_index, title, ev_type) in enumerate(evidence_templates):
    payload = {}
    if evidence_primary:
        payload[evidence_primary] = title
    payload["Evidence_Title"] = title
    payload["Link"] = "https://example.com"
    payload["Date"] = now_ms()
    set_select(payload, "Evidence_Type", ev_type, evidence_options)
    payload["KeyResult"] = [kr_ids[kr_index]]
    payload["Action"] = [action_ids[kr_index * 2]]
    create_record(TOKEN, evidence_table, payload)

# WeeklyPlan
weekly_table = TABLES.get("WeeklyPlan")
weekly_options, weekly_primary = get_field_meta(TOKEN, weekly_table)
weekly_title = "本周重点交付"
weekly_payload = {}
if weekly_primary:
    weekly_payload[weekly_primary] = weekly_title
weekly_payload["Week_Start"] = now_ms()
weekly_payload["Deliverable"] = "完成价值验证结论 + 漏斗分析初稿"
weekly_payload["Risk"] = "实验样本不足影响结论稳定性"
weekly_payload["Time_Budget_Min"] = 600
weekly_payload["KeyResults"] = kr_ids
create_record(TOKEN, weekly_table, weekly_payload)

# Ideas
ideas_table = TABLES.get("Ideas")
ideas_options, ideas_primary = get_field_meta(TOKEN, ideas_table)
idea_title = "探索优质UGC冷启动激励机制"
idea_payload = {}
if ideas_primary:
    idea_payload[ideas_primary] = idea_title
idea_payload["Idea_Title"] = idea_title
idea_payload["Est_Minutes"] = 120
set_select(idea_payload, "Status", "Parking", ideas_options)
idea_payload["Notes"] = "等待结论后再评估是否转正"
idea_payload["KeyResults"] = [kr_ids[2]]
create_record(TOKEN, ideas_table, idea_payload)

print("Mock OKR data created.")
