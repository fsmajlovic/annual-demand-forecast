#!/bin/bash

# Start script for the React UI and API server

echo "🚀 Starting Pharmaceutical Demand Forecasting UI"
echo "================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "   Please create a .env file with your OPENAI_API_KEY"
    echo "   Example: cp .env.example .env"
    exit 1
fi

# Check if OPENAI_API_KEY is set
source .env
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OPENAI_API_KEY not set in .env file"
    exit 1
fi

echo "✓ Environment variables loaded"
echo "✓ OPENAI_API_KEY found"
echo ""

# Build backend if not already built
if [ ! -d "dist" ]; then
    echo "📦 Building backend..."
    npx tsc
    echo "✓ Backend built"
    echo ""
fi

# Install UI dependencies if needed
if [ ! -d "ui/node_modules" ]; then
    echo "📦 Installing UI dependencies..."
    cd ui && npm install && cd ..
    echo "✓ UI dependencies installed"
    echo ""
fi

echo "🚀 Starting servers..."
echo "   - API Server: http://localhost:3001"
echo "   - React UI: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both servers with concurrently
npm run dev:full
