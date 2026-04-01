import redis from "./redis.js";
import { Video } from "../models/video.model.js";

export const syncViewsToDB = async () => {
    const keys = await redis.keys("views:*");

    for (const key of keys) {
        if (key.includes(":users")) continue;

        const videoId = key.split(":")[1];
        const views = Number(await redis.get(key));

        if (views > 0) {
            const video = await Video.findByIdAndUpdate(videoId, {
                $inc: { views },
            });

            console.log("views incremented", video)

            await redis.del(key);
        }
    }
};