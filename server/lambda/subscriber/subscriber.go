package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

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

const (
	extraToDetermineIfNextPage = 1
)

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
// Response Helper functions
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
// Validation Helper functions
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
		if group == "Subscriber" {
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
// DynamoDB Query helper functions
/*****************************************************/
func getLastEvaluatedKey(cursor string) (
	map[string]types.AttributeValue,
	error,
) {
	var lastEvaluatedKey map[string]types.AttributeValue
	if cursor != "" {
		decodedCursor, err := url.QueryUnescape(cursor)
		if err != nil {
			log.Printf("Debug: Error decoding cursor: %v", err)
			return nil, err
		}

		var tempMap map[string]interface{}
		if err := json.Unmarshal([]byte(decodedCursor), &tempMap); err != nil {
			log.Printf("Debug: Error unmarshaling cursor JSON: %v", err)
			return nil, err
		}

		lastEvaluatedKey = make(map[string]types.AttributeValue)
		for k, v := range tempMap {
			if strVal, ok := v.(string); ok {
				lastEvaluatedKey[k] = &types.AttributeValueMemberS{Value: strVal}
			}
		}
	}
	return lastEvaluatedKey, nil
}

func getNextCursor(apps []AppListing, limit int) (string, error) {
	var nextCursor string
	if len(apps) > limit {
		apps = apps[:limit]

		// Since we got more items than requested, there are more pages
		// Generate cursor from the last item we're returning
		lastApp := apps[len(apps)-extraToDetermineIfNextPage]
		cursorMap := map[string]string{
			"appId": lastApp.AppId,
		}
		nextCursorBytes, err := json.Marshal(cursorMap)
		if err != nil {
			log.Printf("Debug: Error creating next cursor: %v", err)
			return "", err
		}
		nextCursor = string(nextCursorBytes)
		log.Printf("Debug: Generated nextCursor from last returned item: %s", nextCursor)
	}
	return nextCursor, nil
}

func getApps(
	ctx context.Context,
	dynamoClient *dynamodb.Client,
	input *dynamodb.ScanInput,
) (
	[]AppListing,
	error,
) {
	result, err := dynamoClient.Scan(ctx, input)
	if err != nil {
		log.Printf("Debug: DynamoDB scan failed: %v", err)
		return nil, err
	}

	if len(result.Items) > 0 {
		log.Printf("Debug: First item: %+v", result.Items[0])
	}

	var apps []AppListing
	err = attributevalue.UnmarshalListOfMaps(result.Items, &apps)
	if err != nil {
		log.Printf("Debug: Error unmarshaling items: %v", err)
		return nil, err
	}

	return apps, nil
}

func getLimit(limitStr string) (int, error) {
	limit := 12 // default limit
	if limitStr != "" {
		var err error
		limit, err = strconv.Atoi(limitStr)
		if err != nil || limit <= 0 || limit > 100 {
			return 0, errors.New("invalid limit parameter. must be a positive number between 1 and 100")
		}
	}
	return limit, nil
}

type SubscriptionItem struct {
	AppId            string `dynamodbav:"appId"`
	UserId           string `dynamodbav:"userId"`
	SubscriptionTime string `dynamodbav:"subscriptionTime"`
}

func getSubscribedAppIdsBasedOnUserId(ctx context.Context, dynamoClient *dynamodb.Client, userID string) ([]string, error) {
	input := &dynamodb.ScanInput{
		TableName:        aws.String(os.Getenv("subscription_table_name")),
		FilterExpression: aws.String("userId = :userId"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":userId": &types.AttributeValueMemberS{Value: userID},
		},
	}
	result, err := dynamoClient.Scan(ctx, input)
	if err != nil {
		log.Printf("Debug: Error scanning subscription table: %v", err)
		return nil, err
	}

	var subscriptions []SubscriptionItem
	err = attributevalue.UnmarshalListOfMaps(result.Items, &subscriptions)
	if err != nil {
		log.Printf("Debug: Error unmarshaling items: %v", err)
		return nil, err
	}

	// Extract app IDs from the subscription items
	var appIds []string
	for _, subscription := range subscriptions {
		appIds = append(appIds, subscription.AppId)
	}

	log.Printf("Debug: Found %d subscribed app IDs for user %s: %v", len(appIds), userID, appIds)
	return appIds, nil
}

/*****************************************************/
// POST Subscription helper functions
/*****************************************************/
// checkSubscriptionExists checks if a subscription already exists for the given appID and userID
func checkSubscriptionExists(ctx context.Context, dynamoClient *dynamodb.Client, tableName, appID, userID string) (bool, error) {
	input := &dynamodb.GetItemInput{
		TableName: aws.String(tableName),
		Key: map[string]types.AttributeValue{
			"appId":  &types.AttributeValueMemberS{Value: appID},
			"userId": &types.AttributeValueMemberS{Value: userID},
		},
	}
	result, err := dynamoClient.GetItem(ctx, input)
	if err != nil {
		log.Printf("Debug: Error checking subscription existence: %v", err)
		return false, err
	}
	exists := result.Item != nil
	return exists, nil
}

func insertSubscription(ctx context.Context, dynamoClient *dynamodb.Client, tableName, appID, userID string) error {
	subscriptionTime := time.Now().UTC().Format(time.RFC3339)

	input := &dynamodb.PutItemInput{
		TableName: aws.String(tableName),
		Item: map[string]types.AttributeValue{
			"appId":            &types.AttributeValueMemberS{Value: appID},
			"userId":           &types.AttributeValueMemberS{Value: userID},
			"subscriptionTime": &types.AttributeValueMemberS{Value: subscriptionTime},
		},
	}
	_, err := dynamoClient.PutItem(ctx, input)
	if err != nil {
		return err
	}
	return nil
}

/*****************************************************/
// DynamoDB query functions
/*****************************************************/
func getAllApps(ctx context.Context, dynamoClient *dynamodb.Client, input *dynamodb.ScanInput, limit int, cursor string) ([]AppListing, string, error) {
	var lastEvaluatedKey map[string]types.AttributeValue

	lastEvaluatedKey, err := getLastEvaluatedKey(cursor)
	if err != nil {
		log.Printf("Debug: Error getting last evaluated key: %v", err)
		return nil, "", err
	}

	if lastEvaluatedKey != nil {
		input.ExclusiveStartKey = lastEvaluatedKey
	}

	apps, err := getApps(ctx, dynamoClient, input)
	if err != nil {
		log.Printf("Debug: Error getting apps: %v", err)
		return nil, "", err
	}

	nextCursor, err := getNextCursor(apps, limit)
	if err != nil {
		log.Printf("Debug: Error getting next cursor: %v", err)
		return nil, "", err
	}

	return apps, nextCursor, nil
}

/*****************************************************/
// Handler functions
/*****************************************************/
func handleGetAllApps(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	// Parse query parameters
	limitStr := request.QueryStringParameters["limit"]
	cursor := request.QueryStringParameters["cursor"]
	getSubscribed := request.QueryStringParameters["getSubscribed"] == "true"

	log.Printf("Debug: Query parameters - limit: %s, cursor: %s", limitStr, cursor)

	limit, err := getLimit(limitStr)
	if err != nil {
		log.Printf("Debug-getAllSubscribedApps: Error getting limit: %v", err)
		return createErrorResponse(400, err.Error())
	}
	// Load AWS configuration
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Printf("Error loading AWS config: %v", err)
		return createErrorResponse(500, "Internal server error")
	}
	log.Printf("Debug-getAllSubscribedApps: limit: %d", limit)

	dynamoClient := dynamodb.NewFromConfig(cfg)
	tableName := os.Getenv("app_table_name")

	log.Printf("Debug-getAllSubscribedApps: getSubscribed: %t", getSubscribed)

	var input *dynamodb.ScanInput
	if getSubscribed {
		userID := request.RequestContext.Authorizer.JWT.Claims["sub"]
		appIds, err := getSubscribedAppIdsBasedOnUserId(ctx, dynamoClient, userID)
		if err != nil {
			log.Printf("Error getting subscribed app IDs: %v", err)
			return createErrorResponse(500, "Error retrieving subscribed apps")
		}

		if len(appIds) == 0 {
			// If user has no subscriptions, return empty result
			response := AppListResponse{
				Apps:       []AppListing{},
				Count:      0,
				NextCursor: "",
			}
			return createSuccessResponse(200, response), nil
		}

		// Build FilterExpression with individual parameters for each app ID
		var filterParts []string
		expressionAttributeValues := make(map[string]types.AttributeValue)
		for i, appId := range appIds {
			paramName := fmt.Sprintf(":appId%d", i)
			filterParts = append(filterParts, fmt.Sprintf("appId = %s", paramName))
			expressionAttributeValues[paramName] = &types.AttributeValueMemberS{Value: appId}
		}
		filterExpression := strings.Join(filterParts, " OR ")

		input = &dynamodb.ScanInput{
			TableName:                 aws.String(tableName),
			FilterExpression:          aws.String(filterExpression),
			ExpressionAttributeValues: expressionAttributeValues,
			Limit:                     aws.Int32(int32(limit + extraToDetermineIfNextPage)),
		}
	} else {
		input = &dynamodb.ScanInput{
			TableName: aws.String(tableName),
			// fetch one more to check if there are more pages
			Limit: aws.Int32(int32(limit + extraToDetermineIfNextPage)),
		}
	}

	log.Printf("Debug-getAllSubscribedApps: input: %+v", input)
	apps, nextCursor, err := getAllApps(ctx, dynamoClient, input, limit, cursor)
	log.Printf("Debug-getAllSubscribedApps: apps: %+v", apps)
	if err != nil {
		log.Printf("Error querying apps: %v", err)
		return createErrorResponse(500, "Error retrieving apps")
	}

	response := AppListResponse{
		Apps:       apps,
		Count:      len(apps),
		NextCursor: nextCursor,
	}
	log.Printf("Debug-getAllSubscribedApps: response: %+v", response)
	return createSuccessResponse(200, response), nil
}

