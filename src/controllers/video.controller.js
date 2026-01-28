import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { removeFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy = "createdAt", sortType = "desc", userId } = req.query;

    // validate userId
    if (!userId || !isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid or missing userId");
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const sortDirection = sortType === "asc" ? 1 : -1;

    // build match stage
    const match = {
        owner: new mongoose.Types.ObjectId(userId)
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

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    // TODO: get video, upload to cloudinary, create video

    if (!title || !description) {
        throw new ApiError("401", "All fields are required.")
    }

    const videoFile = req.files?.videoFile?.[0];
    const thumbnail = req.files?.thumbnail?.[0];

    if (!videoFile || !thumbnail) {
        throw new ApiError(400, "Video file and thumbnail are required.");
    }

    // MIME validation
    if (!videoFile.mimetype.startsWith("video/")) {
        throw new ApiError(400, "Invalid video format");
    }
    if (!thumbnail.mimetype.startsWith("image/")) {
        throw new ApiError(400, "Invalid image format");
    }

    if (videoFile.size > 100 * 1024 * 1024) {
        throw new ApiError(400, "Video size exceeds limit");
    }

    const videoFileResponse = await uploadOnCloudinary(videoFile.buffer);
    const thumbnailResponse = await uploadOnCloudinary(thumbnail.buffer);
    
    if (!videoFileResponse || !thumbnailResponse) {
        throw new ApiError(401, "video or thumbnail upload failed.")
    }

    const newVideo = await Video.create({
        title: title,
        description: description,
        duration: videoFileResponse?.duration || 0.0,
        videoFile: videoFileResponse?.secure_url || "",
        thumbnail: thumbnailResponse?.secure_url || "",
        owner: req.user?._id
    });
    
    res.status(200).json(new ApiResponse(201, { video: newVideo }, "A new video added successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
    if (!videoId) {
        throw new ApiError("401", "Video ID is required.")
    }
    const video = await Video.findById(videoId);
    res.status(200).json(new ApiResponse(201, video, "Video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body
    //TODO: update video details like title, description, thumbnail

    if (!videoId) throw new ApiError(400, "Video ID is required.");
    if (!title || title.trim() === "") throw new ApiError(400, "Title is required.");
    if (!description || description.trim() === "") throw new ApiError(400, "Description is required.");

    // find video document
    const video = await Video.findById(videoId);
    if (!video) throw new ApiError(404, "Video doesn't exist.");

    const thumbnailBuffer = req.file?.buffer;

    if (!thumbnailBuffer) {
        throw new ApiError(404, "Thumbnail is missing.");
    }    

    const thumbnailResult = await removeFromCloudinary(video.thumbnail);
    // console.log(thumbnailResult.result);
    
    if (!thumbnailResult?.result) {
        throw new ApiError(400, "Thumbnail failed to delete.");
    }

    const thumbnailResponse = await uploadOnCloudinary(thumbnailBuffer);

    video.title = title;
    video.description = description;
    video.thumbnail = thumbnailResponse?.secure_url || "";

    await video.save();
    res.status(200).json(new ApiResponse(200, video, "Video updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
    if (!videoId) {
        throw new ApiError("401", "Video ID is required.")
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found.");
    }
    const videoResult = await removeFromCloudinary(video.videoFile)
    await removeFromCloudinary(video.thumbnail)

    if (!videoResult) {
        throw new ApiError(500, "Failed to delete video from Cloudinary.");
    }

    await video.deleteOne();

    res.status(200).json(new ApiResponse(201, {}, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!videoId) {
        throw new ApiError("401", "Video ID is required.")
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found.");
    }

    video.isPublished = !video.isPublished;
    await video.save();

    res.status(200).json(new ApiResponse(200, {isPublished: video.isPublished}, "Published status changed successfully"))
})

const getVideoFeed = asyncHandler(async (req, res) => {

    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    
    const userId = req.user?._id
        ? new mongoose.Types.ObjectId(req.user._id)
        : null;

    const aggregate = Video.aggregate([
        {
            $match: { isPublished: true }
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
                            _id: 0,
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
                avatar: "$owner.avatar"
            }
        },

        // 🔹 cleanup
        {
            $project: {
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

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus,
    getVideoFeed
}
