'use client'

import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { terminalSocketUrl } from '@/lib/terminal-session-api'

/**
 * Interactive human terminal (Phase 1): backend-owned PTY over /ws/terminals,
 * rendered by xterm.js. The renderer owns the screen; this component only
 * bridges frames (output down; input/resize up).
 */
export function InteractiveTerminal() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      theme: { background: '#09090b' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const ws = new WebSocket(terminalSocketUrl())
    ws.onmessage = (event) => {
      let frame: { type?: string; data?: string; exit_code?: number; message?: string }
      try {
        frame = JSON.parse(event.data as string)
      } catch {
        return
      }
      if (frame.type === 'output' && typeof frame.data === 'string') {
        term.write(frame.data)
      } else if (frame.type === 'ready') {
        fit.fit()
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        term.focus()
      } else if (frame.type === 'exit') {
        term.write(`\r\n[process exited ${frame.exit_code ?? 0}]\r\n`)
      } else if (frame.type === 'error') {
        term.write(`\r\n[terminal error: ${frame.message ?? 'unknown'}]\r\n`)
      }
    }
    ws.onclose = (event) => {
      if (event.code === 4003) {
        term.write('\r\n[session token rejected — reload the app]\r\n')
      }
    }

    const sendInput = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })
    const sendResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(host)

    return () => {
      observer.disconnect()
      sendInput.dispose()
      sendResize.dispose()
      ws.close()
      term.dispose()
    }
  }, [])

  return <div className="h-full min-h-0 w-full bg-[#09090b]" ref={hostRef} />
}
