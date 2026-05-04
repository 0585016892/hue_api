const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");


// =======================
// 1️⃣ OVERVIEW TỔNG QUAN
// =======================
router.get("/overview", auth, async (req, res) => {
  try {
    const [
      patients,
      doctors,
      appointments,
      prescriptions,
      invoices,
      revenue,
      medicines,
      lowStock
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM patients"),
      pool.query("SELECT COUNT(*) as total FROM users WHERE role_id=2"),
      pool.query("SELECT COUNT(*) as total FROM appointments"),
      pool.query("SELECT COUNT(*) as total FROM prescriptions"),
      pool.query("SELECT COUNT(*) as total FROM invoices"),
      pool.query("SELECT SUM(total_amount) as total FROM invoices"),
      pool.query("SELECT COUNT(*) as total FROM medicines"),
      pool.query("SELECT COUNT(*) as total FROM medicines WHERE stock < 10"),
    ]);

    res.json({
      success: true,
      data: {
        totalPatients: patients[0][0].total,
        totalDoctors: doctors[0][0].total,
        totalAppointments: appointments[0][0].total,
        totalPrescriptions: prescriptions[0][0].total,
        totalInvoices: invoices[0][0].total,
        totalRevenue: revenue[0][0].total || 0,
        totalMedicines: medicines[0][0].total,
        lowStockMedicines: lowStock[0][0].total,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================
// 2️⃣ DOANH THU 7 NGÀY GẦN NHẤT
// =======================
router.get("/revenue-last-7-days", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        SUM(total_amount) as revenue
      FROM invoices
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================
// 3️⃣ DOANH THU THEO THÁNG (12 THÁNG)
// =======================
router.get("/revenue-by-month", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        MONTH(created_at) as month,
        SUM(total_amount) as revenue
      FROM invoices
      WHERE YEAR(created_at) = YEAR(CURDATE())
      GROUP BY MONTH(created_at)
      ORDER BY month ASC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================
// 4️⃣ BỆNH NHÂN THEO NGÀY
// =======================
router.get("/patients-last-7-days", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total
      FROM patients
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================
// 5️⃣ TOP 5 THUỐC BÁN CHẠY
// =======================
router.get("/top-medicines", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        m.medicine_name,
        SUM(p.quantity) as total_used
      FROM prescriptions p
      JOIN medicines m ON p.medicine_id = m.id
      GROUP BY p.medicine_id
      ORDER BY total_used DESC
      LIMIT 5
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================
// 6️⃣ TOP 5 BÁC SĨ KHÁM NHIỀU NHẤT
// =======================
router.get("/top-doctors", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.full_name,
        COUNT(a.id) as total_appointments
      FROM appointments a
      JOIN users u ON a.doctor_id = u.id
      GROUP BY a.doctor_id
      ORDER BY total_appointments DESC
      LIMIT 5
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================
// 7️⃣ DANH SÁCH THUỐC SẮP HẾT
// =======================
router.get("/low-stock-medicines", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT *
      FROM medicines
      WHERE stock < 10
      ORDER BY stock ASC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================
// 8️⃣ DOANH THU THEO KHOẢNG NGÀY
// =======================
router.get("/revenue-by-range", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        SUM(total_amount) as revenue
      FROM invoices
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [startDate, endDate]);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;