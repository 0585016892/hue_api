require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/patients", require("./routes/patients"));
app.use("/api/medicines", require("./routes/medicines"));
app.use("/api/appointments", require("./routes/appointments"));
app.use("/api/prescriptions", require("./routes/prescriptions"));
app.use("/api/invoices", require("./routes/invoices"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/doctors", require("./routes/doctors"));
app.use("/api/user", require("./routes/user"));
app.use("/api/salary", require("./routes/salary"));
app.use("/api/medical-supplies", require("./routes/medicalSupply.routes"));
app.use("/api/chatbot", require("./routes/chatbot"));
app.use("/api/beds", require("./routes/bedRoutes"));

// test server
app.get("/", (req, res) => {
  res.json({ message: "Hospital API running 🚀" });
});

// start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});