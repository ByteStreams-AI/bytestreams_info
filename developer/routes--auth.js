/**
 * Authentication Routes — SAML SSO
 * Handles login, callback (ACS), logout, and metadata
 */

const express = require('express');
const passport = require('passport');
const router = express.Router();

/**
 * GET /auth/sso/login
 * Initiates SAML authentication flow → redirects to Google Workspace
 */
router.get('/sso/login', (req, res, next) => {
  // Preserve the return URL through the SAML flow
  const returnTo = req.query.returnTo || req.session.returnTo || '/';
  req.session.returnTo = returnTo;

  passport.authenticate('saml', {
    failureRedirect: '/auth/error',
    failureFlash: false,
  })(req, res, next);
});

/**
 * POST /auth/sso/acs
 * Assertion Consumer Service — Google Workspace posts the SAML response here
 */
router.post('/sso/acs', (req, res, next) => {
  passport.authenticate('saml', (err, user, info) => {
    if (err) {
      console.error('[SAML] Authentication error:', err.message);
      return res.redirect('/auth/error');
    }

    if (!user) {
      console.warn('[SAML] No user returned from assertion');
      return res.redirect('/auth/error');
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('[SAML] Session login error:', loginErr.message);
        return res.redirect('/auth/error');
      }

      // Redirect to the originally requested page or home
      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;

      console.log(`[SAML] User authenticated: ${user.email}`);
      return res.redirect(returnTo);
    });
  })(req, res, next);
});

/**
 * GET /auth/sso/logout
 * Destroys local session and redirects to Google logout
 */
router.get('/sso/logout', (req, res) => {
  const logoutUrl = process.env.SAML_LOGOUT_URL || 'https://accounts.google.com/Logout';

  req.logout((err) => {
    if (err) {
      console.error('[SAML] Logout error:', err.message);
    }

    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error('[SAML] Session destroy error:', sessionErr.message);
      }
      res.redirect(logoutUrl);
    });
  });
});

/**
 * GET /auth/sso/metadata
 * Serves SP metadata XML — provide this URL to Google Workspace admin
 */
router.get('/sso/metadata', (req, res) => {
  const strategy = req._passport?.instance?._strategy('saml');

  if (!strategy) {
    return res.status(500).send('SAML strategy not initialized');
  }

  res.type('application/xml');
  res.send(strategy.generateServiceProviderMetadata(
    strategy._options?.decryptionCert || null,
    strategy._options?.signingCert || null
  ));
});

/**
 * GET /auth/me
 * Returns current user profile (API endpoint)
 */
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: {
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      nameID: req.user.nameID,
    },
  });
});

/**
 * GET /auth/error
 * Authentication error page
 */
router.get('/error', (req, res) => {
  res.status(401).render('error', {
    title: 'Authentication Failed',
    message: 'Unable to authenticate with Google Workspace. Please try again or contact the administrator.',
    user: null,
  });
});

module.exports = router;
