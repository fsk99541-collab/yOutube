import mongoose, { Schema } from "mongoose";

const TweetSchema = new Schema({
    content: { type: String, required: true, maxlength: 280, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // optional metadata
    // isReplyTo: { type: Schema.Types.ObjectId, ref: 'Tweet', default: null },
    // replyCount: { type: Number, default: 0 },
    // likeCount: { type: Number, default: 0 },

}, {
    timestamps: true
});

// virtual populate for comments and likes (not embedded)
// TweetSchema.virtual('comments', {
//     ref: 'Comment',
//     localField: '_id',
//     foreignField: 'targetId',
//     justOne: false,
//     match: { targetModel: 'Tweet' }
// });

// TweetSchema.virtual('likes', {
//     ref: 'Like',
//     localField: '_id',
//     foreignField: 'targetId',
//     justOne: false,
//     match: { targetModel: 'Tweet' }
// });

// optional: text index for searching tweets
TweetSchema.index({ content: 'text' });

export const Tweet = mongoose.model('Tweet', TweetSchema);
