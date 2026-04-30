const express = require("express");
const app = express();
const path = require("path");

app.use(express.json());

// serve frontend
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 👉 DITO MO ILALAGAY
app.post("/webhook", (req, res) => {
  const event = req.body;

  console.log("Webhook received:", JSON.stringify(event, null, 2));

  if (event.data && event.data.attributes.type === "payment.paid") {
    console.log("✅ Payment successful!");
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
