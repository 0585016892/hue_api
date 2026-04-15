const router = require("express").Router();
const pool = require("../config/db");

router.get("/", async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", gender } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let sql = `SELECT * FROM patients WHERE 1=1`;
    let params = [];

    // 🔍 SEARCH theo tên / SĐT
    if (search) {
      sql += ` AND (full_name LIKE ? OR phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // 🚻 FILTER gender
    if (gender) {
      sql += ` AND gender = ?`;
      params.push(gender);
    }

    // 📊 COUNT TOTAL
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM (${sql}) as temp`,
      params
    );

    const total = countResult[0].total;

    // 📄 DATA + PAGINATION
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);

    res.json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.post("/", async (req, res) => {
  try {
    const { full_name, phone, gender, date_of_birth, address } = req.body;

    // ❌ Validate bắt buộc
    if (!full_name || !phone) {
      return res.status(400).json({
        message: "full_name và phone là bắt buộc",
      });
    }

    // ❌ Check trùng số điện thoại
    const [exist] = await pool.query(
      "SELECT id FROM patients WHERE phone = ?",
      [phone]
    );

    if (exist.length > 0) {
      return res.status(400).json({
        message: "Số điện thoại đã tồn tại",
      });
    }

    await pool.query(
      `INSERT INTO patients (full_name, phone, gender, date_of_birth, address)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, phone, gender, date_of_birth, address]
    );

    res.json({ message: "Tạo bệnh nhân thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, gender, address } = req.body;

    // ❌ Check tồn tại
    const [check] = await pool.query(
      "SELECT id FROM patients WHERE id = ?",
      [id]
    );

    if (check.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy bệnh nhân" });
    }

    await pool.query(
      `UPDATE patients 
       SET full_name=?, phone=?, gender=?, address=? 
       WHERE id=?`,
      [full_name, phone, gender, address, id]
    );

    res.json({ message: "Cập nhật thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ❌ Check tồn tại
    const [check] = await pool.query(
      "SELECT id FROM patients WHERE id = ?",
      [id]
    );

    if (check.length === 0) {
      return res.status(404).json({ message: "Không tồn tại" });
    }

    // ❌ Check ràng buộc (đã có phiếu khám thì không xoá)
    const [appointments] = await pool.query(
      "SELECT id FROM appointments WHERE patient_id = ?",
      [id]
    );

    if (appointments.length > 0) {
      return res.status(400).json({
        message: "Không thể xoá bệnh nhân đã có phiếu khám",
      });
    }

    await pool.query("DELETE FROM patients WHERE id = ?", [id]);

    res.json({ message: "Xoá thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;