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

    console.log("📥 INVOICE LIST:", { page, limit, search });

    // =========================
    // 1. COUNT
    // =========================
    let countSql = `
      SELECT COUNT(*) as total
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE 1=1
    `;

    let params = [];

    if (search) {
      countSql += ` AND (p.full_name LIKE ? OR p.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0].total;

    // =========================
    // 2. GET INVOICES (NO JOIN ITEMS)
    // =========================
    let dataSql = `
      SELECT 
        i.id,
        i.patient_id,
        i.total_amount,
        i.status,
        i.created_at,
        p.full_name as patient_name,
        p.phone
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE 1=1
    `;

    if (search) {
      dataSql += ` AND (p.full_name LIKE ? OR p.phone LIKE ?)`;
    }

    dataSql += ` ORDER BY i.id DESC LIMIT ? OFFSET ?`;

    const dataParams = search
      ? [...params, limit, offset]
      : [limit, offset];

    const [invoices] = await pool.query(dataSql, dataParams);

    // =========================
    // 3. GET ITEMS (SEPARATE QUERY)
    // =========================
    const invoiceIds = invoices.map(i => i.id);

    let items = [];

    if (invoiceIds.length > 0) {
      const [itemRows] = await pool.query(
        `
        SELECT 
          id,
          invoice_id,
          item_type,
          description,
          quantity,
          unit_price,
          amount
        FROM invoice_items
        WHERE invoice_id IN (?)
        `,
        [invoiceIds]
      );

      items = itemRows;
    }

    // =========================
    // 4. MAP ITEMS TO INVOICE
    // =========================
    const result = invoices.map(inv => ({
      ...inv,
      items: items.filter(i => i.invoice_id === inv.id)
    }));

    // =========================
    // RESPONSE
    // =========================
    res.json({
      success: true,
      data: result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (err) {
    console.log("🔥 INVOICE LIST ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
router.get("/:id", auth, async (req, res) => {
  try {
    const invoiceId = req.params.id;

    console.log("📥 GET INVOICE DETAIL REQUEST:", {
      invoiceId,
    });

    // =========================
    // 1. LẤY INVOICE INFO
    // =========================
    const [invoice] = await pool.query(
      `
      SELECT 
        i.*,
        p.full_name as patient_name,
        p.phone
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE i.id = ?
      `,
      [invoiceId]
    );

    console.log("📄 INVOICE RESULT:", invoice);

    if (!invoice.length) {
      console.log("❌ INVOICE NOT FOUND:", invoiceId);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    // =========================
    // 2. LẤY ITEMS
    // =========================
    const [items] = await pool.query(
      `
      SELECT 
        id,
        item_type,
        description,
        quantity,
        unit_price,
        amount
      FROM invoice_items
      WHERE invoice_id = ?
      `,
      [invoiceId]
    );

    console.log("🧾 ITEMS FOUND:", items.length);
    console.log("📦 ITEMS DATA:", items);

    // =========================
    // 3. TÍNH TỔNG
    // =========================
    const total = items.reduce(
      (sum, i) => sum + Number(i.amount || 0),
      0
    );

    console.log("💰 CALCULATED TOTAL:", total);

    // =========================
    // 4. RESPONSE
    // =========================
    const response = {
      success: true,
      data: {
        info: invoice[0],
        items,
        total,
      },
    };

    console.log("📤 RESPONSE READY:", response);

    res.json(response);

  } catch (err) {
    console.log("🔥 INVOICE DETAIL ERROR:", err);

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

    console.log("📥 CONVERT PRESCRIPTION:", id);

    // =========================
    // 1. LẤY PRESCRIPTION + PATIENT_ID CHUẨN
    // =========================
    const [prescription] = await conn.query(
      `
      SELECT 
        p.*,
        a.patient_id
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.id
      WHERE p.id = ?
      `,
      [id]
    );

    if (!prescription.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn thuốc",
      });
    }

    const pre = prescription[0];

    console.log("📄 PRESCRIPTION:", pre);

    // kiểm tra trạng thái
    if (pre.status === "invoiced") {
      return res.status(400).json({
        success: false,
        message: "Đơn thuốc đã được tạo hóa đơn",
      });
    }

    const patientId = pre.patient_id;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Không xác định được bệnh nhân",
      });
    }

    // =========================
    // 2. LẤY PRESCRIPTION ITEMS
    // =========================
    const [items] = await conn.query(
      `
      SELECT 
        pi.*,
        m.price,
        m.medicine_name
      FROM prescription_items pi
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE pi.prescription_id = ?
      `,
      [id]
    );

    console.log("💊 ITEMS COUNT:", items.length);

    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: "Đơn thuốc không có dữ liệu",
      });
    }

    // =========================
    // 3. TÍNH TỔNG TIỀN
    // =========================
    let total = 0;

    for (let item of items) {
      total += item.price * item.quantity;
    }

    console.log("💰 TOTAL:", total);

    // =========================
    // 4. TẠO INVOICE
    // =========================
    const [invoice] = await conn.query(
      `
      INSERT INTO invoices (patient_id, total_amount, status)
      VALUES (?, ?, 'unpaid')
      `,
      [patientId, total]
    );

    const invoiceId = invoice.insertId;

    console.log("🧾 INVOICE CREATED:", invoiceId);

    // =========================
    // 5. INSERT INVOICE ITEMS
    // =========================
    for (let item of items) {
      await conn.query(
        `
        INSERT INTO invoice_items (
          invoice_id,
          item_type,
          description,
          quantity,
          unit_price,
          amount
        )
        VALUES (?, 'medicine', ?, ?, ?, ?)
        `,
        [
          invoiceId,
          item.medicine_name || "Thuốc",
          item.quantity,
          item.price,
          item.price * item.quantity,
        ]
      );
    }

    console.log("📦 INVOICE ITEMS INSERTED");

    // =========================
    // 6. UPDATE PRESCRIPTION STATUS
    // =========================
    await conn.query(
      `
      UPDATE prescriptions
      SET status = 'approved'
      WHERE id = ?
      `,
      [id]
    );

    // =========================
    // 7. COMMIT
    // =========================
    await conn.commit();

    res.json({
      success: true,
      message: "Tạo hóa đơn thành công",
      invoice_id: invoiceId,
      patient_id: patientId,
      total,
    });

  } catch (err) {
    await conn.rollback();

    console.log("🔥 CONVERT ERROR:", err);

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