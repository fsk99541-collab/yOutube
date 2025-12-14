import mongoose, { isValidObjectId } from "mongoose"
import { User } from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    const { channelId } = req.params
    if (!channelId) {
        throw new ApiError(400, "Channel ID is required.");
    }

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid Channel ID.");
    }
    const existingSubscription = await Subscription.findOne({ channel: channelId, subscriber: req.user._id })

    if (existingSubscription) {
        await existingSubscription.deleteOne()

        return res.status(200).json(
            new ApiResponse(200, null, "Channel unsubscribed successfully.")
        );
    }

    const subscribed = await Subscription.create({
        subscriber: req.user._id,
        channel: channelId,
    })

    return res.status(200).json(
        new ApiResponse(200, subscribed, "Channel subscribed successfully.")
    );
})

// controller to return subscriber list of a channel
const getChannelSubscribers = asyncHandler(async (req, res) => {
    const { channelId } = req.params

    if (!channelId) {
        throw new ApiError(400, "Channel ID is required.");
    }

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid Channel ID.");
    }

    const subscribers = await Subscription.aggregate([
        { $match: { channel: new mongoose.Types.ObjectId(channelId) } },
        {
            // jo subsribers hamko mile hai unka name aur photo kya hai.
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
            }
        },
        { $unwind: "$subscriber" }, // channel [] -> {}
        {
            $project: {
                _id: 0,
                id: "$subscriber._id",
                name: "$subscriber.username",
                avatar: "$subscriber.avatar"
            }
        },
        // {
        //     $facet: {
        //         channels: [{ $match: {} }],
        //         count: [{ $count: "total" }]
        //     }
        // }
    ])

    return res.status(200).json(
        new ApiResponse(200, subscribers, "All Channel's subscribers fetched successfully.")
    );
})

// controller to return channel list to which user has subscribed
const getUserSubscriptions = asyncHandler(async (req, res) => {
    // main yani user ne kin kin ko subscribe kar rakha hai
    // user se userId yani subscriber 
    // jahan jahan subscriber hoga subscription me wo channel select kar ke bhejna hai.
    const { userId } = req.params
    if (!userId) {
        throw new ApiError(400, "User ID is required.");
    }
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID.");
    }
    const channels = await Subscription.aggregate([
        { $match: { subscriber: new mongoose.Types.ObjectId(userId) } },
        { 
            // jo channel hamko mile hai unka name aur photo kya hai.
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "channel",
            }
        },
        { $unwind: "$channel" }, // channel [] -> {}
        {
            $project: {
                _id: 0,
                id: "$channel._id",
                name: "$channel.username",
                avatar: "$channel.avatar"
            }
        }
    ])
    return res.status(200).json(
        new ApiResponse(200, channels, "All Subscribed channels fetched successfully.")
    );
})

// 6937f8d04d906a8583b905f4 @zara ki id

export {
    toggleSubscription,
    getChannelSubscribers,
    getUserSubscriptions
}