import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

// Live updates (D-10, D-66). The server only says *that* something changed
// ("accounts:changed"); the app then refetches through the normal API. So the socket
// never carries data, and the API stays the one place that decides what a user may see.
//
// Each browser connects with its access token, checked once at the handshake, and
// joins a room for its user, so one user's updates never reach another (D-04).

let io = null
const roomOf = userId => `user:${userId}`

export function initSockets(httpServer){
    io = new Server(httpServer, {
        cors: { origin: process.env.CLIENT_URL, credentials: true },
    })

    io.use((socket, next) => {
        try {
            const payload = jwt.verify(socket.handshake.auth?.token ?? '', process.env.JWT_SECRET)
            if(typeof payload.userId !== 'string' || !payload.userId) throw new Error('no user')
            socket.data.userId = payload.userId
            next()
        } catch {
            // The client refreshes its token and reconnects on this message.
            next(new Error('unauthorized'))
        }
    })

    io.on('connection', socket => { socket.join(roomOf(socket.data.userId)) })
    return io
}

// Safe to call before initSockets (tests, scripts): it does nothing.
export function notifyUser(userId, event, payload = {}){
    io?.to(roomOf(userId)).emit(event, payload)
}
