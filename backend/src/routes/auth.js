const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const admin = require('firebase-admin');

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Initialise Firebase Admin (used to verify tokens from the frontend SDK)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: process.env.FIREBASE_SERVICE_ACCOUNT
      ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
      : admin.credential.applicationDefault(),
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  });
}

// Get Google OAuth URL
router.get('/google', (req, res) => {
  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar',
    ],
    prompt: 'consent',
  });
  res.json({ url });
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
          googleId: payload.sub,
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token || user.googleRefreshToken,
          picture: payload.picture,
        },
      });
    }

    const appToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${appToken}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  const { id, email, name, picture, canvasDomain } = req.user;
  res.json({ id, email, name, picture, canvasDomain, hasCanvas: !!req.user.canvasToken });
});

// Save Canvas token — then immediately wipe demo data and sync
router.post('/canvas-token', authMiddleware, async (req, res) => {
  const { token, domain } = req.body;
  if (!token || !domain) return res.status(400).json({ error: 'Token and domain required' });

  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: { canvasToken: token, canvasDomain: domain },
  });

  // Remove demo placeholders
  await prisma.canvasAssignment.deleteMany({
    where: { userId: req.user.id, canvasId: { startsWith: 'demo-' } },
  });

  // Auto-sync in background (don't block the response)
  const { syncCanvasAssignments } = require('../services/canvasService');
  syncCanvasAssignments(updatedUser)
    .then(r => console.log(`[Canvas] Auto-synced ${r.synced} assignments for ${updatedUser.email}`))
    .catch(err => console.error('[Canvas] Auto-sync failed:', err.message));

  res.json({ success: true });
});

// Firebase Google Sign-In (frontend SDK → backend verification)
router.post('/firebase', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decoded;

    let user = await prisma.user.findUnique({ where: { googleId: uid } });
    if (!user) {
      // Also check by email in case they logged in via old OAuth flow
      user = await prisma.user.findUnique({ where: { email } });
    }
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: name || email.split('@')[0], picture: picture || null, googleId: uid },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId: uid, picture: picture || user.picture } });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, picture: user.picture } });
  } catch (err) {
    console.error('Firebase auth error:', err);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// Demo login (for development without Google OAuth setup)
router.post('/demo', async (req, res) => {
  let user = await prisma.user.findUnique({ where: { email: 'demo@acadex.app' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'demo@acadex.app',
        name: 'Demo Student',
        picture: null,
      },
    });
  }
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

module.exports = router;
