import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (fileBuffer) => {
    if(!fileBuffer) return null
    try {
        const response = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: "users",
                    resource_type: "auto" // if doesn't set/ it will through null :case video
                },
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
            streamifier.createReadStream(fileBuffer).pipe(stream);
        });
        return response;
    } catch (error) {
        return null;
    }
};

const removeFromCloudinary = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
        const publicId = extractPublicIdFromUrl(imageUrl);
        const response = await cloudinary.uploader.destroy(publicId);
        return response;
    } catch (error) {
        return null;
    }
}

function extractPublicIdFromUrl(url) {
    if (!url) return null;
    const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+(?:$|\?)/i);
    return m ? decodeURIComponent(m[1]) : null;
}

export { uploadOnCloudinary, removeFromCloudinary };



    
    
    
    
    
    
    
    
    
    
    
    
// This is for local but i am going to memory storage
// const uploadOnCloudinary = async (localFilePath) => {
//     try {
//         if (!localFilePath) return null
//         const response = await cloudinary.uploader.upload(localFilePath, {
//             resource_type: "auto"
//         })
//         fs.unlinkSync(localFilePath)
//         return response;
//     } catch (error) {
//         fs.unlinkSync(localFilePath)
//         return null;
//     }
// }



// function extractPublicId(url) {
//     // Remove query params if any
//     const cleanUrl = url.split('?')[0];

//     // Get the part after /upload/
//     const afterUpload = cleanUrl.split("/upload/")[1];

//     // Remove version folder (v1234567/) if included
//     const parts = afterUpload.split("/");
//     const lastPart = parts[parts.length - 1];

//     // Remove file extension (.jpg, .png, etc.)
//     const publicId = lastPart.replace(/\.[^/.]+$/, "");

//     return publicId;
// }

/*(async function() {

    // Configuration
    
    
    // Upload an image
     const uploadResult = await cloudinary.uploader
       .upload(
           'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg', {
               public_id: 'shoes',
           }
       )
       .catch((error) => {
           console.log(error);
       });
    
    console.log(uploadResult);
    
    // Optimize delivery by resizing and applying auto-format and auto-quality
    const optimizeUrl = cloudinary.url('shoes', {
        fetch_format: 'auto',
        quality: 'auto'
    });
    
    console.log(optimizeUrl);
    
    // Transform the image: auto-crop to square aspect_ratio
    const autoCropUrl = cloudinary.url('shoes', {
        crop: 'auto',
        gravity: 'auto',
        width: 500,
        height: 500,
    });
    
    console.log(autoCropUrl);    
})();
*/

/*** This is a way to upload on cloudinary by resource type
 * and use some transforamtion such as gravity : face,
 * 
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

const RESOURCE_TYPE = { video: "video", profile: "image", thumbnail: "image", post: "image" };

const SIZE_LIMITS = {
    image: 10 * 1024 * 1024,   // 10MB — free tier
    video: 100 * 1024 * 1024,  // 100MB — free tier hard cap
};

const UPLOAD_TIMEOUT_MS = 60_000;

const buildOptions = ({ type, userId, postId, videoId, index }) => {
    switch (type) {
        case "profile":
            return {
                public_id: `youtubeX/users/${userId}/profile`,
                overwrite: true,
                resource_type: "image",
                transformation: [
                    { width: 500, height: 500, crop: "fill", gravity: "auto:face" },
                    { quality: "auto", fetch_format: "auto" },
                ],
                tags: [`user:${userId}`, "profile"],
            };

        case "video":
            return {
                public_id: `youtubeX/videos/${videoId}/video`,
                resource_type: "video",
                tags: [`video:${videoId}`],
            };

        case "thumbnail":
            return {
                public_id: `youtubeX/videos/${videoId}/thumbnail`,
                overwrite: true,
                resource_type: "image",
                transformation: [
                    { width: 1280, height: 720, crop: "fill" },
                    { quality: "auto", fetch_format: "auto" },
                ],
                tags: [`video:${videoId}`, "thumbnail"],
            };

        case "post":
            return {
                public_id: `youtubeX/users/${userId}/posts/${postId}/image_${index}`,
                resource_type: "image",
                transformation: [{ quality: "auto", fetch_format: "auto" }],
                tags: [`user:${userId}`, `post:${postId}`],
            };

        default:
            throw Object.assign(new Error(`Invalid upload type: "${type}"`), { code: "INVALID_TYPE" });
    }
};

const uploadOnCloudinary2 = async ({ fileBuffer, type, userId, postId, videoId, index = 0 }) => {
    if (!fileBuffer) {
        throw Object.assign(new Error("fileBuffer is required"), { code: "MISSING_BUFFER" });
    }

    // Validate size before hitting the network
    const resourceType = RESOURCE_TYPE[type];
    if (!resourceType) {
        throw Object.assign(new Error(`Invalid upload type: "${type}"`), { code: "INVALID_TYPE" });
    }

    if (fileBuffer.length > SIZE_LIMITS[resourceType]) {
        throw Object.assign(
            new Error(`${type} exceeds ${SIZE_LIMITS[resourceType] / (1024 * 1024)}MB limit`),
            { code: "FILE_TOO_LARGE" }
        );
    }

    const options = buildOptions({ type, userId, postId, videoId, index });

    let streamRef = null; // hold ref for timeout cleanup

    const uploadPromise = new Promise((resolve, reject) => {
        streamRef = cloudinary.uploader.upload_stream(options, (err, result) => {
            if (err) {
                // Preserve original error — code/http_code from Cloudinary are useful
                return reject(
                    Object.assign(new Error(`Cloudinary upload failed [${type}]: ${err.message}`), {
                        code: "CLOUDINARY_ERROR",
                        cause: err,
                    })
                );
            }
            resolve(result);
        });

        Readable.from(fileBuffer).pipe(streamRef);
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
            streamRef?.destroy(); // abort the stream on timeout
            reject(
                Object.assign(new Error(`Upload timed out after ${UPLOAD_TIMEOUT_MS}ms [${type}]`), {
                    code: "UPLOAD_TIMEOUT",
                })
            );
        }, UPLOAD_TIMEOUT_MS)
    );

    try {
        return await Promise.race([uploadPromise, timeoutPromise]);
    } catch (error) {
        // Log with full context, rethrow as-is — don't wrap again
        console.error(`[Cloudinary] ${error.code ?? "ERROR"} | type=${type} | ${error.message}`);
        throw error;
    }
};

*/