import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const WatchHistorySchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        videoId: { type: Schema.Types.ObjectId, ref: "Video" },
        watchedAt: { type: Date, default: Date.now },
        watchDuration: Number
    },
    {
        timestamps: true
    }
);

// Index for finding watch history by user
WatchHistorySchema.index({ userId: 1 });

// Index for finding watch history by video
WatchHistorySchema.index({ videoId: 1 });

// Compound index for getting a user's watch history in chronological order
WatchHistorySchema.index({ userId: 1, watchedAt: -1 });

// ONE history per user per video
WatchHistorySchema.index(
    { userId: 1, videoId: 1 },
    { unique: true }
);


WatchHistorySchema.plugin(mongooseAggregatePaginate);

export default mongoose.model("WatchHistory", WatchHistorySchema);