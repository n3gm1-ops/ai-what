const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const qrcode = require('qrcode');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

// 1. Firebase Setup
if (!admin.apps.length) {
    admin.initializeApp({
        databaseURL: process.env.FIREBASE_DB_URL
    });
}
const db = admin.database();

// 2. Gemini Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "أنت المساعد الذكي لبراند (طلة - Talla). رد بلهجة مصرية ودودة جداً. ساعد العميلات في اختيار الملابس والمقاسات. هدفك هو تحويل الاستفسار إلى عملية بيع ناجحة."
});

// 3. WhatsApp Setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let lastQr = "";

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Talla AI Dashboard</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; text-align: center; background: #f4f7f6; padding: 50px; }
                .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: inline-block; min-width: 300px; }
                #status { font-weight: bold; margin-bottom: 20px; }
                img { margin-top: 20px; max-width: 250px; }
                .online { color: green; }
                .offline { color: orange; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>لوحة تحكم بوت طلة AI</h2>
                <div id="status" class="offline">جاري التحميل...</div>
                <div id="qr-container"></div>
            </div>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const statusDiv = document.getElementById('status');
                const qrContainer = document.getElementById('qr-container');

                socket.on('qr', (url) => {
                    statusDiv.innerText = "برجاء مسح الرمز للربط";
                    statusDiv.className = "offline";
                    qrContainer.innerHTML = '<img src="' + url + '" />';
                });

                socket.on('ready', () => {
                    statusDiv.innerText = "البوت متصل ويعمل الآن ✅";
                    statusDiv.className = "online";
                    qrContainer.innerHTML = "";
                });
            </script>
        </body>
        </html>
    `);
});

client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        lastQr = url;
        io.emit('qr', url);
    });
});

client.on('ready', () => {
    io.emit('ready');
    console.log('Client is ready!');
});

client.on('message', async (msg) => {
    if (msg.from.includes('@g.us')) return;
    try {
        const result = await model.generateContent(msg.body);
        const response = await result.response;
        const botReply = response.text();

        // Save to Firebase
        const phone = msg.from.replace('@c.us', '');
        db.ref('talla_chats/' + phone).push({
            timestamp: Date.now(),
            user: msg.body,
            bot: botReply
        });

        await msg.reply(botReply);
    } catch (e) { console.error(e); }
});

client.initialize();
server.listen(port, () => {
    console.log('Dashboard available at http://localhost:' + port);
});
