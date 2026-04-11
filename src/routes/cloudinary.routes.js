import express from "express";
import { generateSignature, handleWebhook } from "../controllers/cloudinary.controller.js";

const router = express.Router();

router.post("/generate-signature", generateSignature);
router.post("/webhook", handleWebhook);

export default router;