import core from "@nestia/core";
import { Controller, Headers, HttpCode, Res } from "@nestjs/common";
import { Response } from "express";
import { tags } from "typia";

import { KnittingLogContext as K } from "../../../providers/common/KnittingLogContext";
import { SocialProvider as S } from "../../../providers/social/SocialProvider";
import { AuthProvider } from "../../../providers/auth/AuthProvider";

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
