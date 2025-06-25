package main

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go/aws"
)

func getMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".html":
		return "text/html"
	case ".css":
		return "text/css"
	case ".js":
		return "application/javascript"
	case ".json":
		return "application/json"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".svg":
		return "image/svg+xml"
	case ".onnx":
		return "application/octet-stream"
	default:
		return "application/octet-stream"
	}
}

func handleRequest(ctx context.Context, s3Event events.S3Event) error {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("failed to load configuration: %w", err)
	}
	s3Client := s3.NewFromConfig(cfg)
	appsBucket := os.Getenv("apps_bucket")

	for _, record := range s3Event.Records {
		sourceBucket := record.S3.Bucket.Name
		sourceKey := record.S3.Object.Key

		log.Printf("Processing file from bucket %s, key %s", sourceBucket, sourceKey)

		// Expected sourceKey format: uploads/{appSlug}/{versionId}/{some_uuid}.zip
		parts := strings.Split(sourceKey, "/")
		if len(parts) != 4 || parts[0] != "uploads" {
			log.Printf("Invalid key format, skipping: %s", sourceKey)
			continue
		}
		appSlug := parts[1]
		versionId := parts[2]
		_ = versionId // Explicitly ignore the versionId to satisfy the linter

		resp, err := s3Client.GetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(sourceBucket),
			Key:    aws.String(sourceKey),
		})
		if err != nil {
			return fmt.Errorf("failed to get object %s from bucket %s: %w", sourceKey, sourceBucket, err)
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read object body: %w", err)
		}

		zipReader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
		if err != nil {
			return fmt.Errorf("failed to create zip reader: %w", err)
		}

		for _, file := range zipReader.File {
			if file.FileInfo().IsDir() {
				continue
			}

			rc, err := file.Open()
			if err != nil {
				return fmt.Errorf("failed to open file in zip: %w", err)
			}
			defer rc.Close()

			fileBody, err := io.ReadAll(rc)
			if err != nil {
				return fmt.Errorf("failed to read file content from zip: %w", err)
			}

			destKey := filepath.Join("app", appSlug, file.Name)
			contentType := getMimeType(file.Name)

			_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
				Bucket:      aws.String(appsBucket),
				Key:         aws.String(destKey),
				Body:        bytes.NewReader(fileBody),
				ContentType: aws.String(contentType),
			})
			if err != nil {
				return fmt.Errorf("failed to upload unzipped file %s: %w", destKey, err)
			}
			log.Printf("Successfully uploaded %s", destKey)
		}

		_, err = s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(sourceBucket),
			Key:    aws.String(sourceKey),
		})
		if err != nil {
			log.Printf("Failed to delete original zip file %s: %v", sourceKey, err)
		} else {
			log.Printf("Successfully deleted original zip file %s", sourceKey)
		}
	}
	return nil
}

func main() {
	lambda.Start(handleRequest)
}
