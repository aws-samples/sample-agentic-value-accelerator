import os, json, uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Tuple

import boto3

# ---------- AWS clients/resources ----------
REGION = os.environ.get("AWS_REGION", "us-east-2")
DDB = boto3.client("dynamodb", region_name=REGION)
SMR = boto3.client("sagemaker-runtime", region_name=REGION)
DDBR = boto3.resource("dynamodb", region_name=REGION)

# ---------- Tables / Endpoints (env) ----------
TABLE_FEATURES = os.environ["TABLE_FEATURES"]            # txn_features
TABLE_PAIRS    = os.environ["TABLE_PAIRS"]               # pair_stats
ENDPOINT_NAME  = os.environ["ENDPOINT_NAME"]             # fraud-xgb-endpoint
TABLE_TXN_LOGS = os.environ["TABLE_TXN_LOGS"]            # txn_logs (audit)
LOGS_TABLE     = DDBR.Table(TABLE_TXN_LOGS)

# Optional
TABLE_DSTSRC      = os.environ.get("TABLE_DSTSRC")       # dst_src_window (optional)
TABLE_ACTOR_STATE = os.environ.get("TABLE_ACTOR_STATE")  # actor_state (optional)

# ---------- Thresholds / knobs (env) ----------
NEAR_LOW   = float(os.environ.get("NEAR_LOW", "95.0"))
NEAR_HIGH  = float(os.environ.get("NEAR_HIGH", "100.0"))
REVIEW_TH  = float(os.environ.get("REVIEW_THRESHOLD", "0.85"))
HOLD_TH    = float(os.environ.get("HOLD_THRESHOLD",   "0.95"))

# Reason-tag thresholds
SMURFING_NEAR_MIN   = int(os.environ.get("SMURFING_NEAR_MIN", "5"))
HI_VELOCITY_CNT_1H  = int(os.environ.get("HI_VELOCITY_CNT_1H", "12"))
NEW_BENEF_AMT_MIN   = float(os.environ.get("NEW_BENEF_AMT_MIN", "500"))
LARGE_AMT_MIN       = float(os.environ.get("LARGE_AMT_MIN", "5000"))
LOG_TTL_DAYS        = int(os.environ.get("LOG_TTL_DAYS", "30"))

# Fan-in / Mule thresholds (for destination activity)
FANIN_DISTINCT_MIN  = int(os.environ.get("FANIN_DISTINCT_MIN", "5"))
MULE_DST_CNT_1H     = int(os.environ.get("MULE_DST_CNT_1H", "20"))
MULE_DST_SUM_1H     = float(os.environ.get("MULE_DST_SUM_1H", "2000"))

# Geo/Device anomaly knobs
GEO_HOP_WINDOW_MIN   = int(os.environ.get("GEO_HOP_WINDOW_MIN", "30"))
DEVICE_CHANGE_WINDOW = int(os.environ.get("DEVICE_CHANGE_WINDOW", "30"))

# ---------- Utilities ----------
def _bad(msg, code=400):
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": msg}),
    }

