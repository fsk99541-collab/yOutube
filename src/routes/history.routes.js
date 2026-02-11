import { Router } from "express";
import {
    addWatchHistory,
    getWatchHistory,
    getContinueWatching,
    deleteWatchHistoryItem,
    clearWatchHistory,
} from "../controllers/watchHistory.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router
    .route("/")
    .post(addWatchHistory)
    .get(getWatchHistory)
    .delete(clearWatchHistory);

router.route("/continue").get(getContinueWatching);

router.route("/:videoId").delete(deleteWatchHistoryItem);

export default router;
