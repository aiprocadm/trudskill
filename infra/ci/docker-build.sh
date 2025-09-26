#!/bin/bash
set -e
echo "Building Docker image"
docker build -t myapp:latest .
