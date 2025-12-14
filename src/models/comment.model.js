import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const commentSchema = new Schema({
    content: { type: String, required: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // polymorphic target: can be a Video or a Tweet (or other models if you add)
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetModel: { type: String, required: true, enum: ['Video', 'Tweet'] },

    // optional parent comment (for replies)
    parent: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },

}, {
    timestamps: true // createdAt, updatedAt
});

// convenience virtual to populate the target (video or tweet)
commentSchema.virtual('target', {
    ref: doc => doc.targetModel,
    localField: 'targetId',
    foreignField: '_id',
    justOne: true
});

commentSchema.plugin(mongooseAggregatePaginate);

export const Comment = mongoose.model('Comment', commentSchema);
