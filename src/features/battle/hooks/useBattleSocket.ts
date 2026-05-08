'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export type BattleConfig = {
  mode: 'race' | 'time'
  timeLimit: number // in seconds
  difficulty: string
  text: string
  language?: string
  isPrivate?: boolean
}

export type BattlePlayer = {
  id: string
  username: string
  wpm: number
  progress: number
  correctChars?: number
  ready: boolean
}

export type BattleState =
  | 'idle'
  | 'waiting'
  | 'starting'
  | 'playing'
  | 'finished'

export type BattleRoom = {
  id: string
  host: string
  mode: string
  difficulty: string
  playerCount: number
  isPrivate?: boolean
  config?: BattleConfig
}

export function useBattleSocket(username: string) {
  const socketRef = useRef<Socket | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [status, setStatus] = useState<BattleState>('idle')
  const [players, setPlayers] = useState<Record<string, BattlePlayer>>({})
  const [gameConfig, setGameConfig] = useState<BattleConfig | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [winner, setWinner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rooms, setRooms] = useState<BattleRoom[]>([])
  const [myId, setMyId] = useState<string | null>(null)

  // Connect
  useEffect(() => {
    const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/+$/, '')

    const s = io(undefined, {
      path: `${basePath}/socket.io`,
      addTrailingSlash: false,
      autoConnect: true,
    })
    socketRef.current = s

    s.on('connect', () => {
      console.log('Connected to battle server', s.id)
      setMyId(s.id || null)
      // Request room list on connect
      s.emit('get_rooms')
    })

    s.on('rooms_update', (updatedRooms) => {
      setRooms(updatedRooms)
    })

    s.on('room_created', ({ roomId, players, config }) => {
      setRoomId(roomId)
      setPlayers(players)
      if (config) setGameConfig(config)
      setStatus('waiting')
      setError(null)
    })

    s.on('room_joined', ({ roomId, players, config }) => {
      setRoomId(roomId)
      setPlayers(players)
      if (config) setGameConfig(config)
      setStatus('waiting')
      setError(null)
    })

    s.on('player_joined', ({ players }) => {
      setPlayers(players)
    })

    s.on('player_update', ({ players }) => {
      setPlayers(players)
    })

    s.on('countdown', (count) => {
      setStatus('starting')
      setCountdown(count)
    })

    s.on('countdown_cancelled', () => {
      setStatus('waiting')
      setCountdown(null)
    })

    s.on('game_start', ({ startTime, config }) => {
      setStatus('playing')
      setStartTime(startTime)
      if (config) setGameConfig(config)
      setCountdown(null)
    })

    s.on('progress_update', ({ players }) => {
      setPlayers(players)
    })

    s.on('game_over', ({ winner, players }) => {
      setStatus('finished')
      setWinner(winner)
      if (players) setPlayers(players)
    })

    s.on('player_left', ({ players }) => {
      setPlayers(players)
    })

    s.on('opponent_disconnected', () => {
      setError('Opponent disconnected')
      setStatus('finished')
    })

    s.on('error', ({ message }) => {
      setError(message)
    })

    return () => {
      s.disconnect()
      socketRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    const socket = socketRef.current
    if (socket?.connected) return
    socket?.connect()
  }, [])

  const getRooms = useCallback(() => {
    const socket = socketRef.current
    connect()
    setError(null)
    socket?.emit('get_rooms')
  }, [connect])

  const createRoom = useCallback(
    (config: BattleConfig) => {
      const socket = socketRef.current
      connect()
      setError(null)
      socket?.emit('create_room', { username, config })
    },
    [username, connect]
  )

  const joinRoom = useCallback(
    (roomId: string) => {
      const socket = socketRef.current
      const normalizedRoomId = roomId.trim().toUpperCase()
      if (!normalizedRoomId) return

      connect()
      setError(null)
      socket?.emit('join_room', { roomId: normalizedRoomId, username })
      setWinner(null)
    },
    [username, connect]
  )

  const setReady = useCallback(
    (ready: boolean) => {
      const socket = socketRef.current
      if (roomId) {
        socket?.emit('player_ready', { roomId, ready })
      }
    },
    [roomId]
  )

  const updateProgress = useCallback(
    (wpm: number, progress: number, correctChars: number) => {
      const socket = socketRef.current
      if (roomId && status === 'playing') {
        socket?.emit('update_progress', { roomId, wpm, progress, correctChars })
      }
    },
    [roomId, status]
  )

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current
    if (roomId) {
      socket?.emit('leave_room', { roomId })
      setRoomId(null)
      setStatus('idle')
      setPlayers({})
      setGameConfig(null)
      setWinner(null)
      // Refresh rooms when leaving
      socket?.emit('get_rooms')
    }
  }, [roomId])

  return {
    roomId,
    status,
    players,
    gameConfig,
    countdown,
    startTime,
    winner,
    error,
    rooms,
    socketId: myId,
    createRoom,
    joinRoom,
    getRooms,
    setReady,
    updateProgress,
    leaveRoom,
  }
}
