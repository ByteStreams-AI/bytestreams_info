/**
 * ByteStreams LLC Intranet
 * bytestreams.info — SAML SSO with Google Workspace
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Strategy: SamlStrategy } = require('@node-saml/passport-saml');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { getSamlConfig } = require('./config/saml');
const authRoutes = require('./routes/auth');
const { attachUser, ensureAuthenticated, ensureDomain } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------
// Security & Parsing
// ------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));
app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------
// View Engine
// ------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ------------------------------------
// Sessions (MongoDB-backed)
// ------------------------------------
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',    // HTTPS only in prod
    httpOnly: true,                                     // No JS access
    maxAge: 1000 * 60 * 60 * 8,                        // 8-hour session
    sameSite: 'lax',
  },
};

// Use MongoDB session store if MONGO_URI is set, otherwise fall back to memory
if (process.env.MONGO_URI) {
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 8, // 8 hours
  });
  console.log('[Session] Using MongoDB session store');
} else {
  console.warn('[Session] No MONGO_URI set — using in-memory sessions (not for production)');
}

app.use(session(sessionConfig));

// ------------------------------------
// Passport / SAML
// ------------------------------------
app.use(passport.initialize());
app.use(passport.session());

const samlConfig = getSamlConfig();
const samlStrategy = new SamlStrategy(samlConfig, (profile, done) => {
  /**
   * Google Workspace SAML assertion profile:
   *   profile.nameID       → email address (primary identifier)
   *   profile.firstName    → from attribute mapping
   *   profile.lastName     → from attribute mapping
   *
   * In production, you'd look up or create the user in your database here.
   * For the intranet scaffold, we pass through the profile directly.
   */
  const user = {
    nameID: profile.nameID,
    nameIDFormat: profile.nameIDFormat,
    email: profile.nameID, // Google sends email as nameID
    firstName: profile.firstName || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] || '',
    lastName: profile.lastName || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] || '',
    sessionIndex: profile.sessionIndex,
  };

  console.log(`[SAML] Profile received: ${user.email}`);
  return done(null, user);
});

passport.use(samlStrategy);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  // In production, fetch fresh user data from your database here
  done(null, user);
});

// Make the strategy accessible for metadata generation
app._samlStrategy = samlStrategy;

// ------------------------------------
// Global Middleware
// ------------------------------------
app.use(attachUser);

// ------------------------------------
// Routes
// ------------------------------------

// Auth routes (login, ACS, logout, metadata)
app.use('/auth', authRoutes);

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Landing / login page (public)
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Sign In — ByteStreams Intranet' });
});

// ------------------------------------
// Protected Routes (everything below requires auth)
// ------------------------------------
app.use(ensureAuthenticated);
app.use(ensureDomain(['bytestreams.ai']));

// Intranet home
app.get('/', (req, res) => {
  res.render('home', {
    title: 'ByteStreams Intranet',
    user: req.user,
  });
});

// Example protected API route
app.get('/api/dashboard', (req, res) => {
  res.json({
    message: 'Welcome to the ByteStreams intranet API',
    user: req.user.email,
  });
});

// ------------------------------------
// Error Handling
// ------------------------------------
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 — Not Found',
    message: 'The page you requested could not be found.',
    user: req.user || null,
  });
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(500).render('error', {
    title: 'Server Error',
    message: 'An unexpected error occurred. Please try again.',
    user: req.user || null,
  });
});

// ------------------------------------
// Start
// ------------------------------------
app.listen(PORT, () => {
  console.log(`\n=================================`);
  console.log(`  ByteStreams Intranet`);
  console.log(`  ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=================================\n`);
  console.log(`  SSO Login:    /auth/sso/login`);
  console.log(`  SSO Metadata: /auth/sso/metadata`);
  console.log(`  Logout:       /auth/sso/logout`);
  console.log(`\n`);
});

module.exports = app;
