package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

/*****************************************************/
// App types for response
/*****************************************************/
type AppListing struct {
	AppId           string `json:"appId"`
	AppSlug         string `json:"appSlug"`
	AppName         string `json:"appName"`
	AppDescription  string `json:"appDescription"`
	PublisherId     string `json:"publisherId"`
	UploadTimestamp string `json:"uploadTimestamp"`
	VersionNumber   int    `json:"versionNumber"`
	ManifestContent string `json:"manifestContent,omitempty"`
}

type AppListResponse struct {
	Apps  []AppListing `json:"apps"`
	Count int          `json:"count"`
}

type AppDetailResponse struct {
	App AppListing `json:"app"`
}

/*****************************************************/
// Response types
/*****************************************************/
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

/*****************************************************/
// Validation functions
/*****************************************************/
func validateSubscriber(request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
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
		// Handle both comma-separated and space-separated formats
		if strings.Contains(trimmedGroups, ", ") {
			groupsList = strings.Split(trimmedGroups, ", ")
		} else {
			groupsList = strings.Fields(trimmedGroups) // Split by any whitespace
		}
	} else {
		groupsList = []string{}
	}

	log.Printf("Raw groups claim: %s", groupsClaim)
	log.Printf("Trimmed groups: %s", trimmedGroups)
	log.Printf("Parsed groups list: %v", groupsList)

	isSubscriber := false
	for _, group := range groupsList {
		log.Printf("Checking group: '%s'", group)
		if group == "Subscriber" || group == "Publisher" {
			isSubscriber = true
			break
		}
	}
	log.Printf("isSubscriber result: %t", isSubscriber)
	if !isSubscriber {
		return createErrorResponse(403, "Access denied. Subscriber role required.")
	}
	return events.APIGatewayV2HTTPResponse{}, nil
}

/*****************************************************/
// DynamoDB query functions
/*****************************************************/
func getAllApps(ctx context.Context, dynamoClient *dynamodb.Client, tableName string) ([]AppListing, error) {
	input := &dynamodb.ScanInput{
		TableName: aws.String(tableName),
	}

	result, err := dynamoClient.Scan(ctx, input)
	if err != nil {
		return nil, err
	}

	var apps []AppListing
	err = attributevalue.UnmarshalListOfMaps(result.Items, &apps)
	if err != nil {
		return nil, err
	}

	return apps, nil
}

/*****************************************************/
// Handler functions
/*****************************************************/
func handleGetAllApps(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	// Validate subscriber permissions
	if errorResp, err := validateSubscriber(request); err != nil {
		return errorResp, err
	} else if errorResp.StatusCode != 0 {
		return errorResp, nil
	}

	// Load AWS configuration
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Printf("Error loading AWS config: %v", err)
		return createErrorResponse(500, "Internal server error")
	}

	dynamoClient := dynamodb.NewFromConfig(cfg)
	tableName := os.Getenv("app_table_name")

	apps, err := getAllApps(ctx, dynamoClient, tableName)
	if err != nil {
		log.Printf("Error querying apps: %v", err)
		return createErrorResponse(500, "Error retrieving apps")
	}

	response := AppListResponse{
		Apps:  apps,
		Count: len(apps),
	}

	return createSuccessResponse(200, response), nil
}

/*****************************************************/
// Main handler
/*****************************************************/
func handleRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	switch request.RouteKey {
	case "GET /apps":
		return handleGetAllApps(ctx, request)
	default:
		return createErrorResponse(404, "Route not found")
	}
}

func main() {
	lambda.Start(handleRequest)
}
