const router = require("express").Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

router.post("/register", async (req, res) => {
  try {
    const { full_name, email, password, role_id } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin",
      });
    }

    const [exist] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (exist.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email đã tồn tại",
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (full_name, email, password, role_id)
       VALUES (?, ?, ?, ?)`,
      [full_name, email, hash, role_id || 2]
    );

    res.json({
      success: true,
      message: "Tạo user thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.password,
        u.role_id,
        r.role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = ?
      `,
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Sai email hoặc mật khẩu",
      });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Sai email hoặc mật khẩu",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role_name, // 🔥 gửi luôn role_name
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      message: "Login success",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role_id: user.role_id,
        role: user.role_name, // 🔥 frontend dùng cái này
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
const auth = require("../middleware/auth");

router.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, full_name, email, role_id FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User không tồn tại",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
module.exports = router;