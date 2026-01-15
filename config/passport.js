const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const Nguoidung = require('../models/user_model');

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
      done(null, user || false);
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
              // matkhau is optional here; set random hash to avoid null issues.
              const randomPassword = Math.random().toString(36).slice(2) + Date.now();
              const matkhau = await bcrypt.hash(randomPassword, 10);

              user = await Nguoidung.create({
                hoten: hoten || email.split('@')[0],
                email,
                matkhau,
                avatar,
                vaitro: 'user',
                trangthai: 'active',
                xacthuc: true,
                ngaytao: new Date(),
                ngaycapnhat: new Date()
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
              if (!user.xacthuc) {
                user.xacthuc = true;
                changed = true;
              }
              if (changed) {
                user.ngaycapnhat = new Date();
                await user.save();
              }
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
