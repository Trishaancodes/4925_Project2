// Blocks the route unless someone is logged in.
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

module.exports = { requireLogin };
