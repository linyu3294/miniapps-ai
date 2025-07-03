package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/google/uuid"
)

/*****************************************************/
// Publish Request types
/*****************************************************/
type Manifest struct {
	Name        string `json:"name"`
	ShortName   string `json:"short_name"`
	StartUrl    string `json:"start_url"`
	Display     string `json:"display"`
	Description string `json:"description"`
	Icons       []Icon `json:"icons"`
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
// App Metadata types for SQS processing
/*****************************************************/
type AppMetadataMessage struct {
	AppSlug         string    `json:"app_slug"`
	VersionId       string    `json:"version_id"`
	S3FilePath      string    `json:"s3_file_path"`
	UploadTimestamp time.Time `json:"upload_timestamp"`
	ProcessedFiles  []string  `json:"processed_files"`
	ManifestFound   bool      `json:"manifest_found"`
	ManifestContent string    `json:"manifest_content,omitempty"`
}

/*****************************************************/
// App Record types for DynamoDB
/*****************************************************/
type AppRecord struct {
	AppId           string   `dynamodbav:"appId"`
	AppSlug         string   `dynamodbav:"appSlug"`
	PublisherId     string   `dynamodbav:"publisherId"`
	UploadTimestamp string   `dynamodbav:"uploadTimestamp"`
	VersionNumber   int      `dynamodbav:"versionNumber"`
	S3FilePath      string   `dynamodbav:"s3FilePath"`
	AppDescription  string   `dynamodbav:"appDescription"`
	AppName         string   `dynamodbav:"appName"`
	ManifestContent string   `dynamodbav:"manifestContent,omitempty"`
	ProcessedFiles  []string `dynamodbav:"processedFiles"`
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
// DynamoDB functions
/*****************************************************/
func saveAppMetadata(ctx context.Context, dynamoClient *dynamodb.Client, tableName string, metadata AppMetadataMessage) error {
	var manifest Manifest
	appName := metadata.AppSlug // Default to app slug
	appDescription := ""

	if metadata.ManifestFound && metadata.ManifestContent != "" {
		if err := json.Unmarshal([]byte(metadata.ManifestContent), &manifest); err == nil {
			if manifest.Name != "" {
				appName = manifest.Name
			}
			if manifest.Description != "" {
				appDescription = manifest.Description
			}
		}
	}
	appId := uuid.New().String()

	appRecord := AppRecord{
		AppId:           appId,
		AppSlug:         metadata.AppSlug,
		PublisherId:     metadata.VersionId,
		UploadTimestamp: metadata.UploadTimestamp.Format(time.RFC3339),
		VersionNumber:   1,
		S3FilePath:      metadata.S3FilePath,
		AppDescription:  appDescription,
		AppName:         appName,
		ManifestContent: metadata.ManifestContent,
		ProcessedFiles:  metadata.ProcessedFiles,
	}
	item, err := attributevalue.MarshalMap(appRecord)
	if err != nil {
		return fmt.Errorf("failed to marshal app record: %w", err)
	}

	_, err = dynamoClient.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableName),
		Item:      item,
	})
	if err != nil {
		return fmt.Errorf("failed to put item in DynamoDB: %w", err)
	}

	log.Printf("Successfully saved app metadata for %s (ID: %s)", metadata.AppSlug, appId)
	return nil
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

func handleSQSEvent(ctx context.Context, sqsEvent events.SQSEvent) error {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("failed to load AWS configuration: %w", err)
	}

	dynamoClient := dynamodb.NewFromConfig(cfg)
	tableName := os.Getenv("app_table_name")

	for _, record := range sqsEvent.Records {
		log.Printf("Processing SQS message: %s", record.MessageId)

		var metadata AppMetadataMessage
		if err := json.Unmarshal([]byte(record.Body), &metadata); err != nil {
			log.Printf("Failed to unmarshal SQS message: %v", err)
			continue // Skip this message but continue processing others
		}

		if err := saveAppMetadata(ctx, dynamoClient, tableName, metadata); err != nil {
			log.Printf("Failed to save app metadata: %v", err)
			return err // Return error to trigger message retry
		}
	}

	return nil
}

func handleRequest(ctx context.Context, event json.RawMessage) (interface{}, error) {
	var eventMap map[string]interface{}
	if err := json.Unmarshal(event, &eventMap); err != nil {
		return nil, fmt.Errorf("failed to parse event: %w", err)
	}

	// Handle API Gateway event (relayed from user lambda)
	if requestContext, ok := eventMap["requestContext"].(map[string]interface{}); ok {
		if _, hasHTTP := requestContext["http"]; hasHTTP {
			var apiEvent events.APIGatewayV2HTTPRequest
			if err := json.Unmarshal(event, &apiEvent); err != nil {
				return nil, fmt.Errorf("failed to parse API Gateway event: %w", err)
			}
			return handlePostRequest(ctx, apiEvent)
		}
	}

	// Check for SQS event (direct SQS trigger)
	if records, ok := eventMap["Records"].([]interface{}); ok && len(records) > 0 {
		if record, ok := records[0].(map[string]interface{}); ok {
			if _, hasSQS := record["eventSource"]; hasSQS {
				var sqsEvent events.SQSEvent
				if err := json.Unmarshal(event, &sqsEvent); err != nil {
					return nil, fmt.Errorf("failed to parse SQS event: %w", err)
				}
				err := handleSQSEvent(ctx, sqsEvent)
				if err != nil {
					return nil, err
				}
				return "Successfully processed SQS messages", nil
			}
		}
	}

	log.Printf("Unsupported event structure: %+v", eventMap)
	return nil, fmt.Errorf("unsupported event type")
}

func main() {
	lambda.Start(handleRequest)
}
