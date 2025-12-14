import mongoose, { isValidObjectId } from "mongoose"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const toggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!videoId) {
        throw new ApiError(400, "Video ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID.");
    }

    let existingLike = await Like.findOne({
        user: req.user._id,
        targetId: videoId,
        targetModel: "Video",
    });

    // Unlike
    if (existingLike) {
        await existingLike.deleteOne();

        return res.status(200).json(
            new ApiResponse(200, null, "Video unliked successfully.")
        );
    }

    // Like
    const like = await Like.create({
        user: req.user._id,
        targetId: videoId,
        targetModel: "Video",
    });

    return res.status(201).json(
        new ApiResponse(201, like, "Video liked successfully.")
    );
})

const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params
    if (!commentId) {
        throw new ApiError(400, "Video ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid video ID.");
    }

    let existingLike = await Like.findOne({
        user: req.user._id,
        targetId: commentId,
        targetModel: "Comment",
    });

    // Unlike
    if (existingLike) {
        await existingLike.deleteOne();

        return res.status(200).json(
            new ApiResponse(200, null, "Comment unliked successfully.")
        );
    }

    // Like
    const like = await Like.create({
        user: req.user._id,
        targetId: commentId,
        targetModel: "Comment",
    });

    return res.status(201).json(
        new ApiResponse(201, like, "Comment liked successfully.")
    );
})

const toggleTweetLike = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    if (!tweetId) {
        throw new ApiError(400, "Video ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(tweetId)) {
        throw new ApiError(400, "Invalid video ID.");
    }

    let existingLike = await Like.findOne({
        user: req.user._id,
        targetId: tweetId,
        targetModel: "Tweet",
    });

    // Unlike
    if (existingLike) {
        await existingLike.deleteOne();

        return res.status(200).json(
            new ApiResponse(200, null, "Tweet unliked successfully.")
        );
    }

    // Like
    const like = await Like.create({
        user: req.user._id,
        targetId: tweetId,
        targetModel: "Tweet",
    });

    return res.status(201).json(
        new ApiResponse(201, like, "Tweet liked successfully.")
    );
})

const getLikedVideos = asyncHandler(async (req, res) => {
    //TODO: get all liked videos
    const likedVideos = await Like.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(req.user._id),
                targetModel: "Video"
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "targetId", // it must be video id in the local model
                foreignField: "_id", // it also must be video id but but in the foreign field
                as: "video",
                pipeline: [
                    {
                        $project: {
                            videoFile: 1,
                            thumbnail: 1,
                            title: 1,
                            description: 1,
                            duration: 1,
                            views: 1,
                        }
                    }
                ]
            }
        },
        { $unwind: "$video" },
        { $sort: { createdAt: -1 } },
        {
            $replaceRoot: { newRoot: "$video" },
        },
    ])
    return res.status(200).json(
        new ApiResponse(200, likedVideos, "Fetched all liked videos successfully.")
    );
})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}