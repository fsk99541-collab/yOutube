import { isValidObjectId } from "mongoose"
import { Tweet } from "../models/tweet.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const createTweet = asyncHandler(async (req, res) => {
    const { content } = req.body;

    if (!content || !content.trim()) {
        throw new ApiError(400, "Content is required.");
    }
    if (content.trim().length > 280) {
        throw new ApiError(400, "Tweet content exceeds 280 characters.");
    }

    const tweet = await Tweet.create({
        content: content.trim(),
        user: req.user._id,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, tweet, "Tweet created successfully."))
})

const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params
    if (!userId) {
        throw new ApiError(400, "User ID is required.")
    }

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid User ID.")
    }
    const tweets = await Tweet.find({ user: userId })
        .sort({ createdAt: -1 });
    
    return res.status(200).json(
        new ApiResponse(200, tweets, "Fetched all tweets successfully.")
    );
})

const updateTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    const { content } = req.body
    if (!tweetId) {
        throw new ApiError(400, "Tweet ID is required.")
    }

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid Tweet ID.")
    }

    if (!content || !content.trim()) {
        throw new ApiError(400, "Content is required.");
    }


    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
        throw new ApiError(404, "Tweet not found.");
    }

    if (tweet.user.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "You are not allowed to delete this tweet.");
    }

    tweet.content = content.trim()
    await tweet.save()

    return res
        .status(200)
        .json(new ApiResponse(200, tweet, "Tweet updated successfully."))
})

const deleteTweet = asyncHandler(async (req, res) => {
    // we can check, does it exists; but leave this idea now for faster execution.
    const { tweetId } = req.params
    if (!tweetId) {
        throw new ApiError(400, "Tweet ID is required.")
    }

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid Tweet ID.")
    }

    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
        throw new ApiError(404, "Tweet not found.");
    }

    if (tweet.user.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "You are not allowed to delete this tweet.");
    }

    await tweet.deleteOne()

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Tweet deleted successfully."))
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}
