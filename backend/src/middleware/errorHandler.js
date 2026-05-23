module.exports = function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('[Error]', err);
  }

  res.status(status).json({
    error: {
      message: err.message || 'Internal server error',
      ...(isDev && { stack: err.stack }),
    },
  });
};
