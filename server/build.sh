#!/bin/bash
# This script builds all Go Lambda functions in the project.
# It should be run from the directory where the script is located.

set -e

echo "Building Lambda functions..."

# Define the source directory for the lambda functions
LAMBDA_SRC_DIR="./lambda"

# Check if the lambda source directory exists
if [ ! -d "$LAMBDA_SRC_DIR" ]; then
  echo "Error: Lambda source directory not found at $LAMBDA_SRC_DIR"
  exit 1
fi

# Iterate over each function directory in the lambda source directory
for func_dir in "$LAMBDA_SRC_DIR"/*; do
  if [ -d "$func_dir" ]; then
    func_name=$(basename "$func_dir")
    echo "--- Building: $func_name ---"

    # Navigate into the function's directory
    cd "$func_dir"

    # Initialize Go module if it doesn't exist
    if [ ! -f "go.mod" ]; then
      echo "Initializing Go module for $func_name..."
      # Use the function name for the module path
      go mod init "miniapps-lambda-$func_name"
      go mod tidy
    fi

    # Build the Lambda function for Linux AMD64 architecture
    GOOS=linux GOARCH=amd64 go build -o bootstrap -tags lambda.norpc .

    # Create the zip archive, overwriting if it exists
    zip -j "${func_name}.zip" bootstrap

    # Clean up the bootstrap executable
    rm bootstrap

    echo "--- Done: $func_name ---"
    
    # Navigate back to the original directory (lambda folder)
    cd - > /dev/null
  fi
done

echo "Build complete! All Lambda functions are ready for deployment."