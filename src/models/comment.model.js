import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const commentSchema = new Schema({
    content: { type: String, required: true, trim: true, maxlength: 500 },

    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    targetId: { type: Schema.Types.ObjectId, required: true },
    targetModel: { type: String, required: true, enum: ['Video', 'Tweet', 'Post'] },

    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },

    likesCount: { type: Number, default: 0 },
    repliesCount: { type: Number, default: 0 },

    hasReplies: { type: Boolean, default: false },

    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false }

}, {
    timestamps: true
});

commentSchema.virtual('target', {
    ref: doc => doc.targetModel,
    localField: 'targetId',
    foreignField: '_id',
    justOne: true
});

commentSchema.index({ targetId: 1, createdAt: -1 });
commentSchema.index({ parentId: 1, createdAt: -1 });

commentSchema.plugin(mongooseAggregatePaginate);

export const Comment = mongoose.model('Comment', commentSchema);