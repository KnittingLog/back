export namespace PolicyProvider {
  export type Consent = {
    user_id: string;
    policy_document_id: string;
    agreed_at: string;
  };
  export type Document = {
    id: string;
    code: string;
    version: string;
    title: string;
    body: string;
    language: string;
    effective_at: string;
    requires_reconsent: boolean;
  };
}
