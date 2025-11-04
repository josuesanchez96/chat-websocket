import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv' //se importa dotenv para leer las variables de entorno
import { createClient } from '@libsql/client'

import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()

const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

const db = createClient({
    url: 'libsql://solid-secret-josuedsanchez.aws-us-east-2.turso.io',
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
    )
    `)

io.on('connection', async (socket) => {
    console.log('a user has connected!')

    const username = socket.handshake?.auth?.username ?? 'anonymous'

    // indicador escribiendo...
    //recibe el cliente y retransmite a los demás 
    socket.on('typing', (payload) => {
        const typing = !!payload?.typing
        socket.broadcast.emit('typing', {username, typing})
    })

    socket.on('disconnect', () => {
        console.log('an user has disconnected')
    })

    socket.on('chat message', async (msg) => {
        let result
        const uname = username
        console.log({ username: uname })
        try {
            result = await db.execute({
                sql: `INSERT INTO messages (content, user) VALUES (:msg, :username)`,
                args: { msg, username }
            })
        } catch (e){
            console.error('DB insert error: ',e)
            return
        }

    io.emit('chat message', msg, result.lastInsertRowid.toString(), uname)
    })

    if (!socket.recovered){ //para recuperar los mensajes sin conexión
        try {
            const results = await db.execute({
                sql: 'SELECT id, content, user FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })
            
            results.rows.forEach(row => {
                socket.emit('chat message', row.content, row.id.toString(), row.user)
            })
        } catch (e) {
            console.error('Recovery error: ',e)
        }
    }

})

app.use(logger('dev'))

app.get('/', (req, rest) => {
    rest.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
    console.log(`Server running on port ${port}`)
})