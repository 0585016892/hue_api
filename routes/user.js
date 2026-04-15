const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");
const bcrypt = require("bcryptjs");

// =====================
// 👤 GET ALL USERS
// =====================
router.get("/", auth, async (req, res) => {
  try {
    const { search = "" } = req.query;

    let sql = `
      SELECT id, full_name, email, phone, role_id, department, created_at
      FROM users
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      sql += ` AND (full_name LIKE ? OR email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY id DESC`;

    const [rows] = await pool.query(sql, params);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =====================
// 👤 GET BY ID
// =====================
router.get("/:id", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, email, phone, role_id, department, created_at
       FROM users WHERE id = ?`,
      [req.params.id]
    );

    if (!rows.length) {
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

// =====================
// ➕ CREATE USER
// =====================
router.post("/", auth, async (req, res) => {
  try {
    const { full_name, email, password, phone, role_id, department } =
      req.body;

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

    await pool.query(
      `INSERT INTO users 
      (full_name, email, password, phone, role_id, department)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [full_name, email, password, phone, role_id, department]
    );

    res.json({
      success: true,
      message: "Tạo user thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =====================
// ✏️ UPDATE USER (ADMIN)
// =====================
router.put("/:id", auth, async (req, res) => {
  try {
    const { full_name, phone, role_id, department } = req.body;

    await pool.query(
      `UPDATE users 
       SET full_name=?, phone=?, role_id=?, department=?
       WHERE id=?`,
      [full_name, phone, role_id, department, req.params.id]
    );

    res.json({
      success: true,
      message: "Cập nhật user thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =====================
// 👤 UPDATE PROFILE (USER)
// =====================
router.put("/profile/:id", auth, async (req, res) => {
    console.log("đang gọi API update profile");
    console.log(req.params.id );
    
  try {
    const { full_name, phone, department } = req.body;

    await pool.query(
      `UPDATE users 
       SET full_name=?, phone=?, department=?
       WHERE id=?`,
      [full_name, phone, department, req.params.id]
    );
    console.log("sửa thành công");
    
    res.json({
      success: true,
      message: "Cập nhật profile thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =====================
// 🔐 CHANGE PASSWORD
// =====================
router.put("/change-password/:id", auth, async (req, res) => {
  try {
    const { oldpassword, newpassword } = req.body;
    const userId = req.params.id;

    // 1. Lấy mật khẩu đã mã hóa (hash) từ DB
    const [rows] = await pool.query(
      "SELECT password FROM users WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User không tồn tại" });
    }

    const hashedPassword = rows[0].password;

    // 2. Dùng bcrypt để so sánh mật khẩu cũ (plain text) với hash trong DB
    const isMatch = await bcrypt.compare(oldpassword, hashedPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu cũ không đúng",
      });
    }

    // 3. Mã hóa mật khẩu mới trước khi lưu
    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(newpassword, salt);

    // 4. Cập nhật vào cơ sở dữ liệu
    await pool.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [newHashedPassword, userId]
    );

    res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi máy chủ" });
  }
});
// =====================
// ❌ DELETE USER
// =====================
router.delete("/:id", auth, async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = ?", [
      req.params.id,
    ]);

    res.json({
      success: true,
      message: "Xoá user thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;