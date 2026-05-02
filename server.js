const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");

const app = express();

// ================= FIREBASE INIT =================
let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error("❌ Invalid FIREBASE_SERVICE_ACCOUNT JSON");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ================= MIDDLEWARE =================
// raw body ONLY for webhook
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.static("public"));

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;

// ================= CREATE CHECKOUT =================
app.post("/create-checkout", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).send("Missing userId");
    }

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

// ================= PAYMONGO API VERIFICATION =================
async function verifyPaymentWithPayMongo(checkoutSessionId) {
  try {
    const response = await axios.get(
      `https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}`,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(PAYMONGO_SECRET + ":").toString("base64")
        }
      }
    );

    const data = response.data.data;

    return data.attributes.status === "paid";
  } catch (err) {
    console.error("❌ PayMongo verification failed:", err.message);
    return false;
  }
}

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    const type = event?.data?.attributes?.type;

    if (type !== "checkout_session.payment.paid") {
      return res.sendStatus(200);
    }

    console.log("📩 Payment webhook received");

    // ================= GET DATA =================
    const metadata =
      event?.data?.attributes?.data?.attributes?.metadata ||
      event?.data?.attributes?.data?.metadata;

    const checkoutSessionId =
      event?.data?.attributes?.data?.id ||
      event?.data?.id;

    const userId = metadata?.userId;

    if (!userId) {
      console.log("⚠️ Missing userId");
      return res.sendStatus(200);
    }

    // ================= ANTI-FRAUD CHECK =================
    const isPaid = await verifyPaymentWithPayMongo(checkoutSessionId);

    if (!isPaid) {
      console.log("🚫 Payment NOT verified by PayMongo");
      return res.sendStatus(200);
    }

    // ================= FIREBASE UNLOCK =================
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();

    if (doc.exists && doc.data().isPremium) {
      console.log("ℹ️ User already premium:", userId);
      return res.sendStatus(200);
    }

    await userRef.set(
      {
        isPremium: true,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        lastCheckoutSession: checkoutSessionId
      },
      { merge: true }
    );

    console.log("🔥 USER UNLOCKED:", userId);

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.sendStatus(200);
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
