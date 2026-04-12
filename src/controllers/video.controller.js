import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { removeFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"
import { recordView } from "../utils/recordView.js"
import { v2 as cloudinary } from "cloudinary"

const getUserVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy = "createdAt", sortType = "desc", username } = req.query;

    const user = await User.findOne({ username }).select("_id");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const sortDirection = sortType === "asc" ? 1 : -1;

    // build match stage
    const match = {
        owner: user._id,
        isPublished: true,
        status: "uploaded", // STRICT ENFORCEMENT: Only return fully processed videos
        videoUrl: { $ne: null } // Extra safety net: ensure URL actually exists
    };

    if (query && String(query).trim() !== "") {
        match.title = { $regex: String(query).trim(), $options: "i" };
    }

    // aggregation pipeline (operate on Video collection)
    const agg = Video.aggregate([
        { $match: match },
        // optional: project or remove fields here if needed
        { $sort: { [sortBy]: sortDirection } },
        // you can add $lookup here if you want to include owner/user details
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            _id: 1,          // do NOT include owner._id unless you want it
                            username: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },

        // convert owner array → single object
        { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },

        // merge owner fields directly into root doc
        {
            $addFields: {
                username: "$owner.username",
                avatar: "$owner.avatar"
            }
        },

        // remove the owner temp field
        {
            $project: {
                owner: 0,
                __v: 0
            }
        }

    ]);

    const options = {
        page: pageNum,
        limit: limitNum,
        // lean: true, // uncomment if you want plain objects
        // populate: [{ path: "owner", select: "name email _id" }], // optional populate
        // customLabels: { docs: "videos" } // optional rename
    };

    const result = await Video.aggregatePaginate(agg, options);

    // return the pagination object directly
    res.status(200).json(new ApiResponse(200, result, "All videos fetched successfully"));
});

const initAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    console.log(`title: ${title}`)
    if (!title?.trim() || !description?.trim()) {
        throw new ApiError("400", "All fields are required.")
    }

    const thumbnail = req.file;
    console.log(thumbnail)

    if (!thumbnail) {
        throw new ApiError(400, "Thumbnail is required.");
    }
    if (!thumbnail.mimetype.startsWith("image/")) {
        throw new ApiError(400, "Invalid image format");
    }

    const thumbnailResponse = await uploadOnCloudinary(thumbnail.buffer);

    if (!thumbnailResponse) {
        throw new ApiError(401, "video or thumbnail upload failed.")
    }

    const newVideo = await Video.create({
        thumbnail: thumbnailResponse?.secure_url || "",
        title: title,
        description: description,
        owner: req.user?._id,
        status: "uploading"
    });

    // Generate cloudinary signature -
    const timestamp = Math.round(Date.now() / 1000);
    // const params = {
    //     context: `post_id=${newVideo._id}`,
    //     folder: "videos",
    //     notification_url: `${process.env.BASE_URL}/api/v1/cloudinary/webhook`,
    //     public_id: newVideo._id.toString(),
    //     resource_type: "video",
    //     timestamp,
    // }
    const paramsToSign = {
        context: `video_id=${newVideo._id}`,
        folder: "videos",
        public_id: newVideo._id.toString(),
        timestamp,
    };
    console.log("paramsToSign", paramsToSign)

    const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        process.env.CLOUDINARY_API_SECRET
    );

    console.log("signature", signature)

    res.status(201).json(new ApiResponse(201, {
        videoId: newVideo._id,
        cloudinary: {
            timestamp,
            signature,
            apiKey: process.env.CLOUDINARY_API_KEY,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            folder: "videos",
            public_id: newVideo._id,
            context: paramsToSign.context,
            resource_type: "video",
            // notification_url: paramsToSign.notification_url
        }
    }, "Video upload initialized successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
    if (!videoId || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID.")
    }
    const video = await Video.findOne({
        _id: videoId,
        $or: [
            { isPublished: true, status: "uploaded" },
            { owner: new mongoose.Types.ObjectId(userId) }
        ]
    });

    if (!video) {
        throw new ApiError(404, "video does not exists")
    }
    res.status(200).json(new ApiResponse(200, video, "Video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body
    const thumbnailBuffer = req.file?.buffer;

    if (!videoId) throw new ApiError(400, "Video ID is required.");
    if (!title.trim()) throw new ApiError(400, "Title is required.");
    if (!description.trim()) throw new ApiError(400, "Description is required.");

    const video = await Video.findById(videoId);
    if (!video) throw new ApiError(404, "Video doesn't exist.");

    let thumbnailResponse;

    if (thumbnailBuffer) {
        thumbnailResponse = await uploadOnCloudinary(thumbnailBuffer);
        if (!thumbnailResponse?.secure_url) {
            throw new ApiError(500, "Thumbnail upload failed.");
        }
        const deleteResult = await removeFromCloudinary(video.thumbnail);
        if (!deleteResult?.result) {
            throw new ApiError(500, "Thumbnail failed to delete.");
        }
        video.thumbnail = thumbnailResponse?.secure_url;
    }

    video.title = title;
    video.description = description;

    await video.save({ validateBeforeSave: false });

    res.status(200).json(new ApiResponse(200, video, "Video updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
    if (!videoId) {
        throw new ApiError(400, "Video ID is required.")
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found.");
    }

    const [videoResult, thumbnailResult] = await Promise.all([
        removeFromCloudinary(video.videoFile),
        removeFromCloudinary(video.thumbnail)
    ])

    if (videoResult?.result !== "ok") {
        throw new ApiError(500, "Failed to delete video.");
    }
    if (thumbnailResult?.result !== "ok") {
        throw new ApiError(500, "Failed to delete thumbnail.");
    }

    await video.deleteOne();

    res.status(200).json(new ApiResponse(200, {}, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!videoId) {
        throw new ApiError(400, "Video ID is required.")
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found.");
    }

    video.isPublished = !video.isPublished;
    await video.save({ validateBeforeSave: false });

    res.status(200)
        .json(new ApiResponse(200, { isPublished: video.isPublished }, "Published status changed successfully"))
})

const getVideoFeed = asyncHandler(async (req, res) => {

    const { page = 1, limit = 10, query } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    // for checking, did the logged in user like the video?
    const userId = req.user?._id
        ? new mongoose.Types.ObjectId(req.user._id)
        : null;

    const match = {
        isPublished: true,
        status: "uploaded", // STRICT ENFORCEMENT: Only return fully processed videos
        videoUrl: { $ne: null } // Extra safety net: ensure URL actually exists
    }

    if (query && String(query).trim() !== "") {
        match.title = { $regex: String(query).trim(), $options: "i" };
    }
    const aggregate = Video.aggregate([
        {
            $match: match
        },
        {
            $sort: { createdAt: -1 }
        },

        // 🔹 get owner info (username + avatar)
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            username: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: {
                path: "$owner",
                preserveNullAndEmptyArrays: true
            }
        },

        // 🔹 likes lookup
        {
            $lookup: {
                from: "likes",
                let: { videoId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$targetId", "$$videoId"] },
                                    { $eq: ["$targetModel", "Video"] }
                                ]
                            }
                        }
                    }
                ],
                as: "likes"
            }
        },

        // 🔹 computed fields
        {
            $addFields: {
                likesCount: { $size: "$likes" },
                isLikedByMe: userId
                    ? { $in: [userId, "$likes.user"] }
                    : false,

                // flatten owner fields
                username: "$owner.username",
                avatar: "$owner.avatar",
                ownerId: "$owner._id"
            }
        },

        // 🔹 cleanup
        {
            $project: {
                isPublished: 0,
                likes: 0,
                owner: 0,
                __v: 0
            }
        }
    ]);

    const options = {
        page: pageNum,
        limit: limitNum
    };

    const result = await Video.aggregatePaginate(aggregate, options);

    res.status(200).json(new ApiResponse(200, result, "Videos Fetched Successfully"))
})

const addView = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { deviceId } = req.body;

    if (!videoId || typeof videoId !== 'string') {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID format"
        );
    }

    const viewerId = req.user?._id || deviceId || req.ip
    if (!viewerId) {
        throw new ApiError(400, "ViewerId Required")
    }

    const result = await recordView(videoId, viewerId);

    return res
        .status(200)
        .json(
            new ApiResponse(200, result, "View Counted")
        )
})

export {
    getUserVideos,
    initAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus,
    getVideoFeed,
    addView
}
