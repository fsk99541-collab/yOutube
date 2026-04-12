import cron from "node-cron";
import redis from "./redis.js";
import { Video } from "../models/video.model.js";

cron.schedule("*/5 * * * *", async () => {
    const keys = await redis.keys("view:buffer:*");
    if (!keys.length) return;

    const pipeline = keys.map(async (key) => {
        const videoId = key.split(":")[2];
        const count = await redis.getdel(key);
        if (count > 0) {
            Video.findByIdAndUpdate(
                videoId,
                {
                    $inc: { views: parseInt(count) }
                }
            )
        };
    });

    await Promise.all(pipeline);
});