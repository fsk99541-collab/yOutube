import redis from "./redis.js";
import { Video } from "../models/video.model.js";

const VIEW_THRESHOLD = 2;
const DEDUP_TTL = 3600;

const recordView = async (videoId, userId) => {
    // dedup check
    const dedupKey = `view:dedup:${videoId}:${userId}`;
    const alreadySeen = await redis.get(dedupKey);
    if (alreadySeen) return { counted: false };

    // mark seen
    await redis.set(dedupKey, 1, { ex: DEDUP_TTL });

    // increment buffer count
    const bufferKey = `view:buffer:{videoId}`;
    const newCount = await redis.incr(bufferKey);

    // flush to database when threshold hit
    if (newCount >= VIEW_THRESHOLD) {
        await flushToDB(videoId, newCount);
        await redis.del(bufferKey);
    }

    return { counted: true, buffered: newCount };
}

async function flushToDB(videoId, count) {
    await Video.findByIdAndUpdate(
        videoId,
        {
            $inc: { views: count }
        }
    );
}

export { recordView };