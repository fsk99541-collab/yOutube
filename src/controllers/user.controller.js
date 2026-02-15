import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { removeFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const refreshToken = user.generateRefreshToken();
        const accessToken = user.generateAccessToken();
        // Todo: user.refreshToken = user.hashToken(refreshToken)
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating referesh and access token");
    }
};

const registerUser = asyncHandler(async (req, res) => {
    const { username, fullName, email, password } = req.body;

    if ([username, fullName, email, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All field must be required!");
    }

    const existingUser = await User.findOne({
        $or: [{ email }, { username }],
    });
    if (existingUser) throw new ApiError(409, "User already Existed.")

    const avatarBuffer = req.files?.avatar?.[0]?.buffer
    const coverImageBuffer = req.files?.coverImage?.[0]?.buffer

    if (!avatarBuffer) {
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarBuffer);

    let coverImage = null;
    if (coverImageBuffer) {
        coverImage = await uploadOnCloudinary(coverImageBuffer);
    }

    const user = await User.create({
        username: username.toLowerCase(),
        fullName,
        email,
        password,
        avatar: avatar.secure_url,
        coverImage: coverImage?.secure_url || "",
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken -__v");
    if (!createdUser) throw new ApiError(500, "Something went wrong while registering the user.");

    return res.status(201).json(new ApiResponse(201, createdUser, "User Created Successfully!"));
});
const loginUser = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;
    if (!username && !email) {
        throw new ApiError(400, "A username or email is required");
    }
    const user = await User.findOne({
        $or: [{ email }, { username }],
    });
    if (!user) throw new ApiError(404, "User doesn't Existed.");

    const isValidPassword = await user.isPasswordCorrect(password);
    if (!isValidPassword) throw new ApiError(401, "Invalid user credentials");

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    const options = {
        httpOnly: true,
        secure: true,
    };

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken -__v");
    if (!loggedInUser) throw new ApiError(500, "Something went wrong while logging the user.");

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                201,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "login successfully",
            ),
        );
});
const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            // $set: { refreshToken: undefined } // we can do also, 
            $unset: { refreshToken: 1 }
        },
        {
            new: true
        }
    );
    const options = {
        httpOnly: true,
        secure: true,
    };
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out."))
});
const refreshAccessToken = asyncHandler(async (req, res) => {
    // this works for both web and mobile client
    const incomingRefreshToken =
        req.cookies?.refreshToken ||
        req.headers['x-refresh-token'] ||
        req.headers.authorization?.split(" ")[1] ||
        req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized Access!")
    }
    try {
        // a backend can decode an expired JWT
        const decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        if (!decoded) {
            throw new ApiError(401, "Invalid Refresh!")
        }
        const user = await User.findById(decoded?._id);
        if (!user) {
            throw new ApiError(401, "Malformed Refresh!")
        }

        // Todo:  const hashedToken = user.hashToken(incomingRefreshToken);
        // if (hashedToken !== user.refreshToken) {
        //     throw new ApiError(401, "Refresh token expired or reused");
        // }
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is used or expired!")
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

        const options = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(new ApiResponse(
                201,
                {
                    accessToken,
                    refreshToken,
                },
                "Access Token Refreshed!",
            ))
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

});
const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Old and new password are required");
    }
    const user = await User.findById(req.user?._id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isMatched = await user.isPasswordCorrect(oldPassword);

    if (!isMatched) {
        throw new ApiError(401, "Invalid old password");
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json(
        new ApiResponse(200, {}, "Password changed successfully.")
    );
});
const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(
        req.user?._id,
        ).select("-password -__v");
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Current User Fetched Successfully."))
});
const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body;
    // console.log(`fullname: ${fullName}\nemail: ${email}`);
    if (!fullName || !email) {
        throw new ApiError(401, "All fields are required!")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName: fullName,
                email: email
            }
        },
        {
            new: true
        }
    ).select("-password -__v");
    await user.save();
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Accout details changed successfully."))
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarBuffer = req.file?.buffer;

    if (!avatarBuffer) {
        throw new ApiError(401, "Avatar must be required!")
    }
    const avatar = await uploadOnCloudinary(avatarBuffer)
    
    if (!avatar?.secure_url) throw new ApiError(400, "Avatar upload failed");

    const oldAvatar = req.user?.avatar;

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $set: { avatar: avatar.secure_url } },
        { new: true, runValidators: true }
    ).select("-password")

    if (!user) {
        await removeFromCloudinary(avatar.url);
        throw new ApiError(404, "User not found.");
    }

    console.log(avatar)

    if (oldAvatar) {
        await removeFromCloudinary(oldAvatar);
    }
    return res
        .status(200)
        .json(new ApiResponse(200, avatar.secure_url, "Avatar changed successfully."))
});
const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverBuffer = req.file?.buffer;

    if (!coverBuffer) {
        throw new ApiError(400, "Cover image is required!");
    }

    const uploaded = await uploadOnCloudinary(coverBuffer);

    if (!uploaded?.url) {
        throw new ApiError(400, "Cover image upload failed");
    }

    const oldCover = req.user?.coverImage;

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $set: { coverImage: uploaded.url } },
        { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
        await removeFromCloudinary(uploaded.url);
        throw new ApiError(404, "User not found.");
    }

    if (oldCover) {
        await removeFromCloudinary(oldCover);
    }

    return res.status(200).json(
        new ApiResponse(200, uploaded.secure_url, "Cover image changed successfully.")
    );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const username = req.params.username;
    if (!username?.trim()) throw new ApiError(404, "username not found");

    const channel = await User.aggregate([
        {
            $match: { username: username?.toLowerCase() }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscriberTo"
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "_id",
                foreignField: "owner",
                as: "videos"
            }
        },
        {
            $addFields: {
                subscribersCount: { $size: "$subscribers" },
                subscribeToCount: { $size: "$subscriberTo" },
                videosCount: { $size: "$videos" },
                isUserSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                email: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                subscribeToCount: 1,
                videosCount: 1,
                isUserSubscribed: 1,
            }
        }
    ]);

    if (!channel || channel.length === 0) {
        throw new ApiError(404, "Channel doesn't exists")
    }

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            channel[0],
            "User channel fetched successfully."
        ));
});
const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: { _id: new mongoose.Types.ObjectId(req.user._id) }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ]);
    return res
        .status(200)
        .json(new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched successfully."
        ));
});


