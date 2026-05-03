/**
 * Authentication Middleware
 * Protects routes behind SAML SSO
 */

/**
 * Require authenticated session.
 * Redirects unauthenticated users to /auth/sso/login
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  // Store the originally requested URL so we can redirect back after login
  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/sso/login');
}

/**
 * Restrict access to specific email domains.
 * Only allows @bytestreams.ai users through.
 */
function ensureDomain(allowedDomains = ['bytestreams.ai']) {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.redirect('/auth/sso/login');
    }

    const email = req.user.email || req.user.nameID || '';
    const domain = email.split('@')[1];

    if (allowedDomains.includes(domain)) {
      return next();
    }

    console.warn(`[Auth] Domain rejected: ${email}`);
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'Your account is not authorized to access the ByteStreams intranet.',
      user: req.user,
    });
  };
}

/**
 * Attach user info to all view templates (res.locals)
 */
function attachUser(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
}

module.exports = {
  ensureAuthenticated,
  ensureDomain,
  attachUser,
};
