import mongoose, { isValidObjectId } from "mongoose"
import { Comment } from "../models/comment.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { Video } from "../models/video.model.js"


const getVideoComments = asyncHandler(async (req, res) => {
    //TODO: get all comments for a video
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!videoId) {
        throw new ApiError(400, "Video ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID.");
    }

    const videoExists = await Video.exists({ _id: videoId });
    if (!videoExists) {
        throw new ApiError(404, "Video not found.");
    }

    const options = {
        page: Number(page),
        limit: Number(limit),
    };

    const agg = Comment.aggregate([
        {
            $match: {
                targetId: new mongoose.Types.ObjectId(videoId),
                targetModel: "Video",
            },
        },
        { $sort: { createdAt: -1 } },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
            },
        },
        { $unwind: "$user" },
        {
            $project: {
                content: 1,
                createdAt: 1,
                "user._id": 1,
                "user.username": 1,
                "user.avatar": 1,
            },
        },
    ]);

    const comments = await Comment.aggregatePaginate(agg, options);

    return res
        .status(200)
        .json(new ApiResponse(200, comments, "Comment fetched successfully."))
})

const addComment = asyncHandler(async (req, res) => {
    // TODO: add a comment to a video
    const { content } = req.body;
    const { videoId } = req.params;

    if (!content || !content.trim()) {
        throw new ApiError(400, "Content is required.");
    }

    if (!videoId) {
        throw new ApiError(400, "Video ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID.");
    }

    const comment = await Comment.create({
        content: content.trim(),
        user: req.user._id,
        targetId: videoId,
        targetModel: "Video",
    });

    return res
        .status(201)
        .json(new ApiResponse(201, comment, "Commented on a video successfully."))
})

const updateComment = asyncHandler(async (req, res) => {
    // TODO: update a comment
    const { content } = req.body;
    const { commentId } = req.params;

    if (!content || !content.trim()) {
        throw new ApiError(400, "Content is required.");
    }

    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID.");
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "Comment not found.");
    }

    // Authorization (owner only)
    if (comment.user.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not allowed to update this comment.");
    }

    comment.content = content.trim();
    await comment.save();

    return res.status(201).json(new ApiResponse(201, comment, "Update comment successfully."))
})

const deleteComment = asyncHandler(async (req, res) => {
    // TODO: delete a comment
    const { commentId } = req.params
    if (!commentId) {
        throw new ApiError(400, "comment ID is required.")
    }
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID.")
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "Comment not found.");
    }

    if (comment.user.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "You are not allowed to delete this comment.");
    }

    await comment.deleteOne()

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Comment deleted successfully."))
})

export {
    getVideoComments,
    addComment,
    updateComment,
    deleteComment
}
