import core from "@nestia/core";
import { Controller, VERSION_NEUTRAL } from "@nestjs/common";

@Controller({ path: "monitors/health", version: VERSION_NEUTRAL })
export class MonitorHealthController {
  /**
   * Health check API.
   *
   * @tag Monitor
   *
   * @author Samchon
   */
  @core.TypedRoute.Get()
  public get(): void {}
}
