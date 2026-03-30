import mongoose, { isValidObjectId } from "mongoose"
import { Post } from "../models/post.model.js"
import { Comment } from "../models/comment.model.js"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadOnCloudinary, removeFromCloudinary } from "../utils/cloudinary.js"


const MAX_CONTENT_LENGTH = 5000
const MAX_IMAGES = 4
const ALLOWED_VISIBILITY = ["public", "private"]

// CREATE POST
const createPost = asyncHandler(async (req, res) => {
    const { content, visibility = "public" } = req.body;
    const files = req.files || [];

    // 1. Validation First (Before any heavy lifting)
    const trimmedContent = content?.trim();
    if (!trimmedContent) {
        throw new ApiError(400, "Post content is required.");
    }

    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
        throw new ApiError(400, `Content exceeds ${MAX_CONTENT_LENGTH} characters.`);
    }

    if (!ALLOWED_VISIBILITY.includes(visibility)) {
        throw new ApiError(400, "Invalid visibility type.");
    }

    if (files.length > MAX_IMAGES) {
        throw new ApiError(400, `Maximum ${MAX_IMAGES} images allowed.`);
    }

    // 2. Upload to Cloudinary
    let images = [];
    if (files.length > 0) {
        const uploads = await Promise.all(
            files.map(file => uploadOnCloudinary(file.buffer))
        );

        // Map to objects with url, public_id, width, and height
        images = uploads.filter(Boolean).map(u => ({
            url: u.secure_url,
            public_id: u.public_id,
            width: u.width,
            height: u.height
        }));

        // Fallback: If files were sent but none uploaded successfully
        if (images.length === 0 && files.length > 0) {
            throw new ApiError(500, "Failed to upload images. Please try again.");
        }
    }

    // 3. Create Post with Try/Catch Rollback
    try {
        const post = await Post.create({
            content: trimmedContent,
            images,
            visibility,
            author: req.user._id
        });

        return res
            .status(201)
            .json(new ApiResponse(201, post, "Post created successfully"));

    } catch (error) {
        // ROLLBACK: If DB creation fails, delete the images we just uploaded
        if (images.length > 0) {
            // Don't 'await' this; just fire and forget or log errors
            Promise.all(images.map(img => removeFromCloudinary(img.url)))
                .catch(err => console.error("Rollback cleanup failed:", err));
        }

        // Rethrow the original error to be caught by the global error handler
        throw error;
    }
});

// GET FEED
const getFeed = asyncHandler(async (req, res) => {
    let { page = 1, limit = 10 } = req.query
    page = parseInt(page, 10)
    limit = parseInt(limit, 10)

    const userId = req.user?._id
        ? new mongoose.Types.ObjectId(req.user._id)
        : null

    const match = {
        isDeleted: false,
        $or: [
            { visibility: "public" },
            ...(userId ? [{ author: userId }] : [])
        ]
    }

    const aggregate = Post.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },

        // author lookup
        {
            $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "authorDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: {
                path: "$authorDetails",
                preserveNullAndEmptyArrays: true
            }
        },

        // 🔥 flatten author
        {
            $addFields: {
                authorId: "$authorDetails._id",
                username: "$authorDetails.username",
                fullName: "$authorDetails.fullName",
                avatar: "$authorDetails.avatar"
            }
        },

        // likes lookup
        {
            $lookup: {
                from: "likes",
                let: {
                    postId: "$_id",
                    userId: new mongoose.Types.ObjectId(req.user._id) // ensure ObjectId
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$targetId", "$$postId"] },
                                    { $eq: ["$targetModel", "Post"] },
                                    { $eq: ["$user", "$$userId"] }
                                ]
                            }
                        }
                    },
                    { $limit: 1 }
                ],
                as: "likedStatus"
            }
        },

        {
            $addFields: {
                isLiked: userId
                    ? { $gt: [{ $size: "$likedStatus" }, 0] }
                    : false
            }
        },

        // cleanup
        {
            $project: {
                author: 0,
                authorDetails: 0,
                likedStatus: 0,
                isDeleted: 0,
                __v: 0
            }
        }
    ])

    const result = await Post.aggregatePaginate(aggregate, { page, limit })

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Feed fetched successfully"))
})

