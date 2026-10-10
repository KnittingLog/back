export namespace AuthProvider {
  export type User = {
    id: string;
    handle: string;
    nickname: string;
    biography: null | string;
    visibility: "friends" | "private" | "public";
  };
  export type Registration = {
    login_id: string;
    handle: string;
    nickname: string;
    password: string;
    policy_document_ids: string[];
  };
  export type RegistrationSession = {
    user: AuthProvider.User;
    access_token: string;
    refresh_token: string;
    recovery_code: string;
  };
  export type Login = { login_id: string; password: string };
  export type Session = {
    user: AuthProvider.User;
    access_token: string;
    refresh_token: string;
  };
  export type Refresh = { refresh_token: string };
  export type Recovery = {
    login_id: string;
    recovery_code: string;
    password: string;
  };
  export type Password = { password: string };
  export type RecoveryCode = { recovery_code: string };
}
