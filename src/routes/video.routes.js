import { Router } from 'express';
import {
    deleteVideo,
    getUserVideos,
    getVideoById,
    initAVideo,
    togglePublishStatus,
    updateVideo,
    getVideoFeed,
    addView
} from "../controllers/video.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { upload } from "../utils/multer.js"

const router = Router();

// It's a protected route and each request required the authentication, so
// write a middleware by using 'use' method of router
router.use(verifyJWT);

router.route("/")
    .get(getUserVideos)
    .post(upload.single("thumbnail"), initAVideo);
    
router.route("/feed").get(getVideoFeed);

router.route("/:videoId")
    .get(getVideoById)
    .delete(deleteVideo)
    .patch(upload.single("thumbnail"), updateVideo);

router.route("/:videoId/view").post(addView);

router.route("/toggle/publish/:videoId").patch(togglePublishStatus);

export default router;