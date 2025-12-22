import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, _, res, _) => {

    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            error: err.errors || []
        })
    }

    return res.status(500).json({
        success: false,
        message: "internal server error."
    })
}

export { errorHandler }