export {
    registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser,
    updateAccountDetails, updateUserAvatar, updateUserCoverImage,
    getUserChannelProfile, getWatchHistory
};

/*

// utils/authTokens.js
import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";        // e.g. "15m"
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "30d";     // e.g. "30d"
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.error("Missing ACCESS_TOKEN_SECRET or REFRESH_TOKEN_SECRET");
  // don't throw here; let app startup fail if you prefer
}

export function createAccessToken(payload) {
  // payload should include at least { sub: userId, role?: ... }
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function createRefreshToken(payloadWithJti) {
  // include a jti (token id) for rotation/revocation
  // payloadWithJti: { sub: userId, jti: "<uuid-or-random>" }
  return jwt.sign(payloadWithJti, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

export function newTokenId() {
  // token id stored in JWT jti and hashed in DB
  return crypto.randomBytes(32).toString("hex");
}

export function hashTokenId(tokenId) {
  return crypto.createHash("sha256").update(tokenId).digest("hex");
}

// cookie options factory
export function cookieOptions(req) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,                     // only send over HTTPS in prod
    sameSite: isProd ? "lax" : "lax",   // "lax" works well for most sites; consider "strict" or "none" with cross-site considerations
    // If your web frontend is on a different domain you may need `sameSite: "none"` and `secure: true`
    path: "/",
    // consider setting domain if using subdomains
  };
}

// controllers/auth.controller.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/user.model.js";
import {
  verifyRefreshToken,
  createAccessToken,
  createRefreshToken,
  newTokenId,
  hashTokenId,
  cookieOptions
} from "../utils/authTokens.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const refreshAccessToken = asyncHandler(async (req, res) => {
  // 1. extract incoming refresh token (cookie, body, or header)
  const incoming = req.cookies?.refresh_token || req.body?.refreshToken || req.get("x-refresh-token");
  if (!incoming) {
    return res.status(401).json({ success: false, error: "no_refresh_token" });
  }

  // 2. verify refresh JWT
  let payload;
  try {
    payload = verifyRefreshToken(incoming); // throws if invalid/expired
  } catch (err) {
    return res.status(401).json({ success: false, error: "invalid_refresh" });
  }

  const userId = payload.sub;
  const jti = payload.jti;
  if (!userId || !jti) {
    return res.status(401).json({ success: false, error: "malformed_refresh" });
  }

  const incomingHash = hashTokenId(jti);

  // 3. find user that has this refresh token hash
  const user = await User.findOne({
    _id: userId,
    "refreshTokens.tokenHash": incomingHash
  }).select("+refreshTokens");

  if (!user) {
    // token reuse / revoked token -> security action
    // Option: revoke all tokens for userId (if user exists) and log the event.
    // Attempt to find user by id to revoke everything, else just return error.
    await User.updateOne({ _id: userId }, { $set: { refreshTokens: [] } }).catch(() => {});
    return res.status(401).json({ success: false, error: "refresh_revoked" });
  }

  // 4. Remove the used refresh token (rotation)
  await User.updateOne(
    { _id: userId },
    { $pull: { refreshTokens: { tokenHash: incomingHash } } }
  );

  // 5. Issue new tokens
  const newJti = newTokenId();
  const newRefreshToken = createRefreshToken({ sub: userId, jti: newJti });
  const newAccessToken = createAccessToken({ sub: userId, role: user.role });

  // 6. Store hashed jti for the new refresh token
  const decodedRefresh = jwt.decode(newRefreshToken);
  const expiresAt = decodedRefresh?.exp ? new Date(decodedRefresh.exp * 1000) : undefined;

  await User.updateOne(
    { _id: userId },
    { $push: { refreshTokens: { tokenHash: hashTokenId(newJti), expiresAt, meta: { ip: req.ip, ua: req.get("user-agent") } } } }
  );

  // 7. Send cookies for web and JSON for mobile
  const ckOpts = cookieOptions(req);
  res.cookie("access_token", newAccessToken, { ...ckOpts, maxAge: 15 * 60 * 1000 });
  res.cookie("refresh_token", newRefreshToken, { ...ckOpts, httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });

  return res.json({
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  });
});


*/