import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../utils/multer.js"
import * as postController from "../controllers/post.controller.js";
const router = Router();

// feed & user
router.get("/feed", verifyJWT, postController.getFeed);
router.get("/user/:userId", verifyJWT, postController.getUserPosts);


// post crud
router.post("/", verifyJWT, upload.array("images", 4), postController.createPost);
router.get("/:postId", postController.getPostById);
router.patch("/:postId", verifyJWT, upload.array("images", 4), postController.updatePost);
router.delete("/:postId", verifyJWT, postController.deletePost);


// likes
router.post("/:postId/like", verifyJWT, postController.likePost);
router.delete("/:postId/like", verifyJWT, postController.unlikePost);
router.get("/:postId/likes", postController.getPostLikes);

// comments
router.post("/:postId/comments", verifyJWT, postController.addComment);
router.get("/:postId/comments", postController.getComments);
router.delete("/:postId/comments/:commentId", verifyJWT, postController.deleteComment);



export default router;