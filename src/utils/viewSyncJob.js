import cron from "node-cron";
import { syncViewsToDB } from "../utils/viewSync.js";

cron.schedule("*/1 * * * *", async () => {
    await syncViewsToDB();
});