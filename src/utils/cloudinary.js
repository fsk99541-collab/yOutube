import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        fs.unlinkSync(localFilePath)
        return response;
    } catch (error) {
        fs.unlinkSync(localFilePath)
        return null;
    }
}

const removeFromCloudinary = async(imageUrl) => {
    if (!imageUrl) return null;
    try {
        const publicId = extractPublicIdFromUrl(imageUrl);
        const response = await cloudinary.uploader.destroy(publicId);
        return response;
    } catch (error) {
        return null;
    }
}

function extractPublicId(url) {
    // Remove query params if any
    const cleanUrl = url.split('?')[0];

    // Get the part after /upload/
    const afterUpload = cleanUrl.split("/upload/")[1];

    // Remove version folder (v1234567/) if included
    const parts = afterUpload.split("/");
    const lastPart = parts[parts.length - 1];

    // Remove file extension (.jpg, .png, etc.)
    const publicId = lastPart.replace(/\.[^/.]+$/, "");

    return publicId;
}

function extractPublicIdFromUrl(url) {
    if (!url) return null;
    const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+(?:$|\?)/i);
    return m ? decodeURIComponent(m[1]) : null;
}

export { uploadOnCloudinary, removeFromCloudinary };




















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