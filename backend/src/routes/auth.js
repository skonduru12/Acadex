const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

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
