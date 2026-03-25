const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const database = require('./config/database');
const { setupChatSocket } = require('./socketio/chat.socket');
const { prewarmOpenClipWorker } = require('./services/catalog/openClip.service.js');
const { createApp } = require('./app/create-app');

const port = process.env.PORT;
database.connect();

const app = createApp();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
});

setupChatSocket(io);

httpServer.listen(port, () => {
  console.log(`Example app listening on port ${port}`);

  // Warm OpenCLIP worker in background so first image-search request is faster.
  setImmediate(async () => {
    try {
      const prewarm = await prewarmOpenClipWorker();
      if (prewarm && prewarm.ok) {
        console.log(`OpenCLIP prewarm ready (${prewarm.pythonBin})`);
      } else {
        console.warn('OpenCLIP prewarm skipped/fail:', prewarm);
      }
    } catch (error) {
      console.warn('OpenCLIP prewarm failed:', error && error.message ? error.message : error);
    }
  });
});
