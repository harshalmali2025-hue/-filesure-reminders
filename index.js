const admin = require("firebase-admin");
const twilio = require("twilio");
const nodemailer = require("nodemailer");
const cron = require("node-cron");

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// GST Due Dates
const getDueDates = (year) => {
  const dates = [];
  for (let month = 0; month < 12; month++) {
    dates.push({
      returnName: "GSTR-1",
      date: new Date(year, month, 11),
      label: `GSTR-1 for ${new Date(year, month)
        .toLocaleString("en-IN", { month: "long" })} ${year}`,
    });
    dates.push({
      returnName: "GSTR-3B",
      date: new Date(year, month, 20),
      label: `GSTR-3B for ${new Date(year, month)
        .toLocaleString("en-IN", { month: "long" })} ${year}`,
    });
  }
  dates.push({
    returnName: "GSTR-9",
    date: new Date(year, 11, 31),
    label: `GSTR-9 Annual Return ${year}`,
  });
  return dates;
};

// Send WhatsApp
const sendWhatsApp = async (twilioClient, to, message) => {
  await twilioClient.messages.create({
    from: "whatsapp:+14155238886",
    to: `whatsapp:+91${to}`,
    body: message,
  });
};

// Send Email
const sendEmail = async (transporter, to, subject, message) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: to,
    subject: subject,
    text: message,
  });
};

// Main reminder function
const sendReminders = async () => {
  console.log("Running reminder check:", new Date().toISOString());

  const twilioClient = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_TOKEN
  );

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const today = new Date();
  const year = today.getFullYear();
  const dueDates = getDueDates(year);

  const usersSnap = await admin
    .firestore()
    .collection("users")
    .get();

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    if (!user.whatsappNumber && !user.email) continue;

    for (const due of dueDates) {
      const diffTime = due.date.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
const reminderDays = [];
if (user.reminderSettings?.sevenDay !== false) reminderDays.push(7);
if (user.reminderSettings?.threeDay !== false) reminderDays.push(3);
if (user.reminderSettings?.oneDay !== false) reminderDays.push(1);
reminderDays.push(0);

      if (reminderDays.includes(diffDays)) {
       const dueDateText = diffDays === 0
  ? "is due TODAY ⚠️"
  : `is due in ${diffDays} day${diffDays > 1 ? "s" : ""}`;

const message =
  `Hi ${user.fullName || "there"},\n\n` +
  `FileSure Reminder 🔔\n\n` +
  `${due.label} ${dueDateText}.\n` +
  `Due Date: ${due.date.toLocaleDateString("en-IN")}\n` +
  `Late Fee if Missed: ₹50 per day\n\n` +
  `File now at: https://www.gst.gov.in\n\n` +
  `— FileSure Team`;
        if (
          user.whatsappNumber &&
          user.reminderSettings?.whatsapp !== false
        ) {
          try {
            await sendWhatsApp(
              twilioClient,
              user.whatsappNumber,
              message
            );
            console.log(`WhatsApp sent to ${user.whatsappNumber}`);
          } catch (e) {
            console.log("WhatsApp error:", e.message);
          }
        }

        if (
          user.email &&
          user.reminderSettings?.email !== false
        ) {
          try {
            await sendEmail(
              transporter,
              user.email,
              `FileSure: ${due.label} due in ${diffDays} day${diffDays > 1 ? "s" : ""}`,
              message
            );
            console.log(`Email sent to ${user.email}`);
          } catch (e) {
            console.log("Email error:", e.message);
          }
        }
      }
    }
  }
  console.log("Reminder check complete");
};

// Run every day at 9 AM IST (3:30 AM UTC)
cron.schedule("30 3 * * *", sendReminders);

// Keep server alive on Render
const http = require("http");
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("FileSure reminder server is running");
}).listen(process.env.PORT || 3000);

console.log("FileSure reminder server started");
