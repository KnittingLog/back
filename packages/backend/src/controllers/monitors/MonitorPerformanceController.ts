import { IPerformance } from "@knittinglog/api";
import core from "@nestia/core";
import { Controller, VERSION_NEUTRAL } from "@nestjs/common";

@Controller({ path: "monitors/performance", version: VERSION_NEUTRAL })
export class MonitorPerformanceController {
  /**
   * Get performance information.
   *
   * Get perofmration information composed with CPU, memory and resource usage.
   *
   * @returns Performance info
   * @tag Monitor
   *
   * @author Samchon
   */
  @core.TypedRoute.Get()
  public async get(): Promise<IPerformance> {
    return {
      cpu: process.cpuUsage(),
      memory: process.memoryUsage(),
      resource: process.resourceUsage(),
    };
  }
}
