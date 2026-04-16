#!/bin/bash
# Development startup script for Control Plane backend

# Change to the directory where this script is located
cd "$(dirname "$0")"

echo "Starting Control Plane Backend (Development Mode)..."
echo "Working directory: $(pwd)"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please create .env file with required configuration."
    exit 1
fi

# Set PYTHONPATH for imports to work
export PYTHONPATH=src

# Start the server
echo ""
echo "Starting FastAPI server..."
echo "API will be available at: http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo ""
python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
