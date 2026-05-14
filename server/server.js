/* eslint-disable @typescript-eslint/no-require-imports */
const { Server } = require('socket.io')

const PORT = Number(process.env.SOCKET_PORT || 4000)
const CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN || '*'
const ROOM_ID_PATTERN = /^[A-Z0-9]{6}$/
const MAX_USERNAME_LENGTH = 32
const MAX_TEXT_LENGTH = 5000
const MIN_TEXT_LENGTH = 20
const PROGRESS_UPDATE_INTERVAL_MS = 100

const io = new Server(PORT, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
})

// Store room state
// rooms = { [roomId]: { players: { [socketId]: { id, username, wpm, progress, correctChars } }, status: 'waiting' | 'playing' | 'finished', config } }
const rooms = new Map()

function emitError(socket, message) {
  socket.emit('error', { message })
}

function sanitizeUsername(username) {
  if (typeof username !== 'string') return null
  const trimmed = username.trim()
  if (!trimmed || trimmed.length > MAX_USERNAME_LENGTH) return null
  return trimmed
}

function normalizeRoomId(roomId) {
  if (typeof roomId !== 'string') return null
  const normalized = roomId.trim().toUpperCase()
  return ROOM_ID_PATTERN.test(normalized) ? normalized : null
}

function sanitizeConfig(config) {
  if (!config || typeof config !== 'object') return null
  if (typeof config.text !== 'string') return null

  const text = config.text.trim()
  if (text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) {
    return null
  }

  const mode = config.mode === 'time' ? 'time' : 'race'
  const timeLimit = Number(config.timeLimit)
  const safeTimeLimit =
    Number.isInteger(timeLimit) && timeLimit >= 15 && timeLimit <= 300
      ? timeLimit
      : 60
  const difficulty = ['easy', 'medium', 'hard'].includes(config.difficulty)
    ? config.difficulty
    : 'medium'
  const language =
    typeof config.language === 'string' && config.language.length <= 40
      ? config.language
      : 'english'

  return {
    mode,
    timeLimit: safeTimeLimit,
    difficulty,
    text,
    language,
    isPrivate: Boolean(config.isPrivate),
  }
}

function clampNumber(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

// Helper to broadcast room list
const broadcastRooms = () => {
  const publicRooms = []
  rooms.forEach((room) => {
    if (room.status === 'waiting' && !room.config?.isPrivate) {
      publicRooms.push({
        id: room.id,
        host: room.players[room.host]?.username || 'Unknown',
        mode: room.config?.mode || 'race',
        difficulty: room.config?.difficulty || 'medium',
        playerCount: Object.keys(room.players).length,
        isPrivate: false,
        config: {
          mode: room.config?.mode || 'race',
          timeLimit: room.config?.timeLimit || 60,
          difficulty: room.config?.difficulty || 'medium',
          language: room.config?.language || 'english',
          isPrivate: false,
        },
      })
    }
  })
  console.log('Broadcasting rooms:', publicRooms)
  io.emit('rooms_update', publicRooms)
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  socket.on('get_rooms', () => {
    broadcastRooms()
  })

  socket.on('create_room', ({ username, config }) => {
    const safeUsername = sanitizeUsername(username)
    const safeConfig = sanitizeConfig(config)

    if (!safeUsername || !safeConfig) {
      emitError(socket, 'Invalid room config')
      return
    }

    let roomId
    do {
      roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    } while (rooms.has(roomId))

    rooms.set(roomId, {
      id: roomId,
      players: {
        [socket.id]: {
          id: socket.id,
          username: safeUsername,
          wpm: 0,
          progress: 0,
          correctChars: 0,
          ready: false,
        },
      },
      status: 'waiting',
      config: safeConfig,
      host: socket.id,
      countdown: null,
      timer: null,
    })

    socket.join(roomId)
    socket.emit('room_created', {
      roomId,
      players: rooms.get(roomId).players,
      config: rooms.get(roomId).config,
    })
    console.log(`Room ${roomId} created by ${safeUsername}`)
    broadcastRooms()
  })

  socket.on('join_room', ({ roomId, username }) => {
    const safeRoomId = normalizeRoomId(roomId)
    const safeUsername = sanitizeUsername(username)

    if (!safeRoomId || !safeUsername) {
      emitError(socket, 'Invalid room request')
      return
    }

    const room = rooms.get(safeRoomId)

    if (!room) {
      emitError(socket, 'Room not found')
      return
    }

    if (Object.keys(room.players).length >= 2) {
      emitError(socket, 'Room is full')
      return
    }

    if (room.status !== 'waiting') {
      emitError(socket, 'Game already started')
      return
    }

    room.players[socket.id] = {
      id: socket.id,
      username: safeUsername,
      wpm: 0,
      progress: 0,
      correctChars: 0,
      ready: false,
    }
    socket.join(safeRoomId)

    // IMPORTANT: Send full state to the new joiner so they see the Host
    socket.emit('room_joined', {
      roomId: safeRoomId,
      players: room.players,
      config: room.config,
    })

    // Notify others
    io.to(safeRoomId).emit('player_joined', {
      players: room.players,
      config: room.config,
    })
    console.log(`${safeUsername} joined room ${safeRoomId}`)
    broadcastRooms()
  })

  socket.on('player_ready', ({ roomId, ready }) => {
    const safeRoomId = normalizeRoomId(roomId)
    if (!safeRoomId) return

    const room = rooms.get(safeRoomId)
    if (!room) return

    if (room.players[socket.id]) {
      room.players[socket.id].ready = Boolean(ready)
    }

    io.to(safeRoomId).emit('player_update', { players: room.players })

    // Check if all players ready
    const allReady = Object.values(room.players).every((p) => p.ready)
    const playerCount = Object.keys(room.players).length

    if (room.countdown && !allReady) {
      clearInterval(room.countdown)
      room.countdown = null
      io.to(safeRoomId).emit('countdown_cancelled')
      return
    }

    if (allReady && playerCount === 2 && !room.countdown) {
      // Start countdown
      console.log(`Room ${safeRoomId} starting...`)
      let count = 3
      room.countdown = setInterval(() => {
        io.to(safeRoomId).emit('countdown', count)
        count--

        if (count < 0) {
          clearInterval(room.countdown)
          room.countdown = null
          handleStartGame(safeRoomId)
        }
      }, 1000)
    }
  })

  socket.on('update_progress', ({ roomId, wpm, progress, correctChars }) => {
    const safeRoomId = normalizeRoomId(roomId)
    if (!safeRoomId) return

    const room = rooms.get(safeRoomId)
    if (!room || room.status !== 'playing') return
    if (!room.players[socket.id]) return

    const player = room.players[socket.id]
    socket.data.lastProgressUpdateByRoom ||= {}
    const now = Date.now()
    const lastProgressUpdate = socket.data.lastProgressUpdateByRoom[safeRoomId]
    if (
      lastProgressUpdate &&
      now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL_MS
    ) {
      return
    }
    socket.data.lastProgressUpdateByRoom[safeRoomId] = now

    const safeWpm = Math.round(clampNumber(wpm, 0, 500))
    const safeProgress = clampNumber(progress, 0, 100)
    const safeCorrectChars = Math.round(
      clampNumber(correctChars, 0, MAX_TEXT_LENGTH)
    )

    player.wpm = safeWpm
    player.progress = safeProgress
    player.correctChars = safeCorrectChars

    // Broadcast to everyone in room (including self, to simplify sync)
    io.to(safeRoomId).emit('progress_update', { players: room.players })

    // Check win condition
    if (safeProgress >= 100) {
      finishGame(safeRoomId, socket.id)
    }
  })

  socket.on('leave_room', ({ roomId }) => {
    const safeRoomId = normalizeRoomId(roomId)
    if (safeRoomId) {
      handleLeave(socket, safeRoomId)
    }
  })

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id)
    // Find rooms this user was in and remove them
    rooms.forEach((room, roomId) => {
      if (room.players[socket.id]) {
        handleLeave(socket, roomId)
      }
    })
  })
})

