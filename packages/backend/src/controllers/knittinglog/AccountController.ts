import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";
import type { tags } from "typia";

import { AccountProvider } from "../../providers/knittinglog/AccountProvider";
import { AuthProvider } from "../../providers/knittinglog/AuthProvider";
import { PolicyProvider } from "../../providers/knittinglog/PolicyProvider";

@Controller({ path: "users", version: "1" })
export class AccountController {
  @core.TypedRoute.Get()
  public search(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedQuery() query: { query?: string },
  ): Promise<AuthProvider.User[]> {
    return AccountProvider.search(authorization, query.query);
  }

  @core.TypedRoute.Get("me")
  public me(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<AuthProvider.User> {
    return AccountProvider.me(authorization);
  }

  @core.TypedRoute.Patch("me")
  public update(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedBody() input: AccountProvider.Update,
  ): Promise<AuthProvider.User> {
    return AccountProvider.update(authorization, input);
  }

  @HttpCode(204)
  @core.TypedRoute.Delete("me")
  public withdraw(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<void> {
    return AccountProvider.withdraw(authorization);
  }

  @core.TypedRoute.Get("me/policy-consents")
  public consents(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<PolicyProvider.Consent[]> {
    return AccountProvider.consents(authorization);
  }

  @HttpCode(200)
  @core.TypedRoute.Post("me/policy-consents")
  public agree(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedBody() input: AccountProvider.PolicyConsentInput,
  ): Promise<PolicyProvider.Consent[]> {
    return AccountProvider.agree(authorization, input);
  }

  @core.TypedRoute.Get("me/memberships")
  public memberships(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<AccountProvider.Membership[]> {
    return AccountProvider.memberships(authorization);
  }

  @core.TypedRoute.Get("me/records")
  public records(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<AccountProvider.Record[]> {
    return AccountProvider.records(authorization);
  }

  @core.TypedRoute.Get("me/statistics")
  public statistics(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<AccountProvider.Statistics> {
    return AccountProvider.statistics(authorization);
  }

  @core.TypedRoute.Get(":id")
  public profile(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<AuthProvider.User> {
    return AccountProvider.profile(authorization, id);
  }

  @core.TypedRoute.Get(":id/records")
  public publicRecords(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<AccountProvider.Record[]> {
    return AccountProvider.records(authorization, id);
  }

  @core.TypedRoute.Get(":id/statistics")
  public publicStatistics(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<AccountProvider.Statistics> {
    return AccountProvider.statistics(authorization, id);
  }
}
