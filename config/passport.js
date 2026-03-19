const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Nguoidung = require('../models/user_model');
const { ensureAccountFromUser, getAccountByUserId } = require('../services/account/index.js');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function configurePassport() {
  passport.serializeUser(function (user, done) {
    done(null, String(user._id));
  });

  passport.deserializeUser(async function (id, done) {
    try {
      const user = await Nguoidung.findOne({ _id: id, daxoa: { $ne: true } });

      if (!user) return done(null, false);

      // Attach account info so later code can read role/status from accounts
      // without refactoring every usage of req.user.vaitro/trangthai.
      const account = await getAccountByUserId({ userId: user._id }).catch(() => null);
      if (account) {
        user.account = account;
        if (account.vaitro) user.vaitro = account.vaitro;
        if (account.trangthai) user.trangthai = account.trangthai;
        if (typeof account.xacthuc === 'boolean') user.xacthuc = account.xacthuc;
      }

      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientID && clientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID,
          clientSecret,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
        },
        async function (accessToken, refreshToken, profile, done) {
          try {
            const email = normalizeEmail(profile?.emails?.[0]?.value);
            const avatar = profile?.photos?.[0]?.value;
            const hoten = profile?.displayName;

            if (!email) {
              return done(null, false, { message: 'Google account không có email' });
            }

            let user = await Nguoidung.findOne({ email, daxoa: { $ne: true } });

            if (!user) {
              // Create user for Google login.
              user = await Nguoidung.create({
                hoten: hoten || email.split('@')[0],
                email,
                avatar,
                ngaytao: new Date(),
                ngaycapnhat: new Date()
              });
              await ensureAccountFromUser(user, {
                provider: 'google',
                overrides: { vaitro: 'user', trangthai: 'active', xacthuc: true }
              });
            } else {
              // Update profile fields if missing
              let changed = false;
              if (avatar && !user.avatar) {
                user.avatar = avatar;
                changed = true;
              }
              if (hoten && !user.hoten) {
                user.hoten = hoten;
                changed = true;
              }
              if (changed) {
                user.ngaycapnhat = new Date();
                await user.save();
              }

              await ensureAccountFromUser(user, {
                provider: 'google',
                overrides: { vaitro: 'user', trangthai: 'active', xacthuc: true }
              });
            }

            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }
}

module.exports = {
  configurePassport
};
