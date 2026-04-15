const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");
router.post("/", auth, async (req, res) => {
  try {
    const { appointment_id } = req.body;

    // ❌ check appointment
    const [app] = await pool.query(
      `SELECT * FROM appointments WHERE id = ?`,
      [appointment_id]
    );

    if (app.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiếu khám",
      });
    }

    if (app[0].status !== "Đã khám") {
      return res.status(400).json({
        success: false,
        message: "Bệnh nhân chưa được khám xong",
      });
    }

    // 💊 lấy tổng tiền thuốc
    const [med] = await pool.query(
      `SELECT SUM(total_price) as medicine_total 
       FROM prescriptions 
       WHERE appointment_id = ?`,
      [appointment_id]
    );

    const medicine_total = med[0].medicine_total || 0;

    const examination_fee = 100000; // 💡 phí khám cố định
    const total_amount = examination_fee + medicine_total;

    // ❌ check đã tạo hóa đơn chưa
    const [exist] = await pool.query(
      `SELECT id FROM invoices WHERE appointment_id = ?`,
      [appointment_id]
    );

    if (exist.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Hóa đơn đã tồn tại",
      });
    }

    // 💰 insert invoice
    await pool.query(
      `INSERT INTO invoices 
      (appointment_id, examination_fee, medicine_total, total_amount)
      VALUES (?, ?, ?, ?)`,
      [appointment_id, examination_fee, medicine_total, total_amount]
    );

    res.json({
      success: true,
      message: "Thanh toán thành công",
      data: {
        examination_fee,
        medicine_total,
        total_amount,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get("/", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let baseSql = `
      FROM invoices i
      JOIN prescriptions pr ON i.prescription_id = pr.id
      JOIN appointments a ON pr.appointment_id = a.id
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON pr.doctor_id = u.id
      WHERE 1=1
    `;

    let params = [];

    // 🔍 search patient
    if (search) {
      baseSql += ` AND (p.full_name LIKE ? OR u.full_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
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
        i.*,
        pr.id as prescription_id,
        p.full_name as patient_name,
        u.full_name as doctor_name,
        a.symptoms,
        a.diagnosis
      ${baseSql}
      ORDER BY i.id DESC
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
    const [invoice] = await pool.query(
      `
      SELECT 
        i.*,
        p.full_name as patient_name,
        p.phone,
        u.full_name as doctor_name,
        a.symptoms,
        a.diagnosis,
        pr.id as prescription_id
      FROM invoices i
      JOIN prescriptions pr ON i.prescription_id = pr.id
      JOIN appointments a ON pr.appointment_id = a.id
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON pr.doctor_id = u.id
      WHERE i.id = ?
      `,
      [req.params.id]
    );

    if (!invoice.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    const [items] = await pool.query(
      `
      SELECT 
        pi.quantity,
        pi.price,
        m.medicine_name,
        m.price as unit_price
      FROM prescription_items pi
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE pi.prescription_id = ?
      `,
      [invoice[0].prescription_id]
    );

    res.json({
      success: true,
      data: {
        info: invoice[0],
        items,
        total: items.reduce(
          (sum, i) => sum + i.price,
          0
        ),
      },
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
    const [check] = await pool.query(
      "SELECT id FROM invoices WHERE id = ?",
      [req.params.id]
    );

    if (check.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tồn tại hóa đơn",
      });
    }

    await pool.query("DELETE FROM invoices WHERE id = ?", [
      req.params.id,
    ]);

    res.json({
      success: true,
      message: "Xoá hóa đơn thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
   router.post("/convert-invoice/:id", auth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const { id } = req.params;

    // 1. check prescription tồn tại + trạng thái
    const [prescription] = await conn.query(
      `SELECT * FROM prescriptions WHERE id = ?`,
      [id]
    );

    if (!prescription.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn thuốc",
      });
    }

    if (prescription[0].status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Đơn thuốc đã được tạo hóa đơn",
      });
    }

    // 2. lấy items
    const [items] = await conn.query(
      `
      SELECT pi.*, m.price
      FROM prescription_items pi
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE pi.prescription_id = ?
      `,
      [id]
    );

    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: "Đơn thuốc không có dữ liệu",
      });
    }

    // 3. tính tổng tiền
    let total = 0;

    for (let item of items) {
      total += item.price * item.quantity;
    }

    // 4. tạo invoice
    const [invoice] = await conn.query(
      `
      INSERT INTO invoices (prescription_id, total_amount, status)
      VALUES (?, ?, 'pending')
      `,
      [id, total]
    );

    // 5. UPDATE prescription status 🔥
    await conn.query(
      `
      UPDATE prescriptions
      SET status = 'approved'
      WHERE id = ?
      `,
      [id]
    );

    await conn.commit();

    res.json({
      success: true,
      message: "Tạo hóa đơn thành công",
      invoice_id: invoice.insertId,
      total,
    });
  } catch (err) {
    await conn.rollback();

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    conn.release();
  }
});
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM invoices WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    await pool.query(
      `UPDATE invoices SET status = ? WHERE id = ?`,
      [status, id]
    );

    res.json({
      success: true,
      message: "Cập nhật trạng thái hóa đơn thành công",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
module.exports = router;