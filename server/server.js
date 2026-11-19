import 'dotenv/config'
import http from 'node:http'
import app from './src/app.js'
import { initSockets } from './src/sockets/index.js'
import { startScheduler } from './src/services/sync/scheduler.js'

const PORT = process.env.PORT || 5000

// Express and Socket.IO share one HTTP server, so the browser reaches both at the
// same address (D-66). The sync scheduler runs inside it, which is why the backend
// must stay always on (D-51).
const server = http.createServer(app)
initSockets(server)
startScheduler()

server.listen(PORT, () => { console.log(`Server running on port ${PORT}`) })