function handleLeave(socket, roomId) {
  const room = rooms.get(roomId)
  if (room) {
    delete room.players[socket.id]

    if (Object.keys(room.players).length === 0) {
      rooms.delete(roomId)
      if (room.timer) clearTimeout(room.timer)
      if (room.countdown) clearInterval(room.countdown)
    } else {
      if (room.host === socket.id) {
        room.host = Object.keys(room.players)[0]
      }

      if (room.countdown) {
        clearInterval(room.countdown)
        room.countdown = null
        io.to(roomId).emit('countdown_cancelled')
      }
      io.to(roomId).emit('player_left', { players: room.players })
      if (room.status === 'playing') {
        io.to(roomId).emit('opponent_disconnected')
        room.status = 'finished'
        if (room.timer) clearTimeout(room.timer)
        if (room.countdown) clearInterval(room.countdown)
      }
    }
    // Broadcast updates to lobby
    broadcastRooms()
  }
}

function handleStartGame(roomId) {
  const room = rooms.get(roomId)
  if (!room) return

  room.status = 'playing'
  const startTime = Date.now()
  io.to(roomId).emit('game_start', { startTime, config: room.config })

  // Time Attack Mode Logic
  if (room.config.mode === 'time') {
    const limitMs = room.config.timeLimit * 1000
    console.log(`Room ${roomId}: Timer set for ${room.config.timeLimit}s`)

    room.timer = setTimeout(() => {
      // Time's up! Determine winner by correctChars/WPM
      const players = Object.values(room.players)
      // Sort by correctChars descending
      players.sort((a, b) => (b.correctChars || 0) - (a.correctChars || 0))

      const topScore = players[0]?.correctChars || 0
      const isTie =
        players.filter((p) => (p.correctChars || 0) === topScore).length > 1
      const winnerId = isTie ? null : players[0]?.id
      finishGame(roomId, winnerId)
    }, limitMs)
  }
}

function finishGame(roomId, winnerId) {
  const room = rooms.get(roomId)
  if (!room || room.status === 'finished') return

  room.status = 'finished'
  if (room.timer) clearTimeout(room.timer) // Clear timer if it was race mode or early finish

  io.to(roomId).emit('game_over', { winner: winnerId, players: room.players })
  console.log(`Room ${roomId} finished. Winner: ${winnerId}`)
}

console.log(`Socket server running on port ${PORT}`)
