import { v2 as cloudinary } from "cloudinary";
// import crypto from "crypto";
import { ApiError } from "../utils/ApiError.js";

function verifySignature(body, timestamp, signature) {
    // const payload = `timestamp=${timestamp}${JSON.stringify(body)}`;
    // const expected = crypto
    //     .createHash("sha1")
    //     .update(payload + process.env.CLOUDINARY_API_SECRET)
    //     .digest("hex");

    // return expected === signature;
}

export const generateSignature = (req, res) => {
    const timestamp = Math.round(Date.now() / 1000);

    const params = {
        timestamp,
        folder: "videos",
        resource_type: "video",
        notification_url: `${process.env.BASE_URL}/api/v1/cloudinary/webhook`
    };

    const signature = cloudinary.utils.api_sign_request(
        params,
        process.env.CLOUDINARY_API_SECRET
    );

    res.json({
        timestamp,
        signature,
        api_key: process.env.CLOUDINARY_API_KEY,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        notification_url: params.notification_url,
    });
};

export const handleWebhook = async (req, res) => {
    const signature = req.headers["x-cld-signature"];
    const timestamp = req.headers["x-cld-timestamp"];

    if (!verifySignature(req.body, timestamp, signature)) {
        throw new ApiError(401, "Invalid signature");
    }

    const { public_id, secure_url, context } = req.body;

    const postId = context?.custom?.post_id;

    await Posts.updateOne(
        { _id: postId },
        {
            $set: {
                videoUrl: secure_url,
                status: "uploaded"
            }
        }
    );

    res.sendStatus(200);
};