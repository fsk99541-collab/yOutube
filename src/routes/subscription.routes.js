import { Router } from 'express';
import {
    getChannelSubscribers,
    getUserSubscriptions,
    toggleSubscription,
} from "../controllers/subscription.controller.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"

const router = Router();
router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/c/:channelId").post(toggleSubscription);
router.get("/u/:userId/subscriptions", getUserSubscriptions);
router.get("/c/:channelId/subscribers", getChannelSubscribers);

export default router