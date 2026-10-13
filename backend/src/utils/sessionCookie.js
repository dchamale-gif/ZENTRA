const COOKIE_NAME = 'zentra_session';

const parseDuration = (value = '7d') => {
  const match = String(value).match(/^(\d+)(m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const multipliers = { m: 60000, h: 3600000, d: 86400000 };
  return amount * multipliers[match[2]];
};

const sessionDurationMs = () => parseDuration(process.env.JWT_EXPIRATION);

const setSessionCookie = (res, token) => {
  const maxAge = sessionDurationMs();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge
  });
  return new Date(Date.now() + maxAge).toISOString();
};

const clearSessionCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
};

const getSessionToken = (req) => {
  const cookies = String(req.headers.cookie || '').split(';');
  const sessionCookie = cookies.find(cookie => cookie.trim().startsWith(`${COOKIE_NAME}=`));
  if (sessionCookie) {
    return decodeURIComponent(sessionCookie.trim().slice(COOKIE_NAME.length + 1));
  }

  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (bearerToken) return bearerToken;
  return null;
};

module.exports = {
  clearSessionCookie,
  getSessionToken,
  setSessionCookie
};
