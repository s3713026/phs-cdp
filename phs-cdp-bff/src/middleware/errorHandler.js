// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isDev  = process.env.NODE_ENV === 'development';
  console.error(`[ERROR] ${req.method} ${req.path} → ${status}:`, err.message);
  res.status(status).json({
    error: {
      message: err.message || 'An unexpected error occurred',
      code:    err.code    || 'INTERNAL_ERROR',
      ...(isDev ? { stack: err.stack } : {}),
      requestId: req.requestId,
    },
  });
};
