const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");
router.get("/", auth, async (req, res) => {
  console.log("📌 API STAFF/DOCTOR LIST CALLED");
  console.log("Query params received:", req.query);

  try {
    let { 
      page = 1, 
      limit = 10, 
      search = "", 
      role_id, 
      department 
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const offset = (page - 1) * limit;

    // 1. Khởi tạo câu query gốc
    // Lưu ý: LEFT JOIN để tránh mất dữ liệu nếu user chưa có role
    let sqlConditions = `
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE 1=1
    `;
    let params = [];

    // 2. Lọc theo Search (Tên, Email, SĐT)
    if (search) {
      sqlConditions += ` AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
      const searchKey = `%${search}%`;
      params.push(searchKey, searchKey, searchKey);
    }

    // 3. Lọc theo Role ID (Quan trọng cho yêu cầu của bạn)
    if (role_id && role_id !== 'null' && role_id !== 'undefined') {
      sqlConditions += ` AND u.role_id = ?`;
      params.push(Number(role_id));
    } 

    // 4. Lọc theo Chuyên khoa
    if (department && department !== 'null' && department !== 'undefined') {
      sqlConditions += ` AND u.department = ?`;
      params.push(department);
    }

    // --- BẮT ĐẦU TRUY VẤN ---

    // Lấy tổng số bản ghi để phân trang
    const countQuery = `SELECT COUNT(*) as total ${sqlConditions}`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult?.[0]?.total || 0;

    // Lấy dữ liệu thực tế
    // u.* lấy toàn bộ, r.role_name để hiển thị tên chức vụ ở front-end
    const dataQuery = `
      SELECT u.*, r.role_name
      ${sqlConditions}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;

    // Thêm limit và offset vào mảng params
    const [rows] = await pool.query(dataQuery, [...params, limit, offset]);

    console.log(`✅ Found ${rows.length} records for request`);

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
    console.error("❌ ERROR STAFF LIST API:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
      error: err.message
    });
  }
});
router.get("/dashboard", auth, async (req, res) => {
  try {
    const doctorId = req.user?.id;

    if (!doctorId) {
      return res.status(400).json({ message: "Doctor ID not found in token" });
    }

    const [[todayCount]] = await pool.query(
      `SELECT COUNT(*) as total
       FROM appointments
       WHERE doctor_id = ?
       AND DATE(appointment_date) = CURDATE()`,
      [doctorId]
    );

    const [[patientCount]] = await pool.query(
      `SELECT COUNT(DISTINCT patient_id) as total
       FROM appointments
       WHERE doctor_id = ?`,
      [doctorId]
    );

    const [[prescriptionCount]] = await pool.query(
      `SELECT COUNT(*) as total
       FROM prescriptions
       WHERE doctor_id = ?`,
      [doctorId]
    );

    const [[revenue]] = await pool.query(
        `SELECT IFNULL(SUM(i.total_amount),0) as total
        FROM invoices i
        JOIN prescriptions p ON i.prescription_id = p.id
        WHERE p.doctor_id = ?`,
        [doctorId]
      );

    const [todayAppointments] = await pool.query(
      `SELECT a.*, p.full_name as patient_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       WHERE a.doctor_id = ?
       AND DATE(a.appointment_date) = CURDATE()
       ORDER BY a.appointment_date ASC`,
      [doctorId]
    );

    res.json({
      success: true,
      stats: {
        todayAppointments: todayCount?.total || 0,
        totalPatients: patientCount?.total || 0,
        totalPrescriptions: prescriptionCount?.total || 0,
        totalRevenue: revenue?.total || 0,
      },
      todayAppointments,
    });

  } catch (err) {
    console.error("🔥 DOCTOR DASHBOARD ERROR:");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("Full Error:", err);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
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