func handleSubscribe(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	// Parse query parameters
	appID := request.QueryStringParameters["appID"]
	claims := request.RequestContext.Authorizer.JWT.Claims
	userID := claims["sub"]

	log.Printf("Debug: handleSubscribe started with appID: %s, userID: %s", appID, userID)

	if appID == "" {
		return createErrorResponse(400, "appID is required")
	}
	if userID == "" {
		return createErrorResponse(400, "User ID not found in token")
	}
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Printf("Error loading AWS config: %v", err)
		return createErrorResponse(500, "Internal server error")
	}

	dynamoClient := dynamodb.NewFromConfig(cfg)
	subscriptionTableName := os.Getenv("subscription_table_name")

	exists, err := checkSubscriptionExists(ctx, dynamoClient, subscriptionTableName, appID, userID)
	if exists {
		log.Printf("Debug: Subscription already exists for appID: %s, userID: %s", appID, userID)
		return createErrorResponse(409, "You are already subscribed to this app")
	}
	if err != nil {
		return createErrorResponse(500, "Error checking subscription status")
	}

	err = insertSubscription(ctx, dynamoClient, subscriptionTableName, appID, userID)
	if err != nil {
		log.Printf("Debug: Error inserting subscription: %v", err)
		return createErrorResponse(500, "Error creating subscription")
	}

	return createSuccessResponse(200, map[string]string{
		"message": "Successfully subscribed to app",
	}), nil
}

/*****************************************************/
// Main handler
/*****************************************************/
func handleRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	if errorResp, err := validateSubscriber(request); err != nil {
		return errorResp, err
	} else if errorResp.StatusCode != 0 {
		return errorResp, nil
	}
	method := request.RequestContext.HTTP.Method
	path := request.RequestContext.HTTP.Path
	rawPath := request.RawPath
	// Handle GET requests for getting all apps
	if method == "GET" && (strings.Contains(path, "/apps") || strings.Contains(rawPath, "/apps")) {
		log.Printf("Debug: Routing to handleGetAllApps")
		return handleGetAllApps(ctx, request)
	}
	// Handle POST requests to subscribe to an app
	if method == "POST" && (strings.Contains(path, "/subscribe") || strings.Contains(rawPath, "/subscribe")) {
		log.Printf("Debug: Routing to handleSubscribe")
		return handleSubscribe(ctx, request)
	}
	return createErrorResponse(404, "Route not found")
}

func main() {
	lambda.Start(handleRequest)
}
