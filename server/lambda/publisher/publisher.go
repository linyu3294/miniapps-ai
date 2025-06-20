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
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go/aws"
)

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
	// Extract claims from the JWT token
	claims := request.RequestContext.Authorizer.JWT.Claims
	groupsClaim, ok := claims["cognito:groups"]
	if !ok {
		return createErrorResponse(403, "Access denied. No group information found.")
	}

	// The 'cognito:groups' claim from API Gateway comes as a string representation
	// of a slice, e.g., "[Publisher, Admin]". It is not valid JSON.
	// We need to parse this string manually.
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
	// Determine that the model.onnx file is present and it's less than 25MB
	modelOnnxFile := File{}
	for _, file := range files {
		if file.Filename == "model.onnx" {
			modelOnnxFile = file
		}
	}
	if modelOnnxFile == (File{}) {
		return createErrorResponse(400, "The model.onnx file is required")
	}

	// Determine that the model.onnx file is less than 25MB
	if modelOnnxFile.Size > 25*1024*1024 {
		return createErrorResponse(400, "The model.onnx file size exceeds 25MB")
	}

	return events.APIGatewayV2HTTPResponse{}, nil
}

func validateFileSize(files []File) (events.APIGatewayV2HTTPResponse, error) {
	// Add up all the file sizes
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
	// Validate that there is at least one .js file or .wasm file and at least one html file
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
	// Determine that the entrypoint is a valid file and it points to a valid file
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

func createPresignedUrl(ctx context.Context, appSlug string, versionId string) (
	events.APIGatewayV2HTTPResponse,
	string,
	error,
) {
	s3Directory := fmt.Sprintf("%s/%s/%s/%s", "apps", appSlug, versionId, appSlug)

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		resp, err := createErrorResponse(500, "Failed to load AWS config")
		return resp, "", err
	}

	s3Client := s3.NewFromConfig(cfg)
	presignClient := s3.NewPresignClient(s3Client)
	bucket := os.Getenv("apps_bucket")

	presignedURL, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(s3Directory),
	},
		// Set to 1 minute for getting presigned URL to upload to S3
		// The presigned URL is used to upload the file to S3 immediately
		s3.WithPresignExpires(1*time.Minute))
	if err != nil {
		resp, err := createErrorResponse(500, "Failed to generate presigned PUT URL")
		return resp, "", err
	}

	return createSuccessResponse(200, map[string]interface{}{
			"message":       "Content published successfully",
			"presigned_url": presignedURL.URL,
		}),
		presignedURL.URL,
		nil
}

func handlePostRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	appSlug := request.PathParameters["app-slug"]
	versionId := request.PathParameters["version-id"]

	if appSlug == "" || versionId == "" {
		return createErrorResponse(400, "Invalid request path parameters")
	}

	var publishReq PublishRequest
	if err := json.Unmarshal([]byte(request.Body), &publishReq); err != nil {
		return createErrorResponse(400, "Invalid request body")
	}

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

	_, presignedUrl, err := createPresignedUrl(ctx, appSlug, versionId)
	if err != nil {
		return createErrorResponse(500, err.Error())
	}

	return createSuccessResponse(200, map[string]interface{}{
		"message":       "Content published successfully",
		"presigned_url": presignedUrl,
	}), nil
}

func handleRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	_, err := validatePublisher(request)
	if err != nil {
		return createErrorResponse(403, err.Error())
	}

	var publishReq PublishRequest
	if err := json.Unmarshal([]byte(request.Body), &publishReq); err != nil {
		return createErrorResponse(400, "Invalid request body")
	}
	switch strings.ToUpper(request.RequestContext.HTTP.Method) {
	case "POST":
		return handlePostRequest(ctx, request)
	default:
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 405,
			Headers:    map[string]string{contentTypeHeader: jsonContentType},
			Body:       "Method not allowed",
		}, nil
	}
}

func main() {
	lambda.Start(handleRequest)
}
