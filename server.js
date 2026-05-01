const express = require("express");
const axios = require("axios");
const path = require("path");
const admin = require("firebase-admin");

const app = express();

// 🔥 Firebase Admin init
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ⚠️ IMPORTANT: PayMongo needs raw body for webhook
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.static("public"));

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;

// ============================
// CREATE CHECKOUT
// ============================
app.post("/create-checkout", async (req, res) => {
  try {
    const { userId } = req.body;

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
            cancel_url: "https://deegees.onrender.com/unlockv2.html",
            metadata: {
              userId: userId
            }
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
    res.status(500).send("Checkout error");
  }
});

// ============================
// WEBHOOK (PAYMENT CONFIRMATION)
// ============================
app.post("/webhook", async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    const type = event.data.attributes.type;

    if (type === "checkout_session.payment.paid") {
      console.log("✅ Payment confirmed!");

      const userId =
        event.data.attributes.data.attributes.metadata.userId;

      if (userId) {
        await db.collection("users").doc(userId).update({
          isPremium: true,
          paidAt: new Date()
        });

        console.log("🔥 User upgraded to premium:", userId);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// ============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
