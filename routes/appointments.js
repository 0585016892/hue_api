const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");

router.post("/", auth, async (req, res) => {
  try {
    const { patient_id, doctor_id, symptoms } = req.body;

    // ❌ validate
    if (!patient_id || !doctor_id) {
      return res.status(400).json({
        success: false,
        message: "patient_id và doctor_id là bắt buộc",
      });
    }

    // ❌ check bệnh nhân tồn tại
    const [patient] = await pool.query(
      "SELECT id FROM patients WHERE id = ?",
      [patient_id]
    );

    if (patient.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bệnh nhân không tồn tại",
      });
    }

    // ❌ check bác sĩ tồn tại
    const [doctor] = await pool.query(
      "SELECT id FROM users WHERE id = ? AND role_id = 2",
      [doctor_id]
    );

    if (doctor.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bác sĩ không hợp lệ",
      });
    }

    await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, symptoms, status)
       VALUES (?, ?, ?, 'pending')`,
      [patient_id, doctor_id, symptoms]
    );

    res.json({
      success: true,
      message: "Tạo phiếu khám thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get("/", auth, async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      status,
      doctor_id,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let baseSql = `
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON a.doctor_id = u.id
      WHERE 1=1
    `;

    let params = [];

    // 🔐 PHÂN QUYỀN THEO ROLE
    const userId = req.user.id;
    const userRole = req.user.role;

    // 👨‍⚕️ Nếu là doctor → chỉ xem lịch của mình
    if (userRole === "doctor") {
      baseSql += ` AND a.doctor_id = ?`;
      params.push(userId);
    } 
    // 👑 Nếu admin hoặc staff → cho phép filter theo doctor_id nếu có
    else if (doctor_id) {
      baseSql += ` AND a.doctor_id = ?`;
      params.push(doctor_id);
    }

    // 🔍 search patient name
    if (search) {
      baseSql += ` AND p.full_name LIKE ?`;
      params.push(`%${search}%`);
    }

    // 📌 filter status
    if (status) {
      baseSql += ` AND a.status = ?`;
      params.push(status);
    }

    // 📊 COUNT
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total ${baseSql}`,
      params
    );

    const total = countRows[0].total;

    // 📄 DATA
    const [rows] = await pool.query(
      `
      SELECT 
        a.*,
        p.full_name as patient_name,
        u.full_name as doctor_name
      ${baseSql}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

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
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
router.get("/:id", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        a.*,
        p.full_name as patient_name,
        p.phone,
        u.full_name as doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON a.doctor_id = u.id
      WHERE a.id = ?
      `,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiếu khám",
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
router.put("/:id/examine", auth, async (req, res) => {
  try {
    const { diagnosis } = req.body;

    const [check] = await pool.query(
      "SELECT id, status FROM appointments WHERE id = ?",
      [req.params.id]
    );

    if (check.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tồn tại phiếu khám",
      });
    }

    await pool.query(
      `UPDATE appointments 
       SET diagnosis = ?, status = 'completed'
       WHERE id = ?`,
      [diagnosis, req.params.id]
    );

    res.json({
      success: true,
      message: "Cập nhật khám bệnh thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.delete("/:id", auth, async (req, res) => {
  try {
    const [check] = await pool.query(
      "SELECT id, status FROM appointments WHERE id = ?",
      [req.params.id]
    );

    if (check.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tồn tại",
      });
    }

    if (check[0].status === "Đã khám") {
      return res.status(400).json({
        success: false,
        message: "Không thể xoá phiếu đã khám",
      });
    }

    await pool.query("DELETE FROM appointments WHERE id = ?", [
      req.params.id,
    ]);

    res.json({
      success: true,
      message: "Xoá thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}); 
router.patch("/:id/status", auth, async (req, res) => {
  const { status } = req.body;

  const valid = ["pending", "in_progress", "completed", "cancelled"];

  if (!valid.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  await pool.query(
    "UPDATE appointments SET status=? WHERE id=?",
    [status, req.params.id]
  );

  res.json({ success: true });
});
module.exports = router;