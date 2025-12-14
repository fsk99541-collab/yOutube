import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";

const uploadImage = async (req, res, next) => {
    try {
        if (!req.file) res.status(400).json({ message: "No file provided" });
        
        const streamUpload = (fileBuffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: "users",
                        transformation: [{ quality: "auto", fetch_format: "auto" }],
                    },
                    (err, result) => {
                        if (result) resolve(result);
                        else reject(err);
                    }
                );
                streamifier.createReadStream(fileBuffer).pipe(stream);
            });
        };

        const result = await streamUpload(req.file.buffer);
         return res.json({
           url: result.secure_url,
           public_id: result.public_id,
         });
    } catch (error) {
        next(error);
    }
}
