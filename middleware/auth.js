// Blocks the route unless someone is logged in.
// Remembers the page they wanted so login can send them back to it.
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    if (req.method === 'GET') {
      req.session.returnTo = req.originalUrl;
    }
    return res.redirect('/login');
  }
  next();
}

// Makes the logged-in user and current path available to every view (for the header).
function exposeUser(req, res, next) {
  res.locals.currentUser = req.session.userId
    ? { id: req.session.userId, username: req.session.username }
    : null;
  res.locals.currentPath = req.path;
  next();
}

module.exports = { requireLogin, exposeUser };