// GET USER POSTS
const getUserPosts = asyncHandler(async (req, res) => {
    const { userId } = req.params
    let { page = 1, limit = 10 } = req.query

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid User ID")
    }

    page = Number(page)
    limit = Number(limit)

    const currentUserId = req.user?._id
        ? new mongoose.Types.ObjectId(req.user._id)
        : null

    const match = {
        author: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        $or: [
            { visibility: "public" },
            ...(currentUserId && currentUserId.toString() === userId ? [{}] : [])
        ]
    }

    const aggregate = Post.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },

        // author lookup
        {
            $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "author",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: {
                path: "$author",
                preserveNullAndEmptyArrays: true
            }
        },

        // 🔥 flatten author
        {
            $addFields: {
                authorId: "$author._id",
                username: "$author.username",
                fullName: "$author.fullName",
                avatar: "$author.avatar"
            }
        },

        // likes lookup
        {
            $lookup: {
                from: "likes",
                let: {
                    postId: "$_id",
                    userId: currentUserId
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$targetId", "$$postId"] },
                                    { $eq: ["$targetModel", "Post"] },
                                    { $eq: ["$user", "$$userId"] }
                                ]
                            }
                        }
                    },
                    { $limit: 1 }
                ],
                as: "liked"
            }
        },

        {
            $addFields: {
                isLiked: currentUserId
                    ? { $gt: [{ $size: "$liked" }, 0] }
                    : false
            }
        },

        // cleanup
        {
            $project: {
                author: 0,
                liked: 0,
                isDeleted: 0,
                __v: 0
            }
        }
    ])

    const options = { page, limit }

    const result = await Post.aggregatePaginate(aggregate, options)

    return res.status(200).json(
        new ApiResponse(200, result, "User posts fetched successfully")
    )
})

// UPDATE POST
const updatePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { content, visibility } = req.body;

    if (!isValidObjectId(postId)) {
        throw new ApiError(400, "Invalid Post ID");
    }

    // 1. Fetch post and verify ownership early
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new ApiError(404, "Post not found");

    if (post.author.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "Not authorized to edit this post");
    }

    // 2. Validate Content & Visibility
    if (content !== undefined) {
        const trimmedContent = content.trim();
        if (!trimmedContent) throw new ApiError(400, "Post content is required");
        if (trimmedContent.length > MAX_CONTENT_LENGTH) {
            throw new ApiError(400, `Max ${MAX_CONTENT_LENGTH} characters allowed`);
        }
        post.content = trimmedContent;
    }

    if (visibility !== undefined) {
        if (!ALLOWED_VISIBILITY.includes(visibility)) {
            throw new ApiError(400, "Invalid visibility type");
        }
        post.visibility = visibility;
    }

    // 3. Robust Image Handling (The "Upload-then-Delete" Strategy)
    if (req.files?.length > 0) {
        if (req.files.length > MAX_IMAGES) {
            throw new ApiError(400, `Maximum ${MAX_IMAGES} images allowed`);
        }

        // Keep track of old images to delete later
        const oldImages = [...post.images];

        // Upload NEW images first
        const uploads = await Promise.all(
            req.files.map(file => uploadOnCloudinary(file.buffer))
        );

        const newImages = uploads.filter(Boolean).map(u => ({
            url: u.secure_url,
            public_id: u.public_id,
            width: u.width,
            height: u.height
        }));

        if (newImages.length === 0) {
            throw new ApiError(500, "Image upload failed");
        }

        // Only update the model if uploads succeeded
        post.images = newImages;

        // Cleanup: Now safely delete old images from Cloudinary
        // Note: Don't 'await' this if you want a faster response, 
        // or wrap in try/catch to ensure it doesn't crash the main update.
        Promise.all(oldImages.map(img => removeFromCloudinary(img.url)))
            .catch(err => console.error("Cloudinary cleanup failed:", err));
    }

    await post.save();

    return res
        .status(200)
        .json(new ApiResponse(200, post, "Post updated successfully"));
});


const deletePost = asyncHandler(async (req, res) => {
    const { postId } = req.params

    if (!isValidObjectId(postId)) {
        throw new ApiError(400, "Invalid Post ID")
    }

    const post = await Post.findById(postId)

    if (!post || post.isDeleted) {
        throw new ApiError(404, "Post not found")
    }

    if (post.author.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "Not authorized")
    }

    await Promise.all(
        post.images.map((img) => removeFromCloudinary(img.url))
    )

    await Post.updateOne(
        { _id: postId },
        {
            $set: {
                isDeleted: true,
                deletedAt: new Date()
            }
        }
    )

    return res
        .status(200)
        .json(new ApiResponse(200, null, "Post deleted successfully"))
})

const likePost = asyncHandler(async (req, res) => {
    const { postId } = req.params
    if (!isValidObjectId(postId)) {
        throw new ApiError(400, "Invalid Post ID")
    }
    try {
        const like = await Like.create({
            user: req.user._id,
            targetId: postId,
            targetModel: "Post"
        })

        // Only increment if the like creation was successful
        const updatedPost = await Post.findOneAndUpdate(
            { _id: postId, isDeleted: false },
            { $inc: { likesCount: 1 } },
            { new: true }
        )

        if (!updatedPost) {
            await Like.findByIdAndDelete(like._id)
            throw new ApiError(404, "Post not found")
        }
        return res
            .status(201)
            .json(new ApiResponse(201, like, "Post liked"))

    } catch (error) {
        // Check if error is a MongoDB duplicate key error (code 11000)
        if (error.code === 11000) {
            return res
                .status(200)
                .json(new ApiResponse(200, null, "Already liked"))
        }

        throw error
    }
})

const unlikePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;

    if (!isValidObjectId(postId)) {
        throw new ApiError(400, "Invalid Post ID");
    }

    // 1. Atomically attempt to delete the like
    const deletedLike = await Like.findOneAndDelete({
        user: req.user._id,
        targetId: postId,
        targetModel: "Post"
    });

    // If no like existed, we stop here. 
    // This prevents "Double Unliking" race conditions.
    if (!deletedLike) {
        return res
            .status(200)
            .json(new ApiResponse(200, null, "Post was not liked or already unliked"));
    }

    // 2. Atomically decrement the count
    // We add a check ($gt: 0) to ensure the counter never turns negative 
    // and that the post isn't deleted.
    const updatedPost = await Post.findOneAndUpdate(
        {
            _id: postId,
            isDeleted: false,
            likesCount: { $gt: 0 }
        },
        { $inc: { likesCount: -1 } },
        { new: true }
    );

    return res
        .status(200)
        .json(new ApiResponse(200, null, "Post unliked"));
});



const getPostLikes = asyncHandler(async (req, res) => {
    const { postId } = req.params
    let { page = 1, limit = 10 } = req.query

    if (!isValidObjectId(postId)) {
        throw new ApiError(400, "Invalid Post ID")
    }

    page = Number(page)
    limit = Number(limit)

    // ensure post exists
    const post = await Post.findOne({
        _id: postId,
        isDeleted: false
    })

    if (!post) {
        throw new ApiError(404, "Post not found")
    }

    const postObjectId = new mongoose.Types.ObjectId(postId)

    const aggregate = Like.aggregate([
        {
            $match: {
                targetId: postObjectId,
                targetModel: "Post"
            }
        },

        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$user"
        },

        {
            $sort: { createdAt: -1 }
        }
    ])
    console.log("hle")

    const result = await Like.aggregatePaginate(aggregate, {
        page,
        limit
    })

    return res.status(200).json(
        new ApiResponse(
            200,
            result,
            "Post likes fetched successfully"
        )
    )
})

const addComment = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { content, parentId = null } = req.body;

    if (!isValidObjectId(postId)) {
        throw new ApiError(400, "Invalid Post ID");
    }

    if (!content || !content.trim()) {
        throw new ApiError(400, "Comment content is required");
    }

    if (parentId && !isValidObjectId(parentId)) {
        throw new ApiError(400, "Invalid Parent Comment ID");
    }

    const post = await Post.findOneAndUpdate(
        { _id: postId, isDeleted: false },
        { $inc: { commentsCount: 1 } },
        { new: true }
    );

    if (!post) {
        throw new ApiError(404, "Post not found or deleted");
    }

    let parentComment = null;

    if (parentId) {
        parentComment = await Comment.findOne({
            _id: parentId,
            isDeleted: false
        });

        if (!parentComment) {
            throw new ApiError(404, "Parent comment not found");
        }

        await Comment.updateOne(
            { _id: parentId },
            {
                $inc: { repliesCount: 1 },
                $set: { hasReplies: true }
            }
        );
    }

    const comment = await Comment.create({
        content: content.trim(),
        user: req.user._id,
        targetId: postId,
        targetModel: "Post",
        parentId
    });

    return res.status(201).json(
        new ApiResponse(201, comment, "Comment added successfully")
    );
});

const getComments = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    let { page = 1, limit = 10 } = req.query;

    if (!isValidObjectId(postId)) {
        throw new ApiError(400, "Invalid Post ID");
    }

    page = Math.max(1, Number(page));
    limit = Math.min(50, Number(limit));

    const aggregate = Comment.aggregate([
        {
            $match: {
                targetId: new mongoose.Types.ObjectId(postId),
                targetModel: "Post",
                parentId: null,
                isDeleted: false
            }
        },
        { $sort: { createdAt: -1 } },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
                pipeline: [
                    { $project: { username: 1, avatar: 1 } }
                ]
            }
        },
        {
            $addFields: {
                user: { $first: "$user" }
            }
        },
        {
            $project: {
                content: 1,
                user: 1,
                likesCount: 1,
                repliesCount: 1,
                hasReplies: 1,
                isEdited: 1,
                createdAt: 1
            }
        }
    ]);

    const result = await Comment.aggregatePaginate(aggregate, {
        page,
        limit
    });

    return res.status(200).json(
        new ApiResponse(200, result, "Comments fetched successfully")
    );
});

const deleteComment = asyncHandler(async (req, res) => {
    const { postId, commentId } = req.params

    if (!isValidObjectId(postId) || !isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid Post or Comment ID")
    }

    const deletedComment = await Comment.findOneAndDelete({
        _id: commentId,
        targetId: postId,
        user: req.user._id // Authorization check happens here
    })

    if (!deletedComment) {
        throw new ApiError(404, "Comment not found or you are not authorized to delete it")
    }

    const post = await Post.findOneAndUpdate(
        { _id: postId, isDeleted: false },
        { $inc: { commentsCount: -1 } },
        { new: true }
    )

    return res
        .status(200)
        .json(new ApiResponse(200, null, "Comment deleted successfully"))
})

export {
    createPost,
    getFeed,
    updatePost,
    deletePost,
    likePost,
    unlikePost,
    getPostLikes,
    getUserPosts,
    addComment,
    getComments,
    deleteComment
}
