import { ISystem } from "@knittinglog/api";
import core from "@nestia/core";
import { Controller, VERSION_NEUTRAL } from "@nestjs/common";
import { SystemProvider } from "../../providers/monitors/SystemProvider";
import { DateUtil } from "../../utils/DateUtil";

@Controller({ path: "monitors/system", version: VERSION_NEUTRAL })
export class MonitorSystemController {
  /**
   * Get system information.
   *
   * Get system information with commit and package information.
   *
   * @returns System info
   * @tag Monitor
   *
   * @author Samchon
   */
  @core.TypedRoute.Get()
  public async get(): Promise<ISystem> {
    return {
      uid: SystemProvider.uid,
      commit: await SystemProvider.commit(),
      package: await SystemProvider.package(),
      created_at: DateUtil.toString(SystemProvider.created_at, true),
    };
  }

}
