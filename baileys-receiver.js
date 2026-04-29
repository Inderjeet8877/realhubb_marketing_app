const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const http = require('http');

const firebase = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount)
});

const db = firebase.firestore();

console.log('🔥 Baileys Receiver Starting...');

// QR Code simple server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
    <body style="font-family: Arial; padding: 40px; text-align: center;">
      <h1>WhatsApp Baileys Receiver</h1>
      <p>Status: <span id="status">Connecting...</span></p>
      <div id="qr" style="margin: 20px;"></div>
      <script>
        async function checkStatus() {
          const res = await fetch('/status');
          const data = await res.json();
          document.getElementById('status').innerText = data.status;
          if (data.qr) {
            document.getElementById('qr').innerHTML = '<img src="' + data.qr + '" />';
          }
        }
        setInterval(checkStatus, 2000);
        checkStatus();
      </script>
    </body>
    </html>
  `);
});

let sock;
let qrData = null;
let status = 'Starting...';

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrData = qr;
      status = 'Scan QR Code';
      console.log('📱 QR Received, scan with your phone');
    }
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed:', lastDisconnect.error?.message);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      status = '✅ Connected! Receiving messages...';
      console.log('✅ WhatsApp Connected!');
    }
  });

  // Listen for messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
        const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const messageText = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         msg.message.imageMessage?.caption ||
                         msg.message.videoMessage?.caption ||
                         '[Media message]';
        
        console.log('📨 Received from', phone + ':', messageText);
        
        // Save to Firestore
        try {
          await db.collection('whatsapp_conversations').add({
            phone: phone,
            name: phone,
            message: messageText,
            direction: 'inbound',
            lastMessage: messageText,
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            unreadCount: 1,
            wamid: msg.key.id,
            msgType: msg.message.conversation ? 'text' : 'media',
            source: 'baileys'
          });
          console.log('✅ Saved to Firestore');
          
          // Send read receipt
          await sock.readMessages([msg.key]);
        } catch (err) {
          console.error('❌ Error saving:', err);
        }
      }
    }
  });
}

server.on('request', (req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: status,
      qr: qrData ? 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrData) : null
    }));
  }
});

server.listen(3001, () => {
  console.log('📡 Server running on http://localhost:3001');
  connectToWhatsApp();
});
