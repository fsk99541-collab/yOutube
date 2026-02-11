import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import WatchHistory from "../models/watchHistory.model.js";
import { User } from "../models/user.model.js";

const addWatchHistory = asyncHandler(async (req, res) => {
    const { videoId, watchDuration } = req.body;

    if (!videoId) {
        throw new ApiError(400, "Video ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID.");
    }

    await Promise.all([
        await WatchHistory.findOneAndUpdate(
            {
                userId: req.user._id,
                videoId
            },
            {
                $set: {
                    watchedAt: new Date(),
                    watchDuration
                },
                $setOnInsert: {
                    userId: req.user._id,
                    videoId
                }
            },
            {
                upsert: true,
                new: true,
                runValidators: true
            }
        ),

        // Update recentWatched (keep last 10)
        await User.updateOne(
            { _id: req.user._id },
            { $pull: { recentWatched: { videoId: videoId } } }
        )
    ])  

    await User.updateOne(
        { _id: req.user._id },
        {
            $push: {
                recentWatched: {
                    $each: [{ videoId: videoId, watchedAt: new Date() }],
                    $position: 0,
                    $slice: 10
                }
            }
        }
    );

    return res.status(201).json(
        new ApiResponse(201, null, "Watch history added successfully.")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const agg = WatchHistory.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $sort: { createdAt: -1 }
        },
        {
            $lookup: {
                from: "videos",
                localField: "videoId",
                foreignField: "_id",
                as: "video"
            }
        },
        { $unwind: "$video" },
        {
            $project: {
                _id: 1,
                watchDuration: 1,
                watchedAt: 1,
                videoId: "$video._id",
                title: "$video.title",
                thumbnail: "$video.thumbnail",
                duration: "$video.duration"
            }
        }
    ]);

    const options = {
        page,
        limit
    };

    const history = await WatchHistory.aggregatePaginate(agg, options);

    return res.status(200).json(
        new ApiResponse(200, history, "Watch history fetched successfully.")
    );
});

const getContinueWatching = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(req.user._id) } },
        { $unwind: "$recentWatched" },
        { $sort: { "recentWatched.watchedAt": -1 } },
        {
            $lookup: {
                from: "videos",
                localField: "recentWatched.videoId",
                foreignField: "_id",
                as: "video"
            }
        },
        { $unwind: "$video" },
        {
            $project: {
                _id: 0,
                watchedAt: "$recentWatched.watchedAt",
                video: {
                    _id: "$video._id",
                    title: "$video.title",
                    thumbnail: "$video.thumbnail",
                    duration: "$video.duration"
                }
            }
        }
    ]);

    return res.status(200).json(
        new ApiResponse(200, user, "Continue watching fetched successfully.")
    );
});

const deleteWatchHistoryItem = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(400, "Video ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID.");
    }

    await WatchHistory.deleteMany({
        userId: req.user._id,
        videoId: videoId
    });

    await User.updateOne(
        { _id: req.user._id },
        { $pull: { recentWatched: { videoId: videoId } } }
    );

    return res.status(200).json(
        new ApiResponse(200, null, "Watch history item removed successfully.")
    );
});

const clearWatchHistory = asyncHandler(async (req, res) => {
    await WatchHistory.deleteMany({
        userId: req.user._id
    });

    await User.updateOne(
        { _id: req.user._id },
        { $set: { recentWatched: [] } }
    );

    return res.status(200).json(
        new ApiResponse(200, null, "Watch history cleared successfully.")
    );
});

export {
    addWatchHistory,
    getWatchHistory,
    getContinueWatching,
    deleteWatchHistoryItem,
    clearWatchHistory
}
