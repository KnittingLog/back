export namespace SocialProvider {
  export type Request = {
    id: string;
    sender_id: string;
    recipient_id: string;
    status: "accepted" | "cancelled" | "pending" | "rejected";
  };
}
