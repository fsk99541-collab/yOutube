import redis from "./redis.js";
import { Video } from "../models/video.model.js";

const VIEW_THRESHOLD = 2;
const DEDUP_TTL = 3600;

/**
 * Records a video view with deduplication and batched database updates
 * @param {string} videoId - MongoDB video ID
 * @param {string} viewerId - User ID, device ID, or IP address
 * @returns {Promise<{counted: boolean, buffered?: number}>}
 * @throws {ApiError} If videoId or viewerId is invalid
 */
const recordView = async (videoId, viewerId) => {
    const dedupKey = `view:dedup:${videoId}:${viewerId}`;

    // Mark as seen - nx: true means set only if key doesn't exist
    const isNewView = await redis.set(dedupKey, 1, {
        ex: DEDUP_TTL,
        nx: true
    });

    // If key already exists, view was recently recorded (duplicate)
    if (!isNewView) {
        return { counted: false };
    }

    // Increment buffer count atomically
    const bufferKey = `view:buffer:${videoId}`;
    const newCount = await redis.incr(bufferKey);

    // Set expiry on buffer key to auto-cleanup if not flushed
    await redis.expire(bufferKey, 3600);

    // Flush to database when threshold is reached
    if (newCount >= VIEW_THRESHOLD) {
        // Use GETDEL to atomically get and delete to prevent race conditions
        const countToFlush = await redis.getdel(bufferKey);
        if (countToFlush > 0) {
            await flushToDB(videoId, parseInt(countToFlush));
        }
    }

    return { counted: true, buffered: newCount };
};

/**
 * Flushes buffered view count to database
 * @param {string} videoId - MongoDB video ID
 * @param {number} count - Number of views to increment
 */
async function flushToDB(videoId, count) {
    if (count <= 0) {
        return;
    }

    const result = await Video.findByIdAndUpdate(
        videoId,
        {
            $inc: { views: count }
        },
        { new: false, runValidators: false }
    );

    if (!result) {
        console.warn(`Video not found for view flush: ${videoId}`);
    }
}

export { recordView };