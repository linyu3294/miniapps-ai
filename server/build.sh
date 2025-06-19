#!/bin/bash

# Build each Lambda function
echo "Building Lambda functions..."

cd ./lambda


# Build publisher function
echo "Building publisher function..."
cd ./publisher
echo "Creating zip file for publisher.go function..."
GOOS=linux GOARCH=amd64 go build -o bootstrap publisher.go
zip ./publisher.zip bootstrap


cd ../../

echo "\n\n\n----------------------------------Running tests----------------------------------\n\n\n"
go test ./...
if [ $? -ne 0 ]; then
    echo "Tests failed. Aborting deployment."
    exit 1
fi
echo "\n\n\n---------------------------------------------------------------------------------\n\n\n"
echo "All tests passed. Deploying to AWS..."
terraform apply

echo "Build complete! Lambda functions are ready for deployment."