def _minute_bucket(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M")

def _ttl_hours(ts: datetime, hours=26) -> int:
    return int((ts + timedelta(hours=hours)).timestamp())

def _split_geo(geo: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not geo or "-" not in geo:
        return (geo or None), None
    c, r = geo.split("-", 1)
    return c, r

def _minutes_between(ts_now: datetime, ts_prev_iso: Optional[str]) -> Optional[int]:
    if not ts_prev_iso:
        return None
    try:
        prev = datetime.fromisoformat(ts_prev_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None
    return int((ts_now - prev).total_seconds() // 60)

# ---------- Source minute bucket ----------
def update_minute_bucket_src(src: str, amount: float, ts: datetime):
    minute = _minute_bucket(ts)
    near = 1 if (NEAR_LOW <= amount < NEAR_HIGH) else 0
    DDB.update_item(
        TableName=TABLE_FEATURES,
        Key={"pk": {"S": f"SRC#{src}"}, "sk": {"S": f"WIN#1m#TS#{minute}"}},
        UpdateExpression="ADD cnt_1m :one, sum_1m :amt, near_1m :near SET #ttl = :ttl",
        ExpressionAttributeNames={"#ttl": "ttl"},
        ExpressionAttributeValues={
            ":one": {"N": "1"},
            ":amt": {"N": str(amount)},
            ":near": {"N": str(near)},
            ":ttl": {"N": str(_ttl_hours(ts))},
        },
    )

# ---------- Destination minute bucket (cnt/sum) ----------
def update_minute_bucket_dst(dst: str, amount: float, ts: datetime):
    minute = _minute_bucket(ts)
    DDB.update_item(
        TableName=TABLE_FEATURES,
        Key={"pk": {"S": f"DST#{dst}"}, "sk": {"S": f"WIN#1m#TS#{minute}"}},
        UpdateExpression="ADD cnt_1m :one, sum_1m :amt SET #ttl = :ttl",
        ExpressionAttributeNames={"#ttl": "ttl"},
        ExpressionAttributeValues={
            ":one": {"N": "1"},
            ":amt": {"N": str(amount)},
            ":ttl": {"N": str(_ttl_hours(ts))},
        },
    )

# ---------- Distinct src per dst per minute (optional table) ----------
def put_dst_src_minute(dst: str, src: str, ts: datetime):
    if not TABLE_DSTSRC:
        return
    minute = _minute_bucket(ts)
    sk = f"TS#{minute}#SRC#{src}"
    try:
        DDB.put_item(
            TableName=TABLE_DSTSRC,
            Item={
                "pk": {"S": f"DST#{dst}"},
                "sk": {"S": sk},
                "expire_ts": {"N": str(_ttl_hours(ts))},
            },
            ConditionExpression="attribute_not_exists(pk)",
        )
    except DDB.exceptions.ConditionalCheckFailedException:
        pass

# ---------- Window reads ----------
def get_src_window_1h(src: str, now: datetime):
    start = now - timedelta(hours=1)
    sk_start = f"WIN#1m#TS#{_minute_bucket(start)}"
    sk_end = f"WIN#1m#TS#{_minute_bucket(now)}"
    resp = DDB.query(
        TableName=TABLE_FEATURES,
        KeyConditionExpression="pk = :pk AND sk BETWEEN :a AND :b",
        ExpressionAttributeValues={
            ":pk": {"S": f"SRC#{src}"},
            ":a": {"S": sk_start},
            ":b": {"S": sk_end},
        },
        ProjectionExpression="cnt_1m, sum_1m, near_1m",
    )
    cnt = sum(int(i.get("cnt_1m", {"N": "0"})["N"]) for i in resp.get("Items", []))
    s = sum(float(i.get("sum_1m", {"N": "0"})["N"]) for i in resp.get("Items", []))
    near = sum(int(i.get("near_1m", {"N": "0"})["N"]) for i in resp.get("Items", []))
    return cnt, s, near

def get_dst_window_1h(dst: str, now: datetime):
    start = now - timedelta(hours=1)
    sk_start = f"WIN#1m#TS#{_minute_bucket(start)}"
    sk_end = f"WIN#1m#TS#{_minute_bucket(now)}"
    resp = DDB.query(
        TableName=TABLE_FEATURES,
        KeyConditionExpression="pk = :pk AND sk BETWEEN :a AND :b",
        ExpressionAttributeValues={
            ":pk": {"S": f"DST#{dst}"},
            ":a": {"S": sk_start},
            ":b": {"S": sk_end},
        },
        ProjectionExpression="cnt_1m, sum_1m",
    )
    cnt = sum(int(i.get("cnt_1m", {"N": "0"})["N"]) for i in resp.get("Items", []))
    s = sum(float(i.get("sum_1m", {"N": "0"})["N"]) for i in resp.get("Items", []))
    return cnt, s

def get_dst_distinct_src_1h(dst: str, now: datetime) -> int:
    if not TABLE_DSTSRC:
        return 0
    start = now - timedelta(hours=1)
    sk_start = f"TS#{_minute_bucket(start)}"
    sk_end = f"TS#{_minute_bucket(now)}~"  # include all src after minute
    srcs = set()
    paginator = DDB.get_paginator("query")
    for page in paginator.paginate(
        TableName=TABLE_DSTSRC,
        KeyConditionExpression="pk = :pk AND sk BETWEEN :a AND :b",
        ExpressionAttributeValues={
            ":pk": {"S": f"DST#{dst}"},
            ":a": {"S": sk_start},
            ":b": {"S": sk_end},
        },
        ProjectionExpression="sk",
    ):
        for it in page.get("Items", []):
            sk = it["sk"]["S"]
            srcs.add(sk.split("#")[-1])
    return len(srcs)

# ---------- Pair stats ----------
def incr_prior_pair(src: str, dst: str, ts: datetime, amount: float) -> int:
    r = DDB.update_item(
        TableName=TABLE_PAIRS,
        Key={"pk": {"S": f"SRC#{src}"}, "sk": {"S": f"DST#{dst}"}},
        UpdateExpression="ADD prior_pair_count :one SET last_seen_ts=:ts, last_amount=:amt",
        ExpressionAttributeValues={
            ":one": {"N": "1"},
            ":ts": {"S": ts.isoformat()},
            ":amt": {"N": str(amount)},
        },
        ReturnValues="UPDATED_OLD",
    )
    old = r.get("Attributes", {}).get("prior_pair_count", {"N": "0"})["N"]
    return int(old)

# ---------- Actor state (geo/device) ----------
def _get_actor_state(src: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    if not TABLE_ACTOR_STATE:
        return None, None, None
    r = DDB.get_item(
        TableName=TABLE_ACTOR_STATE,
        Key={"pk": {"S": f"SRC#{src}"}},
        ProjectionExpression="last_seen_ts, last_geo, last_device",
    )
    it = r.get("Item")
    if not it:
        return None, None, None
    ts = it.get("last_seen_ts", {}).get("S")
    geo = it.get("last_geo", {}).get("S")
    dev = it.get("last_device", {}).get("S")
    return ts, geo, dev

def _set_actor_state(src: str, ts_iso: str, geo: str, device_id: str) -> None:
    if not TABLE_ACTOR_STATE:
        return
    DDB.update_item(
        TableName=TABLE_ACTOR_STATE,
        Key={"pk": {"S": f"SRC#{src}"}},
        UpdateExpression="SET last_seen_ts=:ts, last_geo=:g, last_device=:d",
        ExpressionAttributeValues={
            ":ts": {"S": ts_iso},
            ":g": {"S": geo},
            ":d": {"S": device_id},
        },
    )

# ---------- Build features ----------
def build_features(event: dict):
    required = ["txn_id", "src", "dst", "amount", "timestamp", "geo", "device_id"]
    missing = [k for k in required if k not in event]
    if missing:
        raise ValueError(f"missing fields: {missing}")

    try:
        amt = float(event["amount"])
        ts = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception as e:
        raise ValueError(f"bad amount/timestamp: {e}")

    src = event["src"]
    dst = event["dst"]
    geo = event.get("geo", "")
    device_id = event.get("device_id", "")
    hour, dow = ts.hour, ts.weekday()

    # 1h source window
    src_cnt_1h, src_sum_1h, src_near_thr_1h = get_src_window_1h(src, ts)

    # Pair history
    prior = incr_prior_pair(src, dst, ts, amt)

    # Destination windows + distinct incoming sources
    dst_cnt_1h, dst_sum_1h = get_dst_window_1h(dst, ts)
    dst_distinct_src_1h = get_dst_distinct_src_1h(dst, ts)

    # Actor state (geo/device) and recency
    last_ts_iso, last_geo, last_device = _get_actor_state(src)
    minutes_since_last = _minutes_between(ts, last_ts_iso)

    # Anomaly flags
    def _split(geo_str):
        if not geo_str or "-" not in geo_str: return geo_str, None
        a, b = geo_str.split("-", 1); return a, b

    c_country, c_region = _split(geo)
    p_country, p_region = _split(last_geo)

    geo_change_flag = 0
    if last_geo and geo and c_country and p_country:
        changed = (c_country != p_country) or (c_region and p_region and c_region != p_region)
        if changed and (minutes_since_last is None or minutes_since_last <= GEO_HOP_WINDOW_MIN):
            geo_change_flag = 1

    device_change_flag = 0
    if last_device and device_id and last_device != device_id:
        if minutes_since_last is None or minutes_since_last <= DEVICE_CHANGE_WINDOW:
            device_change_flag = 1

    # === 12-feature vector (ORDER MATTERS) ===
    feats = [
        amt,
        int(hour),
        int(dow),
        int(src_cnt_1h),
        float(src_sum_1h),
        int(src_near_thr_1h),
        int(prior),
        int(dst_cnt_1h),
        float(dst_sum_1h),
        int(dst_distinct_src_1h),
        int(geo_change_flag),
        int(device_change_flag),
    ]

    # Update state AFTER reading
    update_minute_bucket_src(src, amt, ts)
    update_minute_bucket_dst(dst, amt, ts)
    put_dst_src_minute(dst, src, ts)
    _set_actor_state(src, ts.isoformat().replace("+00:00", "Z"), geo, device_id)

    # Feature detail (for logs / tags)
    return feats, {
        "amount": amt,
        "hour": hour,
        "dow": dow,
        "src_cnt_1h": src_cnt_1h,
        "src_sum_1h": src_sum_1h,
        "src_near_thr_1h": src_near_thr_1h,
        "prior_pair_count": prior,
        "dst_cnt_1h": dst_cnt_1h,
        "dst_sum_1h": dst_sum_1h,
        "dst_distinct_src_1h": dst_distinct_src_1h,
        "geo_change_flag": geo_change_flag,
        "device_change_flag": device_change_flag,
        "last_seen_min_ago": minutes_since_last,
        "last_geo": last_geo,
        "last_device": last_device,
        "geo": geo,
        "device_id": device_id,
    }


# ---------- Reason tags ----------
def reason_tags(f: dict) -> list:
    tags = []

    # Smurfing / Structuring
    if f.get("src_near_thr_1h", 0) >= SMURFING_NEAR_MIN:
        tags.append("SMURFING")

    # High velocity (source)
    if f.get("src_cnt_1h", 0) >= HI_VELOCITY_CNT_1H:
        tags.append("HIGH_VELOCITY")

    # New beneficiary (first time pair) + sizable amount
    if f.get("prior_pair_count", 0) == 0 and float(f.get("amount", 0.0)) >= NEW_BENEF_AMT_MIN:
        tags.append("NEW_BENEFICIARY")

    # Amount-based
    amt = float(f.get("amount", 0.0))
    if amt >= LARGE_AMT_MIN:
        tags.append("LARGE_AMOUNT")
    if NEAR_LOW <= amt < NEAR_HIGH and f.get("src_near_thr_1h", 0) > 0:
        tags.append("NEAR_REPORTING_THRESHOLD")

    # Fan-in / Mule (destination side)
    if f.get("dst_distinct_src_1h", 0) >= FANIN_DISTINCT_MIN:
        tags.append("FAN_IN_TO_DST")
    if f.get("dst_cnt_1h", 0) >= MULE_DST_CNT_1H and float(f.get("dst_sum_1h", 0.0)) >= MULE_DST_SUM_1H:
        tags.append("MULE_DESTINATION")

    # Time anomalies
    h = int(f.get("hour", 0))
    dow = int(f.get("dow", 0))  # Mon=0 ... Sun=6
    if h < 6 or h > 22:
        tags.append("TIME_ANOMALY")
    if dow in (5, 6):
        tags.append("WEEKEND_ACTIVITY")

    # Geo / Device anomalies
    cur_geo = f.get("geo")
    prev_geo = f.get("last_geo")
    cur_dev = f.get("device_id")
    prev_dev = f.get("last_device")
    mins = f.get("last_seen_min_ago")

    c_country, c_region = _split_geo(cur_geo)
    p_country, p_region = _split_geo(prev_geo)

    if prev_geo and cur_geo and c_country and p_country:
        if c_country != p_country:
            tags.append("GEO_COUNTRY_CHANGE")
        elif c_region and p_region and c_region != p_region:
            tags.append("GEO_REGION_CHANGE")
        if mins is not None and mins <= GEO_HOP_WINDOW_MIN and (
            (c_country != p_country) or (c_region and p_region and c_region != p_region)
        ):
            tags.append("GEO_SUDDEN_HOP")

    if prev_dev and cur_dev and prev_dev != cur_dev:
        tags.append("DEVICE_CHANGE")
        if mins is not None and mins <= DEVICE_CHANGE_WINDOW:
            tags.append("RAPID_DEVICE_CHANGE")

    return sorted(set(tags))

# ---------- Model scoring / decision ----------
def score(features):
    payload = ",".join(map(str, features)) + "\n"
    r = SMR.invoke_endpoint(
        EndpointName=ENDPOINT_NAME,
        ContentType="text/csv",
        Body=payload.encode("utf-8"),
    )
    return float(r["Body"].read().decode("utf-8"))

def decide(s: float, tags: list = None) -> str:
    # High-risk reason tags override ML score
    HOLD_TAGS = {"FAN_IN_TO_DST", "MULE_DESTINATION", "GEO_SUDDEN_HOP", "RAPID_DEVICE_CHANGE"}
    REVIEW_TAGS = {"SMURFING", "HIGH_VELOCITY", "GEO_COUNTRY_CHANGE", "DEVICE_CHANGE", "LARGE_AMOUNT", "NEW_BENEFICIARY"}
    if tags:
        tag_set = set(tags)
        if tag_set & HOLD_TAGS:
            return "HOLD_AND_CASE"
        if tag_set & REVIEW_TAGS:
            return "STEP_UP_REVIEW"
    if s >= HOLD_TH:
        return "HOLD_AND_CASE"
    if s >= REVIEW_TH:
        return "STEP_UP_REVIEW"
    return "APPROVE"

# ---------- Logging (DynamoDB) ----------
def _to_decimal(v):
    if isinstance(v, float):
        return Decimal(str(v))
    return v

def _convert_floats(obj):
    if isinstance(obj, dict):
        return {k: _convert_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_floats(v) for v in obj]
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj

def put_txn_log(tx: dict, ts_dt: datetime, resp_payload: dict):
    item = {
        "pk": str(uuid.uuid4()),
        "txn_id": tx["txn_id"],
        "src": tx["src"],
        "dst": tx["dst"],
        "decision": resp_payload.get("decision"),
        "amount": _to_decimal(float(tx["amount"])),
        "timestamp": tx["timestamp"],
        "fraud_score": _to_decimal(float(resp_payload.get("fraud_score", 0.0))),
        "reason_tags": resp_payload.get("reason_tags", []),
        "request": _convert_floats(tx),
        "response": _convert_floats(resp_payload),
        "expire_ts": int((ts_dt + timedelta(days=LOG_TTL_DAYS)).timestamp()),
    }
    LOGS_TABLE.put_item(Item=item)

# ---------- Lambda handler ----------
def lambda_handler(event, context):
    try:
        body = event.get("body") if isinstance(event, dict) else event
        tx = json.loads(body) if isinstance(body, str) else body

        feats, feat_detail = build_features(tx)
        s = score(feats)
        tags = reason_tags(feat_detail)
        action = decide(s, tags)

        resp_payload = {
            "fraud_score": round(s, 6),
            "decision": action,
            "features": feat_detail,
            "reason_tags": tags,
            "model_feature_order": [
                "amount",
                "hour",
                "dow",
                "src_cnt_1h",
                "src_sum_1h",
                "src_near_thr_1h",
                "prior_pair_count",
                "dst_cnt_1h",
                "dst_sum_1h",
                "dst_distinct_src_1h",
                "geo_change_flag",
                "device_change_flag"
            ],
        }

        ts_dt = datetime.fromisoformat(tx["timestamp"].replace("Z", "+00:00"))
        put_txn_log(tx, ts_dt, resp_payload)

        return {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps(resp_payload)}

    except Exception as e:
        return _bad(str(e), 400)
