import core from "@nestia/core";
import { Controller, Headers } from "@nestjs/common";

import { ReportProvider } from "../../providers/knittinglog/ReportProvider";

@Controller({ path: "reports", version: "1" })
export class ReportController {
  @core.TypedRoute.Post()
  public create(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: ReportProvider.Input): Promise<ReportProvider.Receipt> {
    return ReportProvider.create(authorization, input);
  }
}
