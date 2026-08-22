import "dotenv/config";
import { ensureDemoData } from "../server/demoData";
import { isDemoMode } from "../server/runtimeMode";

if (!isDemoMode()) {
  throw new Error("Refusing to seed data outside APP_MODE=demo.");
}

const result = await ensureDemoData();
if (!result.seeded) throw new Error(result.reason ?? "Demo seed did not complete.");
console.log(JSON.stringify(result));
