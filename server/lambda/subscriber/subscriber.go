package main

import (
	"context"
	"encoding/json"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
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
	Apps       []AppListing `json:"apps"`
	Count      int          `json:"count"`
	NextCursor string       `json:"nextCursor,omitempty"`
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
func getAllApps(ctx context.Context, dynamoClient *dynamodb.Client, tableName string, limit int, cursor string) ([]AppListing, string, error) {
	var lastEvaluatedKey map[string]types.AttributeValue

	log.Printf("Debug: getAllApps called with tableName=%s, limit=%d, cursor=%s", tableName, limit, cursor)

	if cursor != "" {
		decodedCursor, err := url.QueryUnescape(cursor)
		if err != nil {
			log.Printf("Debug: Error decoding cursor: %v", err)
			return nil, "", err
		}

		var tempMap map[string]interface{}
		if err := json.Unmarshal([]byte(decodedCursor), &tempMap); err != nil {
			log.Printf("Debug: Error unmarshaling cursor JSON: %v", err)
			return nil, "", err
		}

		lastEvaluatedKey = make(map[string]types.AttributeValue)
		for k, v := range tempMap {
			if strVal, ok := v.(string); ok {
				lastEvaluatedKey[k] = &types.AttributeValueMemberS{Value: strVal}
			}
		}
		log.Printf("Debug: Parsed lastEvaluatedKey: %+v", lastEvaluatedKey)
	}

	input := &dynamodb.ScanInput{
		TableName: aws.String(tableName),
		Limit:     aws.Int32(int32(limit + 1)), // fetch one more to check if there are more pages
	}

	if lastEvaluatedKey != nil {
		input.ExclusiveStartKey = lastEvaluatedKey
	}

	log.Printf("Debug: About to perform DynamoDB scan with input: %+v", input)

	result, err := dynamoClient.Scan(ctx, input)
	if err != nil {
		log.Printf("Debug: DynamoDB scan failed: %v", err)
		return nil, "", err
	}

	log.Printf("Debug: DynamoDB scan succeeded. Count: %d, ScannedCount: %d", result.Count, result.ScannedCount)
	log.Printf("Debug: Number of items returned: %d", len(result.Items))

	if len(result.Items) > 0 {
		log.Printf("Debug: First item: %+v", result.Items[0])
	}

	var apps []AppListing
	err = attributevalue.UnmarshalListOfMaps(result.Items, &apps)
	if err != nil {
		log.Printf("Debug: Error unmarshaling items: %v", err)
		return nil, "", err
	}

	log.Printf("Debug: Successfully unmarshaled %d apps", len(apps))

	// Check if we have more items than requested (we fetched limit + 1)
	var nextCursor string
	if len(apps) > limit {
		// Remove the extra item
		apps = apps[:limit]
		log.Printf("Debug: Trimmed apps to %d (limit)", len(apps))

		// Since we got more items than requested, there are more pages
		// Generate cursor from the last item we're returning
		lastApp := apps[len(apps)-1]
		cursorMap := map[string]string{
			"appId": lastApp.AppId,
		}
		nextCursorBytes, err := json.Marshal(cursorMap)
		if err != nil {
			log.Printf("Debug: Error creating next cursor: %v", err)
			return nil, "", err
		}
		nextCursor = string(nextCursorBytes)
		log.Printf("Debug: Generated nextCursor from last returned item: %s", nextCursor)
	} else {
		log.Printf("Debug: Got %d apps (not more than limit %d), no more pages", len(apps), limit)
	}

	log.Printf("Debug: Returning %d apps, nextCursor: %s", len(apps), nextCursor)
	return apps, nextCursor, nil
}

/*****************************************************/
// Handler functions
/*****************************************************/
func handleGetAllApps(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	log.Printf("Debug: handleGetAllApps started")

	// Validate subscriber permissions
	if errorResp, err := validateSubscriber(request); err != nil {
		return errorResp, err
	} else if errorResp.StatusCode != 0 {
		return errorResp, nil
	}

	// Parse query parameters
	limitStr := request.QueryStringParameters["limit"]
	cursor := request.QueryStringParameters["cursor"]

	log.Printf("Debug: Query parameters - limit: %s, cursor: %s", limitStr, cursor)

	limit := 12 // default limit
	if limitStr != "" {
		var err error
		limit, err = strconv.Atoi(limitStr)
		if err != nil || limit <= 0 || limit > 100 {
			return createErrorResponse(400, "Invalid limit parameter. Must be a positive number between 1 and 100")
		}
	}

	log.Printf("Debug: Using limit: %d", limit)

	// Load AWS configuration
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Printf("Error loading AWS config: %v", err)
		return createErrorResponse(500, "Internal server error")
	}

	dynamoClient := dynamodb.NewFromConfig(cfg)
	tableName := os.Getenv("app_table_name")

	log.Printf("Debug: Using DynamoDB table name: %s", tableName)

	apps, nextCursor, err := getAllApps(ctx, dynamoClient, tableName, limit, cursor)
	if err != nil {
		log.Printf("Error querying apps: %v", err)
		return createErrorResponse(500, "Error retrieving apps")
	}

	response := AppListResponse{
		Apps:       apps,
		Count:      len(apps),
		NextCursor: nextCursor,
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
