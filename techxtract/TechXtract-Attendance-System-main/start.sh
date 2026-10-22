#!/usr/bin/env bash
# Society Event & Attendance Management System - Startup Script

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"
export PYTHONPATH=.

echo "=========================================================="
echo " Starting TechXtract Attendance Management System"
echo "=========================================================="

# 1. Select Python interpreter and ensure Uvicorn is installed
if command -v python3 >/dev/null 2>&1 && python3 -c "import zxingcpp, fastapi" >/dev/null 2>&1; then
    PYTHON_EXEC="python3"
elif [ -d "venv" ] && [ -x "./venv/bin/python" ]; then
    PYTHON_EXEC="./venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_EXEC="python3"
else
    PYTHON_EXEC="python"
fi

# Verify Uvicorn in the selected environment, installing if missing
if ! $PYTHON_EXEC -c "import uvicorn" >/dev/null 2>&1; then
    echo "Verifying/installing uvicorn in $PYTHON_EXEC..."
    $PYTHON_EXEC -m pip install uvicorn 2>/dev/null || true
fi

# Fallback: check alternative interpreter or standalone binary if uvicorn module is unavailable
UVICORN_CMD="$PYTHON_EXEC -m uvicorn"
if ! $PYTHON_EXEC -c "import uvicorn" >/dev/null 2>&1; then
    if [ "$PYTHON_EXEC" != "python3" ] && command -v python3 >/dev/null 2>&1 && PYTHONPATH=. python3 -c "import uvicorn, backend.app.main" >/dev/null 2>&1; then
        PYTHON_EXEC="python3"
        UVICORN_CMD="$PYTHON_EXEC -m uvicorn"
    elif [ "$PYTHON_EXEC" != "python" ] && command -v python >/dev/null 2>&1 && PYTHONPATH=. python -c "import uvicorn, backend.app.main" >/dev/null 2>&1; then
        PYTHON_EXEC="python"
        UVICORN_CMD="$PYTHON_EXEC -m uvicorn"
    elif command -v uvicorn >/dev/null 2>&1; then
        UVICORN_CMD="uvicorn"
    elif [ -x "./venv/bin/uvicorn" ]; then
        UVICORN_CMD="./venv/bin/uvicorn"
    fi
fi

# 2. Cleanup any old processes on ports 8000, 3000, and 3443
echo "[1/4] Ensuring ports 8000, 3000 & 3443 are clear..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3443 | xargs kill -9 2>/dev/null || true

# 3. Start Backend (use python -m uvicorn with fallback)
echo "[2/4] Starting FastAPI backend on http://0.0.0.0:8000..."
PYTHONPATH=. $UVICORN_CMD backend.app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# 4. Start Frontend
echo "[3/4] Starting Next.js frontend on http://0.0.0.0:3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# 5. Start HTTPS Reverse Proxy for mobile live camera stream
echo "[4/4] Starting HTTPS proxy on https://0.0.0.0:3443..."
$PYTHON_EXEC https_proxy.py &
HTTPS_PID=$!

# Cleanup handler on exit (Ctrl+C)
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill -9 $BACKEND_PID 2>/dev/null || true
    kill -9 $FRONTEND_PID 2>/dev/null || true
    kill -9 $HTTPS_PID 2>/dev/null || true
    echo "Done. Goodbye!"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "=========================================================="
echo " System is LIVE:"
echo " -> Desktop / Local:  http://localhost:3000"
echo " -> Mobile Live Cam:  https://192.168.1.3:3443"
echo " -> Mobile Standard:  http://192.168.1.3:3000"
echo " -> Backend API:      http://127.0.0.1:8000/docs"
echo " Default Logins:"
echo " -> Super Admin:      admin@techxtract.edu / Admin@12345"
echo " -> Coordinator:      coordinator@techxtract.edu / Coord@12345"
echo "=========================================================="
echo "Press Ctrl+C to stop all servers."

# Open browser on macOS
if command -v open >/dev/null 2>&1; then
    sleep 2
    open http://localhost:3000
fi

# Keep script running
wait
