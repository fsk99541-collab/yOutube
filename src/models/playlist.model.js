import mongoose, { Schema } from "mongoose";

const playlistSchema = new Schema({
    title: { type: String, required: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, default: '' },

    video: [{type: mongoose.Types.ObjectId, ref: "Video"}],

    isPublic: { type: Boolean, default: true },
}, {
    timestamps: true
});

export const Playlist = mongoose.model('Playlist', playlistSchema);


/*
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Simple embedded items approach (keeps playlist and order with it)
const PlaylistItemSchema = new Schema({
    video: { type: Schema.Types.ObjectId, ref: 'Video', required: true },
    position: { type: Number, required: true } // 0-based or 1-based per your choice
}, { _id: true });

// Playlist
const PlaylistSchema = new Schema({
    title: { type: String, required: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, default: '' },

    items: [PlaylistItemSchema],

    isPublic: { type: Boolean, default: true },
}, {
    timestamps: true
});

// ensure position uniqueness inside a playlist - Mongo doesn't support unique on array fields,
// so enforce at application level or create a separate PlaylistItem collection if you need DB-level constraint.
// Add indexes for common queries:
PlaylistSchema.index({ user: 1, title: 1 });
PlaylistSchema.index({ user: 1 });
*/
/*
 Option: if you prefer DB-level uniqueness per playlist item position (playlistId + position),
 create a separate collection `PlaylistItem` with fields { playlist: ObjectId, video: ObjectId, position: Number }
 and then add a compound unique index: { playlist:1, position:1 } unique: true
*/

/*
module.exports = mongoose.model('Playlist', PlaylistSchema);
*/