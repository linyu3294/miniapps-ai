function handler(event) {
    var request = event.request;
    // Only rewrite for /app/:slug/ and subpaths, but NOT for static files
    if (
      request.uri.startsWith('/app/') &&
      !request.uri.match(/\\.[a-zA-Z0-9]+$/) // not a file (no extension)
    ) {
      request.uri = '/index.html';
    }
    return request;
  }