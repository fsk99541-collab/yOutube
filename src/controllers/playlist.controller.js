import mongoose, { isValidObjectId } from "mongoose"
import { Playlist } from "../models/playlist.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"


const createPlaylist = asyncHandler(async (req, res) => {
    const { title, description } = req.body;

    if (!title || !description) {
        throw new ApiError(400, "All fields are required.");
    }

    if (!title.trim() || !description.trim()) {
        throw new ApiError(400, "Title and description cannot be empty.");
    }

    const playlist = await Playlist.create({
        title: title.trim(),
        description: description.trim(),
        user: req.user._id,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, playlist, "New playlist created successfully"));
});


const getUserPlaylists = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        throw new ApiError(400, "User ID is required.");
    }

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid User ID.");
    }

    const playlists = await Playlist.find({ user: userId });

    return res
        .status(200)
        .json(new ApiResponse(200, playlists, "Playlists fetched successfully"));
});

const getPlaylistById = asyncHandler(async (req, res) => {
    const { playlistId } = req.params
    if (!playlistId) {
        throw new ApiError(400, "Playlist ID is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID.");
    }
    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist does not exists.");
    }
    return res.status(200).json(new ApiResponse(200, playlist, "Playlist fetched successfully"))
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params
    if (!playlistId || !videoId) {
        throw new ApiError(400, "Playlist Id and Video ID are required.");
    }

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlist or video ID.");
    }

    const playlist = await Playlist.findOne({ _id: playlistId })
    if (!playlist) {
        throw new ApiError(404, "playlist does not exist")
    }
    const alreadyExists = playlist.video.some(
        v => v.toString() === videoId
    )
    if (alreadyExists) {
        throw new ApiError(409, "video already exist in playlist")
    }
    playlist.video.push(videoId)
    await playlist.save()
    
    return res.status(200).json(new ApiResponse(200, playlist, "Video added to playlist sucessfully"))
})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;

    if (!playlistId || !videoId) {
        throw new ApiError(400, "Playlist ID and Video ID are required.");
    }

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlist or video ID.");
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist does not exist.");
    }

    const exists = playlist.video.some(
        v => v.toString() === videoId
    );

    if (!exists) {
        throw new ApiError(404, "Video does not exist in playlist.");
    }

    playlist.video.pull(videoId);
    await playlist.save();

    return res.status(200).json(
        new ApiResponse(200, playlist, "Video removed from the playlist successfully.")
    );
});


const deletePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;

    if (!playlistId) {
        throw new ApiError(400, "Playlist ID is required.");
    }

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Playlist ID.");
    }

    // 3️⃣ Ownership + delete
    const playlist = await Playlist.findOneAndDelete({
        _id: playlistId,
        user: req.user._id,
    });

    if (!playlist) {
        throw new ApiError(404, "Playlist not found or unauthorized.");
    }

    return res.status(200).json(
        new ApiResponse(200, playlist, "Playlist deleted successfully.")
    );
});


const updatePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params
    const { title, description } = req.body
    if (!playlistId) {
        throw new ApiError(400, "Playlist ID is required.");
    }

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Playlist ID.");
    }
    if (!title || !description) {
        throw new ApiError(400, "All fields are required.");
    }

    if (!title.trim() || !description.trim()) {
        throw new ApiError(400, "Title and description cannot be empty.");
    }
    const playlist = await Playlist.findOneAndUpdate(
        { _id: playlistId, user: req.user._id},
        { title: title.trim(), description: description.trim() },
        { new: true, runValidators: true }
    );
    if (!playlist) {
        throw new ApiError(404, "Playlist not found or unauthorized.");
    }

    return res.status(200).json(
        new ApiResponse(200, playlist, "Playlist updated successfully.")
    );
})

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}
