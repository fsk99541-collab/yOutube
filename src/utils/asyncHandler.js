const asyncHandler4 = function (requestHandler) {
    return async (req, res, next) => {
        try {
            await requestHandler(req, res, next);
        } catch (error) {
            res.send(error.code || 500).json({
                success: false,
                message: error.message
            });
        }
    }
}

// “curried” style
const asyncHandler2 = (fn) =>
  function handler(req, res, next) {
    return Promise.resolve(fn(req, res, next)).catch(next);
    };
  
const asyncHandler3 =
    (requestHandler) =>
        (req, res, next) =>
            Promise
                .resolve()
                .then(() => requestHandler(req, res, next))
                .catch(next);

export const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((error) =>
    next(error)
    );
