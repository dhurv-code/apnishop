/**
 * ApnaBasket OTP email relay for Google Apps Script.
 * Deploy as a Web App: Execute as Me; access: Anyone.
 * Keep the shared secret in Script Properties, never in this source file.
 */

const SECRET_PROPERTY = "APNABASKET_WEBHOOK_SECRET";

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents
      ? e.postData.contents
      : "{}";
    const data = JSON.parse(raw);

    const expectedSecret = PropertiesService
      .getScriptProperties()
      .getProperty(SECRET_PROPERTY);
    const suppliedSecret = String(data.secret || "");

    if (!expectedSecret || !constantTimeEquals(suppliedSecret, expectedSecret)) {
      return jsonResponse({ success: false, message: "Unauthorized." });
    }

    const email = String(data.email || "").trim().toLowerCase();
    const otp = String(data.otp || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ success: false, message: "Invalid recipient email." });
    }

    if (!/^\d{6}$/.test(otp)) {
      return jsonResponse({ success: false, message: "Invalid OTP format." });
    }

    if (MailApp.getRemainingDailyQuota() < 1) {
      return jsonResponse({ success: false, message: "Daily email quota exhausted." });
    }

    MailApp.sendEmail({
      to: email,
      subject: "Your ApnaBasket login code",
      body:
        "Your ApnaBasket verification code is " + otp +
        ". It is valid for 5 minutes. Do not share this code with anyone.",
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">' +
        '<h2 style="color:#087b3c">ApnaBasket</h2>' +
        '<p>Your sign-in verification code is:</p>' +
        '<p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#087b3c">' + otp + '</p>' +
        '<p>This code expires in <strong>5 minutes</strong>.</p>' +
        '<p>Do not share this code with anyone. ApnaBasket support will never ask you for it.</p>' +
        '</div>',
      name: "ApnaBasket"
    });

    return jsonResponse({ success: true, message: "OTP email sent." });
  } catch (err) {
    // Do not log the OTP, recipient, or shared secret.
    console.error("ApnaBasket OTP email relay failed: " + String(err && err.message ? err.message : err));
    return jsonResponse({ success: false, message: "Email delivery failed." });
  }
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
