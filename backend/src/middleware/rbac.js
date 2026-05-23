const ROLE_LEVELS = { user: 1, editor: 2, admin: 3 };

/**
 * requireRole('editor') — allows editor and admin
 * requireRole('admin')  — allows admin only
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userLevel = ROLE_LEVELS[req.user?.role] || 0;
    const minRequired = Math.min(...allowedRoles.map((r) => ROLE_LEVELS[r] || 99));

    if (userLevel < minRequired) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { requireRole, ROLE_LEVELS };
