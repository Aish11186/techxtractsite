#!/usr/bin/env python3
"""
Lightweight TLS/HTTPS Reverse Proxy for Mobile Testing.
Proxies incoming HTTPS connections on 0.0.0.0:3443 to http://127.0.0.1:3000.
Enables secure context (window.isSecureContext === true) on mobile phones (iOS Safari & Android Chrome),
unlocking real-time WebRTC camera video streaming over local Wi-Fi.
"""

import asyncio
import os
import ssl
import sys

TARGET_HOST = "127.0.0.1"
TARGET_PORT = 3000
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 3443

CERT_FILE = os.path.join(os.path.dirname(__file__), "frontend", "certificates", "cert.crt")
KEY_FILE = os.path.join(os.path.dirname(__file__), "frontend", "certificates", "cert.key")

async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        while not reader.at_eof():
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (asyncio.CancelledError, ConnectionResetError, BrokenPipeError, Exception):
        pass
    finally:
        try:
            if not writer.is_closing():
                writer.close()
        except Exception:
            pass

async def handle_client(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
    try:
        remote_reader, remote_writer = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)
    except Exception:
        try:
            client_writer.close()
        except Exception:
            pass
        return

    t1 = asyncio.create_task(pipe(client_reader, remote_writer))
    t2 = asyncio.create_task(pipe(remote_reader, client_writer))
    done, pending = await asyncio.wait([t1, t2], return_when=asyncio.FIRST_COMPLETED)
    for t in pending:
        t.cancel()
    await asyncio.gather(*pending, return_exceptions=True)

async def main():
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        print(f"SSL certificate or key missing: {CERT_FILE}, {KEY_FILE}")
        sys.exit(1)

    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(CERT_FILE, KEY_FILE)

    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT, ssl=ssl_ctx)
    print(f"HTTPS Reverse Proxy active on https://{LISTEN_HOST}:{LISTEN_PORT} -> http://{TARGET_HOST}:{TARGET_PORT}")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
