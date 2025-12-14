import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    // 1) Extract token: Prefer Authorization header (mobile); fallback to cookie (web)
    const header = req.get?.("authorization") || req.headers.authorization;
    const cookieToken = req.cookies?.accessToken;

    let token;
    if (header && header.startsWith("Bearer ")) {
        token = header.split(" ")[1]
    } else if(cookieToken) {
        token = cookieToken;
    }
    if (!token) throw new ApiError(401, "Unauthorized request")
    
    let payload;
    try {
        payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
        if (err.name === "TokenExpiredError") {
             throw new ApiError(401, "Token expired.")
        }
        throw new ApiError(401, "Invalid Token");
    }
 
    const user = await User.findById(payload?._id).select("-password -refreshToken");
    if (!user) throw new ApiError(401, "User not found");

    req.user = user;

    next();
})