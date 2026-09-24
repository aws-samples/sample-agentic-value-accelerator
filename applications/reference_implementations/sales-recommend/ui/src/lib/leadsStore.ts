import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * Server-side persistence for captured visitor emails.
 *
 * Backed by the DynamoDB table named in LEADS_TABLE_NAME (provisioned by
 * infrastructure/modules/leads and injected into the ECS task). When the env
 * var is absent — e.g. local `next dev` with no AWS — every function no-ops
 * gracefully so the UI and the capture modal keep working without a table.
 */

export interface Lead {
  email: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
  source?: string;
  userAgent?: string;
}

const TABLE_NAME = process.env.LEADS_TABLE_NAME?.trim() || "";
const REGION = process.env.AWS_REGION || "us-east-1";
const MAX_SCAN_ITEMS = 1000;

/** True when a table is configured and persistence is active. */
export function leadsEnabled(): boolean {
  return TABLE_NAME.length > 0;
}

let _doc: DynamoDBDocumentClient | null = null;
function doc(): DynamoDBDocumentClient {
  if (!_doc) {
    // On ECS the SDK auto-discovers credentials from the task role; locally it
    // uses whatever is in the environment. No explicit keys are wired here.
    const base = new DynamoDBClient({ region: REGION });
    _doc = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _doc;
}

/**
 * Upsert a captured email. Increments a visit counter and refreshes lastSeen;
 * firstSeen is set once on creation. Returns false if persistence is disabled
 * or the write fails (callers should treat capture as best-effort).
 */
export async function recordLead(
  email: string,
  meta: { source?: string; userAgent?: string } = {}
): Promise<boolean> {
  if (!leadsEnabled()) return false;
  const now = new Date().toISOString();
  try {
    await doc().send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { email },
        UpdateExpression:
          "SET firstSeen = if_not_exists(firstSeen, :now), lastSeen = :now, #src = :src, userAgent = :ua ADD visits :one",
        ExpressionAttributeNames: { "#src": "source" },
        ExpressionAttributeValues: {
          ":now": now,
          ":one": 1,
          ":src": meta.source ?? "email-capture-modal",
          ":ua": meta.userAgent ?? "unknown",
        },
      })
    );
    return true;
  } catch (err) {
    console.error("[leadsStore] recordLead failed", err);
    return false;
  }
}

/**
 * Return captured leads, most-recently-seen first. Empty array when
 * persistence is disabled. Capped at MAX_SCAN_ITEMS — fine for demo volume.
 */
export async function listLeads(limit = 500): Promise<Lead[]> {
  if (!leadsEnabled()) return [];
  const items: Lead[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  try {
    do {
      const out = await doc().send(
        new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey })
      );
      for (const it of out.Items ?? []) items.push(it as Lead);
      ExclusiveStartKey = out.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey && items.length < MAX_SCAN_ITEMS);
  } catch (err) {
    console.error("[leadsStore] listLeads failed", err);
    return [];
  }

  return items
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1))
    .slice(0, limit);
}
