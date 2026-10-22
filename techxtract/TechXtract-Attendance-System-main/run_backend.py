import socket
import uvicorn
from backend.app.main import app

def main():
    # Bind a true dual-stack socket for both IPv4 (127.0.0.1) and IPv6 (::1 / localhost)
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    except (AttributeError, OSError):
        pass
    sock.bind(('::', 8000))
    sock.listen(128)
    
    config = uvicorn.Config(app=app, log_level="info")
    server = uvicorn.Server(config)
    print("Dual-stack FastAPI server active on http://localhost:8000 and http://127.0.0.1:8000")
    server.run(sockets=[sock])

if __name__ == "__main__":
    main()
