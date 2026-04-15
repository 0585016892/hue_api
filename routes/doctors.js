const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");
router.get("/", auth, async (req, res) => {
  console.log("📌 API DOCTOR LIST CALLED");
  console.log("query:", req.query);

  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    page = Number(page);
    limit = Number(limit);
    const offset = (page - 1) * limit;

    let sql = `
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.role_name = 'doctor'
    `;

    let params = [];

    if (search) {
      sql += ` AND (u.full_name LIKE ? OR u.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    console.log("🧠 SQL BASE:", sql);
    console.log("📦 PARAMS:", params);

    // COUNT
    const countQuery = `SELECT COUNT(*) as total ${sql}`;
    console.log("📊 COUNT QUERY:", countQuery);

    const [count] = await pool.query(countQuery, params);

    console.log("📊 COUNT RESULT:", count);

    const total = count?.[0]?.total || 0;

    // DATA
    const dataQuery = `
      SELECT u.*
      ${sql}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;

    console.log("📄 DATA QUERY:", dataQuery);

    const [rows] = await pool.query(dataQuery, [
      ...params,
      limit,
      offset,
    ]);

    console.log("📦 ROWS:", rows.length);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("❌ ERROR DOCTOR API:", err);

    res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack, // 👈 QUAN TRỌNG
    });
  }
});
router.post("/", auth, async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      password,
      department,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Thiếu email hoặc password",
      });
    }

    // check email
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
      `
      INSERT INTO users 
      (full_name, email, phone, password, role_id, department)
      VALUES (?, ?, ?, ?, 2, ?)
      `,
      [full_name, email, phone, password, department]
    );

    res.json({
      success: true,
      message: "Tạo bác sĩ thành công",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, department } = req.body;

    const [check] = await pool.query(
      "SELECT id FROM users WHERE id = ? AND role_id = 2",
      [id]
    );

    if (!check.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bác sĩ",
      });
    }

    await pool.query(
      `
      UPDATE users
      SET full_name=?, phone=?, department=?
      WHERE id=? AND role_id=2
      `,
      [full_name, phone, department, id]
    );

    res.json({
      success: true,
      message: "Cập nhật thành công",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}); 
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const [check] = await pool.query(
      "SELECT id FROM users WHERE id = ? AND role_id = 2",
      [id]
    );

    if (!check.length) {
      return res.status(404).json({
        success: false,
        message: "Không tồn tại bác sĩ",
      });
    }

    await pool.query("DELETE FROM users WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Xoá bác sĩ thành công",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
module.exports = router;