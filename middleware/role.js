const role = (...allowRoles) => {
  return (req, res, next) => {
    try {
      const userRole = req.user.role_id;

      if (!allowRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Không có quyền truy cập",
        });
      }

      next();
    } catch (err) {
      return res.status(403).json({
        success: false,
        message: "Role error",
      });
    }
  };
};

module.exports = role;