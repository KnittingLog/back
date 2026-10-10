import type { policy_documents } from "@prisma/sdk";

import { KnittingLogContext as K } from "./KnittingLogContext";

export namespace PolicyProvider {
  export interface Document {
    id: string;
    code: string;
    version: string;
    title: string;
    body: string;
    language: string;
    effective_at: string;
    requires_reconsent: boolean;
  }
  export interface Consent {
    user_id: string;
    policy_document_id: string;
    agreed_at: string;
  }

  export async function active(tx: K.Tx): Promise<policy_documents[]> {
    const rows = await tx.policy_documents.findMany({
      where: {
        deleted_at: null,
        language: "ko",
        effective_at: { lte: new Date() },
      },
      orderBy: [{ code: "asc" }, { effective_at: "desc" }, { id: "desc" }],
    });
    const latest = new Map<string, policy_documents>();
    for (const row of rows) {
      if (!latest.has(row.code)) {
        latest.set(row.code, row);
      }
    }
    return [...latest.values()];
  }

  export function list(): Promise<Document[]> {
    return K.transaction(async (tx) =>
      (await active(tx)).map((row) => ({
        id: row.id,
        code: row.code,
        version: row.version,
        title: row.title,
        body: row.body,
        language: row.language,
        effective_at: row.effective_at.toISOString(),
        requires_reconsent: row.requires_reconsent,
      })),
    );
  }

  export async function agree(tx: K.Tx, userId: string, ids: string[]): Promise<Consent[]> {
    const current = await active(tx);
    if (
      !current.length ||
      new Set(ids).size !== ids.length ||
      current.some((row) => !ids.includes(row.id)) ||
      ids.some((id) => !current.some((row) => row.id === id))
    ) {
      K.fail(
        400,
        "INVALID_POLICY_CONSENT",
        "현재 정책 문서 전체에 동의해야 합니다.",
      );
    }
    for (const id of ids) {
      const existing = await tx.policy_consents.findUnique({
        where: {
          user_id_policy_document_id: {
            user_id: userId,
            policy_document_id: id,
          },
        },
      });
      if (!existing) await tx.policy_consents.create({
        data: {
          user_id: userId,
          policy_document_id: id,
          agreed_at: new Date(),
          ...K.audit(userId),
        },
      });
      else if (existing.deleted_at) await tx.policy_consents.update({
        where: { id: existing.id },
        data: { deleted_at: null, agreed_at: new Date(), ...K.changed(userId) },
      });
    }
    return consents(tx, userId);
  }

  export async function consents(tx: K.Tx, userId: string): Promise<Consent[]> {
    return (await tx.policy_consents.findMany({ where: { user_id: userId, deleted_at: null },
      orderBy: [{ agreed_at: "asc" }, { policy_document_id: "asc" }, { id: "asc" }],
    }))
      .map((row) => ({ user_id: row.user_id, policy_document_id: row.policy_document_id, agreed_at: row.agreed_at.toISOString() }));
  }
}
