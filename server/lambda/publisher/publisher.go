package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go/aws"
)

/*****************************************************/
// Unzip and Upload function
/*****************************************************/

func unzipAndUpload(ctx context.Context, s3Event events.S3Event) error {
	// Initialize S3 client
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

		// Download the zip file
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

		// Unzip
		zipReader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
		if err != nil {
			return fmt.Errorf("failed to create zip reader: %w", err)
		}

		// Upload unzipped files
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

			destKey := filepath.Join("apps", appSlug, versionId, file.Name)
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

		// Delete the original zip file
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

/*****************************************************/
// Publish Request types
/*****************************************************/

type Manifest struct {
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
	StartUrl  string `json:"start_url"`
	Display   string `json:"display"`
	Icons     []Icon `json:"icons"`
}

type Icon struct {
	Src   string `json:"src"`
	Sizes string `json:"sizes"`
	Type  string `json:"type"`
}

type File struct {
	Filename string `json:"filename"`
	Size     int    `json:"size"`
	Type     string `json:"type"`
}

type PublishRequest struct {
	Manifest     Manifest `json:"manifest"`
	Files        []File   `json:"files"`
	Entrypoint   string   `json:"entrypoint"`
	VersionNotes string   `json:"version_notes"`
	PublisherId  string   `json:"publisher_id"`
}

/*****************************************************/
// Publish Response types
/*****************************************************/

type PublishResponse struct {
	Message      string `json:"message"`
	PresignedUrl string `json:"presigned_url"`
}

/*****************************************************/
// Other types
/*****************************************************/

type Response events.APIGatewayV2HTTPResponse

const (
	contentTypeHeader = "Content-Type"
	jsonContentType   = "application/json"
)

type ErrorResponse struct {
	Error string `json:"error"`
}

/*****************************************************/
// Validation functions
/*****************************************************/

func validatePublisher(request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	claims := request.RequestContext.Authorizer.JWT.Claims
	groupsClaim, ok := claims["cognito:groups"]
	if !ok {
		return createErrorResponse(403, "Access denied. No group information found.")
	}

	if !strings.HasPrefix(groupsClaim, "[") || !strings.HasSuffix(groupsClaim, "]") {
		log.Println("Group claim is not in the expected format '[...]'")
		return createErrorResponse(403, "Invalid group format in token.")
	}

	trimmedGroups := groupsClaim[1 : len(groupsClaim)-1]
	var groupsList []string
	if trimmedGroups != "" {
		groupsList = strings.Split(trimmedGroups, ", ")
	} else {
		groupsList = []string{}
	}

	isPublisher := false
	for _, group := range groupsList {
		if group == "Publisher" {
			isPublisher = true
			break
		}
	}
	if !isPublisher {
		return createErrorResponse(403, "Access denied. Publisher role required.")
	}

	return events.APIGatewayV2HTTPResponse{}, nil
}

func validatePublishRequest(request PublishRequest) (events.APIGatewayV2HTTPResponse, error) {

	if request.Manifest.Name == "" {
		return createErrorResponse(400, "Manifest name is required")
	}
	if request.Manifest.ShortName == "" {
		return createErrorResponse(400, "Manifest short name is required")
	}
	if request.Manifest.StartUrl == "" {
		return createErrorResponse(400, "Manifest start url is required")
	}
	if request.Manifest.Display == "" {
		return createErrorResponse(400, "Manifest display is required")
	}
	if request.Manifest.Icons == nil {
		return createErrorResponse(400, "Manifest icons are required")
	}
	if request.Files == nil {
		return createErrorResponse(400, "Files are required")
	}
	if request.Entrypoint == "" {
		return createErrorResponse(400, "Entrypoint is required")
	}
	if request.VersionNotes == "" {
		return createErrorResponse(400, "Version notes are required")
	}
	if request.PublisherId == "" {
		return createErrorResponse(400, "Publisher id is required")
	}

	return events.APIGatewayV2HTTPResponse{}, nil
}

func validateModelOnnxFile(files []File) (events.APIGatewayV2HTTPResponse, error) {
	modelOnnxFile := File{}
	for _, file := range files {
		if file.Filename == "model.onnx" {
			modelOnnxFile = file
		}
	}
	if modelOnnxFile == (File{}) {
		return createErrorResponse(400, "The model.onnx file is required")
	}

	if modelOnnxFile.Size > 25*1024*1024 {
		return createErrorResponse(400, "The model.onnx file size exceeds 25MB")
	}

	return events.APIGatewayV2HTTPResponse{}, nil
}

func validateFileSize(files []File) (events.APIGatewayV2HTTPResponse, error) {
	totalSize := 0
	for _, file := range files {
		totalSize += file.Size
	}

	reasonableLimit := 100 * 1024 * 1024 // 100 MB
	if totalSize > reasonableLimit {
		return createErrorResponse(400, "Total file size exceeds reasonable limit")
	}
	return events.APIGatewayV2HTTPResponse{}, nil
}

func validateAppFiles(files []File) (events.APIGatewayV2HTTPResponse, error) {
	jsFiles := 0
	wasmFiles := 0
	htmlFiles := 0
	for _, file := range files {
		if file.Type == "application/javascript" {
			jsFiles++
		}
		if file.Type == "application/wasm" {
			wasmFiles++
		}
		if file.Type == "text/html" {
			htmlFiles++
		}
	}

	if jsFiles == 0 && wasmFiles == 0 {
		return createErrorResponse(400, "There must be at least one .js file or .wasm file")
	}
	if htmlFiles == 0 {
		return createErrorResponse(400, "There must be at least one html file")
	}

	return events.APIGatewayV2HTTPResponse{}, nil
}

/*****************************************************/
// Response functions
/*****************************************************/

func createErrorResponse(statusCode int, message string) (events.APIGatewayV2HTTPResponse, error) {
	errorResp := ErrorResponse{Error: message}
	body, _ := json.Marshal(errorResp)
	return events.APIGatewayV2HTTPResponse{
		StatusCode: statusCode,
		Headers:    map[string]string{contentTypeHeader: jsonContentType},
		Body:       string(body),
	}, nil
}

func createSuccessResponse(statusCode int, data interface{}) events.APIGatewayV2HTTPResponse {
	body, _ := json.Marshal(data)
	return events.APIGatewayV2HTTPResponse{
		StatusCode: statusCode,
		Headers:    map[string]string{contentTypeHeader: jsonContentType},
		Body:       string(body),
	}
}

func validateAppEntrypoint(entrypoint string, files []File) (events.APIGatewayV2HTTPResponse, error) {
	for _, file := range files {
		if file.Filename == entrypoint {
			return events.APIGatewayV2HTTPResponse{}, nil
		}
	}
	return createErrorResponse(400, "The entrypoint is not a valid file")
}

/*****************************************************/
// Handler functions
/*****************************************************/

func createPresignedUrl(ctx context.Context, appSlug string, versionId string) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("error loading AWS configuration: %w", err)
	}
	s3Client := s3.NewFromConfig(cfg)
	presigner := s3.NewPresignClient(s3Client)
	appsBucket := os.Getenv("apps_bucket")
	uploadKey := fmt.Sprintf("uploads/%s/%s/%d.zip", appSlug, versionId, time.Now().UnixNano())

	req, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(appsBucket),
		Key:    aws.String(uploadKey),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = time.Duration(15 * time.Minute)
	})

	if err != nil {
		return "", fmt.Errorf("error creating presigned URL: %w", err)
	}

	return req.URL, nil
}

func handlePostRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	if _, err := validatePublisher(request); err != nil {
		return createErrorResponse(403, "Access denied. Publisher role required.")
	}

	var publishReq PublishRequest
	if err := json.Unmarshal([]byte(request.Body), &publishReq); err != nil {
		return createErrorResponse(400, "Invalid request body")
	}

	appSlug := request.PathParameters["app-slug"]
	versionId := request.PathParameters["version-id"]

	if appSlug == "" || versionId == "" {
		log.Printf("Could not find app-slug or version-id in path parameters: %+v", request.PathParameters)
		return createErrorResponse(400, "app-slug and version-id are required in the URL path")
	}

	// Run all validations
	if _, err := validatePublishRequest(publishReq); err != nil {
		return createErrorResponse(400, err.Error())
	}
	if _, err := validateModelOnnxFile(publishReq.Files); err != nil {
		return createErrorResponse(400, err.Error())
	}
	if _, err := validateFileSize(publishReq.Files); err != nil {
		return createErrorResponse(400, err.Error())
	}
	if _, err := validateAppFiles(publishReq.Files); err != nil {
		return createErrorResponse(400, err.Error())
	}
	if _, err := validateAppEntrypoint(publishReq.Entrypoint, publishReq.Files); err != nil {
		return createErrorResponse(400, err.Error())
	}

	presignedURL, err := createPresignedUrl(ctx, appSlug, versionId)
	if err != nil {
		log.Printf("Error creating presigned URL: %v", err)
		return createErrorResponse(500, "Failed to generate presigned URL")
	}

	return createSuccessResponse(200, map[string]interface{}{
		"message":       "Presigned URL generated successfully",
		"presigned_url": presignedURL,
	}), nil
}

func handleRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	log.Println("API Gateway event detected, processing as a publish request...")
	return handlePostRequest(ctx, request)
}

func main() {
	lambda.Start(handleRequest)
}
