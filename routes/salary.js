const express = require("express");
const router = express.Router();
const db = require("../config/db");
const ExcelJS = require("exceljs");


// =======================================
// 1. LẤY DANH SÁCH LƯƠNG (PHÂN TRANG)
// =======================================
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const month = req.query.month;

    let where = "";
    let params = [];

    if (month) {
      where = "WHERE s.month = ?";
      params.push(month);
    }

    // ================= LIST DATA =================
    const [rows] = await db.query(
      `SELECT s.*, d.full_name,
              (s.base_salary + s.bonus) as total
       FROM salary s
       JOIN users d ON s.doctor_id = d.id
       ${where}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // ================= COUNT =================
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM salary s ${where}`,
      params
    );

    // ================= SUMMARY =================
    const [summaryResult] = await db.query(
      `SELECT 
          SUM(base_salary) as total_base_salary,
          SUM(bonus) as total_bonus,
          SUM(base_salary + bonus) as grand_total
       FROM salary s
       ${where}`,
      params
    );

    res.json({
      data: rows,
      total: countResult[0].total,
      summary: summaryResult[0], // 👈 THÊM CÁI NÀY
    });

  } catch (error) {
    console.error("Lỗi API salary:", error);
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
});


// =======================================
// 2. TỔNG LƯƠNG TOÀN BỆNH VIỆN
// =======================================
router.get("/summary", async (req, res) => {
  try {
    const { month } = req.query;

    let where = "WHERE 1=1";
    let params = [];

    if (month) {
      where += " AND month = ?";
      params.push(month);
    }

    const sql = `
      SELECT 
        SUM(base_salary) as total_base_salary,
        SUM(bonus) as total_bonus,
        SUM(base_salary + bonus) as grand_total
      FROM salary
      ${where}
    `;

    const [rows] = await db.query(sql, params);

    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// =======================================
// 3. THÊM LƯƠNG (KHÔNG TRÙNG THÁNG)
// =======================================
router.post("/", async (req, res) => {
  try {
    const { doctor_id, month, base_salary, bonus } = req.body;

    const [exist] = await db.query(
      "SELECT * FROM salary WHERE doctor_id=? AND month=?",
      [doctor_id, month]
    );

    if (exist.length > 0) {
      return res.status(400).json({ message: "Đã tồn tại lương tháng này" });
    }

    await db.query(
      "INSERT INTO salary (doctor_id, month, base_salary, bonus) VALUES (?, ?, ?, ?)",
      [doctor_id, month, base_salary, bonus]
    );

    res.json({ message: "Thêm thành công" });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// =======================================
// 4. CẬP NHẬT
// =======================================
router.put("/:id", async (req, res) => {
  try {
    const { base_salary, bonus } = req.body;

    await db.query(
      "UPDATE salary SET base_salary=?, bonus=? WHERE id=?",
      [base_salary, bonus, req.params.id]
    );

    res.json({ message: "Cập nhật thành công" });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// =======================================
// 5. XOÁ
// =======================================
router.delete("/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM salary WHERE id=?", [req.params.id]);

    res.json({ message: "Xoá thành công" });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// =======================================
// 6. DANH SÁCH BÁC SĨ
// =======================================
router.get("/doctors", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, full_name FROM users WHERE role_id=2"
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// =======================================
// 7. EXPORT EXCEL
// =======================================
router.get("/export", async (req, res) => {
  try {
    const { month } = req.query;

    let where = "WHERE u.role_id = 2";
    let params = [];

    if (month) {
      where += " AND s.month = ?";
      params.push(month);
    }

    const sql = `
      SELECT u.full_name, s.month, s.base_salary, s.bonus,
             (s.base_salary + s.bonus) as total
      FROM salary s
      JOIN users u ON u.id = s.doctor_id
      ${where}
    `;

    const [rows] = await db.query(sql, params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Bảng lương");

    worksheet.columns = [
      { header: "Bác sĩ", key: "full_name", width: 25 },
      { header: "Tháng", key: "month", width: 15 },
      { header: "Lương cơ bản", key: "base_salary", width: 20 },
      { header: "Thưởng", key: "bonus", width: 20 },
      { header: "Tổng", key: "total", width: 20 },
    ];

    rows.forEach((row) => {
      worksheet.addRow(row);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=bang_luong.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    res.status(500).json({ message: "Xuất Excel thất bại" });
  }
});


// =======================================
// 8. THỐNG KÊ BIỂU ĐỒ THEO THÁNG
// =======================================
router.get("/chart", async (req, res) => {
  try {
    const sql = `
      SELECT month,
             SUM(base_salary + bonus) as total_salary
      FROM salary
      GROUP BY month
      ORDER BY month ASC
    `;

    const [rows] = await db.query(sql);

    res.json(rows);

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;