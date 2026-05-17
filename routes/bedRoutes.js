const express = require("express");
const router = express.Router();
const db = require("../config/db");


// ===============================
// 📌 LẤY TẤT CẢ GIƯỜNG
// ===============================
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT b.*, r.room_name, w.name AS ward_name
      FROM beds b
      JOIN rooms r ON b.room_id = r.id
      JOIN wards w ON r.ward_id = w.id
      ORDER BY b.id DESC
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ===============================
// 📌 LẤY GIƯỜNG THEO TRẠNG THÁI
// ===============================
router.get("/status/:status", async (req, res) => {
  try {
    const { status } = req.params;

    const [rows] = await db.query(`
      SELECT b.*, r.room_name, w.name AS ward_name
      FROM beds b
      JOIN rooms r ON b.room_id = r.id
      JOIN wards w ON r.ward_id = w.id
      WHERE b.status = ?
    `, [status]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===============================
// 📌 THÊM GIƯỜNG
// ===============================
router.post("/", async (req, res) => {
  try {
    const { room_id, bed_code, status } = req.body;

    await db.query(
      "INSERT INTO beds (room_id, bed_code, status) VALUES (?, ?, ?)",
      [room_id, bed_code, status || "empty"]
    );

    res.json({ message: "Tạo giường thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ===============================
// 📌 CẬP NHẬT GIƯỜNG
// ===============================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { bed_code, status } = req.body;

    await db.query(
      "UPDATE beds SET bed_code=?, status=? WHERE id=?",
      [bed_code, status, id]
    );

    res.json({ message: "Cập nhật giường thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ===============================
// 📌 XOÁ GIƯỜNG
// ===============================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.query("DELETE FROM beds WHERE id=?", [id]);

    res.json({ message: "Xoá giường thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ===============================
// 📌 GÁN BỆNH NHÂN VÀO GIƯỜNG
// ===============================
router.post("/assign", async (req, res) => {
  try {
    const { bed_id, patient_id } = req.body;

    // check giường
    const [bed] = await db.query(
      "SELECT * FROM beds WHERE id=?",
      [bed_id]
    );

    if (!bed.length || bed[0].status !== "empty") {
      return res.status(400).json({ message: "Giường không khả dụng" });
    }

    // tạo phân giường
    await db.query(
      "INSERT INTO bed_assignments (bed_id, patient_id, status) VALUES (?, ?, 'active')",
      [bed_id, patient_id]
    );

    // update trạng thái giường
    await db.query(
      "UPDATE beds SET status='occupied' WHERE id=?",
      [bed_id]
    );

    res.json({ message: "Gán giường thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ===============================
// 📌 TRẢ GIƯỜNG (XUẤT VIỆN)
// ===============================
router.post("/release/:id", async (req, res) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const { id } = req.params;

    console.log("🟡 RELEASE BED_ID:", id);

    // =========================
    // 1. GET ACTIVE ASSIGNMENT
    // =========================
    const [rows] = await conn.query(
      `
      SELECT ba.*, b.bed_code, b.room_id
      FROM bed_assignments ba
      JOIN beds b ON ba.bed_id = b.id
      WHERE ba.bed_id = ? AND ba.status = 'active'
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Giường chưa có bệnh nhân",
      });
    }

    const data = rows[0];

    console.log("📌 ASSIGNMENT:", data);

    // =========================
    // 2. CALCULATE DAYS
    // =========================
    const start = new Date(data.admitted_at);
    const end = new Date();

    const days = Math.max(
      1,
      Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    );

    const pricePerDay = 200000;
    const total = days * pricePerDay;

    console.log("💰 TOTAL:", total);

    // =========================
    // 3. FIND EXISTING INVOICE (UNPAID)
    // =========================
    const [existingInvoice] = await conn.query(
      `
      SELECT * FROM invoices
      WHERE patient_id = ? AND status = 'unpaid'
      LIMIT 1
      `,
      [data.patient_id]
    );

    let invoiceId;

    // =========================
    // 4. CREATE OR USE INVOICE
    // =========================
    if (existingInvoice.length) {
      invoiceId = existingInvoice[0].id;

      console.log("♻ REUSE INVOICE:", invoiceId);

      // update total
      await conn.query(
        `
        UPDATE invoices
        SET total_amount = total_amount + ?
        WHERE id = ?
        `,
        [total, invoiceId]
      );
    } else {
      const [invoice] = await conn.query(
        `
        INSERT INTO invoices (patient_id, total_amount, status)
        VALUES (?, ?, 'unpaid')
        `,
        [data.patient_id, total]
      );

      invoiceId = invoice.insertId;

      console.log("🧾 NEW INVOICE:", invoiceId);
    }

    // =========================
    // 5. INSERT INVOICE ITEM
    // =========================
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
      VALUES (?, 'bed', ?, ?, ?, ?)
      `,
      [
        invoiceId,
        `Tiền giường ${days} ngày`,
        days,
        pricePerDay,
        total,
      ]
    );

    console.log("📄 INVOICE ITEM INSERTED");

    // =========================
    // 6. UPDATE ASSIGNMENT
    // =========================
    await conn.query(
      `
      UPDATE bed_assignments
      SET status='done', discharged_at=NOW()
      WHERE id=?
      `,
      [data.id]
    );

    // =========================
    // 7. UPDATE BED
    // =========================
    await conn.query(
      `
      UPDATE beds
      SET status='empty'
      WHERE id=?
      `,
      [id]
    );

    await conn.commit();

    console.log("✅ DONE");

    res.json({
      message: "Trả giường + cập nhật hóa đơn thành công",
      invoice_id: invoiceId,
      total,
      days,
    });

  } catch (err) {
    await conn.rollback();

    console.log("🔥 ERROR:", err);

    res.status(500).json({
      message: err.message,
    });

  } finally {
    conn.release();
  }
});

// ===============================
// 📌 DANH SÁCH GIƯỜNG ĐANG DÙNG
// ===============================
router.get("/occupied", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ba.*, p.full_name, b.bed_code, r.room_name
      FROM bed_assignments ba
      JOIN patients p ON ba.patient_id = p.id
      JOIN beds b ON ba.bed_id = b.id
      JOIN rooms r ON b.room_id = r.id
      WHERE ba.status='active'
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(`
      SELECT b.*, r.room_name, w.name AS ward_name
      FROM beds b
      JOIN rooms r ON b.room_id = r.id
      JOIN wards w ON r.ward_id = w.id
      WHERE b.id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Không tìm thấy giường" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get("/stats/summary", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        COUNT(*) AS total_beds,
        SUM(CASE WHEN status='empty' THEN 1 ELSE 0 END) AS empty_beds,
        SUM(CASE WHEN status='occupied' THEN 1 ELSE 0 END) AS occupied_beds,
        SUM(CASE WHEN status='maintenance' THEN 1 ELSE 0 END) AS maintenance_beds
      FROM beds
    `);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;