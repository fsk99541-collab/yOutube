
import { Schema, model } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const VISIBILITY = Object.freeze({
    PUBLIC: "public",
    PRIVATE: "private"
});

const postSchema = new Schema({
    content: {
        type: String,
        required: [true, "Post content is required"],
        maxlength: [5000, "Post content cannot exceed 5000 characters"],
        trim: true
    },

    images: {
        type: [
            {
                url: { type: String, required: true },
                public_id: { type: String, required: true },
                width: { type: Number, required: true },
                height: { type: Number, required: true }
            }
        ],
        validate: {
            validator: (arr) => arr.length <= 4,
            message: "A post can have at most 4 images"
        },
        default: []
    },

    author: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    visibility: {
        type: String,
        enum: { values: Object.values(VISIBILITY), message: "Visibility must be 'public' or 'private'" },
        default: VISIBILITY.PUBLIC
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },

    likesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 }

}, { timestamps: true });

postSchema.index({ author: 1, isDeleted: 1, createdAt: -1 });
postSchema.index({ visibility: 1, isDeleted: 1, createdAt: -1 });
postSchema.index({ content: "text" });

postSchema.plugin(mongooseAggregatePaginate);

export { VISIBILITY };
export const Post = model("Post", postSchema);
