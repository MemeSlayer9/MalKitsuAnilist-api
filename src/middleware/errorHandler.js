const errorHandler = (err, req, res, next) => {
  // Axios errors from external APIs
  if (err.response) {
    const { status, data } = err.response;

    if (status === 401) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API credentials. Check your .env file.',
        hint: err.config?.baseURL?.includes('myanimelist')
          ? 'Ensure MAL_CLIENT_ID is set in your .env file.'
          : 'Ensure Kitsu credentials are set.',
      });
    }

    if (status === 403) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied by external API.' });
    }

    if (status === 404) {
      return res.status(404).json({ error: 'Not Found', message: 'Resource not found in external API.' });
    }

    if (status === 429) {
      return res.status(429).json({
        error: 'Rate Limited',
        message: 'Too many requests to external API. Please slow down.',
      });
    }

    return res.status(status).json({
      error: 'External API Error',
      message: data?.message || data?.error || 'Unknown external API error',
      status,
    });
  }

  // Network errors
  if (err.request) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Could not connect to external API.',
    });
  }

  // Validation errors
  if (err.message?.startsWith('Invalid')) {
    return res.status(400).json({ error: 'Bad Request', message: err.message });
  }

  // Default
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong.',
  });
};

module.exports = errorHandler;
