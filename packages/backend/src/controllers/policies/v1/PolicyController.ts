import core from "@nestia/core";
import { Controller } from "@nestjs/common";

import { PolicyProvider } from "../../../providers/policies/PolicyProvider";

@Controller({ path: "policy-documents", version: "1" })
export class PolicyController {
  @core.TypedRoute.Get()
  public list(): Promise<PolicyProvider.Document[]> {
    return PolicyProvider.list();
  }
}
