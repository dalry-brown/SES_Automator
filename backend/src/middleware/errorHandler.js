module.exports = function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Surface Axios errors from Graph API with their actual response body
  if (err.response?.data) {
    err.status = err.response.status || err.status || 500;
    console.error('[Error]', err.message, JSON.stringify(err.response.data));
  }

  const status = err.status || err.statusCode || 500;
  console.error(`[Error] ${status}`, err.message);

  res.status(status).json({
    error: {
      message: err.message || 'Internal server error',
      ...(isDev && { stack: err.stack }),
    },
  });
};
