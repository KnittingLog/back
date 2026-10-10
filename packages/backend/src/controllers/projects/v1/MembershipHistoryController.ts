import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";

import { ProjectProvider as P } from "../../../providers/projects/ProjectProvider";

@Controller({ path: "users/me/memberships", version: "1" })
export class MembershipHistoryController {
  @core.TypedRoute.Get()
  public get(@Headers(
    "authorization",
  ) auth: string | undefined): Promise<P.Membership[]> {
    return P.history(auth);
  }
}
