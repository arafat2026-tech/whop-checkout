require("dotenv").config();
var express = require("express");
var cors = require("cors");
var https = require("https");
var app = express();
app.use(cors());
app.use(express.json());

var S = process.env.SHOPIFY_STORE;
var T = process.env.SHOPIFY_ADMIN_TOKEN;

function callShopify(body, cb) {
  var d = JSON.stringify(body);
  var hostname = S + ".myshopify.com";
  var path = "/admin/api/2024-01/orders.json";
  var o = {
    hostname: hostname,
    path: path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": T,
      "Content-Length": Buffer.byteLength(d)
    }
  };
  var r = https.request(o, function(rs) {
    var x = "";
    rs.on("data", function(c) { x += c; });
    rs.on("end", function() { cb(null, JSON.parse(x)); });
  });
  r.on("error", cb);
  r.write(d);
  r.end();
}

app.post("/api/sync-order", function(req, res) {
  var p = req.body;
  var a = p.shipping_address;
  if (!a) a = {};
  var order = {
    order: {
      email: p.email,
      financial_status: "paid",
      currency: "CAD",
      source_name: "whop",
      tags: "whop",
      send_receipt: true,
      line_items: [{ title: "Nike Air Jordan 1", quantity: 1, price: p.total_price || "149.99" }],
      shipping_address: a,
      billing_address: a,
      transactions: [{ kind: "sale", status: "success", amount: p.total_price || "149.99", gateway: "whop" }]
    }
  };
  callShopify(order, function(e, data) {
    if (e) return res.status(500).json({ error: e.message });
    if (data.order) {
      console.log("Order created:", data.order.name);
      res.json({ success: true, order: data.order.name, id: data.order.id });
    } else {
      console.log("Shopify error:", JSON.stringify(data));
      res.status(400).json(data);
    }
  });
});

// Whop webhook — auto-sync when someone buys on Whop
app.post("/api/whop-webhook", function(req, res) {
  var data = req.body;
  console.log("Whop webhook received:", data.event || data.type || "unknown");
  if (data.event === "payment.succeeded" || data.event === "membership.went_valid") {
    var user = data.data || data;
    var addr = {
      first_name: user.user ? user.user.name || "" : "",
      last_name: "",
      address1: "",
      city: "",
      province: "",
      zip: "",
      country: "CA"
    };
    var email = user.user ? user.user.email || "" : (user.email || "");
    var amount = user.total || user.amount || "149.99";
    var order = {
      order: {
        email: email,
        financial_status: "paid",
        currency: "CAD",
        source_name: "whop",
        tags: "whop",
        note: "Auto-synced from Whop",
        send_receipt: true,
        line_items: [{ title: "Nike Air Jordan 1", quantity: 1, price: amount }],
        shipping_address: addr,
        billing_address: addr,
        transactions: [{ kind: "sale", status: "success", amount: amount, gateway: "whop" }]
      }
    };
    callShopify(order, function(e, result) {
      if (e) return console.error("Shopify error:", e.message);
      console.log("Shopify order created from Whop:", result.order ? result.order.name : "error");
    });
  }
  res.json({ received: true });
});

// Serve checkout page
var path = require("path");
app.use(express.static(path.join(__dirname)));
app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", function(req, res) {
  res.json({ status: "ok", store: S, time: new Date().toISOString() });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("READY on port " + PORT);
  console.log("Checkout: https://whop-checkout-production-bf20.up.railway.app");
  console.log("Health: https://whop-checkout-production-bf20.up.railway.app/api/health");
});
