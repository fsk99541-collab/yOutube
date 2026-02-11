import mongoose, { Schema, model } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
    {
        videoFile: {
            type: String, //cloudinary url
            required: true
        },
        thumbnail: {
            type: String, //cloudinary url
            required: true
        },
        title: {
            type: String, 
            required: true,
            trim: true
        },
        description: {
            type: String, 
            required: true,
            trim: true
        },
        duration: {
            type: Number, 
            required: true
        },
        views: {
            type: Number,
            default: 0
        },
        isPublished: {
            type: Boolean,
            default: true
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User"
        }

    }, 
    {
        timestamps: true,
    }
)

videoSchema.index({ owner: 1 });
videoSchema.index({ createdAt: -1 });
videoSchema.index({ views: -1 });

videoSchema.plugin(mongooseAggregatePaginate);

export const Video = model("Video", videoSchema);