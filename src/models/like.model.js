import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const likeSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // polymorphic target: a Video, Comment, or Tweet
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetModel: { type: String, required: true, enum: ['Video', 'Comment', 'Tweet', 'Post'] },

}, {
    timestamps: true
});

// Prevent duplicate likes by same user on same target:
// Unique compound index on (user, targetId).
// This works across target models because targetId + user must be unique.
likeSchema.index({ user: 1, targetId: 1 }, { unique: true });

likeSchema.plugin(mongooseAggregatePaginate);

export const Like = mongoose.model('Like', likeSchema);
