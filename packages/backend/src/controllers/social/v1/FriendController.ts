import core from "@nestia/core";
import { Controller, Headers, HttpCode, Res } from "@nestjs/common";
import { Response } from "express";
import { tags } from "typia";

import { KnittingLogContext as K } from "../../../providers/common/KnittingLogContext";
import { SocialProvider as S } from "../../../providers/social/SocialProvider";
import { AuthProvider } from "../../../providers/auth/AuthProvider";

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
