import core from "@nestia/core";
import { Controller, Headers, HttpCode, Res } from "@nestjs/common";
import { Response } from "express";
import { tags } from "typia";

import { KnittingLogContext as K } from "../../providers/knittinglog/KnittingLogContext";
import { SocialProvider as S } from "../../providers/knittinglog/SocialProvider";
import { AuthProvider } from "../../providers/knittinglog/AuthProvider";

@Controller({ path: "friend-requests", version: "1" })
export class FriendRequestController {
  @core.TypedRoute.Get()
  public list(@Headers("authorization") auth: string | undefined,
    @core.TypedQuery() query: { direction?: "sent" | "received"; status?: S.Request["status"] }): Promise<S.Request[]> {
    return S.requests(auth, query);
  }

  @core.TypedRoute.Get("badge")
  public badge(@Headers(
    "authorization",
  ) auth: string | undefined): Promise<{ pending_count: number }> {
    return S.badge(auth);
  }

  @core.TypedRoute.Post()
  public async create(@Headers("authorization") auth: string | undefined,
    @core.TypedBody() input: { recipient_id: string & tags.Format<"uuid"> }, @Res(
      { passthrough: true },
    ) response: Response): Promise<S.Request> {
    K.keys(input, ["recipient_id"]);
    const result = await S.request(auth, input.recipient_id);
    response.status(result.status);
    return result.value;
  }

  @core.TypedRoute.Post(":id/accept")
  @HttpCode(200)
  public accept(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<S.Request> {
    return S.respond(auth, id, "accepted");
  }

  @core.TypedRoute.Post(":id/reject")
  @HttpCode(200)
  public reject(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<S.Request> {
    return S.respond(auth, id, "rejected");
  }

  @core.TypedRoute.Delete(":id")
  @HttpCode(204)
  public cancel(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<void> {
    return S.cancel(auth, id);
  }
}

@Controller({ path: "friends", version: "1" })
export class FriendController {
  @core.TypedRoute.Get()
  public list(@Headers(
    "authorization",
  ) auth: string | undefined): Promise<AuthProvider.User[]> {
    return S.friends(auth);
  }

  @core.TypedRoute.Delete(":userId")
  @HttpCode(204)
  public remove(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "userId",
  ) userId: string & tags.Format<"uuid">): Promise<void> {
    return S.unfriend(auth, userId);
  }
}

@Controller({ path: "blocks", version: "1" })
export class BlockController {
  @core.TypedRoute.Get()
  public list(@Headers(
    "authorization",
  ) auth: string | undefined): Promise<AuthProvider.User[]> {
    return S.blocks(auth);
  }

  @core.TypedRoute.Post()
  public create(@Headers("authorization") auth: string | undefined, @core.TypedBody() input: { blocked_id: string & tags.Format<"uuid"> }): Promise<{ blocked_id: string }> {
    K.keys(input, ["blocked_id"]);
    return S.block(auth, input.blocked_id);
  }

  @core.TypedRoute.Delete(":userId")
  @HttpCode(204)
  public remove(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "userId",
  ) userId: string & tags.Format<"uuid">): Promise<void> {
    return S.unblock(auth, userId);
  }
}
