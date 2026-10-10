import { Module } from "@nestjs/common";
import { MonitorModule } from "./controllers/monitors/MonitorModule";
import { KnittingLogModule } from "./controllers/KnittingLogModule";

@Module({
  imports: [MonitorModule, KnittingLogModule],
})
export class MyModule {}
