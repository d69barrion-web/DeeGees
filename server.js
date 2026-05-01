const express = require("express");
const axios = require("axios");
const app = express();
const path = require("path");

app.use(express.json());

// serve frontend
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;
// 🔥 CREATE CHECKOUT SESSION
app.post("/create-checkout", async (req, res) => {
  try {
    const response = await axios.post(
      "https://api.paymongo.com/v1/checkout_sessions",
      {
        data: {
          attributes: {
            line_items: [
              {
                name: "Premium Access",
                amount: 4900,
                currency: "PHP",
                quantity: 1
              }
            ],
            payment_method_types: ["gcash", "card"],
            success_url: "https://deegees.onrender.com/success.html",
            cancel_url: "https://deegees.onrender.com/unlock.html"
          }
        }
      },
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(PAYMONGO_SECRET + ":").toString("base64"),
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      checkout_url: response.data.data.attributes.checkout_url
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error creating checkout");
  }
});

// 🔥 WEBHOOK (FIXED)
app.post("/webhook", (req, res) => {
  const event = req.body;

  console.log("Webhook received:", JSON.stringify(event, null, 2));

  if (
    event.data &&
    event.data.attributes.type === "checkout_session.payment.paid"
  ) {
    console.log("✅ Payment successful!");

    // 👉 dito mo ilalagay Firestore update later
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
