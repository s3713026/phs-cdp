const ROLE_LEVELS = { viewer: 1, operator: 2, manager: 3, analyst: 3, admin: 4 };

function requireRole(minRole) {
  return (req, res, next) => {
    const role      = (req.headers['x-phs-role'] || 'viewer').toLowerCase();
    const userLevel = ROLE_LEVELS[role] || 0;
    const minLevel  = ROLE_LEVELS[minRole] || 99;
    if (userLevel < minLevel) {
      return res.status(403).json({
        error: {
          message: `Access denied. Required role: ${minRole}`,
          code: 'INSUFFICIENT_PERMISSIONS',
          yourRole: role, requiredRole: minRole,
        },
      });
    }
    req.userRole = role;
    next();
  };
}

module.exports = { requireRole, ROLE_LEVELS };
