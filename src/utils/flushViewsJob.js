import cron from "node-cron";
import redis from "./redis.js";
import { Video } from "../models/video.model.js";

/**
 * Cron job to flush remaining buffered views every 5 minutes
 * This handles views that haven't reached the threshold
 */
cron.schedule("*/5 * * * *", async () => {
    try {
        const keys = await redis.keys("view:buffer:*");

        if (!keys || keys.length === 0) {
            return;
        }

        const promises = keys.map(async (key) => {
            try {
                const videoId = key.split(":")[2];

                // Atomically get and delete the count
                const count = await redis.getdel(key);

                if (count && parseInt(count) > 0) {
                    await Video.findByIdAndUpdate(
                        videoId,
                        {
                            $inc: { views: parseInt(count) }
                        },
                        { runValidators: false }
                    ).catch((error) => {
                        console.error(`Failed to update views for video ${videoId}:`, error.message);
                    });
                }
            } catch (error) {
                console.error(`Error processing buffer key ${key}:`, error.message);
            }
        });

        await Promise.all(promises);
    } catch (error) {
        console.error("Error in flushViewsJob cron:", error.message);
    }
});